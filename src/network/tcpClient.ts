// src/network/tcpClient.ts
import net from 'net';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';

/**
 * Parseur de flux TCP pour extraire les paquets au format ARCH
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
      if (magic !== 0x41524348) { // MAGIC "ARCH"
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
 * Client TCP pour initier les connexions et envoyer des données chiffrées
 */
export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession;
  private nodeId: Buffer;

  constructor(nodeId: Buffer) {
    this.nodeId = nodeId;
    this.session = new CryptoSession(); // Session unique pour cette connexion
  }

  /**
   * Construit un paquet au format binaire ARCH
   */
  private buildPacket(type: PacketType, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0);       // MAGIC
    buf.writeUInt8(type, 4);                // TYPE
    this.nodeId.copy(buf, 5);               // SENDER_ID (32 bytes)
    buf.writeUInt32BE(payload.length, 37);  // PAYLOAD_LEN
    payload.copy(buf, 41);                  // PAYLOAD
    return buf;
  }

  /**
   * Initie la connexion vers un pair et lance le Handshake
   */
  public connect(ip: string, port: number, manifestToShare?: any) {
    console.log(`[TCP CLIENT] Tentative de connexion vers ${ip}:${port}...`);
    
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      console.log(`[TCP CLIENT] Connecté. Envoi de la clé éphémère X25519...`);
      // 1. Envoi immédiat de notre clé publique pour le Handshake
      const handshake = this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey);
      this.socket?.write(handshake);
    });

    const parser = new TcpStreamParser(this.socket);

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payloadLen = packetBuffer.readUInt32BE(37);
      const payload = packetBuffer.subarray(41, 41 + payloadLen);

      if (type === PacketType.HANDSHAKE) {
        console.log(`[TCP CLIENT] Handshake réussi avec ${ip}.`);
        this.session.deriveSharedSecret(payload); // Calcul du secret AES
        
        // 2. Si un manifeste est prêt, on l'envoie immédiatement (Sprint 3)
        if (manifestToShare) {
          const manifestData = Buffer.from(JSON.stringify(manifestToShare));
          const encryptedManifest = this.session.encrypt(manifestData); // Chiffrement AES-GCM
          
          const packet = this.buildPacket(PacketType.MANIFEST, encryptedManifest);
          this.socket?.write(packet);
          console.log(`[TCP CLIENT] Manifeste chiffré envoyé à ${ip} !`);
        }
      } 
      else if (type === PacketType.MSG) {
        try {
          const decrypted = this.session.decrypt(payload);
          console.log(`[TCP CLIENT] Message reçu : ${decrypted.toString('utf-8')}`);
        } catch (err: any) {
          console.error(`[TCP CLIENT] Échec déchiffrement : ${err.message}`);
        }
      }
    });

    this.socket.on('error', (err) => {
      if (err.message.includes('ECONNREFUSED')) return;
      console.error(`[TCP CLIENT] Erreur : ${err.message}`);
    });
  }
}