// src/network/types.ts

export const MULTICAST_IP = '255.255.255.255'; // CHANGEMENT CRITIQUE : BROADCAST ABSOLU
export const MULTICAST_PORT = 6000;          
export const DEFAULT_TCP_PORT = 7777;

export enum PacketType {
  HELLO = 0x01,       // annonce de présence sur le réseau [cite: 87]
  PEER_LIST = 0x02,   // réponse avec liste des nœuds connus [cite: 88]
  MSG = 0x03,         // message chiffré [cite: 89]
  CHUNK_REQ = 0x04,   // requête d'un bloc de fichier [cite: 90]
  CHUNK_DATA = 0x05,  // transfert d'un bloc de fichier [cite: 93]
  MANIFEST = 0x06,    // métadonnées d'un fichier (hash, nb chunks) [cite: 94]
  ACK = 0x07          // acquittement [cite: 95]
}