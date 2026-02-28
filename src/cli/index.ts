import readline from 'readline';
import { Discovery } from '../network/discovery';
import { FileManager } from '../network/fileManager';
import { NetworkDirectory } from '../network/networkDirectory';
import { TcpClient } from '../network/tcpClient';
import { queryGemini } from '../messaging/gemini'; // Import de l'IA

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
            this.trustedPeers.add(targetId.replace(/"/g, '').substring(0,8));
            console.log(`✅ [Web of Trust] Nœud ${targetId} approuvé localement.`);
          }
          break;
          
        case 'download':
          let fileName = args[1];
          if (!fileName) { console.log("❌ Syntaxe : download <nom_du_fichier>"); break; }
          fileName = fileName.replace(/"/g, '');
          const results = this.networkDirectory.searchFiles(fileName);
          if (results.length === 0) { console.log(`❌ Fichier '${fileName}' introuvable.`); break; }
          const owner = this.discovery.peerTable.getPeers().find(p => p.node_id === results[0].ownerId);
          if (!owner) { console.log(`❌ Pair hors ligne.`); break; }
          console.log(`📥 Téléchargement de ${fileName} depuis ${owner.ip}...`);
          const dlClient = new TcpClient(Buffer.from(this.nodeIdHex, 'hex'), this.fileManager, this.networkDirectory);
          dlClient.connect(owner.ip, owner.tcp_port, null, true);
          break;

        case 'msg':
          const msgTarget = args[1]?.replace(/"/g, '');
          const messageText = args.slice(2).join(' ').replace(/"/g, '');
          if (!msgTarget || !messageText) { console.log("❌ Syntaxe : msg <node_id> <texte>"); break; }
          const msgPeer = this.discovery.peerTable.getPeers().find(p => p.node_id.startsWith(msgTarget));
          if (!msgPeer) { console.log(`❌ Pair ${msgTarget} introuvable dans la table.`); break; }
          const msgClient = new TcpClient(Buffer.from(this.nodeIdHex, 'hex'), this.fileManager, this.networkDirectory);
          msgClient.connect(msgPeer.ip, msgPeer.tcp_port, null, false, messageText);
          break;

        case 'send':
          const sendTarget = args[1]?.replace(/"/g, '');
          const filePath = args[2]?.replace(/"/g, '');
          if (!sendTarget || !filePath) { console.log("❌ Syntaxe : send <node_id> <nom_fichier>"); break; }
          const sendPeer = this.discovery.peerTable.getPeers().find(p => p.node_id.startsWith(sendTarget));
          if (!sendPeer) { console.log(`❌ Pair ${sendTarget} introuvable.`); break; }
          const manifest = this.fileManager.shareFile(filePath);
          if (!manifest) { console.log(`❌ Impossible de lire ${filePath} dans shared/`); break; }
          console.log(`📤 Push du manifeste de ${filePath} vers ${sendTarget}...`);
          const sendClient = new TcpClient(Buffer.from(this.nodeIdHex, 'hex'), this.fileManager, this.networkDirectory);
          sendClient.connect(sendPeer.ip, sendPeer.tcp_port, manifest, false);
          console.log(`✅ Push terminé ! Le pair peut maintenant faire 'download ${filePath}'.`);
          break;

        // ---------------- INTÉGRATION GEMINI ----------------
        case '/ask':
        case '@archipel-ai':
          if (!this.aiEnabled) {
            console.log(`🤖 [Gemini] : L'assistant est désactivé (--no-ai). Mode offline strict.`);
            break;
          }
          const question = args.slice(1).join(' ').replace(/"/g, '');
          if (!question) {
            console.log("❌ Syntaxe : /ask <votre question>");
            break;
          }
          console.log(`🤖 [Gemini] : Réflexion en cours...`);
          
          // Construction du contexte réseau (Nœuds connectés, Fichiers dispo)
          const peerCount = this.discovery.peerTable.getPeers().length;
          const fileCount = this.networkDirectory.getAllFiles().length;
          const context = `L'utilisateur est sur le nœud ${this.nodeIdHex.substring(0,8)}. Actuellement, ${peerCount} pairs sont connectés et ${fileCount} fichiers sont indexés sur ce réseau local.`;
          
          // Appel à l'API
          const reponseIA = await queryGemini(context, question);
          console.log(`\n🤖 [Gemini] :\n${reponseIA}\n`);
          break;

        case 'exit':
        case 'quit':
          console.log("Fermeture...");
          process.exit(0);
          break;
        default: console.log(`❌ Commande inconnue.`); break;
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
send <node_id> <fichier>: Pousser un fichier vers un pair
msg <node_id> <texte>   : Envoyer un message texte chiffré E2E
trust <node_id>         : Approuver la clé d'un pair (Web of Trust)
/ask <question>         : Poser une question à l'assistant IA
exit                    : Quitter\n`);
  }

  // ... (Garde showPeers, showStatus et showFiles identiques à avant)
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