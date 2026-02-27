const _sodium = require('libsodium-wrappers');
const fs = require('fs');

async function testIdentity() {
    await _sodium.ready;
    const sodium = _sodium;

    const identity = JSON.parse(fs.readFileSync('./keys/node_identity.json'));
    const privKey = sodium.from_hex(identity.ed25519.privateKey);
    const pubKey  = sodium.from_hex(identity.ed25519.publicKey);

    const message = new TextEncoder().encode("archipel-test-message");
    const signature = sodium.crypto_sign_detached(message, privKey);
    const valid = sodium.crypto_sign_verify_detached(signature, message, pubKey);

    console.log(valid ? '✅ Signature Ed25519 : OK' : '❌ Signature invalide');
}

testIdentity().catch(console.error);