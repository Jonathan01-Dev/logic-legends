// src/index.ts
import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';

const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');

// 1. Sécurité : On vérifie si les clés existent avant de démarrer
if (!fs.existsSync(keyFile)) {
    console.error('Clés introuvables ! Lance d\'abord : node src/crypto/generateKeys.js');
    process.exit(1);
}

// 2. Chargement de l'identité cryptographique PURE
const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex'); // 32 bytes intacts
const nodeIdHex = nodeId.toString('hex').substring(0, 8); // Pour l'affichage

// 3. Récupération du port TCP via CLI (Défaut : 7777)
const args = process.argv.slice(2);
const portArg = args.find(arg => !isNaN(parseInt(arg)));
const tcpPort = portArg ? parseInt(portArg) : 7777;

console.log(`\n🚀 Démarrage du Nœud Archipel [ID: ${nodeIdHex}...]`);
console.log(`--------------------------------------------------`);

// 4. Lancement du Serveur TCP (Module 1.3)
// On passe le nodeId pur pour forger les paquets Handshake
const tcpServer = new TcpServer(nodeId, tcpPort);
tcpServer.start();

// 5. Lancement de la Découverte UDP (Module 1.1)
const discovery = new Discovery(nodeId, tcpPort);
discovery.start();

console.log(`--------------------------------------------------`);
console.log(`Nœud opérationnel. En attente de pairs sur le réseau local...\n`);