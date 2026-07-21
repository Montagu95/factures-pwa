/**
 * api/reissue-invoice.js
 * Réédition de facture depuis www.meignant.net
 *
 * Flux :
 * 1. Chercher le patient dans invoice:patients (prénom + nom, accent-insensible)
 * 2. Chercher la facture correspondante (patientId + date + montant)
 * 3a. Si trouvée + payée → générer PDF + envoyer email au patient
 * 3b. Si non trouvée → email au patient (informatif) + email au praticien (alerte)
 */

'use strict';

try {
  require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });
} catch (e) {}

const nodemailer        = require('nodemailer');
const { checkRateLimit } = require('../lib/rate-limit');
const { decrypt }       = require('../lib/crypto-utils');
const { generateInvoicePDF } = require('../lib/pdf-server');

// ─── Config ──────────────────────────────────────────────────────────────────
const PRATICIEN_EMAIL  = process.env.PRATICIEN_EMAIL  || 'cabinet@ouvertures-psy.online';
const INVOICE_PREFIX   = process.env.INVOICE_PREFIX   || 'PROD';
const REDIS_URL        = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN      = process.env.UPSTASH_REDIS_REST_TOKEN;

// ─── Helpers Redis (REST natif, pas de SDK) ───────────────────────────────────
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

async function getPatients() {
  const raw = await redisGet('invoice:patients');
  if (!raw) return [];
  const d = isEncryptedValue(raw) ? decrypt(raw) : raw;
  return Array.isArray(d) ? d : [];
}

async function getInvoices() {
  const raw = await redisGet(`invoice:${INVOICE_PREFIX}:factures`);
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

// ─── Vérification montant (tolérance ±0.01 €) ────────────────────────────────
function montantCorrespond(facture, montantSaisi) {
  const total = facture.total
    || (facture.lines || []).reduce((s, l) => s + ((l.qty || 0) * (l.unitPrice || 0)), 0);
  return Math.abs(total - parseFloat(montantSaisi)) < 0.02;
}

// ─── Vérification date (±3 jours de tolérance) ───────────────────────────────
// La date de consultation est dans lines[0].description (format "DD/MM/YYYY" ou ISO)
// invoiceDate est la date d'émission, pas de consultation
function parseDateDescription(desc) {
  if (!desc) return null;
  // Format français DD/MM/YYYY
  const frMatch = desc.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frMatch) {
    return new Date(
      parseInt(frMatch[3]),
      parseInt(frMatch[2]) - 1,
      parseInt(frMatch[1])
    );
  }
  // Format ISO ou autre
  const d = new Date(desc);
  return isNaN(d) ? null : d;
}

function dateCorrespond(facture, dateSaisie) {
  // Chercher la date dans lines[0].description en priorité
  const descDate = parseDateDescription((facture.lines || [])[0]?.description);
  const fd = descDate || new Date(facture.invoiceDate || facture.createdAt);
  const ds = new Date(dateSaisie);
  if (isNaN(fd) || isNaN(ds)) return false;
  return Math.abs(fd - ds) <= 3 * 24 * 60 * 60 * 1000;
}

// ─── Transport email ─────────────────────────────────────────────────────────
function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls:    { rejectUnauthorized: false }
  });
}

