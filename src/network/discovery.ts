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

  /**
   * @param manifestToShare Peut être null si le dossier /shared est vide (Mode Receveur)
   */
  constructor(
    nodeId: Buffer, 
    tcpPort: number, 
    fileManager: FileManager, 
    manifestToShare: FileManifest | null = null
  ) {
    this.nodeId = nodeId;
    this.tcpPort = tcpPort;
    this.fileManager = fileManager;
    this.manifestToShare = manifestToShare;
    this.peerTable = new PeerTable();
    
    // Utilisation de reuseAddr pour permettre plusieurs instances sur la même machine (test local)
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.on('error', (err) => {
      console.error(`[UDP] Erreur : ${err.message}`);
      this.socket.close();
    });

    this.socket.on('message', (msg, rinfo) => {
      // 1. Vérification du MAGIC "ARCH"
      const magic = msg.readUInt32BE(0);
      if (magic !== 0x41524348) return;

      const type = msg.readUInt8(4);
      if (type === PacketType.HELLO) {
        const senderId = msg.subarray(5, 37);
        
        // 2. Ignorer nos propres paquets
        if (senderId.equals(this.nodeId)) return;

        const remoteTcpPort = msg.readUInt16BE(41);
        const senderIdHex = senderId.toString('hex');

        // 3. Vérifier si c'est un nouveau pair
        const isNew = !this.peerTable.getPeers().some(p => p.node_id === senderIdHex);
        
        // Mise à jour de la table des pairs
        this.peerTable.upsert(senderId, rinfo.address, remoteTcpPort);

        if (isNew) {
          console.log(`[UDP] Nouveau pair détecté : ${rinfo.address}:${remoteTcpPort}`);
          
          // 4. Lancer une connexion TCP vers le nouveau pair
          // On passe le fileManager et le manifeste local (même s'il est null)
          const client = new TcpClient(this.nodeId, this.fileManager);
          client.connect(rinfo.address, remoteTcpPort, this.manifestToShare);
        }
      }
    });

    // Liaison au port de multicast
    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true);
      // Optionnel : joindre un groupe multicast si nécessaire sur ton réseau
      // this.socket.addMembership(MULTICAST_IP);
      
      console.log(`[UDP] Découverte active sur le port ${MULTICAST_PORT}`);
      this.startHelloLoop();
    });
  }

  /**
   * Envoie un paquet HELLO toutes les 10 secondes pour annoncer notre présence
   */
  private startHelloLoop() {
    setInterval(() => {
      const buf = Buffer.alloc(43);
      buf.writeUInt32BE(0x41524348, 0);       // MAGIC
      buf.writeUInt8(PacketType.HELLO, 4);    // TYPE
      this.nodeId.copy(buf, 5);               // SENDER_ID
      buf.writeUInt32BE(2, 37);               // PAYLOAD_LEN (Le port TCP = 2 octets)
      buf.writeUInt16BE(this.tcpPort, 41);    // PAYLOAD (Notre port TCP)

      this.socket.send(buf, MULTICAST_PORT, MULTICAST_IP, (err) => {
        if (err) console.error(`[UDP] Échec envoi HELLO : ${err.message}`);
      });
    }, 10000); 
  }
}