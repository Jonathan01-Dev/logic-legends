// src/network/discovery.ts
import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';
import { PeerTable } from './peerTable';
import { TcpClient } from './tcpClient'; // Import du TcpClient pour initier le Handshake

export class Discovery {
  private socket: dgram.Socket;
  private nodeId: Buffer;
  private tcpPort: number;
  public peerTable: PeerTable;

  constructor(nodeId: Buffer, tcpPort: number) {
    this.nodeId = nodeId;
    this.tcpPort = tcpPort;
    this.peerTable = new PeerTable();
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      // VITAL : On autorise le broadcast pur
      this.socket.setBroadcast(true);

      console.log(`[UDP] Mode BROADCAST LOCAL pur activé sur le port ${MULTICAST_PORT}`);

      this.startHelloLoop();
      this.startPurgeLoop();
    });

    this.socket.on('message', (msg, rinfo) => {
      this.handleIncomingMessage(msg, rinfo);
    });

    this.socket.on('error', (err) => {
      console.error(`[UDP] Erreur socket : ${err.message}`);
    });
  }

  private startHelloLoop() {
    // Émission du paquet HELLO toutes les 30 secondes
    setInterval(() => {
      const helloPacket = this.buildHelloPacket();
      this.socket.send(helloPacket, MULTICAST_PORT, MULTICAST_IP, (err) => {
        if (err) console.error('[UDP] Erreur d\'envoi HELLO:', err.message);
      });
    }, 30000);

    // Émettre immédiatement au démarrage sans attendre 30s
    const initPacket = this.buildHelloPacket();
    this.socket.send(initPacket, MULTICAST_PORT, MULTICAST_IP);
  }

  private startPurgeLoop() {
    // Vérifier les timeouts (90s) toutes les 10 secondes
    setInterval(() => {
      this.peerTable.purgeDeadNodes();
    }, 10000);
  }

  private buildHelloPacket(): Buffer {
    // Header (41 bytes) + Payload TCP Port (2 bytes) = 43 bytes total
    const buf = Buffer.alloc(43); 
    
    // 1. Header Archipel
    buf.writeUInt32BE(0x41524348, 0);       // MAGIC "ARCH"
    buf.writeUInt8(PacketType.HELLO, 4);    // TYPE 0x01
    this.nodeId.copy(buf, 5);               // NODE_ID (32 bytes)
    buf.writeUInt32BE(2, 37);               // PAYLOAD_LEN = 2 octets

    // 2. Payload (Le port TCP sur lequel on écoute)
    buf.writeUInt16BE(this.tcpPort, 41);    // TCP_PORT (2 bytes)

    return buf;
  }

  private handleIncomingMessage(msg: Buffer, rinfo: dgram.RemoteInfo) {
    // Sécurité : taille minimale d'un paquet HELLO valide (43 bytes)
    if (msg.length < 43) return;

    // Validation du MAGIC
    const magic = msg.readUInt32BE(0);
    if (magic !== 0x41524348) return;

    const type = msg.readUInt8(4);
    if (type === PacketType.HELLO) {
      const senderId = msg.subarray(5, 37);
      
      // On s'ignore soi-même
      if (senderId.equals(this.nodeId)) return;

      // Extraction du port TCP du payload
      const payloadLen = msg.readUInt32BE(37);
      if (payloadLen >= 2) {
        const remoteTcpPort = msg.readUInt16BE(41);
        const idHex = senderId.toString('hex');
        
        // 1. Vérifier si c'est un TOUT NOUVEAU voisin avant de l'ajouter
        const isNewPeer = !this.peerTable.getPeers().some(p => p.node_id === idHex);

        // 2. Enregistrement / Mise à jour dans la Peer Table (Module 1.2)
        this.peerTable.upsert(senderId, rinfo.address, remoteTcpPort);

        // 3. SI C'EST UN NOUVEAU NŒUD, ON LANCE LE HANDSHAKE TCP !
        if (isNewPeer) {
          const client = new TcpClient(this.nodeId);
          client.connect(rinfo.address, remoteTcpPort);
        }
      }
    }
  }
}