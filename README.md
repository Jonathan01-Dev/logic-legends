# Archipel - "The Geek & The Moon"

**Protocole P2P Chiffré et Décentralisé à Zéro-Connexion**

## 1. Description du Protocole
Archipel est un protocole de communication P2P conçu pour survivre à une coupure totale d'infrastructure Fonctionnant sans Internet, sans serveur central et sans autorité de certification (CA), il crée un réseau local souverain et chiffré de bout-en-bout Inspiré de BitTorrent pour la distribution segmentée de fichiers (chunking) et du framework Noise pour la cryptographie, chaque nœud Archipel agit simultanément comme client et serveur.

## 2. Choix Technologiques & Justifications

### Langage : Node.js avec TypeScript
**Justification :** Le protocole requiert la gestion de dizaines de flux d'entrées/sorties asynchrones simultanés (écoute Multicast continue + minimum 10 connexions TCP parallèles). L'Event Loop non-bloquante de Node.js est taillée pour ce besoinTypeScript sécurise la manipulation des structures de données complexes (Peer Table, Manifests) et des buffers binaires exigés par le protocole.

### Transport Local : UDP Multicast + TCP Sockets
**Justification :** Pour garantir un réseau ad-hoc sans configuration préalable, nous utilisons **UDP Multicast (LAN)** sur l'adresse privée `239.255.42.99:6000` pour la découverte des pairs (Broadcast léger et standard)Une fois découverts, les nœuds établissent des connexions **TCP point-à-point** pour le handshake cryptographique et les transferts de fichiers, assurant fiabilité et contrôle de flux.

## 3. Schéma d'Architecture (Archipel P2P)

```text
  [Réseau Local LAN / Ad-Hoc - ZERO INTERNET]
                 |
   +-------------+-------------+
   |             |             |
+--+--+       +--+--+       +--+--+
|Nœud |       |Nœud |       |Nœud |
|  A  |       |  B  |       |  C  |
+--+--+       +--+--+       +--+--+
   |             |             |
   |             |             |
   +----(UDP Multicast)--------+ ---> Découverte (Port 6000) [HELLO]
   |    239.255.42.99          |
   |                           |
   +----(TCP Sockets)----------+ ---> Transferts (Port 7777+)
        Connexions P2P directes       [Handshake Noise + AES-GCM]
                                      [Transfert de Chunks Rarest First]

```

## 4. Spécification du Format de Paquet (ARCHIPEL PACKET v1)

Tout trafic TCP respecte scrupuleusement le format binaire suivant, garantissant qu'aucune donnée ne transite en clair  :

| Champ | Taille | Type / Description |
| --- | --- | --- |
| **MAGIC** | 4 bytes | Identifiant du protocole Archipel |
| **TYPE** | 1 byte | Type de paquet (0x01 HELLO, 0x03 MSG, etc.) |
| **NODE ID** | 32 bytes | Clé publique Ed25519 de l'émetteur |
| **PAYLOAD LEN** | 4 bytes | Longueur du payload (uint32_BE) |
| **PAYLOAD** | Variable | Données (Chiffrées en AES-GCM après handshake) |
| **SIGNATURE** | 32 bytes | Signature HMAC-SHA256 pour intégrité du paquet |

## 5. Primitives Cryptographiques

Nous n'utilisons aucun algorithme "maison" (Anti-pattern 2), l'ensemble repose sur `libsodium-wrappers`:

* 
**Identité et Signatures :** `Ed25519` (Preuve d'identité sans autorité centrale).


* 
**Échange de clés éphémères :** `X25519` (Diffie-Hellman pour le Forward Secrecy à chaque session TCP).


* 
**Chiffrement de bout-en-bout :** `AES-256-GCM` (Chiffrement symétrique des payloads avec authentification intégrée).


* 
**Intégrité :** `HMAC-SHA256` et hashage `SHA-256` pour la vérification des chunks de fichiers.