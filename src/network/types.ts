export const MULTICAST_IP = '255.255.255.255';
export const MULTICAST_PORT = 12345;

export enum PacketType {
  HELLO = 0x01,
  QUERY = 0x02,
  RESPONSE = 0x03,
  HANDSHAKE = 0x04,
  MANIFEST = 0x05,
  CHUNK_REQ = 0x06,
  CHUNK_DATA = 0x07,
  MSG = 0x08 // Ajout du paquet Message [cite: 89]
}