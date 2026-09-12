/**
 * api/contact.js
 * Formulaire de contact — envoie un email au praticien
 * L'adresse du praticien n'est jamais exposée côté client
 *
 * GET  ?action=challenge → génère un petit calcul (anti-bot), stocké côté
 *                          serveur avec un jeton à usage unique (10 min)
 * POST                   → envoie le message, après vérification du calcul
 *
 * Ouvert à tout visiteur (plus réservé aux patients déjà suivis) — la
 * distinction "patient identifié / nouveau contact" est conservée à titre
 * indicatif pour la praticienne, dans le sujet et le corps de l'email.
 */

'use strict';

try {
  require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });
} catch (e) {}

const crypto            = require('crypto');
const nodemailer        = require('nodemailer');
const { checkRateLimit } = require('../lib/rate-limit');
const { decrypt }        = require('../lib/crypto-utils');
const { getSmtpConfig, getFromAddress } = require('../lib/smtp-config');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(...args) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const data = await res.json();
  if (data.error) throw new Error('Redis: ' + data.error);
  return data.result;
}

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// ─── Vérification patient (indicatif uniquement, ne bloque plus) ────────────
async function patientExiste(prenom, nom) {
  try {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'invoice:patients'])
    });
    const data = await res.json();
    const raw = data.result;
    if (!raw) return false;
    const isEnc = typeof raw === 'string' && raw.startsWith('enc:v1:');
    const patients = isEnc ? decrypt(raw) : (Array.isArray(raw) ? raw : JSON.parse(raw));
    if (!Array.isArray(patients)) return false;
    return patients.some(p =>
      normalize(p.prenom) === normalize(prenom) &&
      normalize(p.nom)    === normalize(nom)
    );
  } catch (e) {
    console.error('[contact] Vérification patient échouée (non bloquant):', e.message);
    return false;
  }
}

// ─── Anti-bot : petit calcul généré côté serveur, jeton à usage unique ──────
async function creerDefi() {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  const token = crypto.randomBytes(16).toString('hex');
  await redisCommand('SET', `contact-captcha:${token}`, String(a + b), 'EX', 600); // 10 min
  return { token, a, b };
}

async function verifierDefi(token, reponse) {
  if (!token || reponse === undefined || reponse === null || reponse === '') return false;
  const key = `contact-captcha:${token}`;
  const attendu = await redisCommand('GET', key);
  await redisCommand('DEL', key); // usage unique, même si la réponse est fausse
  if (attendu === null) return false; // jeton inconnu, expiré, ou déjà utilisé
  return parseInt(reponse, 10) === parseInt(attendu, 10);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Génération du défi anti-bot ──────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'challenge') {
    try {
      const defi = await creerDefi();
      return res.status(200).json(defi);
    } catch (e) {
      console.error('[contact] Génération défi échouée:', e.message);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { prenom, nom, email, sujet, message, website, captchaToken, captchaReponse } = req.body || {};

  // Honeypot : si rempli → bot silencieux
  if (website) { console.warn('[contact] Honeypot bot detecte'); return res.status(200).json({ ok: true }); }

  // Rate limiting : 10 messages par IP par heure
  const rl = await checkRateLimit(req, 'contact', 10, 3600);
  if (!rl.ok) return res.status(429).json({ error: rl.message });

  if (!prenom || !nom || !email || !sujet || !message) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message trop long (2000 caractères max)' });
  }

  // Anti-bot : le calcul doit être correct (jeton à usage unique, 10 min)
  const defiOk = await verifierDefi(captchaToken, captchaReponse);
  if (!defiOk) {
    return res.status(400).json({ error: 'Le calcul de vérification est incorrect ou a expiré. Veuillez réessayer.' });
  }

  const estPatient     = await patientExiste(prenom, nom);
  const praticienEmail = process.env.PRATICIEN_EMAIL || 'cabinet@ouvertures-psy.online';
  const nomComplet      = `${prenom} ${nom}`;
  const dateStr        = new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const etiquette = estPatient ? 'Patient suivi' : 'Nouveau contact';

  try {
    const smtpCfg      = await getSmtpConfig();
    const transporter  = nodemailer.createTransport({
      host:   smtpCfg.host,
      port:   smtpCfg.port,
      secure: smtpCfg.port === 465,
      auth:   { user: smtpCfg.user, pass: smtpCfg.password },
      tls:    { rejectUnauthorized: false }
    });
    const fromAddress = await getFromAddress(smtpCfg.user);

    await transporter.sendMail({
      from:     `"Site Ouvertures Psy" <${fromAddress}>`,
      to:       praticienEmail,
      replyTo:  email,  // Répondre directement au visiteur
      subject:  `[Contact — ${etiquette}] ${sujet}`,
      text: [
        `Nouveau message depuis www.meignant.net`,
        `Statut  : ${etiquette}`,
        `Date    : ${dateStr}`,
        `De      : ${nomComplet}`,
        `Email   : ${email}`,
        `Sujet   : ${sujet}`,
        ``,
        `Message :`,
        message
      ].join('\n'),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#3d2b2b">
        <div style="background:linear-gradient(135deg,#8e6b8e,#c9748f);padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0;font-size:1rem">📩 Nouveau message — www.meignant.net</h2>
        </div>
        <div style="background:#faf7f5;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e8d8d8">
          <table style="width:100%;font-size:.9rem;margin-bottom:20px">
            <tr><td style="color:#8a7070;padding:4px 0;width:80px">Statut</td><td style="font-weight:600">${etiquette}</td></tr>
            <tr><td style="color:#8a7070;padding:4px 0">Date</td><td style="font-weight:600">${dateStr}</td></tr>
            <tr><td style="color:#8a7070;padding:4px 0">De</td><td style="font-weight:600">${nomComplet}</td></tr>
            <tr><td style="color:#8a7070;padding:4px 0">Email</td><td><a href="mailto:${email}" style="color:#c9748f">${email}</a></td></tr>
            <tr><td style="color:#8a7070;padding:4px 0">Sujet</td><td style="font-weight:600">${sujet}</td></tr>
          </table>
          <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e8d8d8;font-size:.9rem;line-height:1.7;white-space:pre-wrap">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          <p style="margin-top:16px;font-size:.8rem;color:#8a7070">
            Pour répondre, cliquez sur "Répondre" dans votre messagerie — l'email sera envoyé directement à <strong>${email}</strong>.
          </p>
        </div>
      </div>`
    });

    console.log(`[contact] Message de ${nomComplet} <${email}> — ${etiquette} — sujet: ${sujet}`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[contact]', err.message);
    return res.status(500).json({ error: 'Erreur d\'envoi — veuillez réessayer' });
  }
};
