import nacl from "tweetnacl";
import { randomBytes } from "crypto";

function generateSigningKey() {
  const keypair = nacl.sign.keyPair();

  return {
    private: Buffer.from(keypair.secretKey).toString("base64"),
    public: Buffer.from(keypair.publicKey).toString("base64"),
  };
}

function generateBootstrapSecret() {
  return randomBytes(48).toString("base64");
}

const signing = generateSigningKey();
const bootstrap = generateBootstrapSecret();

console.log("=== SYNQ ENGINE PRODUCTION KEYS ===\n");

console.log("PAIRING_BOOTSTRAP_SECRET=");
console.log(bootstrap);

console.log("\nBACKEND_SIGNING_PRIVATE_KEY=");
console.log(signing.private);

console.log("\nBACKEND_SIGNING_PUBLIC_KEY (for reference only):");
console.log(signing.public);

console.log("\n===================================");
