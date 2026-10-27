// Real cryptography, running in the browser.
// SHA-256 makes "fingerprints" (hashes). secp256k1 is the same signature
// curve that Bitcoin and Ethereum use, so the concept is exactly the real one.
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";

export function sha256Hex(text) {
  return bytesToHex(sha256(utf8ToBytes(String(text))));
}

/** Demo keys are derived from a fixed phrase, so every role keeps the same key on every computer. */
export function privateKeyFor(roleKey) {
  return sha256(utf8ToBytes(`pixelpass-demo-key-${roleKey}`));
}

export function publicKeyFor(roleKey) {
  return bytesToHex(secp256k1.getPublicKey(privateKeyFor(roleKey), true));
}

/** Signs a message with the role's private key. Returns the signature as hex. */
export function signAs(roleKey, message) {
  const digest = sha256(utf8ToBytes(message));
  return secp256k1.sign(digest, privateKeyFor(roleKey)).toCompactHex();
}

/** True only if `signatureHex` was made for `message` by the owner of `publicKeyHex`. */
export function verifySignature(publicKeyHex, message, signatureHex) {
  try {
    const digest = sha256(utf8ToBytes(message));
    return secp256k1.verify(signatureHex, digest, publicKeyHex);
  } catch {
    return false;
  }
}

/** A short random code, e.g. "7K2Q9X". */
export function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
