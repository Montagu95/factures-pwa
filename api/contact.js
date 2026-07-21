/**
 * api/contact.js
 * Formulaire de contact — envoie un email au praticien
 * L'adresse du praticien n'est jamais exposée côté client
 */

'use strict';

try {
  require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });
} catch (e) {}

const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 465,
    secure: true,
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls:    { rejectUnauthorized: false }
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Méthode non autorisée' });

  const { prenom, nom, email, sujet, message } = req.body || {};

  if (!prenom || !nom || !email || !sujet || !message) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  // Protection anti-spam basique : limiter la taille des champs
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message trop long (2000 caractères max)' });
  }

  const praticienEmail = process.env.PRATICIEN_EMAIL || 'cabinet@ouvertures-psy.online';
  const nomComplet     = `${prenom} ${nom}`;
  const dateStr        = new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  try {
    const transporter = createTransport();

    await transporter.sendMail({
      from:     `"Site Ouvertures Psy" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to:       praticienEmail,
      replyTo:  email,  // Répondre directement au visiteur
      subject:  `[Contact www.meignant.net] ${sujet}`,
      text: [
        `Nouveau message depuis www.meignant.net`,
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
            <tr><td style="color:#8a7070;padding:4px 0;width:80px">Date</td><td style="font-weight:600">${dateStr}</td></tr>
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

    console.log(`[contact] Message de ${nomComplet} <${email}> — sujet: ${sujet}`);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[contact]', err.message);
    return res.status(500).json({ error: 'Erreur d\'envoi — veuillez réessayer' });
  }
};
