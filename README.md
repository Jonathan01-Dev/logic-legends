# 🌐 Archipel - Réseau P2P Chiffré et Décentralisé à Zéro-Connexion

[cite_start]**Archipel** est un protocole de communication Pair-à-Pair (P2P) conçu pour survivre à une coupure totale d'infrastructure[cite: 22, 23]. [cite_start]Développé lors des 24 heures de coding du Hackathon de la Lomé Business School [cite: 10, 11][cite_start], ce projet implémente un réseau local souverain, sans serveur central ni autorité de certification[cite: 22].

---

## 🏗️ Architecture et Choix Techniques

[cite_start]Le protocole repose sur trois piliers : la décentralisation totale, la segmentation des données (chunking), et le chiffrement de bout en bout [cite: 26-29].

* **Langage :** TypeScript / Node.js
* [cite_start]**Découverte (Couche Réseau) :** Datagrammes UDP Multicast sur `239.255.42.99:6000` pour détecter les pairs sans routeur central[cite: 118].
* [cite_start]**Transfert (Couche Données) :** Sockets TCP (port 7777 par défaut) avec un protocole TLV (Type-Length-Value) pour la fiabilité et le contrôle de flux[cite: 151, 153].

### Schéma d'Architecture : Handshake Archipel
[cite_start]Le handshake est inspiré du Noise Protocol Framework[cite: 177]:

```text
Alice                                        Bob
  |                                           |
  |--- HELLO (e_A_pub, timestamp) ----------->|
  |                                           | génère e_B
  |<-- HELLO_REPLY (e_B_pub, sig_B) ----------|
  |                                           |
  | calcul: shared = X25519(e_A_priv, e_B_pub)|
  | session_key = HKDF(shared, 'archipel-v1') |
  |                                           |
  |--- AUTH (sig_A sur shared_hash) --------->|
  |                                           | vérifie sig_A
  |<-- AUTH_OK -------------------------------|
  |                                           |
  |=== Tunnel AES-256-GCM établi =============|
```

---

## 🔐 Primitives Cryptographiques et Justification

[cite_start]Conformément aux contraintes, l'identité et les transferts sont sécurisés sans CA, via un modèle Web of Trust (TOFU)[cite: 191, 193]. [cite_start]Nous utilisons la bibliothèque `crypto` native de Node.js[cite: 228]:

* [cite_start]**Ed25519 :** Utilisé pour la signature et l'identité permanente des nœuds[cite: 172].
* [cite_start]**X25519 (ECDH) :** Dédié à l'échange de clés Diffie-Hellman pour générer le secret partagé[cite: 173].
* [cite_start]**HKDF-SHA256 :** Utilisé pour la dérivation de la clé de session éphémère (Forward Secrecy)[cite: 228].
* [cite_start]**AES-256-GCM :** Assure le chiffrement symétrique et l'authentification des données transférées[cite: 173].
* [cite_start]**HMAC-SHA256 & SHA-256 :** Garantissent l'intégrité des paquets réseau et des fragments de fichiers (chunks)[cite: 174, 228].

---

## 🛠️ Instructions d'Installation et d'Exécution

1. **Cloner le projet** et installer les dépendances :
   ```bash
   npm install
   ```

2. **Configuration de l'Environnement** :
   Créez un fichier `.env` à la racine pour l'assistant contextuel (le réseau fonctionnera en mode hors-ligne strict sans cette clé) :
   ```env
   GEMINI_API_KEY=votre_cle_api_ici
   ```

3. **Lancer un Nœud** :
   ```bash
   npx tsx src/index.ts
   ```

---

## 🚀 Guide de la Démo (Cas d'Usage)

[cite_start]Une fois dans l'interface interactive `archipel>`, voici les commandes pour la démonstration [cite: 327-343] :

**1. Découverte et Web of Trust**
* `peers` : Affiche les pairs découverts via UDP Multicast.
* `trust <node_id>` : Approuve manuellement la clé cryptographique d'un pair (TOFU).

**2. Messagerie Chiffrée & Assistant IA**
* `msg <node_id> <texte>` : Envoie un message chiffré de bout en bout.
* `/ask <question>` : Interroge l'IA sur l'état du réseau (avec fallback gracieux si hors-ligne).

**3. Partage de Fichiers Distribué**
* `files` : Consulte l'annuaire local des fichiers.
* `send <node_id> <fichier>` : Pousse le manifest d'un fichier vers un pair.
* `download <fichier>` : Initie le téléchargement par chunks avec vérification d'intégrité SHA-256.

---

## 🚧 Limitations Connues et Améliorations

* **Réseau Local Strict :** Le multicast UDP limite la découverte aux nœuds présents sur le même sous-réseau (LAN).
* **Interface Utilisateur :** L'application est actuellement restreinte à une interface CLI interactive. Une UI Web locale (HTTP) pourrait faciliter l'adoption.

---

## 👨‍💻 Équipe & Contributions

* **OKE Komlan Erwin** - (GitHub: @R1wen)
* **M'BOUEKE Marcel Kevin** - (GitHub: @kevin-mboueke)
* **DOSSEH Penelope** - (GitHub: @athalya-ai)
* **ADJIMON Boyi Conniah** - (GitHub: @coco-dotcom)