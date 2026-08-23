/**
 * api/prepay-consultation.js
 * Prépaiement d'une consultation à venir depuis www.meignant.net
 *
 * Flux :
 * 1. Vérifier que le demandeur est un patient déjà connu (prénom + nom, accent-insensible + email)
 * 2. Si connu → créer un lien de paiement SogeCommerce (capture immédiate, comme create-payment.js
 *    de sogecommerce-pwa) et l'enregistrer dans Redis avec la même structure que sogecommerce-pwa,
 *    afin que les traitements existants (mise à jour du statut, création de facture, notification
 *    du praticien par bcc) s'appliquent automatiquement sans aucune modification de ces projets.
 * 3. Si inconnu → email d'alerte au praticien + message informatif au patient (aucun lien créé)
 */

'use strict';

try {
  require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });
} catch (e) {}

const nodemailer         = require('nodemailer');
const { checkRateLimit } = require('../lib/rate-limit');
const { decrypt }        = require('../lib/crypto-utils');

// ─── Config ──────────────────────────────────────────────────────────────────
const PRATICIEN_EMAIL = process.env.PRATICIEN_EMAIL || 'cabinet@ouvertures-psy.online';
const REDIS_URL       = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN     = process.env.UPSTASH_REDIS_REST_TOKEN;
const DUREE_VALIDITE_JOURS      = 1;
const PREFERENCE_3DS            = 'CHALLENGE_MANDATE';
const DELAI_REMISE_BANQUE_JOURS = 0; // Capture immédiate, comme create-payment.js

// ─── Helpers Redis (REST natif, pas de SDK) ───────────────────────────────────
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

async function redisGet(key) {
  return redisCommand('GET', key);
}

async function getPatients() {
  const raw = await redisGet('invoice:patients');
  if (!raw) return [];
  const d = isEncryptedValue(raw) ? decrypt(raw) : raw;
  return Array.isArray(d) ? d : [];
}

function isEncryptedValue(v) {
  return typeof v === 'string' && v.startsWith('enc:v1:');
}

// ─── Normalisation accent-insensible ─────────────────────────────────────────
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// ─── Transport email ─────────────────────────────────────────────────────────
function createTransport() {
  const port = parseInt(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   port,
    secure: port === 465, // true = TLS implicite (465), false = STARTTLS (587, ex: Brevo)
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls:    { rejectUnauthorized: false }
  });
}

