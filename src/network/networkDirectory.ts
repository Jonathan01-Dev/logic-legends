import { FileManifest } from '../models/manifest';

interface RemoteFile {
  manifest: FileManifest;
  ownerId: string;    // L'ID du nœud qui possède ce fichier
  lastSeen: number;   // Timestamp pour savoir si le propriétaire est toujours en ligne
}

export class NetworkDirectory {
  // Clé : Hash unique du fichier, Valeur : Détails du fichier et son possesseur
  private remoteFiles: Map<string, RemoteFile> = new Map();

  /**
   * Ajoute ou met à jour un fichier dans l'annuaire global.
   * Appelé dès qu'un manifeste circule sur le réseau (via TCP).
   */
  public updateFile(manifest: FileManifest, ownerId: string) {
    this.remoteFiles.set(manifest.fileHash, {
      manifest,
      ownerId,
      lastSeen: Date.now()
    });
    
    const shortId = ownerId.substring(0, 8);
    console.log(`[DIRECTORY] 🔍 Nouveau fichier indexé : ${manifest.fileName} (Possédé par : ${shortId})`);
  }

  /**
   * Retourne la liste de tous les fichiers connus sur le réseau.
   */
  public getAllFiles(): RemoteFile[] {
    return Array.from(this.remoteFiles.values());
  }

  /**
   * Permet de chercher un fichier spécifique par son nom (utile pour le futur moteur de recherche).
   */
  public findFileByName(name: string): RemoteFile[] {
    return this.getAllFiles().filter(f => 
      f.manifest.fileName.toLowerCase().includes(name.toLowerCase())
    );
  }

  /**
   * Supprime les fichiers des nœuds qui ont disparu du réseau.
   * @param timeoutMs Délai après lequel un fichier est considéré comme "perdu" (ex: 30s).
   */
  public purgeExpiredFiles(timeoutMs: number = 30000) {
    const now = Date.now();
    let deletedCount = 0;

    for (const [hash, file] of this.remoteFiles.entries()) {
      if (now - file.lastSeen > timeoutMs) {
        this.remoteFiles.delete(hash);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[DIRECTORY] 🧹 Nettoyage : ${deletedCount} fichier(s) retiré(s) (Propriétaires déconnectés).`);
    }
  }

  /**
   * Vérifie si on connaît déjà ce fichier.
   */
  public hasFile(fileHash: string): boolean {
    return this.remoteFiles.has(fileHash);
  }
}