// src/models/manifest.ts
import crypto from 'crypto';

export interface FileChunk {
  index: number;
  hash: string;
}

export interface FileManifest {
  fileName: string;
  totalSize: number;
  fileHash: string;
  chunkSize: number;
  chunks: FileChunk[];
}

export function generateManifest(fileName: string, fileBuffer: Buffer): FileManifest {
  const CHUNK_SIZE = 1024; // Taille fixe imposée
  const chunks: FileChunk[] = [];
  
  const totalHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  for (let i = 0; i < fileBuffer.length; i += CHUNK_SIZE) {
    const chunkData = fileBuffer.subarray(i, i + CHUNK_SIZE);
    const chunkHash = crypto.createHash('sha256').update(chunkData).digest('hex');
    
    chunks.push({
      index: Math.floor(i / CHUNK_SIZE),
      hash: chunkHash
    });
  }

  return {
    fileName,
    totalSize: fileBuffer.length,
    fileHash: totalHash,
    chunkSize: CHUNK_SIZE,
    chunks
  };
}