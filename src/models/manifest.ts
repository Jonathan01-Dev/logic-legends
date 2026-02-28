import crypto from 'crypto';

/**
 * Structure d'un morceau (chunk) de fichier
 */
export interface FileChunk {
  index: number;
  hash: string;
}

/**
 * Structure du manifeste complet du fichier
 */
export interface FileManifest {
  fileName: string;
  totalSize: number;
  fileHash: string;
  chunkSize: number;
  chunks: FileChunk[];
}

/**
 * Génère un manifeste à partir d'un buffer de fichier
 * @param fileName Nom du fichier d'origine
 * @param fileBuffer Contenu binaire du fichier
 */
export function generateManifest(fileName: string, fileBuffer: Buffer): FileManifest {
  // TAILLE DE CHUNK OPTIMISÉE POUR LE SPRINT 3 & 4 (16 Ko)
  // Cela permet de réduire la taille du JSON pour les fichiers de 50 Mo
  const CHUNK_SIZE = 16384; 
  const chunks: FileChunk[] = [];
  
  // Hash global du fichier pour vérification finale
  const totalHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Découpage du fichier en morceaux
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