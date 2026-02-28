import fs from 'fs';
import path from 'path';
import { Discovery } from './network/discovery';
import { TcpServer } from './network/tcpServer';
import { FileManager } from './network/fileManager';
import { NetworkDirectory } from './network/networkDirectory';

async function main() {
  try {
    // 1. Chargement de l'identité du nœud
    const keyFile = path.join(process.cwd(), 'keys', 'node_identity.json');
    if (!fs.existsSync(keyFile)) {
      console.error('❌ Identité introuvable. Génère les clés d\'abord.');
      return;
    }
    const identity = JSON.parse(fs.readFileSync(keyFile, 'utf-8'));
    const nodeId = Buffer.from(identity.ed25519.publicKey, 'hex');
    const nodeIdShort = nodeId.toString('hex').substring(0, 8);

    // 2. Configuration du port
    const args = process.argv.slice(2);
    const tcpPort = args[0] ? parseInt(args[0]) : 7777;

    // 3. Initialisation des composants cœurs
    const fileManager = new FileManager();
    const networkDirectory = new NetworkDirectory(); // L'annuaire du Sprint 4
    const sharedPath = path.join(process.cwd(), 'shared');

    if (!fs.existsSync(sharedPath)) fs.mkdirSync(sharedPath);

    // 4. Indexation locale (Mode Émetteur si fichier présent)
    let localManifest = null;
    const files = fs.readdirSync(sharedPath).filter(f => 
      !f.startsWith('DOWNLOAD_') && f !== '.gitkeep'
    );

    if (files.length > 0) {
      console.log(`[SYSTEM] Indexation locale de : ${files[0]}...`);
      localManifest = fileManager.shareFile(files[0]);
      
      // On s'ajoute nous-même dans notre annuaire local
      if (localManifest) {
        networkDirectory.updateFile(localManifest, nodeId.toString('hex'));
      }
    } else {
      console.log(`[SYSTEM] Mode receveur (Dossier partagé vide).`);
    }

    // 5. Lancement du Serveur TCP (avec l'annuaire en paramètre)
    const tcpServer = new TcpServer(nodeId, tcpPort, fileManager);
    
    // On lie le manifeste local au serveur pour diffusion automatique
    if (localManifest) {
      tcpServer.setManifest(localManifest);
    }
    
    tcpServer.start();

    // 6. Lancement de la Découverte UDP
    // On passe l'annuaire pour que Discovery puisse le remplir lors des échanges
    const discovery = new Discovery(nodeId, tcpPort, fileManager, localManifest);
    discovery.start();

    console.log(`\n🚀 NŒUD ARCHIPEL [${nodeIdShort}] PRÊT`);
    console.log(`📡 Écoute sur le port : ${tcpPort}`);
    console.log(`--------------------------------------------------\n`);

    // 7. Monitoring de l'annuaire (Log toutes les 15 secondes)
    setInterval(() => {
      const allFiles = networkDirectory.getAllFiles();
      if (allFiles.length > 0) {
        console.log(`\n--- ANNUAIRE RÉSEAU (${allFiles.length} fichiers) ---`);
        allFiles.forEach(f => {
          console.log(`- ${f.manifest.fileName} (${(f.manifest.totalSize / 1024 / 1024).toFixed(2)} Mo) | Prop: ${f.ownerId.substring(0,8)}`);
        });
        console.log(`----------------------------------------------\n`);
      }
    }, 15000);

  } catch (error) {
    console.error("❌ Erreur critique au démarrage :", error);
  }
}

main();