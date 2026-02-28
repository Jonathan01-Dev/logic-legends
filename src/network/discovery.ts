import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';
import { PeerTable } from './peerTable';
import { TcpClient } from './tcpClient';
import { FileManager } from './fileManager';
import { FileManifest } from '../models/manifest';
import { NetworkDirectory } from './networkDirectory';

export class Discovery {
  private socket: dgram.Socket;
  public peerTable: PeerTable = new PeerTable();

  constructor(
    private nodeId: Buffer, 
    private tcpPort: number, 
    private fileManager: FileManager, 
    private networkDirectory: NetworkDirectory, 
    private manifestToShare: FileManifest | null = null
  ) {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.on('message', (msg, rinfo) => {
      const magic = msg.readUInt32BE(0);
      if (magic !== 0x41524348) return;

      const type = msg.readUInt8(4);
      if (type === PacketType.HELLO) {
        const senderId = msg.subarray(5, 37);
        if (senderId.equals(this.nodeId)) return;

        const remoteTcpPort = msg.readUInt16BE(41);
        const senderIdHex = senderId.toString('hex');
        
        const isNew = !this.peerTable.getPeers().some(p => p.node_id === senderIdHex);
        this.peerTable.upsert(senderId, rinfo.address, remoteTcpPort);

        if (isNew) {
          console.log(`[UDP] Nouveau pair : ${rinfo.address}:${remoteTcpPort}`);
          const client = new TcpClient(this.nodeId, this.fileManager, this.networkDirectory);
          client.connect(rinfo.address, remoteTcpPort, this.manifestToShare);
        }
      }
    });

    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true);
      
      try {
        // Tentative de rejoindre le groupe multicast
        this.socket.addMembership(MULTICAST_IP);
      } catch (e) {
        // On ne crash plus si l'interface multicast n'est pas dispo
        console.log(`[UDP] Note: Multicast strict non dispo, passage en mode broadcast.`);
      }

      this.sendHello();
      setInterval(() => this.sendHello(), 10000);
    });
  }

  private sendHello() {
    const buf = Buffer.alloc(43);
    buf.writeUInt32BE(0x41524348, 0);
    buf.writeUInt8(PacketType.HELLO, 4);
    this.nodeId.copy(buf, 5);
    buf.writeUInt32BE(2, 37);
    buf.writeUInt16BE(this.tcpPort, 41);
    this.socket.send(buf, MULTICAST_PORT, MULTICAST_IP, (err) => {
      if (err) console.error(`[UDP] Erreur d'envoi HELLO : ${err.message}`);
    });
  }
}