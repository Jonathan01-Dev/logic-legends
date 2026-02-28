import dgram from 'dgram';
import os from 'os';
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

  // --- FONCTION MAGIQUE POUR WINDOWS ---
  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        // On cherche une adresse IPv4 qui n'est pas interne (127.0.0.1)
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '0.0.0.0';
  }

  public start() {
    const localIp = this.getLocalIp();
    console.log(`[UDP] Interface détectée : ${localIp}`);

    this.socket.on('message', (msg, rinfo) => {
      const magic = msg.readUInt32BE(0);
      if (magic !== 0x41524348) return;

      const type = msg.readUInt8(4);
      if (type === PacketType.HELLO) {
        const senderId = msg.subarray(5, 37);
        if (senderId.equals(this.nodeId)) return;

        const remotePort = msg.readUInt16BE(41);
        const senderIdHex = senderId.toString('hex');
        
        const isNew = !this.peerTable.getPeers().some(p => p.node_id === senderIdHex);
        this.peerTable.upsert(senderId, rinfo.address, remotePort);

        if (isNew) {
          console.log(`[URGENT] Pair trouvé sur ${rinfo.address}. Connexion...`);
          const client = new TcpClient(this.nodeId, this.fileManager, this.networkDirectory);
          client.connect(rinfo.address, remotePort, this.manifestToShare);
        }
      }
    });

    // On lie le socket explicitement à l'IP locale pour éviter les conflits
    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true);
      
      try {
        // On force le multicast sur l'interface active
        this.socket.setMulticastInterface(localIp);
        this.socket.addMembership(MULTICAST_IP, localIp);
      } catch (e) {
        console.log(`[UDP] Mode Broadcast activé sur ${localIp}`);
      }

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