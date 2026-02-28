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

// 1. Initialisation du Gestionnaire de Fichiers
const fileManager = new FileManager();
const testFile = 'test.txt'; 

// 2. Création du dossier shared et du fichier de test s'ils n'existent pas
const sharedPath = path.join(process.cwd(), 'shared');
if (!fs.existsSync(sharedPath)) fs.mkdirSync(sharedPath);
const filePath = path.join(sharedPath, testFile);
if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "Ceci est un test de transfert P2P Archipel !");
}

// 3. Génération du VRAI manifeste
const manifest = fileManager.shareFile(testFile);

console.log(`\n🚀 Nœud Archipel [ID: ${nodeIdHex}] port ${tcpPort}`);

// 4. Lancement du Serveur TCP (avec le fileManager pour répondre aux CHUNK_REQ)
const tcpServer = new TcpServer(nodeId, tcpPort, fileManager);
tcpServer.start();

// 5. Lancement de la Découverte UDP (On lui passe le fileManager ET le manifeste à partager)
// Note: On modifie légèrement l'appel pour passer le manifeste au Discovery
const discovery = new Discovery(nodeId, tcpPort, fileManager, manifest);
discovery.start();

console.log(`--------------------------------------------------`);
console.log(`Nœud opérationnel. Partage de : ${testFile}\n`);