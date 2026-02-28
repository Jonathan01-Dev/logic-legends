// src/network/peerTable.ts
export interface Peer {
  node_id: string; // Hex string de la clé publique
  ip: string;
  tcp_port: number;
  last_seen: number;
}

export class PeerTable {
  private peers: Map<string, Peer> = new Map();

  public upsert(nodeId: Buffer, ip: string, tcpPort: number) {
    const idHex = nodeId.toString('hex');
    this.peers.set(idHex, {
      node_id: idHex,
      ip: ip,
      tcp_port: tcpPort,
      last_seen: Date.now()
    });
    this.printTable();
  }

  public getPeers(): Peer[] {
    return Array.from(this.peers.values());
  }

  public purgeDeadNodes() {
    const now = Date.now();
    for (const [id, peer] of this.peers.entries()) {
      // Timeout: nœud considéré mort après 90 secondes 
      if (now - peer.last_seen > 90000) {
        this.peers.delete(id);
        console.log(`[PEER TABLE] Nœud ${id.substring(0, 8)} supprimé (Timeout)`);
      }
    }
  }

  private printTable() {
    console.log(`\n--- PEER TABLE ACTIVE ---`);
    this.peers.forEach(p => console.log(`- ID: ${p.node_id.substring(0, 8)} | IP: ${p.ip}:${p.tcp_port}`));
    console.log(`-------------------------\n`);
  }
}