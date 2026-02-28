export interface Peer {
  node_id: string;
  ip: string;
  tcp_port: number;
  last_seen: number;
}

export class PeerTable {
  private peers: Map<string, Peer> = new Map();

  public upsert(nodeId: Buffer, ip: string, port: number) {
    const idStr = nodeId.toString('hex');
    this.peers.set(idStr, {
      node_id: idStr,
      ip: ip,
      tcp_port: port,
      last_seen: Date.now()
    });
    // Les console.log() ont été supprimés ici pour garantir un CLI propre
  }

  public getPeers(): Peer[] {
    const now = Date.now();
    for (const [id, peer] of this.peers.entries()) {
      // Timeout de 90 secondes selon le cahier des charges
      if (now - peer.last_seen > 90000) {
        this.peers.delete(id);
      }
    }
    return Array.from(this.peers.values());
  }
}