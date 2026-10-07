// GET /api/aweber-auth : lance l'autorisation OAuth AWeber (une seule fois, protégé par le mot de passe du dashboard).
import { AUTH_URL, SCOPES } from '../lib/aweber.js';

export default function handler(req, res) {
  const env = process.env;
  if (!env.AWEBER_CLIENT_ID) return res.status(500).send('AWEBER_CLIENT_ID manquant');
  const host = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const q = new URLSearchParams({
    response_type: 'code', client_id: env.AWEBER_CLIENT_ID,
    redirect_uri: `${host}/api/aweber-callback`, scope: SCOPES, state: env.CRON_SECRET || 'mre',
  });
  res.writeHead(302, { Location: `${AUTH_URL}?${q}` }).end();
}
