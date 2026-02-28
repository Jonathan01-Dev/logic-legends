import net from 'net';
import crypto from 'crypto';
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
  private currentManifest: any = null;
  private nextChunkIndex: number = 0;

  constructor(private nodeId: Buffer, private fileManager: FileManager, private networkDirectory: NetworkDirectory) {}

  public connect(ip: string, port: number, manifestToShare: any = null) {
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
          console.log(`[PC3] Manifeste reçu : ${this.currentManifest.fileName}`);
          this.networkDirectory.updateFile(this.currentManifest, "remote");
          if (!this.fileManager.hasFile(this.currentManifest.fileHash)) {
            this.nextChunkIndex = 0;
            this.requestNextChunk();
          }
        } catch (e) {}
      }
      else if (type === PacketType.CHUNK_DATA) {
        const data = this.session.decrypt(payload);
        this.fileManager.saveChunk(this.currentManifest.fileName, this.nextChunkIndex, data);
        this.nextChunkIndex++;
        if (this.nextChunkIndex < this.currentManifest.chunks.length) this.requestNextChunk();
        else console.log("✅ PC3 TERMINÉ !");
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
    const p = Buffer.alloc(68);
    Buffer.from(this.currentManifest.fileHash).copy(p, 0);
    p.writeUInt32BE(this.nextChunkIndex, 64);
    this.socket?.write(this.buildPacket(PacketType.CHUNK_REQ, this.session.encrypt(p)));
  }
}