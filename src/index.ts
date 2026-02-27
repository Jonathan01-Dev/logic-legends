import crypto from 'crypto';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';

// 1. Génération d'un Node ID factice (32 bytes) pour le test
// Remplacé plus tard par la vraie clé publique Ed25519 du Membre 2
const dummyNodeId = crypto.randomBytes(32);
const nodeIdHex = dummyNodeId.toString('hex').substring(0, 8); // Juste pour l'affichage

// 2. Récupération du port TCP via la ligne de commande (ex: npm start -- 7777)
// Si non fourni, on utilise 7777 par défaut
const args = process.argv.slice(2);
const portArg = args.find(arg => !isNaN(parseInt(arg)));
const tcpPort = portArg ? parseInt(portArg) : 7777;

console.log(`\n🚀 Démarrage du Nœud Archipel [ID: ${nodeIdHex}...]`);
console.log(`--------------------------------------------------`);

// 3. Lancement du Serveur TCP (Module 1.3)
const tcpServer = new TcpServer(tcpPort);
tcpServer.start();

// 4. Lancement de la Découverte UDP (Module 1.1)
const discovery = new Discovery(dummyNodeId, tcpPort);
discovery.start();

console.log(`--------------------------------------------------`);
console.log(`Nœud opérationnel. En attente de pairs...\n`);