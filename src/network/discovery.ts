import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';
import { PeerTable } from './peerTable';
import { TcpClient } from './tcpClient';
import { FileManager } from './fileManager';
import { NetworkDirectory } from './networkDirectory';

export class Discovery {
  private socket: dgram.Socket;
  public peerTable: PeerTable = new PeerTable();

  constructor(private nodeId: Buffer, private port: number, private fm: FileManager, private nd: NetworkDirectory, private manifest: any = null) {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.on('message', (msg, rinfo) => {
      const type = msg.readUInt8(4);
      const senderId = msg.subarray(5, 37);
      if (senderId.equals(this.nodeId)) return;

      if (type === PacketType.HELLO) {
        const remotePort = msg.readUInt16BE(41);
        const senderIdHex = senderId.toString('hex');
        const isNew = !this.peerTable.getPeers().some(p => p.node_id === senderIdHex);
        
        this.peerTable.upsert(senderId, rinfo.address, remotePort);

        if (isNew) {
          const client = new TcpClient(this.nodeId, this.fm, this.nd);
          // On passe false pour ne PAS télécharger automatiquement
          client.connect(rinfo.address, remotePort, this.manifest, false);
        }
      }
    });

    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true);
      setInterval(() => {
        const buf = Buffer.alloc(43);
        buf.writeUInt32BE(0x41524348, 0); buf.writeUInt8(PacketType.HELLO, 4);
        this.nodeId.copy(buf, 5); buf.writeUInt32BE(2, 37); buf.writeUInt16BE(this.port, 41);
        this.socket.send(buf, MULTICAST_PORT, MULTICAST_IP);
      }, 3000);
    });
  }

  public search(term: string) {
    // La logique de recherche UDP peut rester ici pour plus tard
  }
}