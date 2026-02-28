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

// --- CONFIGURATION DU TEST 50 MO ---
// 1. Assure-toi que ce fichier existe dans le dossier /shared
const fileName = 'test_50mb.dat'; 
const filePath = path.join(process.cwd(), 'shared', fileName);

if (!fs.existsSync(filePath)) {
    console.error(`❌ ERREUR : Le fichier ${fileName} est introuvable dans /shared !`);
    console.log(`Conseil : fsutil file createnew shared/${fileName} 52428800`);
    process.exit(1);
}

// 2. Génération du manifeste lourd
console.log(`[SYSTEM] Indexation du fichier de 50 Mo... (Patientez)`);
const manifest = fileManager.shareFile(fileName);

if (manifest) {
    console.log(`✅ Manifeste généré : ${manifest.chunks.length} morceaux.`);
}

const tcpServer = new TcpServer(nodeId, tcpPort, fileManager);
tcpServer.start();

// 3. On passe le VRAI manifeste à Discovery pour qu'il le donne aux clients
const discovery = new Discovery(nodeId, tcpPort, fileManager, manifest);
discovery.start();

console.log(`🚀 Nœud prêt. Partage actif de : ${fileName}`);