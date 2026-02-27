const _sodium = require('libsodium-wrappers');
const fs = require('fs');
const path = require('path');

async function generateNodeIdentity() {
    await _sodium.ready;
    const sodium = _sodium;

    const edKeyPair = sodium.crypto_sign_keypair();
    const dhKeyPair = sodium.crypto_box_keypair();
    const nodeId = sodium.to_hex(edKeyPair.publicKey);

    const identity = {
        node_id: nodeId,
        created_at: new Date().toISOString(),
        ed25519: {
            publicKey: sodium.to_hex(edKeyPair.publicKey),
            privateKey: sodium.to_hex(edKeyPair.privateKey)
        },
        x25519: {
            publicKey: sodium.to_hex(dhKeyPair.publicKey),
            privateKey: sodium.to_hex(dhKeyPair.privateKey)
        }
    };

    const keysDir = path.join(process.cwd(), 'keys');
    if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

    const keyFile = path.join(keysDir, 'node_identity.json');
    fs.writeFileSync(keyFile, JSON.stringify(identity, null, 2));

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║         🔑 ARCHIPEL NODE IDENTITY GENERATED          ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    console.log('NODE_ID (Ed25519 pub) : ' + nodeId);
    console.log('X25519  pub key       : ' + identity.x25519.publicKey);
    console.log('\n✅ Clés sauvegardées dans : ' + keyFile);
    console.log('⚠️  Ne jamais committer le dossier keys/ sur GitHub !\n');

    return identity;
}

generateNodeIdentity().catch(console.error);