/**
 * api/video-effect.js
 * Expose publiquement le réglage "Effet vidéo" configuré dans invoice-pwa
 * (Réglages > Effet vidéo), pour que sogecommerce-pwa (praticienne) et
 * facture-pwa/visio.html (patient) sachent quel effet appliquer à la
 * consultation Whereby. Placé ici (facture-pwa) plutôt que dans invoice-pwa
 * ou sogecommerce-pwa, qui sont déjà proches de la limite de 12 fonctions
 * serverless du plan Vercel Hobby.
 * Public (pas de Basic Auth) : c'est juste une préférence d'affichage, pas
 * une donnée sensible — et sogecommerce-pwa doit pouvoir l'appeler en
 * cross-origin sans identifiants invoice-pwa.
 */

'use strict';

try {
  require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env.local') });
} catch (e) {}

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

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=60'); // évite de solliciter Redis à chaque appel vidéo
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const settings = await redisGet('invoice:settings');
    const videoEffect = (settings && settings.videoEffect) || 'none';
    return res.status(200).json({ videoEffect });
  } catch (err) {
    console.error('[video-effect]', err.message);
    // Repli sûr : sans effet, plutôt que de casser l'affichage vidéo
    return res.status(200).json({ videoEffect: 'none' });
  }
};
