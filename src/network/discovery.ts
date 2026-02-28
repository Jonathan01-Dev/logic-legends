import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';
import { PeerTable } from './peerTable';
import { TcpClient } from './tcpClient';
import { FileManager } from './fileManager';
import { NetworkDirectory } from './networkDirectory';

export class Discovery {
  private socket: dgram.Socket;
  public peerTable: PeerTable = new PeerTable();

  constructor(
    private nodeId: Buffer, 
    private tcpPort: number, 
    private fileManager: FileManager, 
    private networkDirectory: NetworkDirectory, 
    private manifestToShare: any = null
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

        const remotePort = msg.readUInt16BE(41);
        const senderIdHex = senderId.toString('hex');
        
        console.log(`[UDP] Signal reçu de ${rinfo.address}:${remotePort} (${senderIdHex.substring(0,8)})`);

        const isNew = !this.peerTable.getPeers().some(p => p.node_id === senderIdHex);
        this.peerTable.upsert(senderId, rinfo.address, remotePort);

        if (isNew) {
          console.log(`[URGENT] Nouvelle connexion vers ${rinfo.address}`);
          const client = new TcpClient(this.nodeId, this.fileManager, this.networkDirectory);
          client.connect(rinfo.address, remotePort, this.manifestToShare);
        }
      }
    });

    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true); // Autorise l'envoi vers 255.255.255.255
      console.log(`[UDP] Recherche de pairs active...`);
      
      setInterval(() => {
        const buf = Buffer.alloc(43);
        buf.writeUInt32BE(0x41524348, 0);
        buf.writeUInt8(PacketType.HELLO, 4);
        this.nodeId.copy(buf, 5);
        buf.writeUInt32BE(2, 37);
        buf.writeUInt16BE(this.tcpPort, 41);
        
        this.socket.send(buf, MULTICAST_PORT, MULTICAST_IP);
      }, 5000);
    });
  }
}