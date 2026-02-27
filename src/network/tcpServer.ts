// src/network/tcpServer.ts
import net from 'net';
import { DEFAULT_TCP_PORT } from './types';

export class TcpServer {
  private server: net.Server;
  private port: number;

  constructor(port: number = DEFAULT_TCP_PORT) { // Port configurable [cite: 151]
    this.port = port;
    this.server = net.createServer((socket) => this.handleConnection(socket));
    
    // Minimum 10 connexions parallèles exigées [cite: 152]
    this.server.maxConnections = 50; 
  }

  public start() {
    this.server.listen(this.port, () => {
      console.log(`[TCP] Serveur en écoute sur le port ${this.port}`);
    });
  }

  private handleConnection(socket: net.Socket) {
    console.log(`[TCP] Nouvelle connexion entrante de ${socket.remoteAddress}`);
    
    // Keep-alive : ping/pong toutes les 15 secondes [cite: 154]
    socket.setKeepAlive(true, 15000); 

    socket.on('data', (data) => {
      // Le flux sera découpé ici plus tard grâce au protocole TLV [cite: 153]
      console.log(`[TCP] Reçu ${data.length} bytes`);
    });

    socket.on('error', (err) => console.error(`[TCP] Erreur : ${err.message}`));
    socket.on('close', () => console.log(`[TCP] Connexion fermée avec ${socket.remoteAddress}`));
  }
}