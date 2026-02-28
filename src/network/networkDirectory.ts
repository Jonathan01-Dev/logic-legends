export interface DirectoryEntry {
  manifest: any;
  ownerId: string;
  lastUpdated: number;
}

export class NetworkDirectory {
  private files: Map<string, DirectoryEntry> = new Map();

  public updateFile(manifest: any, ownerId: string) {
    // On évite d'indexer en boucle si le fichier est déjà connu
    if (!this.files.has(manifest.fileHash)) {
      this.files.set(manifest.fileHash, {
        manifest,
        ownerId,
        lastUpdated: Date.now()
      });
      console.log(`\n[DIRECTORY] 🔍 Nouveau fichier indexé : ${manifest.fileName} (Possédé par : ${ownerId.substring(0,8)})`);
    }
  }

  public getAllFiles(): DirectoryEntry[] {
    return Array.from(this.files.values());
  }

  // La fameuse fonction manquante qui a causé le crash !
  public searchFiles(query: string): DirectoryEntry[] {
    const term = query.replace(/"/g, '').toLowerCase(); // Nettoie les guillemets
    return this.getAllFiles().filter(f => 
      f.manifest.fileName.toLowerCase().includes(term)
    );
  }
}