async function sendAlertEmailPraticien(patientName, emailPatient, montantSaisi, raison) {
  const transporter = createTransport();
  await transporter.sendMail({
    from:    `"Site www.meignant.net" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to:      PRATICIEN_EMAIL,
    subject: `⚠️ Demande de prépaiement non traitée — ${patientName}`,
    text: [
      `Une demande de prépaiement de consultation n'a pas pu être traitée automatiquement.`,
      '',
      `Patient : ${patientName}`,
      `Email   : ${emailPatient}`,
      `Montant : ${parseFloat(montantSaisi).toFixed(2).replace('.', ',')} €`,
      `Raison  : ${raison}`,
      '',
      `Merci de contacter le patient pour organiser le règlement.`
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <div style="background:#dc2626;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:1.1rem">⚠️ Demande de prépaiement non traitée</h2>
      </div>
      <div style="background:#f4f7fb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <p style="margin:0 0 16px">Une demande de prépaiement n'a pas pu être traitée automatiquement :</p>
        <div style="background:#fee2e2;border-radius:6px;padding:16px;margin-bottom:16px">
          <div>👤 <strong>${patientName}</strong></div>
          <div style="margin-top:6px">📧 <a href="mailto:${emailPatient}">${emailPatient}</a></div>
          <div style="margin-top:6px">💶 Montant : <strong>${parseFloat(montantSaisi).toFixed(2).replace('.', ',')} €</strong></div>
          <div style="margin-top:8px;font-size:0.9rem;color:#7f1d1d">Raison : ${raison}</div>
        </div>
        <p style="margin:0;font-weight:600;color:#dc2626">Merci de contacter le patient pour organiser le règlement.</p>
      </div>
    </div>`
  });
}

async function sendNotFoundEmailPatient(to, patientName) {
  const transporter = createTransport();
  await transporter.sendMail({
    from:    `"Cabinet" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `Demande de paiement en ligne — en cours de traitement`,
    text: [
      `Bonjour ${patientName},`,
      '',
      `Nous avons bien reçu votre demande de paiement en ligne pour votre prochaine consultation.`,
      '',
      `Nous n'avons pas pu retrouver automatiquement votre dossier. Le praticien prendra contact avec vous dans les meilleurs délais pour organiser le règlement.`,
      '',
      `Cordialement,`,
      `Le cabinet Ouvertures Psy`
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <div style="background:#1a3a5c;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:1.1rem">Demande de paiement reçue</h2>
      </div>
      <div style="background:#f4f7fb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <p style="margin:0 0 12px">Bonjour <strong>${patientName}</strong>,</p>
        <p style="margin:0 0 16px">Nous avons bien reçu votre demande de paiement en ligne pour votre prochaine consultation.</p>
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:0.9rem;color:#92400e">
          ⚠️ Nous n'avons pas pu retrouver automatiquement votre dossier. Le praticien prendra contact avec vous dans les meilleurs délais.
        </div>
        <p style="margin:0;font-size:0.9rem;color:#64748b">Cordialement,<br/><strong>Le cabinet Ouvertures Psy</strong></p>
      </div>
    </div>`
  });
}

// ─── Handler principal ────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Méthode non autorisée' });

  // Vérification variables d'environnement
  const missingVars = [];
  if (!REDIS_URL)  missingVars.push('UPSTASH_REDIS_REST_URL');
  if (!REDIS_TOKEN) missingVars.push('UPSTASH_REDIS_REST_TOKEN');
  if (!process.env.ENCRYPTION_KEY) missingVars.push('ENCRYPTION_KEY');
  if (!process.env.SMTP_HOST)      missingVars.push('SMTP_HOST');
  if (!process.env.SOGE_USERNAME)  missingVars.push('SOGE_USERNAME');
  if (!process.env.SOGE_PASSWORD)  missingVars.push('SOGE_PASSWORD');
  if (missingVars.length > 0) {
    console.error('[prepay] Variables manquantes:', missingVars.join(', '));
    return res.status(500).json({ error: 'Configuration serveur incomplete: ' + missingVars.join(', ') });
  }

  const { prenom, nom, email, montant, website } = req.body || {};

  // Honeypot : si rempli → bot silencieux
  if (website) { console.warn('[prepay] Honeypot bot detecte'); return res.status(200).json({ success: false, message: 'Demande enregistree.' }); }

  // Rate limiting : 5 demandes par IP par heure
  const rl = await checkRateLimit(req, 'prepay', 5, 3600);
  if (!rl.ok) return res.status(429).json({ error: rl.message });

  // Validation des champs
  if (!prenom || !nom || !email || !montant) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (isNaN(parseFloat(montant)) || parseFloat(montant) <= 0) {
    return res.status(400).json({ error: 'Montant invalide' });
  }

  const patientName = `${prenom} ${nom}`;

  try {
    // ── 1. Vérifier que le patient est déjà connu ──────────────────────
    const patients = await getPatients();
    const patientByName = patients.find(p =>
      normalize(p.prenom) === normalize(prenom) &&
      normalize(p.nom)    === normalize(nom)
    );

    let raison = '';
    let patient = null;

    if (!patientByName) {
      raison = `Patient "${patientName}" introuvable dans la base`;
      console.log('[prepay] Patient non trouvé:', patientName);
    } else {
      const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      const emailSaisi = email.toLowerCase().trim();

      if (ADMIN_EMAILS.includes(emailSaisi)) {
        patient = patientByName;
      } else if (patientByName.email && normalize(patientByName.email) === normalize(email)) {
        patient = patientByName;
      } else {
        raison = `Email fourni ne correspond pas au dossier de "${patientName}"`;
        console.log('[prepay] Email ne correspond pas pour:', patientName);
      }
    }

    if (!patient) {
      // Patient non identifié : alerte praticien + email informatif patient, aucun lien créé
      try {
        await sendAlertEmailPraticien(patientName, email, montant, raison);
        await sendNotFoundEmailPatient(email, patientName);
      } catch (mailErr) {
        console.error('[prepay] Erreur envoi email (patient non trouvé):', mailErr.message);
      }
      return res.status(200).json({
        success: false,
        message: "Nous n'avons pas pu retrouver automatiquement votre dossier. Le praticien va vous contacter."
      });
    }

    // ── 2. Créer le lien de paiement SogeCommerce (capture immédiate) ──
    const montantCentimes = Math.round(parseFloat(montant) * 100);
    const nomSlug = patientName.trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .substring(0, 30)
      .toUpperCase();
    const orderId = `Consultation-${nomSlug}`;

    const username = process.env.SOGE_USERNAME;
    const password = process.env.SOGE_PASSWORD;
    const apiUrl    = process.env.SOGE_API_URL || 'https://api-sogecommerce.societegenerale.eu';
    const mode      = process.env.SOGE_MODE    || 'TEST';
    // Même préfixe Redis que sogecommerce-pwa/invoice-pwa pour partager la même file d'attente
    const prefix    = mode === 'PRODUCTION' ? 'prod' : 'dev';

    const basicAuth      = Buffer.from(`${username}:${password}`).toString('base64');
    const dateExpiration = new Date();
    dateExpiration.setDate(dateExpiration.getDate() + DUREE_VALIDITE_JOURS);
    const expirationDate = dateExpiration.toISOString();

    const payload = {
      amount: montantCentimes,
      currency: 'EUR',
      orderId: orderId,
      channelOptions: { channelType: 'URL' },
      customer: { reference: patientName.trim() },
      locale: 'fr_FR',
      expirationDate: expirationDate,
      strongAuthentication: PREFERENCE_3DS,
      captureDelay: DELAI_REMISE_BANQUE_JOURS,
      dataCollectionForm: 'false',
      // Redirection du patient vers une page dédiée de remerciement (puis retour auto à l'accueil)
      // (nécessite un clic sur "Retourner à la boutique" côté page SogeCommerce —
      // ces URL servent uniquement de contexte visuel, jamais de confirmation fiable :
      // c'est le cron/QStash de mise à jour de statut qui fait foi)
      returnUrl:  'https://www.meignant.net/paiement-merci.html?statut=info',
      successUrl: 'https://www.meignant.net/paiement-merci.html?statut=succes',
      refusedUrl: 'https://www.meignant.net/paiement-merci.html?statut=echec',
      cancelUrl:  'https://www.meignant.net/paiement-merci.html?statut=annule'
    };

    const sogeRes = await fetch(`${apiUrl}/api-payment/V4/Charge/CreatePaymentOrder`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const rawText = await sogeRes.text();
    let sogeData;
    try { sogeData = JSON.parse(rawText); }
    catch {
      console.error('[prepay] Réponse SogeCommerce non-JSON:', rawText.substring(0, 300));
      return res.status(502).json({ error: 'Le service de paiement est momentanément indisponible. Veuillez réessayer.' });
    }

    if (sogeData.status !== 'SUCCESS') {
      console.error('[prepay] Erreur SogeCommerce:', sogeData.answer?.errorMessage || sogeData.status);
      return res.status(400).json({ error: sogeData.answer?.errorMessage || 'Impossible de créer le lien de paiement.' });
    }

    const paymentOrderId = sogeData.answer.paymentOrderId;
    const creationDate   = new Date().toISOString();

    // ── 3. Sauvegarde dans Redis (même structure que sogecommerce-pwa) ──
    // Les crons existants (mise à jour statut + création facture/email) traiteront
    // cette transaction automatiquement, sans aucune modification requise ailleurs.
    const txKey = `${prefix}:tx:${paymentOrderId}`;
    try {
      await redisCommand('HSET', txKey,
        'paymentOrderId', paymentOrderId,
        'orderId',        orderId,
        'nomPatient',     patientName.trim(),
        'patientId',      patient.id || '',
        'amount',         String(montantCentimes),
        'status',         'RUNNING',
        'creationDate',   creationDate,
        'expirationDate', expirationDate,
        'paymentURL',     sogeData.answer.paymentURL,
        'paiementGroupe', 'false',
        'source',         'facture-pwa'
      );
      await redisCommand('ZADD', `${prefix}:index`, String(new Date(creationDate).getTime()), paymentOrderId);
    } catch (redisErr) {
      console.error('[prepay] Erreur sauvegarde Redis:', redisErr.message);
      // On ne bloque pas : le lien de paiement est déjà créé côté SogeCommerce et valide,
      // mais le suivi automatique (facture, notification) ne fonctionnera pas pour cette transaction.
    }

    return res.status(200).json({
      success: true,
      paymentURL: sogeData.answer.paymentURL,
      montant: parseFloat(montant).toFixed(2)
    });

  } catch (err) {
    console.error('[prepay] Erreur:', err.message);
    return res.status(500).json({ error: 'Une erreur est survenue. Veuillez réessayer.' });
  }
};
