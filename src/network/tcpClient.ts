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
        } else { break; }
      }
    });
  }
}

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession = new CryptoSession();
  private manifest: any = null;
  private chunkIdx: number = 0;
  private remoteNodeId: string = "";

  constructor(private nodeId: Buffer, private fm: FileManager, private nd: NetworkDirectory) {}

  public connect(ip: string, port: number, manifestToShare: any = null, autoDownload: boolean = false, messageToSend: string | null = null) {
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      this.socket?.write(this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey));
    });

    this.socket.on('error', () => {}); 

    const parser = new TcpStreamParser(this.socket);
    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const senderId = packetBuffer.subarray(5, 37).toString('hex');
      const payload = packetBuffer.subarray(41);

      if (type === PacketType.HANDSHAKE) {
        this.remoteNodeId = senderId;
        this.session.deriveSharedSecret(payload);
        
        // Envoi du message chiffré avec fermeture douce
        if (messageToSend) {
          const encMsg = this.session.encrypt(Buffer.from(messageToSend));
          this.socket?.write(this.buildPacket(PacketType.MSG, encMsg)); 
          console.log(`✅ Message chiffré envoyé avec succès !`);
          
          // DÉLAI DE SÉCURITÉ : Laisse 500ms au paquet pour voyager avant de fermer
          setTimeout(() => {
            this.socket?.end(); 
          }, 500);
          return;
        }

        if (manifestToShare) {
          const enc = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, enc));
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          const dec = this.session.decrypt(payload);
          this.manifest = JSON.parse(dec.toString());
          this.nd.updateFile(this.manifest, this.remoteNodeId);

          if (autoDownload && !this.fm.hasFile(this.manifest.fileHash || this.manifest.file_id)) {
            console.log(`\n[START] Téléchargement de ${this.manifest.fileName || this.manifest.filename} en cours...`);
            this.chunkIdx = 0;
            this.request();
          } else if (!autoDownload) {
            this.socket?.destroy();
          }
        } catch (e) {}
      } 
      else if (type === PacketType.CHUNK_DATA) {
        try {
          const chunk = this.session.decrypt(payload);
          this.fm.saveChunk(this.manifest.fileName || this.manifest.filename, this.chunkIdx, chunk);
          this.chunkIdx++;
          const pct = Math.floor((this.chunkIdx / this.manifest.chunks.length) * 100);
          process.stdout.write(`\r[PROGRESSION] ${pct}% (${this.chunkIdx}/${this.manifest.chunks.length})`);
          if (this.chunkIdx < this.manifest.chunks.length) {
            this.request();
          } else {
            console.log(`\n✅ Fichier synchronisé avec succès !`);
          }
        } catch (e) {}
      }
    });
  }

  private buildPacket(type: PacketType | number, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); 
    buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5); 
    buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41); 
    return buf;
  }

  private request() {
    if (!this.manifest) return;
    const p = Buffer.alloc(68);
    const hashToRequest = this.manifest.file_id || this.manifest.fileHash || this.manifest.fileName || "unknown";
    Buffer.from(hashToRequest).copy(p, 0);
    p.writeUInt32BE(this.chunkIdx, 64);
    this.socket?.write(this.buildPacket(PacketType.CHUNK_REQ, this.session.encrypt(p)));
  }
}