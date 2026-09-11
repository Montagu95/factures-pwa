// lib/auth-basic.js — Middleware Basic Auth partagé (même pattern qu'invoice-pwa/sogecommerce-pwa)
// Variables d'env requises : BASIC_AUTH_USER, BASIC_AUTH_PASS

'use strict';

/**
 * Vérifie le header Authorization Basic sur la requête.
 * Retourne true si OK, sinon envoie 401 et retourne false.
 * Usage : if (!checkBasicAuth(req, res)) return;
 */
function checkBasicAuth(req, res) {
  // Bypass en dev si BASIC_AUTH_DISABLED=true
  if (process.env.BASIC_AUTH_DISABLED === 'true') return true;

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  if (!user || !pass) {
    // Non configuré → laisser passer (évite de bloquer si oubli de config)
    console.warn('[auth-basic] BASIC_AUTH_USER ou BASIC_AUTH_PASS non configuré');
    return true;
  }

  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Backoffice Ouvertures Psy", charset="UTF-8"');
    res.status(401).send('Authentification requise');
    return false;
  }

  const [reqUser, ...rest] = Buffer.from(header.slice(6), 'base64')
    .toString('utf8').split(':');
  const reqPass = rest.join(':'); // supporte les : dans le mot de passe

  if (reqUser !== user || reqPass !== pass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Backoffice Ouvertures Psy", charset="UTF-8"');
    res.status(401).send('Identifiants incorrects');
    return false;
  }

  return true;
}

module.exports = { checkBasicAuth };
