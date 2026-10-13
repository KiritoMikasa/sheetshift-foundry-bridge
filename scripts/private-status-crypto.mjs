// Bundled locally for Foundry, including HTTP worlds where SubtleCrypto is unavailable.
import { x25519 } from '@noble/curves/ed25519.js';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const random=length=>crypto.getRandomValues(new Uint8Array(length));
export function statusKeyPair(secret){const privateKey=secret?hexToBytes(secret):random(32);return {secret:bytesToHex(privateKey),publicKey:bytesToHex(x25519.getPublicKey(privateKey))};}
function key(secret,pub,nonce,context){return hkdf(sha256,x25519.getSharedSecret(hexToBytes(secret),hexToBytes(pub)),hexToBytes(nonce),encoder.encode(context),32);}
export function sealStatus(value,publicKey,context){
  const ephemeral=statusKeyPair(),nonce=bytesToHex(random(12));
  const cipher=gcm(key(ephemeral.secret,publicKey,nonce,context),hexToBytes(nonce),encoder.encode(context)).encrypt(encoder.encode(JSON.stringify(value)));
  return {ephemeral:ephemeral.publicKey,key:publicKey,nonce,data:bytesToHex(cipher)};
}
export function openStatus(box,secret,context){
  const plain=gcm(key(secret,box.ephemeral,box.nonce,context),hexToBytes(box.nonce),encoder.encode(context)).decrypt(hexToBytes(box.data));
  return JSON.parse(decoder.decode(plain));
}