async function sendInvoiceEmail(to, patientName, invoice, pdfBase64, settings) {
  const praticien  = invoice.praticien || settings.praticien || {};
  const totalStr   = parseFloat(invoice.total || 0).toFixed(2).replace('.', ',') + ' €';
  const transporter = createTransport();

  await transporter.sendMail({
    from:    `"Cabinet" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    bcc:     PRATICIEN_EMAIL,
    subject: `Votre facture ${invoice.invoiceNumber}`,
    text: [
      `Bonjour ${patientName},`,
      '',
      `Suite à votre demande, veuillez trouver ci-joint votre facture ${invoice.invoiceNumber} d'un montant de ${totalStr}.`,
      '',
      `Cordialement,`,
      praticien.nom || 'Le cabinet'
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <div style="background:#1a3a5c;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:1.1rem">Réédition de facture</h2>
      </div>
      <div style="background:#f4f7fb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <p style="margin:0 0 12px">Bonjour <strong>${patientName}</strong>,</p>
        <p style="margin:0 0 16px">Suite à votre demande, veuillez trouver ci-joint votre facture <strong>${invoice.invoiceNumber}</strong> d'un montant de <strong>${totalStr}</strong>.</p>
        <div style="background:#e8f0f8;border-radius:6px;padding:12px 16px;font-size:0.9rem;color:#1a3a5c;margin-bottom:16px">📎 La facture est jointe en PDF.</div>
        <p style="margin:0;font-size:0.9rem">Cordialement,</p>
        ${praticien.nom ? `<p style="margin:4px 0 0;font-weight:600">${praticien.nom}</p>` : ''}
        ${praticien.titre ? `<p style="margin:2px 0 0;font-style:italic;font-size:0.85rem;color:#64748b">${praticien.titre}</p>` : ''}
      </div>
    </div>`,
    attachments: [{
      filename:    `${invoice.invoiceNumber}.pdf`,
      content:     pdfBase64,
      encoding:    'base64',
      contentType: 'application/pdf'
    }]
  });
}

async function sendNotFoundEmailPatient(to, patientName, dateSaisie, montantSaisi) {
  const transporter = createTransport();
  await transporter.sendMail({
    from:    `"Cabinet Ouvertures Psy" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `Demande de facture — en cours de traitement`,
    text: [
      `Bonjour ${patientName},`,
      '',
      `Nous avons bien reçu votre demande de facture pour la consultation du ${new Date(dateSaisie).toLocaleDateString('fr-FR')} d'un montant de ${parseFloat(montantSaisi).toFixed(2).replace('.', ',')} €.`,
      '',
      `Nous n'avons pas pu retrouver automatiquement la facture correspondante. Le praticien prendra contact avec vous dans les meilleurs délais.`,
      '',
      `Nous vous prions de nous excuser pour ce désagrément.`,
      '',
      `Cordialement,`,
      `Le cabinet Ouvertures Psy`
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <div style="background:#1a3a5c;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:1.1rem">Demande de facture reçue</h2>
      </div>
      <div style="background:#f4f7fb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <p style="margin:0 0 12px">Bonjour <strong>${patientName}</strong>,</p>
        <p style="margin:0 0 12px">Nous avons bien reçu votre demande de facture pour :</p>
        <div style="background:#e8f0f8;border-radius:6px;padding:12px 16px;margin-bottom:16px">
          <div>📅 Consultation du <strong>${new Date(dateSaisie).toLocaleDateString('fr-FR')}</strong></div>
          <div style="margin-top:6px">💶 Montant : <strong>${parseFloat(montantSaisi).toFixed(2).replace('.', ',')} €</strong></div>
        </div>
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:0.9rem;color:#92400e">
          ⚠️ Nous n'avons pas pu retrouver automatiquement cette facture. Le praticien prendra contact avec vous dans les meilleurs délais.
        </div>
        <p style="margin:0;font-size:0.9rem;color:#64748b">Cordialement,<br/><strong>Le cabinet Ouvertures Psy</strong></p>
      </div>
    </div>`
  });
}

async function sendAlertEmailPraticien(patientName, emailPatient, dateSaisie, montantSaisi, raison) {
  const transporter = createTransport();
  await transporter.sendMail({
    from:    `"Site www.meignant.net" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to:      PRATICIEN_EMAIL,
    subject: `⚠️ Demande de facture non trouvée — ${patientName}`,
    text: [
      `Une demande de réédition de facture n'a pas pu être traitée automatiquement.`,
      '',
      `Patient : ${patientName}`,
      `Email   : ${emailPatient}`,
      `Date    : ${new Date(dateSaisie).toLocaleDateString('fr-FR')}`,
      `Montant : ${parseFloat(montantSaisi).toFixed(2).replace('.', ',')} €`,
      `Raison  : ${raison}`,
      '',
      `Merci de contacter le patient pour lui fournir sa facture.`
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
      <div style="background:#dc2626;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:white;margin:0;font-size:1.1rem">⚠️ Demande de facture non traitée</h2>
      </div>
      <div style="background:#f4f7fb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <p style="margin:0 0 16px">Une demande de réédition n'a pas pu être traitée automatiquement :</p>
        <div style="background:#fee2e2;border-radius:6px;padding:16px;margin-bottom:16px">
          <div>👤 <strong>${patientName}</strong></div>
          <div style="margin-top:6px">📧 <a href="mailto:${emailPatient}">${emailPatient}</a></div>
          <div style="margin-top:6px">📅 Consultation du <strong>${new Date(dateSaisie).toLocaleDateString('fr-FR')}</strong></div>
          <div style="margin-top:6px">💶 Montant : <strong>${parseFloat(montantSaisi).toFixed(2).replace('.', ',')} €</strong></div>
          <div style="margin-top:8px;font-size:0.9rem;color:#7f1d1d">Raison : ${raison}</div>
        </div>
        <p style="margin:0;font-weight:600;color:#dc2626">Merci de contacter le patient pour lui fournir sa facture.</p>
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
  if (!process.env.UPSTASH_REDIS_REST_URL)  missingVars.push('UPSTASH_REDIS_REST_URL');
  if (!process.env.UPSTASH_REDIS_REST_TOKEN) missingVars.push('UPSTASH_REDIS_REST_TOKEN');
  if (!process.env.ENCRYPTION_KEY)          missingVars.push('ENCRYPTION_KEY');
  if (!process.env.SMTP_HOST)               missingVars.push('SMTP_HOST');
  if (missingVars.length > 0) {
    console.error('[reissue] Variables manquantes:', missingVars.join(', '));
    return res.status(500).json({ error: 'Configuration serveur incomplete: ' + missingVars.join(', ') });
  }
  console.log('[reissue] Requete recue pour:', req.body?.prenom, req.body?.nom);
  const { prenom, nom, email, dateConsultation, montant, website } = req.body || {};

  // Honeypot : si rempli → bot silencieux
  if (website) { console.warn('[reissue] Honeypot bot detecte'); return res.status(200).json({ success: false, message: 'Demande enregistree.' }); }

  // Rate limiting : 5 demandes par IP par heure
  const rl = await checkRateLimit(req, 'facture', 5, 3600);
  if (!rl.ok) return res.status(429).json({ error: rl.message });

  // Validation des champs
  if (!prenom || !nom || !email || !dateConsultation || !montant) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (isNaN(parseFloat(montant)) || parseFloat(montant) <= 0) {
    return res.status(400).json({ error: 'Montant invalide' });
  }

  const patientName  = `${prenom} ${nom}`;
  const startTime    = Date.now(); // Pour le timing constant

  try {
    // ── 1. Chercher le patient ────────────────────────────────────────
    const patients = await getPatients();

    // Chercher par prénom + nom (accent-insensible)
    const patientByName = patients.find(p =>
      normalize(p.prenom) === normalize(prenom) &&
      normalize(p.nom)    === normalize(nom)
    );

    let raison = '';
    let patient = null;

    if (!patientByName) {
      raison = `Patient "${patientName}" introuvable dans la base`;
      console.log('[reissue] Patient non trouvé:', patientName);
    } else {
      // Email admin : bypass de la vérification (test et vraies demandes)
      const ADMIN_EMAILS = ['cabinet@meignant.net'];
      const emailSaisi   = email.toLowerCase().trim();
      const isAdmin      = ADMIN_EMAILS.includes(emailSaisi);

      const emailPatientBase = (patientByName.email || '').toLowerCase().trim();

      if (isAdmin) {
        // Email admin → accès autorisé sans vérification
        // La facture sera envoyée à l'adresse admin, pas à celle du patient
        console.log('[reissue] Accès admin — bypass vérification email pour:', patientName);
        patient = patientByName;
      } else if (!emailPatientBase) {
        // Pas d'email enregistré → on accepte mais on log
        console.log('[reissue] Patient trouvé sans email enregistré, on accepte:', patientName);
        patient = patientByName;
      } else if (emailPatientBase !== emailSaisi) {
        // Email incorrect → sécurité : on répond "non trouvé" sans révéler pourquoi
        console.log('[reissue] Email incorrect pour', patientName, '— saisi:', emailSaisi, 'attendu:', emailPatientBase);
        raison = `Email incorrect pour le patient "${patientName}"`;
      } else {
        patient = patientByName;
        console.log('[reissue] Patient trouvé et email vérifié:', patientName);
      }
    }

    // ── 2. Chercher la facture ────────────────────────────────────────
    let facture = null;
    if (patient) {
      const factures = await getInvoices();
      console.log('[reissue] Nb factures en base:', factures.length);

      // Debug : loguer les factures du patient
      const facturesPatient = factures.filter(f => f.patient?.id === patient.id);
      console.log('[reissue] Factures du patient:', facturesPatient.map(f => ({
        num: f.invoiceNumber,
        status: f.status,
        desc: f.lines?.[0]?.description,
        total: f.total
      })));

      facture = factures.find(f =>
        f.patient?.id === patient.id &&
        f.status === 'paid' &&
        dateCorrespond(f, dateConsultation) &&
        montantCorrespond(f, montant)
      );

      if (!facture) {
        // Chercher sans le filtre statut pour donner une meilleure raison
        const factureAny = factures.find(f =>
          f.patient?.id === patient.id &&
          dateCorrespond(f, dateConsultation) &&
          montantCorrespond(f, montant)
        );
        if (factureAny) {
          raison = `Facture trouvée mais statut "${factureAny.status}" (non payée)`;
        } else {
          raison = `Aucune facture pour ${patientName} — date saisie: ${dateConsultation}, montant: ${montant}`;
        }
        console.log('[reissue] Facture non trouvée:', raison);
      }
    }

    // ── 3a. Facture trouvée → générer PDF + envoyer ───────────────────
    if (facture) {
      // Récupérer les settings du praticien depuis Redis
      let settings = {};
      try {
        const rawSettings = await redisGet('invoice:settings');
        settings = rawSettings ? (isEncryptedValue(rawSettings) ? decrypt(rawSettings) : rawSettings) : {};
      } catch (e) {}

      // Enrichir la facture avec le praticien si absent
      if (!facture.praticien && settings.praticien) {
        facture = { ...facture, praticien: settings.praticien };
      }

      // Générer le PDF
      const pdfBase64 = await generateInvoicePDF(facture, settings, settings.signatureB64 || null);

      // Envoyer email au patient
      await sendInvoiceEmail(email, patientName, facture, pdfBase64, settings);

      console.log(`[reissue] Facture ${facture.invoiceNumber} renvoyée à ${email}`);
      return res.status(200).json({
        success: true,
        message: `La facture ${facture.invoiceNumber} a été envoyée à ${email}`
      });
    }

    // ── 3b. Non trouvée → emails d'alerte ────────────────────────────
    console.log(`[reissue] Non trouvée — ${raison}`);

    await Promise.all([
      sendNotFoundEmailPatient(email, patientName, dateConsultation, montant),
      sendAlertEmailPraticien(patientName, email, dateConsultation, montant, raison)
    ]);

    const elapsed2 = Date.now() - startTime;
    if (elapsed2 < 1500) await new Promise(r => setTimeout(r, 1500 - elapsed2));
    return res.status(200).json({
      success: false,
      message: `Nous n\'avons pas pu retrouver cette facture. Un email de confirmation vous a ete envoye et le praticien prendra contact avec vous.`
    });

  } catch (err) {
    console.error('[reissue] ERREUR COMPLETE:', err.message, err.stack);
    return res.status(500).json({ error: 'Erreur serveur — veuillez reessayer ulterieurement', detail: err.message });
  }
};
