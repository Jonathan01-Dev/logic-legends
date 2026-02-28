import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';
import { FileManifest } from '../models/manifest';
import { NetworkDirectory } from './networkDirectory';

/**
 * Parseur de flux TCP robuste capable d'accumuler les fragments de données
 */
class TcpStreamParser extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly HEADER_SIZE = 41;

  constructor(private socket: net.Socket) {
    super();
    this.socket.on('data', (chunk) => this.handleData(chunk as Buffer));
  }

  private handleData(chunk: Buffer) {
    // Accumulation des morceaux de données reçus du réseau
    this.buffer = Buffer.concat([this.buffer, chunk]);
    
    while (this.buffer.length >= this.HEADER_SIZE) {
      const magic = this.buffer.readUInt32BE(0);
      if (magic !== 0x41524348) { 
        console.error("[PARSER] Erreur MAGIC : Flux corrompu, fermeture socket.");
        this.buffer = Buffer.alloc(0); 
        this.socket.destroy(); 
        return; 
      }

      const payloadLen = this.buffer.readUInt32BE(37);
      const totalPacketSize = this.HEADER_SIZE + payloadLen;

      // Attendre d'avoir le paquet complet (Header + Payload) avant de traiter
      if (this.buffer.length >= totalPacketSize) {
        const fullPacket = this.buffer.subarray(0, totalPacketSize);
        this.buffer = this.buffer.subarray(totalPacketSize);
        this.emit('packet', fullPacket);
      } else {
        // Paquet incomplet : on attend la suite des données
        break; 
      }
    }
  }
}

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession;
  private currentManifest: FileManifest | null = null;
  private nextChunkIndex: number = 0;
  private remoteNodeId: string = "";

  constructor(
    private nodeId: Buffer, 
    private fileManager: FileManager,
    private networkDirectory: NetworkDirectory
  ) {
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

  private requestNextChunk() {
    if (!this.currentManifest || !this.socket) return;
    const reqPayload = Buffer.alloc(68);
    Buffer.from(this.currentManifest.fileHash).copy(reqPayload, 0);
    reqPayload.writeUInt32BE(this.nextChunkIndex, 64);
    
    // Envoi de la requête de morceau chiffrée
    this.socket.write(this.buildPacket(PacketType.CHUNK_REQ, this.session.encrypt(reqPayload)));
  }

  public connect(ip: string, port: number, manifestToShare: FileManifest | null = null) {
    console.log(`[URGENT] Connexion TCP vers ${ip}:${port}...`);
    
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      console.log(`[URGENT] Socket ouvert. Envoi Handshake...`);
      const handshakePacket = this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey);
      this.socket?.write(handshakePacket);
    });

    this.socket.on('error', (err: any) => {
      if (err.code !== 'ECONNRESET') console.error(`\n[URGENT] Erreur TCP : ${err.message}`);
    });

    const parser = new TcpStreamParser(this.socket);

    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const senderId = packetBuffer.subarray(5, 37).toString('hex');
      const payloadLen = packetBuffer.readUInt32BE(37);
      const payload = packetBuffer.subarray(41, 41 + payloadLen);

      if (type === PacketType.HANDSHAKE) {
        this.remoteNodeId = senderId;
        this.session.deriveSharedSecret(payload);
        console.log(`[URGENT] Session sécurisée avec ${ip}`);
        
        if (manifestToShare) {
          const encrypted = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, encrypted));
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          // Déchiffrement du manifeste complet accumulé
          const decrypted = this.session.decrypt(payload);
          const manifest = JSON.parse(decrypted.toString('utf-8'));
          
          // Mise à jour de l'annuaire réseau (Sprint 4)
          this.networkDirectory.updateFile(manifest, this.remoteNodeId);

          if (!this.fileManager.hasFile(manifest.fileHash)) {
            this.currentManifest = manifest;
            this.nextChunkIndex = 0;
            console.log(`\n[CLIENT] Découverte : ${manifest.fileName}. Téléchargement lancé...`);
            this.requestNextChunk();
          } else {
            console.log(`\n[CLIENT] Fichier ${manifest.fileName} déjà connu localement.`);
          }
        } catch (e) {
          console.error("\n[CLIENT] Erreur critique : Impossible de parser le manifeste JSON.");
        }
      }
      else if (type === PacketType.CHUNK_DATA) {
        try {
          if (!this.currentManifest) return;
          const chunkData = this.session.decrypt(payload);
          
          const receivedHash = crypto.createHash('sha256').update(chunkData).digest('hex');
          const expectedHash = this.currentManifest.chunks[this.nextChunkIndex].hash;

          if (receivedHash === expectedHash) {
            this.fileManager.saveChunk(this.currentManifest.fileName, this.nextChunkIndex, chunkData);
            this.nextChunkIndex++;
            
            // Log de progression
            if (this.nextChunkIndex % 20 === 0 || this.nextChunkIndex === this.currentManifest.chunks.length) {
                const pct = Math.floor((this.nextChunkIndex / this.currentManifest.chunks.length) * 100);
                process.stdout.write(`\r[TRANSFERT] ${pct}% (${this.nextChunkIndex}/${this.currentManifest.chunks.length})`);
            }

            if (this.nextChunkIndex < this.currentManifest.chunks.length) {
              this.requestNextChunk();
            } else {
              console.log(`\n✅ SUCCÈS : ${this.currentManifest.fileName} reçu !`);
            }
          }
        } catch (e) { console.error("\n[CLIENT] Erreur déchiffrement chunk"); }
      }
    });
  }
}