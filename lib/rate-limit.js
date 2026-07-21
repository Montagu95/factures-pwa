/**
 * lib/rate-limit.js
 * Rate limiting par IP via Upstash Redis
 * Utilise INCR + EXPIRE pour un compteur TTL simple et atomique
 *
 * Usage :
 *   const { checkRateLimit } = require('../lib/rate-limit');
 *   const result = await checkRateLimit(req, 'facture', 5, 3600); // 5 req/heure
 *   if (!result.ok) return res.status(429).json({ error: result.message });
 */

'use strict';

async function redisCommand(...args) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const res   = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const data = await res.json();
  if (data.error) throw new Error('Redis: ' + data.error);
  return data.result;
}

/**
 * Vérifie et incrémente le compteur de requêtes pour une IP
 * @param {object} req         - Requête Express/Vercel
 * @param {string} action      - Identifiant de l'action ('facture', 'contact')
 * @param {number} maxRequests - Nombre max de requêtes autorisées
 * @param {number} windowSecs  - Fenêtre de temps en secondes
 * @returns {{ ok: boolean, message?: string, remaining?: number }}
 */
async function checkRateLimit(req, action, maxRequests, windowSecs) {
  try {
    // Récupérer l'IP réelle (Vercel passe l'IP via x-forwarded-for)
    const ip = (
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      'unknown'
    ).trim();

    const key = `rl:${action}:${ip}`;

    // INCR atomique — crée la clé si elle n'existe pas
    const count = await redisCommand('INCR', key);

    // Définir le TTL uniquement à la première requête
    if (count === 1) {
      await redisCommand('EXPIRE', key, String(windowSecs));
    }

    // Récupérer le TTL restant pour l'info
    const ttl = await redisCommand('TTL', key);

    console.log(`[rate-limit] ${action} — IP: ${ip} — count: ${count}/${maxRequests} — TTL: ${ttl}s`);

    if (count > maxRequests) {
      const minutesRestantes = Math.ceil(ttl / 60);
      return {
        ok: false,
        message: `Trop de tentatives. Veuillez reessayer dans ${minutesRestantes} minute${minutesRestantes > 1 ? 's' : ''}.`,
        remaining: 0,
        ttl
      };
    }

    return { ok: true, remaining: maxRequests - count };

  } catch (err) {
    // En cas d'erreur Redis, on laisse passer (fail open)
    // pour ne pas bloquer les utilisateurs légitimes
    console.error('[rate-limit] Erreur Redis, fail open:', err.message);
    return { ok: true, remaining: -1 };
  }
}

module.exports = { checkRateLimit };
