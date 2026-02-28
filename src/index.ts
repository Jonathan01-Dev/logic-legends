import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';

const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');
const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));

if (!fs.existsSync(keyFile)) {
    console.error('Clés introuvables ! Lance d\'abord : node src/crypto/generateKeys.js');
    process.exit(1);
}

const baseNodeId = Buffer.from(identity.ed25519.publicKey, 'hex'); // 32 bytes
const nodeIdHex = identity.node_id.substring(0, 8);
const nodeId = baseNodeId;

// 2. Récupération du port TCP via la ligne de commande (ex: npm start -- 7777)
const args = process.argv.slice(2);
const portArg = args.find(arg => !isNaN(parseInt(arg)));
const tcpPort = portArg ? parseInt(portArg) : 7777;
baseNodeId.writeUInt16BE(tcpPort, 30);

console.log(`\n🚀 Démarrage du Nœud Archipel [ID: ${nodeIdHex}...]`);
console.log(`--------------------------------------------------`);

// 3. Lancement du Serveur TCP (Module 1.3)
const tcpServer = new TcpServer(tcpPort);
tcpServer.start();

// 4. Lancement de la Découverte UDP (Module 1.1)
const discovery = new Discovery(nodeId, tcpPort);
discovery.start();

console.log(`--------------------------------------------------`);
console.log(`Nœud opérationnel. En attente de pairs...\n`);