import net from 'net';
import { EventEmitter } from 'events';
import { PacketType } from './types';
import { CryptoSession } from '../crypto/session';
import { FileManager } from './fileManager';
import { NetworkDirectory } from './networkDirectory';

class TcpStreamParser extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly HEADER_SIZE = 41;
  constructor(private socket: net.Socket) {
    super();
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (this.buffer.length >= this.HEADER_SIZE) {
        const payloadLen = this.buffer.readUInt32BE(37);
        if (this.buffer.length >= 41 + payloadLen) {
          this.emit('packet', this.buffer.subarray(0, 41 + payloadLen));
          this.buffer = this.buffer.subarray(41 + payloadLen);
        } else break;
      }
    });
  }
}

export class TcpClient {
  private socket: net.Socket | null = null;
  private session: CryptoSession = new CryptoSession();
  private manifest: any = null;
  private chunkIdx: number = 0;
  private remoteNodeId: string = "";

  constructor(private nodeId: Buffer, private fm: FileManager, private nd: NetworkDirectory) {}

  // Ajout du paramètre autoDownload (désactivé par défaut)
  public connect(ip: string, port: number, manifestToShare: any = null, autoDownload: boolean = false) {
    this.socket = net.createConnection({ host: ip, port: port }, () => {
      this.socket?.write(this.buildPacket(PacketType.HANDSHAKE, this.session.ephemeralPublicKey));
    });

    this.socket.on('error', () => {}); // Silence les erreurs réseau pour garder le CLI propre

    const parser = new TcpStreamParser(this.socket);
    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      const senderId = packetBuffer.subarray(5, 37).toString('hex');
      const payload = packetBuffer.subarray(41);

      if (type === PacketType.HANDSHAKE) {
        this.remoteNodeId = senderId;
        this.session.deriveSharedSecret(payload);
        if (manifestToShare) {
          const enc = this.session.encrypt(Buffer.from(JSON.stringify(manifestToShare)));
          this.socket?.write(this.buildPacket(PacketType.MANIFEST, enc));
        }
      } 
      else if (type === PacketType.MANIFEST) {
        try {
          const dec = this.session.decrypt(payload);
          this.manifest = JSON.parse(dec.toString());
          
          // Indexation silencieuse
          this.nd