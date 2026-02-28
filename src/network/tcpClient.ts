// src/network/tcpClient.ts
import net from 'net';
import { EventEmitter } from 'events';
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
      } else {
        break;
      }
    }
  }
}

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession;
  private nodeId: Buffer;

  constructor(nodeId: Buffer) {
    this.nodeId = nodeId;
    this.session = new CryptoSession();
  }

  private buildHandshakePacket(ephemeralKey: Buffer): Buffer {
    const buf = Buffer.alloc(41 + 32);
    buf.writeUInt32BE(0x41524348, 0);       // MAGIC
    buf.writeUInt8(PacketType.HANDSHAKE, 4); // TYPE 0x08
    this.nodeId.copy(buf, 5);               // NODE_ID
    buf.writeUInt32BE(32, 37);              // PAYLOAD_LEN
    ephemeralKey.copy(buf, 41);             // CLÉ X25519
    return buf;
  }

  // NOUVEAU : Fonction pour forger un paquet MSG chiffré
  private buildMsgPacket(encryptedPayload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + encryptedPayload.length);
    buf.writeUInt32BE(0x41524348, 0);       // MAGIC
    buf.writeUInt8(PacketType.MSG, 4);      // TYPE 0x03
    this.nodeId.copy(buf, 5);               // NODE_ID
    buf.writeUInt32BE(encryptedPayload.length, 37); // PAYLOAD_LEN
    encryptedPayload.copy(buf, 41);         // PAYLOAD CHIFFRÉ
    return buf;
  }

  public connect(ip: string, port: number) {
    console.log(`[TCP CLIENT] Tentative de connexion vers ${ip}:${port}...`);
    
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      console.log(`[TCP CLIENT] Connecté à ${ip}:${port}. Envoi de notre clé X25519...`);
      const handshakePacket = this.buildHandshakePacket(this.session.ephemeralPublicKey);
      this.socket?.write(handshakePacket);
    });

    const parser = new TcpStreamParser(this.socket);

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payloadLen = packetBuffer.readUInt32BE(37);
      const payload = packetBuffer.subarray(41, 41 + payloadLen);

      if (type === PacketType.HANDSHAKE) {
        console.log(`[TCP CLIENT] Handshake reçu de ${ip}. Calcul du secret AES...`);
        this.session.deriveSharedSecret(payload);
        
        // --- LE TEST DU FEU : ENVOI D'UN MESSAGE CHIFFRÉ ---
        const testMessage = "Salut Archipel ! Ceci est un message top secret chiffré en AES-256-GCM.";
        const encryptedMsg = this.session.encrypt(Buffer.from(testMessage, 'utf-8'));
        const msgPacket = this.buildMsgPacket(encryptedMsg);
        
        this.socket?.write(msgPacket);
        console.log(`[TCP CLIENT] Message de test chiffré et envoyé avec succès !`);
      } 
      else if (type === PacketType.MSG) {
        try {
          const decrypted = this.session.decrypt(payload);
          console.log(`[TCP CLIENT] Message déchiffré reçu : ${decrypted.toString('utf-8')}`);
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