import net from 'net';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';

export class TcpServer {
  private server: net.Server;
  private manifestToShare: any = null;

  constructor(private nodeId: Buffer, private port: number, private fileManager: FileManager) {
    this.server = net.createServer((socket) => {
      const session = new CryptoSession();
      socket.on('error', () => socket.destroy());

      const h = this.buildPacket(PacketType.HANDSHAKE, session.ephemeralPublicKey);
      socket.write(h);

      socket.on('data', (data) => {
        try {
          if (data.length < 41) return;
          const type = data.readUInt8(4);
          const payload = data.subarray(41);

          if (type === PacketType.HANDSHAKE) {
            session.deriveSharedSecret(payload);
            if (this.manifestToShare) {
              const enc = session.encrypt(Buffer.from(JSON.stringify(this.manifestToShare)));
              socket.write(this.buildPacket(PacketType.MANIFEST, enc));
            }
          } else if (type === PacketType.CHUNK_REQ) {
            const dec = session.decrypt(payload);
            const idx = dec.readUInt32BE(64);
            const hash = dec.subarray(0, 64).toString('utf-8').replace(/\0/g, '').trim();
            
            console.log(`\n[TCP SERVER] 🔍 PC 2 demande le chunk ${idx} du fichier [${hash.substring(0,10)}...]`);
            
            // Tentative 1 : Chercher par Hash
            let chunk = this.fileManager.getChunk(hash, idx);
            
            // Tentative 2 (Hack de Survie) : Chercher par Nom de Fichier (si getChunk utilise le nom)
            if (!chunk && this.manifestToShare && this.manifestToShare.fileName) {
               chunk = this.fileManager.getChunk(this.manifestToShare.fileName, idx);
            }

            if (chunk && !socket.destroyed) {
              console.log(`[TCP SERVER] 📤 Envoi du chunk ${idx} de ${(chunk.length / 1024).toFixed(1)} KB réussi !`);
              socket.write(this.buildPacket(PacketType.CHUNK_DATA, session.encrypt(chunk)));
            } else {
              console.log(`[TCP SERVER] ❌ ERREUR CRITIQUE: Chunk ${idx} introuvable en mémoire.`);
            }
          }
        } catch (e: any) {
           console.log(`[TCP SERVER] ❌ ERREUR de lecture: ${e.message}`);
        }
      });
    });
  }

  private buildPacket(type: PacketType, payload: Buffer): Buffer {
    const buf = Buffer.alloc(41 + payload.length);
    buf.writeUInt32BE(0x41524348, 0); buf.writeUInt8(type, 4);
    this.nodeId.copy(buf, 5); buf.writeUInt32BE(payload.length, 37);
    payload.copy(buf, 41); return buf;
  }

  public setManifest(m: any) { this.manifestToShare = m; }
  public start() { this.server.listen(this.port, '0.0.0.0'); }
}