// src/network/tcpClient.ts
import net from 'net';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';

/**
 * Parseur de flux TCP pour extraire les paquets ARCH
 */
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

/**
 * Client TCP pour le téléchargement chiffré
 */
export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession;
  private nodeId: Buffer;
  private fileManager: FileManager;

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

  public connect(ip: string, port: number, manifestToShare?: any) {
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      this.socket?.write(this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey));
    });

    const parser = new TcpStreamParser(this.socket);

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41, 41 + packetBuffer.readUInt32BE(37));

      if (type === PacketType.HANDSHAKE) {
        this.session.deriveSharedSecret(payload); //
        if (manifestToShare) {
          const encrypted = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, encrypted));
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          const decrypted = this.session.decrypt(payload); //
          const manifest = JSON.parse(decrypted.toString('utf-8'));
          console.log(`[CLIENT] Manifeste reçu pour : ${manifest.fileName}`);

          // Demande du premier morceau (Chunk 0)
          const reqPayload = Buffer.alloc(68); // 64 (Hash hex) + 4 (Index)
          Buffer.from(manifest.fileHash).copy(reqPayload, 0);
          reqPayload.writeUInt32BE(0, 64);
          
          this.socket?.write(this.buildPacket(PacketType.CHUNK_REQ, this.session.encrypt(reqPayload)));
        } catch (e) { console.error("[CLIENT] Erreur Manifeste"); }
      }
      else if (type === PacketType.CHUNK_DATA) {
        try {
          const chunkData = this.session.decrypt(payload);
          this.fileManager.saveChunk("test.txt", 0, chunkData); // Sauvegarde locale
          console.log(`[CLIENT] Morceau reçu et sauvegardé dans /shared !`);
        } catch (e) { console.error("[CLIENT] Erreur Chunk"); }
      }
    });
  }
}