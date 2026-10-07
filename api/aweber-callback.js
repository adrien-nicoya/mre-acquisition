// GET /api/aweber-callback : retour d'AWeber, échange le code contre les tokens et les enregistre dans Vercel Blob.
import { tokenRequest, saveToken } from '../lib/aweber.js';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const code = url.searchParams.get('code');
  if (!code) return res.status(400).send('Code AWeber absent : ' + (url.searchParams.get('error') || 'refus'));
  if (url.searchParams.get('state') !== (process.env.CRON_SECRET || 'mre')) return res.status(400).send('State invalide');
  try {
    const host = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
    const tok = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: `${host}/api/aweber-callback` });
    await saveToken(tok);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<p style="font-family:sans-serif">AWeber connecté. <a href="/">Ouvrir le dashboard</a></p>');
  } catch (e) {
    res.status(500).send(e.message);
  }
}
