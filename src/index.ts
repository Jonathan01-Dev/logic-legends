import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';
import { FileManager } from './network/fileManager';
import { NetworkDirectory } from './network/networkDirectory';
import { CLI } from './cli'; // Import du nouveau module

async function main() {
  try {
    const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');
    const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
    const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex');

    const args = process.argv.slice(2);
    const tcpPort = args.find(a => !a.startsWith('--')) ? parseInt(args.find(a => !a.startsWith('--')) as string) : 7777;
    
    // Détection du flag --no-ai imposé par le hackathon 
    const aiEnabled = !args.includes('--no-ai');

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

    const discovery = new Discovery(nodeId, tcpPort, fileManager, networkDirectory, localManifest);
    discovery.start();

    // Démarrage de l'interface de commande
    const cli = new CLI(nodeId.toString('hex'), tcpPort, discovery, fileManager, networkDirectory, aiEnabled);
    cli.start();

  } catch (error) { 
    console.error("❌ Erreur d'initialisation :", error); 
  }
}

main();