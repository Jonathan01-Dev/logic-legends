// src/network/types.ts

export const MULTICAST_IP = '255.255.255.255'; 
export const MULTICAST_PORT = 6000;          
export const DEFAULT_TCP_PORT = 7777;

export enum PacketType {
  HELLO = 0x01,       
  PEER_LIST = 0x02,   
  MSG = 0x03,         
  CHUNK_REQ = 0x04,   
  CHUNK_DATA = 0x05,  
  MANIFEST = 0x06,    
  ACK = 0x07,
  HANDSHAKE = 0x08    // NOUVEAU : Pour l'échange des clés éphémères X25519
}