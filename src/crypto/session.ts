// src/crypto/session.ts
import crypto from 'crypto';

export class CryptoSession {
  private ecdh: crypto.ECDH;
  public ephemeralPublicKey: Buffer;
  private sharedSecret: Buffer | null = null;

  constructor() {
    // Génération d'une paire de clés X25519 éphémère (jetable) pour la session TCP
    this.ecdh = crypto.createECDH('x25519');
    this.ephemeralPublicKey = this.ecdh.generateKeys();
  }

  /**
   * Calcule le secret partagé à partir de la clé publique éphémère de l'autre nœud
   */
  public deriveSharedSecret(remotePublicKey: Buffer): void {
    try {
      this.sharedSecret = this.ecdh.computeSecret(remotePublicKey);
      console.log(`[CRYPTO] Secret partagé AES dérivé avec succès !`);
    } catch (err) {
      console.error(`[CRYPTO] Échec critique de la dérivation du secret :`, err);
    }
  }

  /**
   * Chiffre un payload en AES-256-GCM
   */
  public encrypt(payload: Buffer): Buffer {
    if (!this.sharedSecret) throw new Error("Impossible de chiffrer : Secret partagé non dérivé");
    
    // GCM nécessite un Vecteur d'Initialisation (IV) unique de 12 bytes
    const iv = crypto.randomBytes(12); 
    const cipher = crypto.createCipheriv('aes-256-gcm', this.sharedSecret, iv);
    
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes pour garantir l'intégrité

    // Structure retournée : IV (12) + AuthTag (16) + Message chiffré
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  /**
   * Déchiffre un payload chiffré en AES-256-GCM
   */
  public decrypt(encryptedData: Buffer): Buffer {
    if (!this.sharedSecret) throw new Error("Impossible de déchiffrer : Secret partagé non dérivé");

    const iv = encryptedData.subarray(0, 12);
    const authTag = encryptedData.subarray(12, 28);
    const ciphertext = encryptedData.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.sharedSecret, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}