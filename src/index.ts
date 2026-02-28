import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';
import { FileManager } from './network/fileManager';

async function main() {
  try {
    const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');
    const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
    const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex');

    const args = process.argv.slice(2);
    const tcpPort = args[0] ? parseInt(args[0]) : 7777;

    const fileManager = new FileManager();
    const sharedPath = path.join(process.cwd(), 'shared');

    if (!fs.existsSync(sharedPath)) fs.mkdirSync(sharedPath);

    let localManifest = null;
    const files = fs.readdirSync(sharedPath).filter(f => !f.startsWith('DOWNLOAD_') && f !== '.gitkeep');

    if (files.length > 0) {
      console.log(`[SYSTEM] Indexation de : ${files[0]}...`);
      localManifest = fileManager.shareFile(files[0]);
    } else {
      console.log(`[SYSTEM] Mode receveur uniquement.`);
    }

    const tcpServer = new TcpServer(nodeId, tcpPort, fileManager);
    
    // ACTION CRUCIALE : On donne le manifeste au serveur
    if (localManifest) {
      tcpServer.setManifest(localManifest);
    }
    
    tcpServer.start();

    const discovery = new Discovery(nodeId, tcpPort, fileManager, localManifest);
    discovery.start();

    console.log(`🚀 Nœud démarré sur le port ${tcpPort}`);

  } catch (error) {
    console.error("❌ Erreur au démarrage :", error);
  }
}

main();