// src/network/tcpServer.ts
import { EventEmitter } from 'events';
import net from 'net';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';

/**
 * Parseur de flux binaire ARCH pour TCP
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

export class TcpServer {
  private server: net.Server;
  private nodeId: Buffer;
  private port: number;
  private fileManager: FileManager;

  constructor(nodeId: Buffer, port: number, fileManager: FileManager) {
    this.nodeId = nodeId;
    this.port = port;
    this.fileManager = fileManager;
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  public start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[TCP SERVER] Service actif sur le port ${this.port}`);
    });
  }

  /**
   * Encapsule les données dans le format binaire ARCH
   */
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
    const remoteIp = socket.remoteAddress;
    
    // GESTION ANTI-CRASH : Capture les déconnexions brutales (ECONNRESET)
    socket.on('error', (err: any) => {
      if (err.code === 'ECONNRESET') {
        console.log(`[TCP SERVER] Un pair s'est déconnecté (${remoteIp}).`);
      } else {
        console.error(`[TCP SERVER] Erreur socket : ${err.message}`);
      }
    });

    const parser = new TcpStreamParser(socket);
    const session = new CryptoSession(); // Session de chiffrement unique

    // 1. HANDSHAKE : Envoyer notre clé publique X25519
    socket.write(this.buildPacket(PacketType.HANDSHAKE, session.ephemeralPublicKey));

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payloadLen = packetBuffer.readUInt32BE(37);
      const payload = packetBuffer.subarray(41, 41 + payloadLen);

      if (type === PacketType.HANDSHAKE) {
        // Dérivation du secret partagé AES-GCM
        session.deriveSharedSecret(payload);
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          // Déchiffrement et enregistrement du manifeste distant
          const decrypted = session.decrypt(payload);
          const manifest = JSON.parse(decrypted.toString('utf-8'));
          
          this.fileManager.registerRemoteManifest(manifest);
          console.log(`[TCP SERVER] Manifeste reçu de ${remoteIp} : ${manifest.fileName}`);
        } catch (err) { 
          console.error("[TCP SERVER] Erreur de lecture du manifeste chiffré."); 
        }
      }
      else if (type === PacketType.CHUNK_REQ) {
        try {
          // 2. RÉPONSE AUX REQUÊTES : On extrait le Hash et l'Index
          const decrypted = session.decrypt(payload);
          const fileHash = decrypted.subarray(0, 64).toString('utf-8');
          const chunkIndex = decrypted.readUInt32BE(64);

          // Récupération sécurisée du morceau sur le disque
          const chunkData = this.fileManager.getChunk(fileHash, chunkIndex);
          if (chunkData) {
            const encryptedChunk = session.encrypt(chunkData);
            socket.write(this.buildPacket(PacketType.CHUNK_DATA, encryptedChunk));
          }
        } catch (err) { 
          console.error("[TCP SERVER] Erreur lors du traitement d'une requête de morceau."); 
        }
      }
    });
  }
}