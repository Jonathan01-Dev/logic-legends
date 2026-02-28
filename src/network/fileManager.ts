// src/network/fileManager.ts
import fs from 'fs';
import path from 'path';
import { FileManifest, generateManifest } from '../models/manifest';

export class FileManager {
  private baseDir: string;
  private manifests: Map<string, FileManifest> = new Map();

  constructor() {
    this.baseDir = path.join(process.cwd(), 'shared');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir);
    }
  }

  /**
   * Prépare un fichier pour le réseau (crée le manifeste)
   */
  public shareFile(fileName: string): FileManifest | null {
    const filePath = path.join(this.baseDir, fileName);
    if (!fs.existsSync(filePath)) {
      console.error(`[FILES] Fichier introuvable : ${filePath}`);
      return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const manifest = generateManifest(fileName, fileBuffer);
    this.manifests.set(manifest.fileHash, manifest);
    
    console.log(`[FILES] Fichier prêt : ${fileName} (${manifest.chunks.length} chunks)`);
    return manifest;
  }

  /**
   * Récupère un morceau spécifique d'un fichier via son index
   */
  public getChunk(fileHash: string, index: number): Buffer | null {
    const manifest = this.manifests.get(fileHash);
    if (!manifest) return null;

    const filePath = path.join(this.baseDir, manifest.fileName);
    const fileBuffer = fs.readFileSync(filePath);
    
    const start = index * manifest.chunkSize;
    const end = Math.min(start + manifest.chunkSize, fileBuffer.length);
    
    return fileBuffer.subarray(start, end);
  }
}