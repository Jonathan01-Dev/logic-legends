import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';
import { PeerTable } from './peerTable';
import { TcpClient } from './tcpClient';
import { FileManager } from './fileManager';
import { FileManifest } from '../models/manifest';
import { NetworkDirectory } from './networkDirectory'; // AJOUT SPRINT 4

export class Discovery {
  private socket: dgram.Socket;
  public peerTable: PeerTable = new PeerTable();

  constructor(
    private nodeId: Buffer, 
    private tcpPort: number, 
    private fileManager: FileManager, 
    private networkDirectory: NetworkDirectory, // AJOUT SPRINT 4
    private manifestToShare: FileManifest | null = null
  ) {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.on('message', (msg, rinfo) => {
      // 1. Vérification du MAGIC "ARCH"
      const magic = msg.readUInt32BE(0);
      if (magic !== 0x41524348) return;

      const type = msg.readUInt8(4);
      if (type === PacketType.HELLO) {
        const senderId = msg.subarray(5, 37);
        
        // Ignorer nos propres paquets
        if (senderId.equals(this.nodeId)) return;

        const remoteTcpPort = msg.readUInt16BE(41);
        const senderIdHex = senderId.toString('hex');

        // 2. Vérifier si c'est un nouveau pair
        const isNew = !this.peerTable.getPeers().some(p => p.node_id === senderIdHex);
        
        // Mise à jour de la table des pairs (Liveness)
        this.peerTable.upsert(senderId, rinfo.address, remoteTcpPort);

        if (isNew) {
          console.log(`[UDP] Nouveau pair détecté : ${rinfo.address}:${remoteTcpPort}`);
          
          // 3. CRUCIAL : On passe l'annuaire (networkDirectory) au client
          const client = new TcpClient(this.nodeId, this.fileManager, this.networkDirectory);
          client.connect(rinfo.address, remoteTcpPort, this.manifestToShare);
        }
      }
    });

    // Liaison au port de multicast
    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true);
      console.log(`[UDP] Découverte active (Sprint 4)`);
      this.startHelloLoop();
    });
  }

  /**
   * Envoie un paquet HELLO périodique pour annoncer notre présence
   */
  private startHelloLoop() {
    setInterval(() => {
      const buf = Buffer.alloc(43);
      buf.writeUInt32BE(0x41524348, 0);       // MAGIC
      buf.writeUInt8(PacketType.HELLO, 4);    // TYPE
      this.nodeId.copy(buf, 5);               // SENDER_ID
      buf.writeUInt32BE(2, 37);               // PAYLOAD_LEN
      buf.writeUInt16BE(this.tcpPort, 41);    // NOTRE PORT TCP

      this.socket.send(buf, MULTICAST_PORT, MULTICAST_IP, (err) => {
        if (err) console.error(`[UDP] Erreur HELLO : ${err.message}`);
      });
    }, 10000); 
  }
}