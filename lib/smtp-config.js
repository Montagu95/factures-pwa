// lib/smtp-config.js — Résolution de la config SMTP effective (lecture seule)
//
// facture-pwa n'a pas de panneau admin : la configuration SMTP et l'adresse
// d'expédition sont saisies côté invoice-pwa (Réglages → Fonctions avancées)
// et stockées dans le Redis partagé (invoice:smtp, invoice:settings).
// Ce module se contente de les lire, avec repli sur les variables
// d'environnement de facture-pwa si absentes.

'use strict';

const { decrypt } = require('./crypto-utils');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key])
  });
  const data = await res.json();
  if (data.error) throw new Error('Redis: ' + data.error);
  return data.result;
}

function isEncryptedValue(v) {
  return typeof v === 'string' && v.startsWith('enc:v1:');
}

// Parse une valeur Redis quelconque (chiffrée, JSON en clair, ou déjà un objet)
function parseStoredValue(raw) {
  if (!raw) return null;
  if (isEncryptedValue(raw)) return decrypt(raw);
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  return raw; // déjà un objet
}

/**
 * Retourne { host, port, user, password } — repli sur les variables
 * d'environnement pour tout champ absent ou vide côté Redis.
 */
async function getSmtpConfig() {
  let stored = null;
  try {
    const raw = await redisGet('invoice:smtp');
    stored = parseStoredValue(raw);
  } catch (e) {
    console.error('[smtp-config] Lecture invoice:smtp échouée, repli sur env:', e.message);
  }

  const port = (stored && stored.port) || process.env.SMTP_PORT;

  return {
    host:     (stored && stored.host)     || process.env.SMTP_HOST,
    port:     parseInt(port, 10) || 587,
    user:     (stored && stored.user)     || process.env.SMTP_USER,
    password: (stored && stored.password) || process.env.SMTP_PASS
  };
}

/**
 * Retourne l'adresse d'expédition effective — priorité
 * invoice:settings.emailFrom > SMTP_FROM > smtpUser.
 */
async function getFromAddress(smtpUser) {
  let emailFrom = null;
  try {
    const raw = await redisGet('invoice:settings');
    const settings = parseStoredValue(raw);
    emailFrom = settings && settings.emailFrom;
  } catch (e) {
    console.error('[smtp-config] Lecture invoice:settings échouée, repli sur env:', e.message);
  }
  return emailFrom || process.env.SMTP_FROM || smtpUser;
}

module.exports = { getSmtpConfig, getFromAddress };
