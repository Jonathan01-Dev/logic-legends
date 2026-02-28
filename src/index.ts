import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';

const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');

// 1. D'ABORD on vérifie si le fichier existe (Sécurité)
if (!fs.existsSync(keyFile)) {
    console.error('Clés introuvables ! Lance d\'abord : node src/crypto/generateKeys.js');
    process.exit(1);
}

// 2. ENSUITE on le lit et on charge l'identité pure
const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex'); // 32 bytes purs
const nodeIdHex = identity.node_id.substring(0, 8);

// 3. Récupération du port TCP via la ligne de commande (ex: npm start -- 7777)
const args = process.argv.slice(2);
const portArg = args.find(arg => !isNaN(parseInt(arg)));
const tcpPort = portArg ? parseInt(portArg) : 7777;

console.log(`\n🚀 Démarrage du Nœud Archipel [ID: ${nodeIdHex}...]`);
console.log(`--------------------------------------------------`);

// 4. Lancement du Serveur TCP (Module 1.3)
const tcpServer = new TcpServer(tcpPort);
tcpServer.start();

// 5. Lancement de la Découverte UDP (Module 1.1)
const discovery = new Discovery(nodeId, tcpPort);
discovery.start();

console.log(`--------------------------------------------------`);
console.log(`Nœud opérationnel. En attente de pairs...\n`);