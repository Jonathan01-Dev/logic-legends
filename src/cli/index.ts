import readline from 'readline';
import { Discovery } from '../network/discovery';
import { FileManager } from '../network/fileManager';
import { NetworkDirectory } from '../network/networkDirectory';

export class CLI {
  private rl: readline.Interface;
  private aiEnabled: boolean = true;

  constructor(
    private nodeId: string,
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
      prompt: '\x1b[36marchipel>\x1b[0m ' // Prompt coloré en cyan
    });
  }

  public start() {
    console.log(`\n🖥️  CLI Archipel activé. Tapez 'help' pour voir les commandes disponibles.`);
    this.rl.prompt();

    this.rl.on('line', async (line) => {
      // Nettoyage de l'entrée (supporte "archipel peers" ou juste "peers") 
      let input = line.trim();
      if (input.startsWith('archipel ')) {
        input = input.replace('archipel ', '');
      }

      if (!input) {
        this.rl.prompt();
        return;
      }

      const args = input.split(' ');
      const cmd = args[0].toLowerCase();

      switch (cmd) {
        case 'help':
          this.showHelp();
          break;
        case 'peers':
          this.showPeers();
          break;
        case 'status':
          this.showStatus();
          break;
        case 'trust':
          const targetId = args[1];
          if (!targetId) console.log("❌ Syntaxe : trust <node_id>");
          else console.log(`✅ [Web of Trust] Nœud ${targetId} approuvé localement.`);
          break;
        case 'msg':
          const msgTarget = args[1];
          const message = args.slice(2).join(' ');
          if (!msgTarget || !message) console.log("❌ Syntaxe : msg <node_id> <message>");
          else console.log(`📨 Message chiffré prêt à être envoyé à ${msgTarget} : "${message}"`);
          break;
        case 'send':
          const sendTarget = args[1];
          const filepath = args[2];
          if (!sendTarget || !filepath) console.log("❌ Syntaxe : send <node_id> <filepath>");
          else console.log(`📤 Préparation du chunking pour envoi de ${filepath} vers ${sendTarget}...`);
          break;
        case 'download':
          const fileId = args[1];
          if (!fileId) console.log("❌ Syntaxe : download <file_id>");
          else console.log(`📥 Initiation du téléchargement pour le hash : ${fileId}...`);
          break;
        case '/ask':
        case '@archipel-ai':
          await this.handleAI(args.slice(1).join(' '));
          break;
        case 'exit':
        case 'quit':
          console.log("Fermeture du nœud Archipel...");
          process.exit(0);
          break;
        default:
          console.log(`❌ Commande inconnue: ${cmd}. Tapez 'help'.`);
          break;
      }
      this.rl.prompt();
    }).on('close', () => {
      console.log('\nArrêt du nœud.');
      process.exit(0);
    });
  }

  private showHelp() {
    console.log(`
--- COMMANDES ARCHIPEL ---
peers                   : Lister les pairs découverts sur le réseau local
status                  : Afficher l'état du nœud et les statistiques
msg <node_id> <texte>   : Envoyer un message chiffré E2E
send <node_id> <chemin> : Envoyer un fichier vers un pair spécifique
download <file_id>      : Télécharger un fichier depuis le réseau mesh
trust <node_id>         : Approuver la clé d'un pair (Web of Trust)
/ask <question>         : Poser une question à l'assistant IA
exit                    : Quitter proprement l'application
    `);
  }

  private showPeers() {
    const peers = this.discovery.peerTable.getPeers();
    if (peers.length === 0) {
      console.log("🌐 Aucun pair détecté pour le moment. En attente de signaux UDP...");
      return;
    }
    console.log(`\n🌐 --- TABLE DES PAIRS ACTIFS (${peers.length}) ---`);
    peers.forEach(p => {
      console.log(`- ID: ${p.node_id.substring(0, 8)} | IP: ${p.ip}:${p.tcp_port} | Vu à: ${new Date(p.last_seen).toLocaleTimeString()}`);
    });
    console.log("-------------------------------------\n");
  }

  private showStatus() {
    const peersCount = this.discovery.peerTable.getPeers().length;
    console.log(`
📊 --- STATUT DU NŒUD ---
Identifiant : ${this.nodeId.substring(0, 8)}
Port TCP    : ${this.tcpPort}
Pairs       : ${peersCount} connectés
Assistant   : ${this.aiEnabled ? 'Activé 🟢' : 'Désactivé 🔴 (Mode hors-ligne strict)'}
-------------------------
    `);
  }

  private async handleAI(query: string) {
    if (!this.aiEnabled) {
      console.log(`🤖 [Gemini] : Désolé, l'assistant est désactivé (--no-ai). Le réseau respecte le mode offline strict.`);
      return;
    }
    if (!query) {
      console.log(`❌ Syntaxe : /ask <votre question>`);
      return;
    }
    console.log(`🤖 [Gemini] : Analyse de votre demande : "${query}"... (En attente du module 4.2)`);
    // Le code d'appel à l'API viendra se greffer ici
  }
}