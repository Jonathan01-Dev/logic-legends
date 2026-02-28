import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';
import { FileManifest } from '../models/manifest';

class TcpStreamParser extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly HEADER_SIZE = 41;

  constructor(private socket: net.Socket) {
    super();
    this.socket.on('data', (chunk) => this.handleData(chunk as Buffer));
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= this.HEADER_SIZE) {
      const magic = this.buffer.readUInt32BE(0);
      if (magic !== 0x41524348) { 
        this.socket.destroy(); 
        return; 
      }
      const payloadLen = this.buffer.readUInt32BE(37);
      const totalPacketSize = this.HEADER_SIZE + payloadLen;
      if (this.buffer.length >= totalPacketSize) {
        const fullPacket = this.buffer.subarray(0, totalPacketSize);
        this.buffer = this.buffer.subarray(totalPacketSize);
        this.emit('packet', fullPacket);
      } else break;
    }
  }
}

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession;
  private nodeId: Buffer;
  private fileManager: FileManager;
  private currentManifest: FileManifest | null = null;
  private nextChunkIndex: number = 0;

  constructor(nodeId: Buffer, fileManager: FileManager) {
    this.nodeId = nodeId;
    this.fileManager = fileManager;
    this.session = new CryptoSession();
  }

  private buildPacket(type: PacketType, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); 
    buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5);
    buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41);
    return buf;
  }

  private requestNextChunk() {
    if (!this.currentManifest || !this.socket) return;
    const reqPayload = Buffer.alloc(68); 
    Buffer.from(this.currentManifest.fileHash).copy(reqPayload, 0);
    reqPayload.writeUInt32BE(this.nextChunkIndex, 64);
    this.socket.write(this.buildPacket(PacketType.CHUNK_REQ, this.session.encrypt(reqPayload)));
  }

  public connect(ip: string, port: number, manifestToShare: FileManifest | null = null) {
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      this.socket?.write(this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey));
    });

    this.socket.on('error', (err: any) => {
      if (err.code !== 'ECONNRESET') console.error(`[TCP CLIENT] Erreur : ${err.message}`);
    });

    const parser = new TcpStreamParser(this.socket);
    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41, 41 + packetBuffer.readUInt32BE(37));

      if (type === PacketType.HANDSHAKE) {
        this.session.deriveSharedSecret(payload);
        if (manifestToShare) {
          // LOG CRITIQUE S3 : On vérifie si l'envoi démarre
          console.log(`[TCP CLIENT] Début de l'envoi du manifeste (${manifestToShare.fileName})...`);
          const encryptedManifest = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, encryptedManifest), () => {
             // CALLBACK : S'exécute quand le buffer est vidé
             console.log(`[TCP CLIENT] ENVOI DU MANIFESTE TERMINÉ ✅`);
          });
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          const decrypted = this.session.decrypt(payload);
          this.currentManifest = JSON.parse(decrypted.toString('utf-8'));
          this.nextChunkIndex = 0;
          console.log(`[CLIENT] Manifeste reçu : ${this.currentManifest?.chunks.length} chunks.`);
          this.requestNextChunk();
        } catch (e) { console.error("[CLIENT] Erreur lecture manifeste."); }
      }
      else if (type === PacketType.CHUNK_DATA) {
        try {
          const chunkData = this.session.decrypt(payload);
          const receivedHash = crypto.createHash('sha256').update(chunkData).digest('hex');
          if (receivedHash === this.currentManifest!.chunks[this.nextChunkIndex].hash) {
            this.fileManager.saveChunk(this.currentManifest!.fileName, this.nextChunkIndex, chunkData);
            if (this.nextChunkIndex % 100 === 0) console.log(`[PROGRESS] Chunk ${this.nextChunkIndex} OK`);
            this.nextChunkIndex++;
            if (this.nextChunkIndex < this.currentManifest!.chunks.length) this.requestNextChunk();
            else console.log(`✅ TRANSFERT RÉUSSI !`);
          }
        } catch (e) { console.error("[CLIENT] Erreur chunk."); }
      }
    });
  }
}