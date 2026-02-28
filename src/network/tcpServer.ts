import net from 'net';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';

export class TcpServer {
  private server: net.Server;
  private manifestToShare: any = null;

  constructor(private nodeId: Buffer, private port: number, private fileManager: FileManager) {
    this.server = net.createServer((socket) => {
      const session = new CryptoSession();
      // On envoie le handshake immédiatement à chaque nouveau client
      const h = Buffer.alloc(41 + 32);
      h.writeUInt32BE(0x41524348, 0); h.writeUInt8(PacketType.HANDSHAKE, 4);
      this.nodeId.copy(h, 5); h.writeUInt32BE(32, 37);
      session.ephemeralPublicKey.copy(h, 41);
      socket.write(h);

      socket.on('data', (data) => {
        const type = data.readUInt8(4);
        const payload = data.subarray(41);

        if (type === PacketType.HANDSHAKE) {
          session.deriveSharedSecret(payload);
          if (this.manifestToShare) {
            const enc = session.encrypt(Buffer.from(JSON.stringify(this.manifestToShare)));
            const m = Buffer.alloc(41 + enc.length);
            m.writeUInt32BE(0x41524348, 0); m.writeUInt8(PacketType.MANIFEST, 4);
            this.nodeId.copy(m, 5); m.writeUInt32BE(enc.length, 37);
            enc.copy(m, 41);
            socket.write(m);
          }
        } else if (type === PacketType.CHUNK_REQ) {
          const dec = session.decrypt(payload);
          const idx = dec.readUInt32BE(64);
          const hash = dec.subarray(0, 64).toString();
          const chunk = this.fileManager.getChunk(hash, idx);
          if (chunk) {
            const encChunk = session.encrypt(chunk);
            const c = Buffer.alloc(41 + encChunk.length);
            c.writeUInt32BE(0x41524348, 0); c.writeUInt8(PacketType.CHUNK_DATA, 4);
            this.nodeId.copy(c, 5); c.writeUInt32BE(encChunk.length, 37);
            encChunk.copy(c, 41);
            socket.write(c);
          }
        }
      });
    });
  }

  public setManifest(m: any) { this.manifestToShare = m; }
  public start() { this.server.listen(this.port, '0.0.0.0'); }
}