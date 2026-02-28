// src/models/manifest.ts
import crypto from 'crypto';

export interface FileChunk {
  index: number;
  hash: string; // Hash SHA-256 du morceau pour vérification
}

export interface FileManifest {
  fileName: string;
  totalSize: number;
  fileHash: string;   // Hash global du fichier complet
  chunkSize: number;  // Fixé à 1024 octets par le protocole
  chunks: FileChunk[];
}

/**
 * Utilitaire pour découper un fichier et générer son manifeste
 */
export function generateManifest(fileName: string, fileBuffer: Buffer): FileManifest {
  const CHUNK_SIZE = 1024; 
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