import { EventEmitter } from 'events';
import net from 'net';
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
      if (magic !== 0x41524348) { this.socket.destroy(); return; }
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

export class TcpServer {
  private server: net.Server;
  private manifestToShare: FileManifest | null = null;

  constructor(private nodeId: Buffer, private port: number, private fileManager: FileManager) {
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }
  public setManifest(manifest: FileManifest) { this.manifestToShare = manifest; }
  public start() { this.server.listen(this.port, '0.0.0.0'); }

  private buildPacket(type: PacketType, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5); buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41); return buf;
  }

  private handleConnection(socket: net.Socket) {
    socket.on('error', () => {}); 
    const parser = new TcpStreamParser(socket);
    const session = new CryptoSession();
    socket.write(this.buildPacket(PacketType.HANDSHAKE, session.ephemeralPublicKey));

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41, 41 + packetBuffer.readUInt32BE(37));

      if (type === PacketType.HANDSHAKE) {
        session.deriveSharedSecret(payload);
        if (this.manifestToShare) {
          setTimeout(() => {
            if (!socket.destroyed) {
              const encrypted = session.encrypt(Buffer.from(JSON.stringify(this.manifestToShare)));
              socket.write(this.buildPacket(PacketType.MANIFEST, encrypted));
            }
          }, 500);
        }
      } 
      else if (type === PacketType.CHUNK_REQ) {
        try {
          const decrypted = session.decrypt(payload);
          const chunkIndex = decrypted.readUInt32BE(64);
          const fileHash = decrypted.subarray(0, 64).toString('utf-8');
          const chunkData = this.fileManager.getChunk(fileHash, chunkIndex);
          if (chunkData && !socket.destroyed) {
            socket.write(this.buildPacket(PacketType.CHUNK_DATA, session.encrypt(chunkData)));
          }
        } catch (e) {}
      }
    });
  }
}