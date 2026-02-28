// src/network/tcpClient.ts
import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
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

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession;
  private nodeId: Buffer;
  private fileManager: FileManager;
  
  // État du téléchargement en cours
  private currentManifest: FileManifest | null = null;
  private nextChunkIndex: number = 0;

  constructor(nodeId: Buffer, fileManager: FileManager) {
    this.nodeId = nodeId;
    this.fileManager = fileManager;
    this.session = new CryptoSession(); //
  }

  private buildPacket(type: PacketType, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); // MAGIC
    buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5);
    buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41);
    return buf;
  }

  /**
   * Envoie une requête chiffrée pour un morceau spécifique
   */
  private requestNextChunk() {
    if (!this.currentManifest || !this.socket) return;

    const reqPayload = Buffer.alloc(68); // 64 (Hash hex) + 4 (Index)
    Buffer.from(this.currentManifest.fileHash).copy(reqPayload, 0);
    reqPayload.writeUInt32BE(this.nextChunkIndex, 64);
    
    const encryptedReq = this.session.encrypt(reqPayload);
    this.socket.write(this.buildPacket(PacketType.CHUNK_REQ, encryptedReq));
  }

  public connect(ip: string, port: number, manifestToShare: FileManifest | null = null) {
    console.log(`[TCP CLIENT] Connexion à ${ip}:${port}...`);
    
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      // 1. Handshake
      this.socket?.write(this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey));
    });

    const parser = new TcpStreamParser(this.socket);

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41, 41 + packetBuffer.readUInt32BE(37));

      if (type === PacketType.HANDSHAKE) {
        this.session.deriveSharedSecret(payload); //
        console.log(`[TCP CLIENT] Canal sécurisé établi avec ${ip}.`);
        
        // 2. Partage de notre manifeste si disponible
        if (manifestToShare) {
          const encryptedManifest = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, encryptedManifest));
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          const decrypted = this.session.decrypt(payload); //
          this.currentManifest = JSON.parse(decrypted.toString('utf-8'));
          this.nextChunkIndex = 0;
          console.log(`[CLIENT] Début téléchargement : ${this.currentManifest?.fileName} (50 Mo env.)`);
          this.requestNextChunk(); // Lancement de la boucle
        } catch (e) { console.error("[CLIENT] Erreur Manifeste"); }
      }
      else if (type === PacketType.CHUNK_DATA) {
        try {
          if (!this.currentManifest) return;

          const chunkData = this.session.decrypt(payload); //
          
          // 3. VÉRIFICATION SHA-256 EN LIVE
          const receivedHash = crypto.createHash('sha256').update(chunkData).digest('hex');
          const expectedHash = this.currentManifest.chunks[this.nextChunkIndex].hash;

          if (receivedHash === expectedHash) {
            this.fileManager.saveChunk(this.currentManifest.fileName, this.nextChunkIndex, chunkData);
            
            // Log de progression pour le jury
            if (this.nextChunkIndex % 100 === 0) {
                console.log(`[PROGRESS] Chunk ${this.nextChunkIndex}/${this.currentManifest.chunks.length} - Hash OK ✅`);
            }

            this.nextChunkIndex++;

            if (this.nextChunkIndex < this.currentManifest.chunks.length) {
              this.requestNextChunk(); // Requête suivante
            } else {
              console.log(`🎉 TRANSFERT TERMINÉ ET VÉRIFIÉ : ${this.currentManifest.fileName}`);
            }
          } else {
            console.error(`❌ ERREUR D'INTÉGRITÉ sur le chunk ${this.nextChunkIndex}.`);
            this.socket?.destroy(); // Sécurité : on coupe si les données sont corrompues
          }
        } catch (e) { console.error("[CLIENT] Erreur déchiffrement chunk"); }
      }
    });

    this.socket.on('close', () => {
      if (this.currentManifest && this.nextChunkIndex < this.currentManifest.chunks.length) {
        console.warn(`⚠️ DÉCONNEXION DÉTECTÉE (Simulation S3). Transfert interrompu à ${this.nextChunkIndex} chunks.`);
      }
    });

    this.socket.on('error', (err) => {
      if (!err.message.includes('ECONNREFUSED')) console.error(`[TCP CLIENT] Erreur : ${err.message}`);
    });
  }
}