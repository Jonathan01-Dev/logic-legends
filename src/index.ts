// src/index.ts
import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';
import { FileManager } from './network/fileManager';

const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');

// 1. Vérification des clés
if (!fs.existsSync(keyFile)) {
    console.error('Clés introuvables ! Lance d\'abord : node src/crypto/generateKeys.js');
    process.exit(1);
}

// 2. Chargement de l'identité
const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex');
const nodeIdHex = nodeId.toString('hex').substring(0, 8);

// 3. Configuration du port
const args = process.argv.slice(2);
const portArg = args.find(arg => !isNaN(parseInt(arg)));
const tcpPort = portArg ? parseInt(portArg) : 7777;

// 4. Initialisation du Gestionnaire de Fichiers (Sprint 3)
const fileManager = new FileManager();
const testFile = 'test.txt'; 
const manifest = fileManager.shareFile(testFile);

console.log(`\n🚀 Nœud Archipel [ID: ${nodeIdHex}] sur le port ${tcpPort}`);
console.log(`--------------------------------------------------`);

// 5. Lancement du Serveur TCP (On passe nodeId ET fileManager)
const tcpServer = new TcpServer(nodeId, tcpPort, fileManager);
tcpServer.start();

// 6. Lancement de la Découverte UDP
const discovery = new Discovery(nodeId, tcpPort, fileManager);
discovery.start();

console.log(`--------------------------------------------------`);
if (manifest) {
    console.log(`📄 Fichier en partage : ${testFile}`);
    console.log(`🔑 Hash Global : ${manifest.fileHash.substring(0, 16)}...`);
}
console.log(`Nœud opérationnel. En attente de pairs...\n`);