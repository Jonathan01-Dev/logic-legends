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

  public shareFile(fileName: string): FileManifest | null {
    const filePath = path.join(this.baseDir, fileName);
    if (!fs.existsSync(filePath)) return null;
    const fileBuffer = fs.readFileSync(filePath);
    const manifest = generateManifest(fileName, fileBuffer);
    this.manifests.set(manifest.fileHash, manifest);
    return manifest;
  }

  public getChunk(fileHash: string, index: number): Buffer | null {
    const manifest = this.manifests.get(fileHash);
    if (!manifest) return null;
    const filePath = path.join(this.baseDir, manifest.fileName);
    const fileBuffer = fs.readFileSync(filePath);
    const start = index * manifest.chunkSize;
    const end = Math.min(start + manifest.chunkSize, fileBuffer.length);
    return fileBuffer.subarray(start, end);
  }

  // NOUVEAU : Pour sauvegarder un morceau reçu du réseau
  public saveChunk(fileName: string, index: number, data: Buffer) {
    const filePath = path.join(this.baseDir, "DOWNLOAD_" + fileName);
    
    // Si c'est le premier morceau, on crée/écrase le fichier
    if (index === 0 && !fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, data);
    } else {
      // Sinon on ajoute à la suite (Attention : cela suppose un ordre séquentiel simple)
      fs.appendFileSync(filePath, data);
    }
  }
}