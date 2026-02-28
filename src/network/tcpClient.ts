import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';
import { FileManifest } from '../models/manifest';
import { NetworkDirectory } from './networkDirectory';

class TcpStreamParser extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly HEADER_SIZE = 41;
  constructor(private socket: net.Socket) {
    super();
    this.socket.on('data', (chunk) => {
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

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession = new CryptoSession();
  private currentManifest: FileManifest | null = null;
  private nextChunkIndex: number = 0;

  constructor(private nodeId: Buffer, private fileManager: FileManager, private networkDirectory: NetworkDirectory) {}

  public connect(ip: string, port: number, manifestToShare: FileManifest | null = null) {
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      this.socket?.write(this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey));
    });

    this.socket.on('error', (err) => console.log(`[TCP] Erreur : ${err.message}`));

    const parser = new TcpStreamParser(this.socket);
    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41);

      if (type === PacketType.HANDSHAKE) {
        this.session.deriveSharedSecret(payload);
        if (manifestToShare) {
          const enc = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, enc));
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          const dec = this.session.decrypt(payload);
          this.currentManifest = JSON.parse(dec.toString());
          console.log(`\n[INFO] Manifeste reçu : ${this.currentManifest?.fileName}`);
          
          this.networkDirectory.updateFile(this.currentManifest!, "remote");

          if (!this.fileManager.hasFile(this.currentManifest!.fileHash)) {
            console.log(`[START] Début du téléchargement...`);
            this.nextChunkIndex = 0;
            this.requestNextChunk();
          } else {
            console.log(`[SKIP] Le fichier ${this.currentManifest?.fileName} est déjà complet dans shared/`);
          }
        } catch (e) { console.error("[ERR] Échec lecture manifeste"); }
      }
      else if (type === PacketType.CHUNK_DATA) {
        const data = this.session.decrypt(payload);
        this.fileManager.saveChunk(this.currentManifest!.fileName, this.nextChunkIndex, data);
        this.nextChunkIndex++;
        
        const pct = Math.floor((this.nextChunkIndex / this.currentManifest!.chunks.length) * 100);
        process.stdout.write(`\r[PROGRESSION] ${pct}% (${this.nextChunkIndex}/${this.currentManifest!.chunks.length})`);
        
        if (this.nextChunkIndex < this.currentManifest!.chunks.length) {
          this.requestNextChunk();
        } else {
          console.log("\n✅ TRANSFERT RÉUSSI !");
        }
      }
    });
  }

  private buildPacket(type: PacketType, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5); buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41); return buf;
  }

  private requestNextChunk() {
    if (!this.currentManifest || !this.socket) return;
    const p = Buffer.alloc(68);
    Buffer.from(this.currentManifest.fileHash).copy(p, 0);
    p.writeUInt32BE(this.nextChunkIndex, 64);
    this.socket.write(this.buildPacket(PacketType.CHUNK_REQ, this.session.encrypt(p)));
  }
}