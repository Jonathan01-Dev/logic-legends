import net from 'net';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';
import { NetworkDirectory } from './networkDirectory';

class TcpStreamParser extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly HEADER_SIZE = 41;
  constructor(private socket: net.Socket) {
    super();
    this.socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (this.buffer.length >= this.HEADER_SIZE) {
        const payloadLen = this.buffer.readUInt32BE(37);
        if (this.buffer.length >= 41 + payloadLen) {
          this.emit('packet', this.buffer.subarray(0, 41 + payloadLen));
          this.buffer = this.buffer.subarray(41 + payloadLen);
        } else break;
      }
    });
  }
}

export class TcpServer {
  private server: net.Server;
  private manifestToShare: any = null;

  // NOUVEAU : On importe le NetworkDirectory pour indexer les fichiers reçus
  constructor(private nodeId: Buffer, private port: number, private fileManager: FileManager, private nd: NetworkDirectory) {
    this.server = net.createServer((socket) => {
      const session = new CryptoSession();
      socket.on('error', () => {});

      socket.write(this.buildPacket(PacketType.HANDSHAKE, session.ephemeralPublicKey));

      const parser = new TcpStreamParser(socket);
      parser.on('packet', (packetBuffer: Buffer) => {
        try {
          const type = packetBuffer.readUInt8(4);
          const senderIdHex = packetBuffer.subarray(5, 37).toString('hex');
          const payload = packetBuffer.subarray(41);

          if (type === PacketType.HANDSHAKE) {
            session.deriveSharedSecret(payload);
            if (this.manifestToShare) {
              const enc = session.encrypt(Buffer.from(JSON.stringify(this.manifestToShare)));
              socket.write(this.buildPacket(PacketType.MANIFEST, enc));
            }
          } 
          else if (type === PacketType.MSG) {
            const decMsg = session.decrypt(payload);
            console.log(`\n💬 [MESSAGE SÉCURISÉ] : ${decMsg.toString('utf-8')}`);
            process.stdout.write('archipel> '); 
          }
          // NOUVEAU : Si un pair nous pousse un fichier via la commande 'send'
          else if (type === PacketType.MANIFEST) {
            const dec = session.decrypt(payload);
            const incomingManifest = JSON.parse(dec.toString());
            this.nd.updateFile(incomingManifest, senderIdHex);
            console.log(`\n📥 [RÉCEPTION] Un pair vient de vous pousser le fichier : ${incomingManifest.fileName}. Tapez 'download ${incomingManifest.fileName}' pour l'accepter.`);
            process.stdout.write('archipel> '); 
          }
          else if (type === PacketType.CHUNK_REQ) {
            const dec = session.decrypt(payload);
            const idx = dec.readUInt32BE(64);
            const hash = dec.subarray(0, 64).toString('utf-8').replace(/\0/g, '').trim();
            
            let chunk = this.fileManager.getChunk(hash, idx);
            if (!chunk && this.manifestToShare && this.manifestToShare.fileName) {
               chunk = this.fileManager.getChunk(this.manifestToShare.fileName, idx);
            }

            if (chunk && !socket.destroyed) {
              socket.write(this.buildPacket(PacketType.CHUNK_DATA, session.encrypt(chunk)));
            }
          }
        } catch (e) {}
      });
    });
  }

  private buildPacket(type: number, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5); buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41); return buf;
  }

  public setManifest(m: any) { this.manifestToShare = m; }
  public start() { this.server.listen(this.port, '0.0.0.0'); }
}