// src/crypto/session.ts
import crypto from 'crypto';

export class CryptoSession {
  private privateKey: crypto.KeyObject;
  public ephemeralPublicKey: Buffer;
  private sharedSecret: Buffer | null = null;

  constructor() {
    // 1. Génération de la paire X25519 via la nouvelle API Node.js
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    this.privateKey = privateKey;
    
    // 2. Extraction propre des 32 bytes bruts via le format natif JWK
    const jwk = publicKey.export({ format: 'jwk' });
    this.ephemeralPublicKey = Buffer.from(jwk.x as string, 'base64url');
  }

  /**
   * Calcule le secret partagé à partir de la clé publique brute de l'autre nœud
   */
  public deriveSharedSecret(remotePublicKeyRaw: Buffer): void {
    try {
      // 3. Reconversion des 32 bytes bruts reçus en objet Clé Publique Node.js
      const remoteJwk = {
        kty: 'OKP',
        crv: 'X25519',
        x: remotePublicKeyRaw.toString('base64url')
      };
      
      const remotePublicKey = crypto.createPublicKey({
        key: remoteJwk,
        format: 'jwk'
      });

      // 4. Calcul du secret partagé Diffie-Hellman
      this.sharedSecret = crypto.diffieHellman({
        privateKey: this.privateKey,
        publicKey: remotePublicKey
      });
      
      console.log(`[CRYPTO] Secret partagé AES dérivé avec succès !`);
    } catch (err: any) {
      console.error(`[CRYPTO] Échec critique de la dérivation du secret :`, err.message);
    }
  }

  /**
   * Chiffre un payload en AES-256-GCM
   */
  public encrypt(payload: Buffer): Buffer {
    if (!this.sharedSecret) throw new Error("Secret partagé non dérivé");
    
    const iv = crypto.randomBytes(12); 
    const cipher = crypto.createCipheriv('aes-256-gcm', this.sharedSecret, iv);
    
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authTag = cipher.getAuthTag(); 

    return Buffer.concat([iv, authTag, ciphertext]);
  }

  /**
   * Déchiffre un payload chiffré en AES-256-GCM
   */
  public decrypt(encryptedData: Buffer): Buffer {
    if (!this.sharedSecret) throw new Error("Secret partagé non dérivé");

    const iv = encryptedData.subarray(0, 12);
    const authTag = encryptedData.subarray(12, 28);
    const ciphertext = encryptedData.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.sharedSecret, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}