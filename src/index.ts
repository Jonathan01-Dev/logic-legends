// src/index.ts
import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';
import { FileManager } from './network/fileManager';

const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');

if (!fs.existsSync(keyFile)) {
    console.error('Clés introuvables ! Lance d\'abord : node src/crypto/generateKeys.js');
    process.exit(1);
}

const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex');
const nodeIdHex = nodeId.toString('hex').substring(0, 8);

const args = process.argv.slice(2);
const portArg = args.find(arg => !isNaN(parseInt(arg)));
const tcpPort = portArg ? parseInt(portArg) : 7777;

// --- INITIALISATION DU SPRINT 3 ---
const fileManager = new FileManager();
const testFile = 'test.txt';

// On prépare le fichier pour le partage (Génération du Manifeste)
const manifest = fileManager.shareFile(testFile);

console.log(`\n🚀 Nœud Archipel [ID: ${nodeIdHex}] sur le port ${tcpPort}`);
console.log(`--------------------------------------------------`);

// Lancement du Serveur TCP avec le nodeId
const tcpServer = new TcpServer(nodeId, tcpPort);
tcpServer.start();

// Lancement de la Découverte UDP
const discovery = new Discovery(nodeId, tcpPort);
discovery.start();

console.log(`--------------------------------------------------`);
if (manifest) {
    console.log(`📄 Fichier partagé : ${testFile} (${manifest.fileHash.substring(0,12)}...)`);
}
console.log(`Nœud opérationnel. En attente de pairs...\n`);