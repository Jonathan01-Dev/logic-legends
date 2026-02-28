// src/network/discovery.ts
import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';
import { PeerTable } from './peerTable';
import { TcpClient } from './tcpClient';
import { FileManager } from './fileManager';
import { FileManifest } from '../models/manifest';

export class Discovery {
  private socket: dgram.Socket;
  private nodeId: Buffer;
  private tcpPort: number;
  private fileManager: FileManager;
  private manifestToShare: FileManifest | null;
  public peerTable: PeerTable;

  constructor(nodeId: Buffer, tcpPort: number, fileManager: FileManager, manifestToShare: FileManifest | null = null) {
    this.nodeId = nodeId;
    this.tcpPort = tcpPort;
    this.fileManager = fileManager;
    this.manifestToShare = manifestToShare;
    this.peerTable = new PeerTable();
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true);
      this.startHelloLoop();
    });

    this.socket.on('message', (msg, rinfo) => {
      const magic = msg.readUInt32BE(0);
      if (magic !== 0x41524348) return;

      const type = msg.readUInt8(4);
      if (type === PacketType.HELLO) {
        const senderId = msg.subarray(5, 37);
        if (senderId.equals(this.nodeId)) return;

        const remoteTcpPort = msg.readUInt16BE(41);
        const isNew = !this.peerTable.getPeers().some(p => p.node_id === senderId.toString('hex'));
        
        this.peerTable.upsert(senderId, rinfo.address, remoteTcpPort);

        if (isNew) {
          console.log(`[UDP] Nouveau pair détecté : ${rinfo.address}:${remoteTcpPort}. Connexion...`);
          // On crée le client en lui passant le fileManager et le VRAI manifeste
          const client = new TcpClient(this.nodeId, this.fileManager);
          client.connect(rinfo.address, remoteTcpPort, this.manifestToShare);
        }
      }
    });
  }

  private startHelloLoop() {
    setInterval(() => {
      const buf = Buffer.alloc(43);
      buf.writeUInt32BE(0x41524348, 0);
      buf.writeUInt8(PacketType.HELLO, 4);
      this.nodeId.copy(buf, 5);
      buf.writeUInt32BE(2, 37);
      buf.writeUInt16BE(this.tcpPort, 41);
      this.socket.send(buf, MULTICAST_PORT, MULTICAST_IP);
    }, 10000); // Hello toutes les 10s pour accélérer les tests
  }
}