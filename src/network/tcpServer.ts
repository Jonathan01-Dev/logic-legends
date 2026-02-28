// src/network/tcpServer.ts
import { EventEmitter } from 'events';
import net from 'net';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';

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
  private nodeId: Buffer;
  private port: number;
  private fileManager: FileManager;
  public networkManifests: Map<string, any> = new Map();

  constructor(nodeId: Buffer, port: number, fileManager: FileManager) {
    this.nodeId = nodeId;
    this.port = port;
    this.fileManager = fileManager;
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`[TCP] Serveur en écoute sur le port ${this.port}`);
    });
  }

  private buildPacket(type: PacketType, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); // MAGIC "ARCH"
    buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5);
    buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41);
    return buf;
  }

  private handleConnection(socket: net.Socket) {
    socket.on('error', (err) => {
      console.log(`[TCP SERVER] Connexion perdue avec un pair (Normal en simulation S3)`);
    });

    const parser = new TcpStreamParser(socket);
    const session = new CryptoSession();

    // Handshake initial
    socket.write(this.buildPacket(PacketType.HANDSHAKE, session.ephemeralPublicKey));

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41, 41 + packetBuffer.readUInt32BE(37));

      if (type === PacketType.HANDSHAKE) {
        session.deriveSharedSecret(payload);
      }
      else if (type === PacketType.MANIFEST) {
        try {
          const decrypted = session.decrypt(payload); //
          const manifest = JSON.parse(decrypted.toString('utf-8'));
          this.networkManifests.set(manifest.fileHash, manifest);
          console.log(`[TCP] Manifeste reçu : ${manifest.fileName}`);
        } catch (err) { console.error("[TCP] Erreur Manifeste"); }
      }
      else if (type === PacketType.CHUNK_REQ) {
        try {
          // Décoder la requête : FileHash (64 hex chars = 32 bytes) + Index (4 bytes)
          const decrypted = session.decrypt(payload);
          const fileHash = decrypted.subarray(0, 64).toString('utf-8');
          const chunkIndex = decrypted.readUInt32BE(64);

          console.log(`[TCP] Requête de morceau reçue : Index ${chunkIndex}`);

          // Récupérer le morceau sur le disque
          const chunkData = this.fileManager.getChunk(fileHash, chunkIndex);
          if (chunkData) {
            const encryptedChunk = session.encrypt(chunkData); //
            socket.write(this.buildPacket(PacketType.CHUNK_DATA, encryptedChunk));
          }
        } catch (err) { console.error("[TCP] Erreur Chunk Request"); }
      }
    });
  }
}