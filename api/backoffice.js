/**
 * api/backoffice.js
 * Portail interne (protégé Basic Auth) donnant accès aux 3 outils du
 * cabinet, chacun hébergé sur sa propre application :
 *   - Lien de paiements    → sogecommerce-pwa
 *   - Facturation          → invoice-pwa
 *   - Consultation vidéo   → sogecommerce-pwa (onglet vidéo, lien profond)
 *
 * Volontairement une simple page de liens, pas une réimplémentation :
 * le plan Vercel Hobby limite à 12 fonctions serverless par déploiement.
 * invoice-pwa (10) et sogecommerce-pwa (11) sont déjà proches de cette
 * limite chacune — les fusionner dépasserait largement le plafond. Cette
 * page reste donc volontairement légère (aucune logique dupliquée).
 */

'use strict';

const { checkBasicAuth } = require('../lib/auth-basic');

module.exports = async function handler(req, res) {
  if (!checkBasicAuth(req, res)) return;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  res.status(200).send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Backoffice — Ouvertures Psy</title>
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,600&family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --rose: #c9748f; --rose-bg: #fdf0f4; --mauve: #8e6b8e;
      --cream: #faf7f5; --text: #3d2b2b; --muted: #8a7070; --border: #e8d8d8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Nunito', sans-serif; color: var(--text); background: var(--cream);
      min-height: 100dvh; display: flex; flex-direction: column; align-items: center;
      padding: 48px 20px;
    }
    header { text-align: center; margin-bottom: 40px; }
    header .brand { font-family: 'Playfair Display', serif; font-size: 1.6rem; font-weight: 600; color: var(--mauve); }
    header .sub { font-size: 0.9rem; color: var(--muted); margin-top: 6px; }
    .cartes { display: grid; gap: 18px; width: 100%; max-width: 420px; }
    .carte {
      display: flex; align-items: center; gap: 16px;
      background: white; border: 1px solid var(--border); border-radius: 16px;
      padding: 20px; text-decoration: none; color: var(--text);
      transition: transform .15s, box-shadow .15s;
    }
    .carte:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(142,107,142,.15); }
    .carte .icone {
      width: 48px; height: 48px; border-radius: 12px; background: var(--rose-bg);
      display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0;
    }
    .carte .titre { font-family: 'Playfair Display', serif; font-size: 1.1rem; font-weight: 600; color: var(--mauve); }
    .carte .desc { font-size: 0.82rem; color: var(--muted); margin-top: 3px; }
    footer { margin-top: 40px; font-size: 0.75rem; color: var(--muted); text-align: center; }
  </style>
</head>
<body>
  <header>
    <div class="brand">Backoffice</div>
    <div class="sub">Ouvertures Psy — accès interne</div>
  </header>

  <div class="cartes">
    <a class="carte" href="https://paiement.meignant.net/" target="_blank" rel="noopener">
      <div class="icone">💳</div>
      <div>
        <div class="titre">Lien de paiements</div>
        <div class="desc">Créer un lien, suivre les transactions, remboursements</div>
      </div>
    </a>

    <a class="carte" href="https://factures.meignant.net/" target="_blank" rel="noopener">
      <div class="icone">📄</div>
      <div>
        <div class="titre">Facturation</div>
        <div class="desc">Factures, patients, réglages du cabinet</div>
      </div>
    </a>

    <a class="carte" href="https://paiement.meignant.net/#video" target="_blank" rel="noopener">
      <div class="icone">📹</div>
      <div>
        <div class="titre">Consultation vidéo</div>
        <div class="desc">Démarrer une consultation ou reprendre un patient en attente</div>
      </div>
    </a>
  </div>

  <footer>Chaque outil s'ouvre dans son application dédiée.</footer>
</body>
</html>`);
};
