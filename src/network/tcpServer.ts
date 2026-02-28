// src/network/tcpServer.ts
import { EventEmitter } from 'events';
import net from 'net';

/**
 * Parseur TLV (Type-Length-Value) pour sécuriser le flux TCP
 * Il garantit qu'on ne traite qu'un paquet complet et valide à la fois.
 */
class TcpStreamParser extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly HEADER_SIZE = 41; // MAGIC(4) + TYPE(1) + NODE_ID(32) + PAYLOAD_LEN(4)

  constructor(private socket: net.Socket) {
    super();
    this.socket.on('data', (chunk) => this.handleData(chunk as Buffer));
  }

  private handleData(chunk: Buffer) {
    // 1. Accumulation des fragments TCP
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // 2. Boucle d'extraction des paquets
    while (this.buffer.length >= this.HEADER_SIZE) {
      
      // Sécurité : Validation stricte du MAGIC "ARCH"
      const magic = this.buffer.readUInt32BE(0);
      if (magic !== 0x41524348) {
        console.error(`[TCP] Flux corrompu depuis ${this.socket.remoteAddress}, MAGIC invalide.`);
        this.socket.destroy();
        return;
      }

      // 3. Lecture de la taille annoncée
      const payloadLen = this.buffer.readUInt32BE(37);
      const totalPacketSize = this.HEADER_SIZE + payloadLen;

      // 4. Découpage si le paquet est entièrement arrivé
      if (this.buffer.length >= totalPacketSize) {
        const fullPacket = this.buffer.subarray(0, totalPacketSize);
        this.buffer = this.buffer.subarray(totalPacketSize);
        
        // Émission du buffer propre vers la logique métier
        this.emit('packet', fullPacket);
      } else {
        // Paquet incomplet, on attend le prochain événement 'data'
        break;
      }
    }
  }
}

/**
 * Serveur TCP Principal (Module 1.3)
 */
export class TcpServer {
  private server: net.Server;
  private port: number;

  constructor(port: number) {
    this.port = port;
    this.server = net.createServer((socket) => this.handleConnection(socket));
    
    // Contrainte de charge du hackathon
    this.server.maxConnections = 50; 
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`[TCP] Serveur en écoute sur le port ${this.port}`);
    });
  }

  private handleConnection(socket: net.Socket) {
    console.log(`[TCP] Nouvelle connexion de ${socket.remoteAddress}:${socket.remotePort}`);
    
    // Contrainte réseau : Keep-alive de 15 secondes
    socket.setKeepAlive(true, 15000); 

    // Instanciation du bouclier anti-fragmentation
    const parser = new TcpStreamParser(socket);
    
    parser.on('packet', (packetBuffer: Buffer) => {
      const type = packetBuffer.readUInt8(4);
      console.log(`[TCP] Paquet reçu ! Type: 0x0${type}, Taille totale: ${packetBuffer.length} bytes`);
      
      // TODO Sprint 2 : Envoyer ce buffer au module Crypto de ton collègue
    });

    socket.on('error', (err) => console.error(`[TCP] Erreur socket : ${err.message}`));
    socket.on('close', () => console.log(`[TCP] Connexion fermée avec ${socket.remoteAddress}`));
  }
}