// src/network/tcpServer.ts
import { EventEmitter } from 'events';
import net from 'net';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';

/**
 * Parseur TLV (Type-Length-Value)
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
        console.error(`[TCP] Flux corrompu, MAGIC invalide.`);
        this.socket.destroy();
        return;
      }

      const payloadLen = this.buffer.readUInt32BE(37);
      const totalPacketSize = this.HEADER_SIZE + payloadLen;

      if (this.buffer.length >= totalPacketSize) {
        const fullPacket = this.buffer.subarray(0, totalPacketSize);
        this.buffer = this.buffer.subarray(totalPacketSize);
        this.emit('packet', fullPacket);
      } else {
        break;
      }
    }
  }
}

/**
 * Serveur TCP Principal
 */
export class TcpServer {
  private server: net.Server;
  private nodeId: Buffer;
  private port: number;

  // Ajout du nodeId dans le constructeur pour pouvoir forger l'en-tête du paquet
  constructor(nodeId: Buffer, port: number) {
    this.nodeId = nodeId;
    this.port = port;
    this.server = net.createServer((socket) => this.handleConnection(socket));
    this.server.maxConnections = 50; 
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`[TCP] Serveur en écoute sur le port ${this.port}`);
    });
  }

  // Fonction pour construire le paquet contenant la clé X25519
  private buildHandshakePacket(ephemeralKey: Buffer): Buffer {
    const buf = Buffer.alloc(41 + 32); // Header (41) + Clé X25519 (32)
    buf.writeUInt32BE(0x41524348, 0);       // MAGIC
    buf.writeUInt8(PacketType.HANDSHAKE, 4); // TYPE 0x08
    this.nodeId.copy(buf, 5);               // NODE_ID
    buf.writeUInt32BE(32, 37);              // PAYLOAD_LEN = 32
    ephemeralKey.copy(buf, 41);             // PAYLOAD = La clé publique
    return buf;
  }

  private handleConnection(socket: net.Socket) {
    console.log(`[TCP] Nouvelle connexion de ${socket.remoteAddress}:${socket.remotePort}`);
    socket.setKeepAlive(true, 15000); 

    const parser = new TcpStreamParser(socket);
    const session = new CryptoSession(); // 1 session crypto par connexion

    // 1. Envoi immédiat de notre clé publique éphémère à l'autre nœud
    const handshakePacket = this.buildHandshakePacket(session.ephemeralPublicKey);
    socket.write(handshakePacket);

    // 2. Réception des paquets
    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payloadLen = packetBuffer.readUInt32BE(37);
      const payload = packetBuffer.subarray(41, 41 + payloadLen); // Extraction de la data utile
      
      if (type === PacketType.HANDSHAKE) {
        // L'autre nœud nous envoie sa clé publique éphémère (32 bytes)
        console.log(`[TCP] Handshake reçu. Calcul du secret partagé...`);
        session.deriveSharedSecret(payload);
      } 
      else if (type === PacketType.MSG) {
        // C'est un message chiffré, on le déchiffre avec AES-256-GCM
        try {
          const decrypted = session.decrypt(payload);
          console.log(`[TCP] Message reçu (Déchiffré) : ${decrypted.toString('utf-8')}`);
        } catch (err: any) {
          console.error(`[TCP] Échec du déchiffrement : ${err.message}`);
        }
      } 
      else {
        console.log(`[TCP] Paquet reçu (Type: 0x0${type}). Pas encore géré.`);
      }
    });

    socket.on('error', (err) => console.error(`[TCP] Erreur socket : ${err.message}`));
    socket.on('close', () => console.log(`[TCP] Connexion fermée avec ${socket.remoteAddress}`));
  }
}