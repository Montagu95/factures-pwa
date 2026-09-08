/**
 * api/whereby-status.js
 * Vérifie si une consultation vidéo a été marquée terminée par la praticienne
 * (voir sogecommerce-pwa/api/delete-whereby-room.js, qui pose le drapeau).
 * Interrogé régulièrement par public/visio.html côté patient.
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const meetingId = req.query.meetingId;
  if (!meetingId) return res.status(400).json({ error: 'meetingId manquant' });

  try {
    const ended = await redisGet(`whereby:ended:${meetingId}`);
    return res.status(200).json({ ended: !!ended });
  } catch (err) {
    console.error('[whereby-status]', err.message);
    // En cas d'erreur Redis, ne pas casser la page patient : on répond
    // simplement "pas terminé", le prochain sondage réessaiera.
    return res.status(200).json({ ended: false });
  }
};
