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

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession;
  private currentManifest: FileManifest | null = null;
  private nextChunkIndex: number = 0;

  constructor(private nodeId: Buffer, private fileManager: FileManager) {
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

  private drawProgressBar(current: number, total: number) {
    const width = 20;
    const progress = Math.floor((current / total) * width);
    const bar = "█".repeat(progress) + "░".repeat(width - progress);
    const percent = Math.floor((current / total) * 100);
    process.stdout.write(`\r[PROGRESSION] [${bar}] ${percent}% (${current}/${total} chunks)`);
  }

  private requestNextChunk() {
    if (!this.currentManifest || !this.socket) return;
    const reqPayload = Buffer.alloc(68);
    Buffer.from(this.currentManifest.fileHash).copy(reqPayload, 0);
    reqPayload.writeUInt32BE(this.nextChunkIndex, 64);
    
    // Envoi de la requête de morceau chiffrée
    this.socket.write(this.buildPacket(PacketType.CHUNK_REQ, this.session.encrypt(reqPayload)));
  }

  public connect(ip: string, port: number, manifestToShare: FileManifest | null = null) {
    console.log(`[URGENT] Initialisation socket TCP vers ${ip}:${port}`);
    
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      console.log(`[URGENT] Socket connecté avec succès ! Envoi du Handshake...`);
      // 1. Envoi immédiat du Handshake
      const handshakePacket = this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey);
      this.socket?.write(handshakePacket);
    });

    this.socket.on('error', (err: any) => {
      console.error(`\n[URGENT] Erreur TCP Client (${ip}): ${err.message}`);
    });

    const parser = new TcpStreamParser(this.socket);

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const payload = packetBuffer.subarray(41, 41 + packetBuffer.readUInt32BE(37));

      if (type === PacketType.HANDSHAKE) {
        this.session.deriveSharedSecret(payload);
        console.log(`[URGENT] Canal AES-GCM sécurisé avec ${ip}`);
        
        // 2. Partage automatique du manifeste s'il existe
        if (manifestToShare) {
          console.log(`[URGENT] Envoi du manifeste local : ${manifestToShare.fileName}`);
          const encrypted = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, encrypted));
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          const decrypted = this.session.decrypt(payload);
          const manifest = JSON.parse(decrypted.toString('utf-8'));
          
          console.log(`\n[URGENT] Manifeste distant reçu : ${manifest.fileName}`);

          // 3. Téléchargement automatique si inconnu
          if (!this.fileManager.hasFile(manifest.fileHash)) {
            this.currentManifest = manifest;
            this.nextChunkIndex = 0;
            console.log(`[URGENT] Début du transfert (3 nœuds)...`);
            this.requestNextChunk();
          } else {
            console.log(`[URGENT] Fichier ignoré : Déjà présent localement.`);
          }
        } catch (e) {
          console.error("\n[URGENT] Erreur déchiffrement manifeste !");
        }
      }
      else if (type === PacketType.CHUNK_DATA) {
        try {
          if (!this.currentManifest) return;
          const chunkData = this.session.decrypt(payload);
          
          // 4. Vérification SHA-256 Live
          const receivedHash = crypto.createHash('sha256').update(chunkData).digest('hex');
          const expectedHash = this.currentManifest.chunks[this.nextChunkIndex].hash;

          if (receivedHash === expectedHash) {
            this.fileManager.saveChunk(this.currentManifest.fileName, this.nextChunkIndex, chunkData);
            this.nextChunkIndex++;
            
            // Affichage de progression pour le jury
            this.drawProgressBar(this.nextChunkIndex, this.currentManifest.chunks.length);
            
            if (this.nextChunkIndex % 50 === 0) console.log(""); // Flush log console

            if (this.nextChunkIndex < this.currentManifest.chunks.length) {
              this.requestNextChunk();
            } else {
              console.log(`\n✅ LIVRABLE S3 TERMINÉ : ${this.currentManifest.fileName} reçu !`);
            }
          } else {
            console.error(`\n❌ ÉCHEC SHA-256 sur chunk ${this.nextChunkIndex}`);
            this.socket?.destroy();
          }
        } catch (e) { console.error("\n[URGENT] Erreur sur paquet CHUNK_DATA"); }
      }
    });
  }
}