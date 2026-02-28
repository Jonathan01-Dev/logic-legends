import dgram from 'dgram';
import { MULTICAST_IP, MULTICAST_PORT, PacketType } from './types';
import { TcpClient } from './tcpClient';

export class Discovery {
  private socket: dgram.Socket;
  constructor(private nodeId: Buffer, private port: number, private fm: any, private nd: any, private manifest: any = null) {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  }

  public start() {
    this.socket.on('message', (msg, rinfo) => {
      const type = msg.readUInt8(4);
      const senderId = msg.subarray(5, 37);
      if (senderId.equals(this.nodeId)) return;

      if (type === PacketType.HELLO) {
        console.log(`[UDP] Pair détecté : ${rinfo.address}`);
        const client = new TcpClient(this.nodeId, this.fm, this.nd);
        client.connect(rinfo.address, msg.readUInt16BE(41), this.manifest);
      }
    });

    this.socket.bind(MULTICAST_PORT, '0.0.0.0', () => {
      this.socket.setBroadcast(true);
      setInterval(() => {
        const buf = Buffer.alloc(43);
        buf.writeUInt32BE(0x41524348, 0); buf.writeUInt8(PacketType.HELLO, 4);
        this.nodeId.copy(buf, 5); buf.writeUInt32BE(2, 37); buf.writeUInt16BE(this.port, 41);
        this.socket.send(buf, MULTICAST_PORT, MULTICAST_IP);
      }, 3000);
    });
  }
}