// Client AWeber (OAuth2). Le refresh token est conservé dans Vercel Blob (il peut changer à chaque rafraîchissement),
// avec AWEBER_REFRESH_TOKEN en secours. Limite AWeber : 120 requêtes/minute par compte → une requête toutes les 550 ms.
const env = process.env;
const API = 'https://api.aweber.com/1.0';
const TOKEN_URL = 'https://auth.aweber.com/oauth2/token';
export const AUTH_URL = 'https://auth.aweber.com/oauth2/authorize';
export const SCOPES = 'account.read list.read subscriber.read email.read';
const TOKEN_KEY = 'aweber/token.json';

const blobOn = () => !!(env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN);

async function readToken() {
  if (blobOn()) {
    const { get } = await import('@vercel/blob');
    const r = await get(TOKEN_KEY, { access: 'private', useCache: false }).catch(() => null);
    const stream = r?.stream || r?.body;
    if (stream) return JSON.parse(await new Response(stream).text());
  }
  return env.AWEBER_REFRESH_TOKEN ? { refresh_token: env.AWEBER_REFRESH_TOKEN } : null;
}

export async function saveToken(tok) {
  if (!blobOn()) throw new Error('Stockage Vercel Blob non activé : impossible de conserver le token AWeber.');
  const { put } = await import('@vercel/blob');
  await put(TOKEN_KEY, JSON.stringify(tok), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
}

export async function tokenRequest(body) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${env.AWEBER_CLIENT_ID}:${env.AWEBER_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`AWeber OAuth ${r.status} : ${j.error_description || j.error || 'refus'}`);
  return { ...j, expires_at: Date.now() + (Number(j.expires_in) || 7200) * 1000 };
}

let cached = null;
async function accessToken() {
  if (cached && cached.expires_at - Date.now() > 120e3) return cached.access_token;
  const stored = await readToken();
  if (!stored?.refresh_token) throw new Error('AWeber non connecté : ouvre /api/aweber-auth pour autoriser le compte.');
  if (stored.access_token && stored.expires_at - Date.now() > 120e3) return (cached = stored).access_token;
  const tok = await tokenRequest({ grant_type: 'refresh_token', refresh_token: stored.refresh_token });
  tok.refresh_token ||= stored.refresh_token;
  cached = tok;
  await saveToken(tok).catch(() => {});
  return tok.access_token;
}

let nextSlot = 0;
export async function aw(path, params) {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 550;
  if (wait) await new Promise(r => setTimeout(r, wait));
  const url = (path.startsWith('http') ? path : API + path) + (params ? '?' + new URLSearchParams(params) : '');
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' } });
    if (r.status === 429 && attempt < 2) { await new Promise(res => setTimeout(res, 15e3)); continue; }
    if (r.status === 401 && attempt < 1) { cached = null; continue; }
    if (!r.ok) throw new Error(`AWeber ${r.status} sur ${path.split('?')[0].replace(API, '')}`);
    return r.json();
  }
}

// Toutes les pages d'une collection AWeber.
export async function awAll(path, params) {
  const out = [];
  let j = await aw(path, { ...params, 'ws.size': '100' });
  for (;;) {
    out.push(...(j.entries || []));
    if (!j.next_collection_link) return out;
    j = await aw(j.next_collection_link);
  }
}

let accountId = null;
export async function getAccountId() {
  if (env.AWEBER_ACCOUNT_ID) return env.AWEBER_ACCOUNT_ID;
  if (accountId) return accountId;
  const j = await aw('/accounts');
  accountId = j.entries?.[0]?.id;
  if (!accountId) throw new Error('AWeber : aucun compte accessible avec ce token.');
  return accountId;
}

export const listNum = id => String(id).replace(/^awlist/i, '');
