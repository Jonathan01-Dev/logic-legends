// src/network/discovery.ts
import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';

export class Discovery {
  private socket: dgram.Socket;
  private nodeId: Buffer;
  private tcpPort: number;

  constructor(nodeId: Buffer, tcpPort: number) {
    this.nodeId = nodeId;
    this.tcpPort = tcpPort;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.bind(MULTICAST_PORT, () => {
      this.socket.addMembership(MULTICAST_IP); // Rejoindre le groupe LAN [cite: 118, 125]
      console.log(`[UDP] Écoute Multicast démarrée sur ${MULTICAST_IP}:${MULTICAST_PORT}`);
      this.startHelloLoop();
    });

    this.socket.on('message', (msg, rinfo) => { // [cite: 134]
      this.handleIncomingMessage(msg, rinfo);
    });
  }

  private startHelloLoop() {
    setInterval(() => { // [cite: 126]
      const helloPacket = this.buildHelloPacket();
      this.socket.send(helloPacket, MULTICAST_PORT, MULTICAST_IP); // [cite: 132]
    }, 30000); // Émission toutes les 30 secondes [cite: 119, 133]
  }

  private buildHelloPacket(): Buffer {
    // Structure minimale : MAGIC (4) + TYPE (1) + NODE_ID (32) + PAYLOAD_LEN (4) [cite: 78-83]
    const buf = Buffer.alloc(41); 
    buf.writeUInt32BE(0x41524348, 0); // "ARCH" en hexadécimal (MAGIC) [cite: 78, 80]
    buf.writeUInt8(PacketType.HELLO, 4); // [cite: 79, 87]
    this.nodeId.copy(buf, 5); // Insertion de ton ID (32 bytes) [cite: 81]
    buf.writeUInt32BE(0, 37); // PAYLOAD LEN = 0 pour ce paquet simple [cite: 82-83]
    return buf;
  }

  private handleIncomingMessage(msg: Buffer, rinfo: dgram.RemoteInfo) {
    if (msg.length < 5) return; // Sécurité de lecture

    const magic = msg.readUInt32BE(0);
    if (magic !== 0x41524348) return; // Ignorer les paquets non-Archipel

    const type = msg.readUInt8(4);
    if (type === PacketType.HELLO) { // [cite: 136]
      const senderId = msg.subarray(5, 37);
      
      if (!senderId.equals(this.nodeId)) { // Ne pas se découvrir soi-même [cite: 136]
        console.log(`[UDP] Nœud découvert (${rinfo.address})`);
        // Prochaine étape : peerTable.upsert(senderId, ip, port) [cite: 137]
      }
    }
  }
}