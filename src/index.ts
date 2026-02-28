import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';
import { FileManager } from './network/fileManager';
import { NetworkDirectory } from './network/networkDirectory';

async function main() {
  try {
    const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');
    const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
    const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex');

    const args = process.argv.slice(2);
    const tcpPort = args[0] ? parseInt(args[0]) : 7777;

    const fileManager = new FileManager();
    const networkDirectory = new NetworkDirectory();
    const sharedPath = path.join(process.cwd(), 'shared');

    if (!fs.existsSync(sharedPath)) fs.mkdirSync(sharedPath);

    let localManifest = null;
    const files = fs.readdirSync(sharedPath).filter(f => !f.startsWith('DOWNLOAD_') && f !== '.gitkeep');

    if (files.length > 0) {
      localManifest = fileManager.shareFile(files[0]);
      if (localManifest) networkDirectory.updateFile(localManifest, nodeId.toString('hex'));
    }

    const tcpServer = new TcpServer(nodeId, tcpPort, fileManager);
    if (localManifest) tcpServer.setManifest(localManifest);
    tcpServer.start();

    // On passe bien networkDirectory ici
    const discovery = new Discovery(nodeId, tcpPort, fileManager, networkDirectory, localManifest);
    discovery.start();

    console.log(`🚀 NŒUD ARCHIPEL [${nodeId.toString('hex').substring(0, 8)}] PRÊT`);

  } catch (error) { console.error("❌ Erreur :", error); }
}

main();