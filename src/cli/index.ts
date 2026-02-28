import readline from 'readline';
import { Discovery } from '../network/discovery';
import { FileManager } from '../network/fileManager';
import { NetworkDirectory } from '../network/networkDirectory';
import { TcpClient } from '../network/tcpClient';

export class CLI {
  private rl: readline.Interface;
  private trustedPeers: Set<string> = new Set();
  private aiEnabled: boolean = true;

  constructor(
    private nodeIdHex: string,
    private tcpPort: number,
    private discovery: Discovery,
    private fileManager: FileManager,
    private networkDirectory: NetworkDirectory,
    aiFlag: boolean = true
  ) {
    this.aiEnabled = aiFlag;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[36marchipel>\x1b[0m '
    });
  }

  public start() {
    console.log(`\n🖥️  CLI Archipel activé. Tapez 'help' pour voir les commandes disponibles.`);
    this.rl.prompt();

    this.rl.on('line', async (line) => {
      let input = line.trim();
      if (input.startsWith('archipel ')) input = input.replace('archipel ', '');
      if (!input) { this.rl.prompt(); return; }

      // Amélioration : permet de lire les arguments avec des guillemets correctement
      const args = input.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      const cmd = args[0].toLowerCase();

      switch (cmd) {
        case 'start':
          console.log(`✅ Le nœud Archipel tourne déjà sur le port ${this.tcpPort}.`);
          break;
        case 'help': this.showHelp(); break;
        case 'peers': this.showPeers(); break;
        case 'status': this.showStatus(); break;
        case 'files': this.showFiles(); break;
        case 'trust':
          const targetId = args[1];
          if (!targetId) console.log("❌ Syntaxe : trust <node_id>");
          else {
            this.trustedPeers.add(targetId.replace(/"/g, ''));
            console.log(`✅ [Web of Trust] Nœud ${targetId} approuvé localement.`);
          }
          break;
        case 'download':
          let fileName = args[1];
          if (!fileName) {
            console.log("❌ Syntaxe : download <nom_du_fichier>");
            break;
          }
          
          // Nettoyage des guillemets pour la recherche
          fileName = fileName.replace(/"/g, '');
          
          const results = this.networkDirectory.searchFiles(fileName);
          if (results.length === 0) {
            console.log(`❌ Fichier '${fileName}' introuvable sur le réseau.`);
            break;
          }

          const fileInfo = results[0];
          const owner = this.discovery.peerTable.getPeers().find(p => p.node_id === fileInfo.ownerId);
          
          if (!owner) {
            console.log(`❌ Le propriétaire du fichier (${fileInfo.ownerId.substring(0,8)}) n'est plus en ligne.`);
            break;
          }

          console.log(`📥 Initiation du téléchargement de ${fileName} depuis ${owner.ip}...`);
          const client = new TcpClient(Buffer.from(this.nodeIdHex, 'hex'), this.fileManager, this.networkDirectory);
          client.connect(owner.ip, owner.tcp_port, null, true);
          break;

        case '/ask':
        case '@archipel-ai':
          if (!this.aiEnabled) console.log(`🤖 Désactivé (--no-ai).`);
          else console.log(`🤖 [Gemini] : Module IA en cours de câblage...`);
          break;
        case 'exit':
        case 'quit':
          console.log("Fermeture...");
          process.exit(0);
          break;
        default: console.log(`❌ Commande inconnue: ${cmd}.`); break;
      }
      
      setTimeout(() => this.rl.prompt(), 100);
    });
  }

  private showHelp() {
    console.log(`\n--- COMMANDES ARCHIPEL ---
peers                   : Lister les pairs découverts
status                  : Afficher l'état du nœud
files                   : Voir les fichiers disponibles sur le réseau
download <nom_fichier>  : Télécharger un fichier depuis un pair
trust <node_id>         : Approuver la clé d'un pair (Web of Trust)
/ask <question>         : Poser une question à l'assistant IA
exit                    : Quitter\n`);
  }

  private showPeers() {
    const peers = this.discovery.peerTable.getPeers();
    if (peers.length === 0) console.log("🌐 Aucun pair détecté.");
    else {
      console.log(`\n🌐 --- TABLE DES PAIRS (${peers.length}) ---`);
      peers.forEach(p => console.log(`- ID: ${p.node_id.substring(0, 8)} | IP: ${p.ip}:${p.tcp_port} | Confiance: ${this.trustedPeers.has(p.node_id.substring(0, 8)) ? '✅' : '❌'}`));
    }
  }

  private showStatus() {
    console.log(`\n📊 --- STATUT DU NŒUD ---\nIdentifiant : ${this.nodeIdHex.substring(0, 8)}\nPort TCP    : ${this.tcpPort}\nPairs       : ${this.discovery.peerTable.getPeers().length}\n-------------------------`);
  }

  private showFiles() {
    const files = this.networkDirectory.getAllFiles();
    if (files.length === 0) console.log("📁 Aucun fichier répertorié sur le réseau.");
    else {
      console.log(`\n📁 --- FICHIERS DISPONIBLES ---`);
      files.forEach(f => console.log(`- ${f.manifest.fileName} [Propriétaire: ${f.ownerId.substring(0, 8)}]`));
    }
  }
}