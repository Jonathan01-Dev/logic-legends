import fs from 'fs';
import path from 'path';
import { FileManifest, generateManifest } from '../models/manifest';

export class FileManager {
  private baseDir: string;
  private manifests: Map<string, FileManifest> = new Map();

  constructor() {
    this.baseDir = path.join(process.cwd(), 'shared');
    if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir);
  }

  public hasFile(fileHash: string): boolean { return this.manifests.has(fileHash); }

  public shareFile(fileName: string): FileManifest | null {
    const filePath = path.join(this.baseDir, fileName);
    if (!fs.existsSync(filePath)) return null;
    const fileBuffer = fs.readFileSync(filePath);
    const manifest = generateManifest(fileName, fileBuffer);
    this.manifests.set(manifest.fileHash, manifest);
    return manifest;
  }

  public registerRemoteManifest(manifest: FileManifest) { this.manifests.set(manifest.fileHash, manifest); }

  public getChunk(fileHash: string, index: number): Buffer | null {
    const manifest = this.manifests.get(fileHash);
    if (!manifest) return null;
    const filePath = path.join(this.baseDir, manifest.fileName);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(manifest.chunkSize);
    const bytesRead = fs.readSync(fd, buffer, 0, manifest.chunkSize, index * manifest.chunkSize);
    fs.closeSync(fd);
    return bytesRead > 0 ? buffer.subarray(0, bytesRead) : null;
  }

  public saveChunk(fileName: string, index: number, data: Buffer) {
    const filePath = path.join(this.baseDir, "DOWNLOAD_" + fileName);
    const flag = (index === 0) ? 'w' : 'a';
    fs.writeFileSync(filePath, data, { flag });
  }
}