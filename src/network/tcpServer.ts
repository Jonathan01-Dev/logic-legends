// src/network/tcpServer.ts
import { EventEmitter } from 'events';
import net from 'net';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';

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

export class TcpServer {
  private server: net.Server;
  private nodeId: Buffer;
  private port: number;
  // Liste des manifestes reçus des autres pairs
  public networkManifests: Map<string, any> = new Map();

  constructor(nodeId: Buffer, port: number) {
    this.nodeId = nodeId;
    this.port = port;
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`[TCP] Serveur en écoute sur le port ${this.port}`);
    });
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

  private handleConnection(socket: net.Socket) {
    const parser = new TcpStreamParser(socket);
    const session = new CryptoSession();

    // 1. Envoyer notre clé pour le Handshake
    socket.write(this.buildPacket(PacketType.HANDSHAKE, session.ephemeralPublicKey));

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41, 41 + packetBuffer.readUInt32BE(37));

      if (type === PacketType.HANDSHAKE) {
        session.deriveSharedSecret(payload); //
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          // 2. Déchiffrer le manifeste reçu
          const decrypted = session.decrypt(payload);
          const manifest = JSON.parse(decrypted.toString('utf-8'));
          
          this.networkManifests.set(manifest.fileHash, manifest);
          console.log(`[TCP] Nouveau manifeste reçu : ${manifest.fileName} (${manifest.totalSize} bytes)`);
        } catch (err: any) {
          console.error(`[TCP] Erreur réception manifeste : ${err.message}`);
        }
      }
    });
  }
}