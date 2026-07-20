// api/crypto-utils.js — Chiffrement AES-256-GCM pour les données sensibles Redis
// Utilisé pour : invoice:patients, invoice:{PREFIX}:factures
// Format stocké : "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
// Si la valeur ne commence pas par "enc:v1:" c'est du JSON clair (avant migration) → lu tel quel

'use strict';
const crypto = require('crypto');

const ALGO    = 'aes-256-gcm';
const VERSION = 'enc:v1:';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY manquante dans les variables d\'environnement');
  // Accepte une clé hex 64 chars (32 bytes) ou base64 44 chars (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (raw.length === 44)              return Buffer.from(raw, 'base64');
  throw new Error('ENCRYPTION_KEY invalide — doit être 64 chars hex ou 44 chars base64');
}

/**
 * Chiffre une valeur JS (objet, tableau, string) → string stockable dans Redis
 */
function encrypt(value) {
  const key      = getKey();
  const iv       = crypto.randomBytes(12); // 96 bits recommandé pour GCM
  const cipher   = crypto.createCipheriv(ALGO, key, iv);
  const plain    = JSON.stringify(value);
  const enc      = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag  = cipher.getAuthTag();
  return VERSION + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + enc.toString('hex');
}

/**
 * Déchiffre une valeur Redis → valeur JS originale
 * Accepte aussi les anciennes valeurs non chiffrées (transition transparente)
 */
function decrypt(stored) {
  // Valeur non chiffrée (avant migration) → on la retourne telle quelle
  if (!stored || typeof stored !== 'string' || !stored.startsWith(VERSION)) {
    return stored; // sera désérialisé par le SDK Upstash normalement
  }
  try {
    const key     = getKey();
    const parts   = stored.slice(VERSION.length).split(':');
    if (parts.length !== 3) throw new Error('Format chiffré invalide');
    const [ivHex, tagHex, ctHex] = parts;
    const iv       = Buffer.from(ivHex,  'hex');
    const authTag  = Buffer.from(tagHex, 'hex');
    const ct       = Buffer.from(ctHex,  'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const plain    = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch(e) {
    console.error('[crypto-utils] Déchiffrement échoué:', e.message, e);
    throw new Error('Déchiffrement échoué : ' + e.message);
  }
}

/**
 * Vérifie si une valeur est déjà chiffrée
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(VERSION);
}

module.exports = { encrypt, decrypt, isEncrypted };
