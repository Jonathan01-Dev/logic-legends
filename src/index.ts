// src/index.ts
import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';
import { FileManager } from './network/fileManager';

const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');
const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex');

const args = process.argv.slice(2);
const tcpPort = args.find(arg => !isNaN(parseInt(arg))) ? parseInt(args[0]) : 7777;

const fileManager = new FileManager();
const sharedPath = path.join(process.cwd(), 'shared');

// --- SCANNAGE DU DOSSIER SHARED ---
let localManifest = null;
const files = fs.readdirSync(sharedPath).filter(f => !f.startsWith('DOWNLOAD_') && f !== '.gitkeep');

if (files.length > 0) {
    const fileToShare = files[0]; // On prend le premier fichier trouvé pour le test S3
    console.log(`[SYSTEM] Fichier détecté : ${fileToShare}. Indexation...`);
    localManifest = fileManager.shareFile(fileToShare);
    if (localManifest) {
        console.log(`✅ Mode ÉMETTEUR activé pour : ${fileToShare} (${localManifest.chunks.length} chunks)`);
    }
} else {
    console.log(`[SYSTEM] Dossier /shared vide. Mode RECEVEUR uniquement.`);
}

// Lancement du serveur (Toujours actif pour recevoir des requêtes ou des manifestes)
const tcpServer = new TcpServer(nodeId, tcpPort, fileManager);
tcpServer.start();

// Lancement de la découverte (On passe le manifeste s'il existe, sinon null)
const discovery = new Discovery(nodeId, tcpPort, fileManager, localManifest);
discovery.start();

console.log(`🚀 Nœud Archipel prêt sur le port ${tcpPort}`);