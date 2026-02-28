import fs from 'fs';
import path from 'path';
import { FileManifest, generateManifest } from '../models/manifest';

export class FileManager {
  private baseDir: string;
  // Stockage des manifestes indexés par leur hash global
  private manifests: Map<string, FileManifest> = new Map();

  constructor() {
    this.baseDir = path.join(process.cwd(), 'shared');
    // Création du dossier de partage s'il n'existe pas
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir);
    }
  }

  /**
   * Scanne un fichier physique et génère son manifeste de chunks
   */
  public shareFile(fileName: string): FileManifest | null {
    const filePath = path.join(this.baseDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.error(`[FILES] Fichier introuvable sur le disque : ${filePath}`);
      return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const manifest = generateManifest(fileName, fileBuffer);
    
    // On enregistre le manifeste en mémoire pour répondre aux futures requêtes
    this.manifests.set(manifest.fileHash, manifest);
    
    return manifest;
  }

  /**
   * Récupère les données binaires d'un morceau spécifique
   */
  public getChunk(fileHash: string, index: number): Buffer | null {
    const manifest = this.manifests.get(fileHash);
    if (!manifest) {
      console.error(`[FILES] Aucun manifeste trouvé pour le hash : ${fileHash}`);
      return null;
    }

    const filePath = path.join(this.baseDir, manifest.fileName);
    if (!fs.existsSync(filePath)) return null;

    // Lecture par position pour ne pas saturer la RAM sur de gros fichiers
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(manifest.chunkSize);
    const bytesRead = fs.readSync(fd, buffer, 0, manifest.chunkSize, index * manifest.chunkSize);
    fs.closeSync(fd);

    return bytesRead > 0 ? buffer.subarray(0, bytesRead) : null;
  }

  /**
   * Sauvegarde un morceau reçu du réseau sur le disque
   */
  public saveChunk(fileName: string, index: number, data: Buffer) {
    const filePath = path.join(this.baseDir, "DOWNLOAD_" + fileName);
    
    // Mode 'w' (écriture) pour le premier morceau, 'a' (ajout) pour les suivants
    const flag = (index === 0) ? 'w' : 'a';
    
    try {
      fs.writeFileSync(filePath, data, { flag });
    } catch (err: any) {
      console.error(`[FILES] Erreur d'écriture disque : ${err.message}`);
    }
  }

  /**
   * Permet d'enregistrer un manifeste reçu d'un pair distant
   */
  public registerRemoteManifest(manifest: FileManifest) {
    this.manifests.set(manifest.fileHash, manifest);
  }
}