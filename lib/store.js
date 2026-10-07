// Instantanés figés des challenges terminés (Vercel Blob privé, authentification OIDC).
const enabled = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const key = id => `snapshots/${id}.json`;

export async function getSnapshot(id) {
  if (!enabled()) return null;
  const { get } = await import('@vercel/blob');
  const r = await get(key(id), { access: 'private', useCache: false }).catch(() => null);
  const stream = r?.stream || r?.body;
  if (!stream) return null;
  return JSON.parse(await new Response(stream).text());
}

export async function saveSnapshot(id, data) {
  if (!enabled()) throw new Error('Stockage non activé : connecte un store Vercel Blob au projet (Storage → Blob).');
  const { put } = await import('@vercel/blob');
  await put(key(id), JSON.stringify(data), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
}

// Photos journalières des totaux d'inscrits (cron de minuit).
const dailyKey = (id, date) => `daily/${id}/${date}.json`;

export async function saveDaily(id, date, data) {
  if (!enabled()) throw new Error('Stockage non activé');
  const { put } = await import('@vercel/blob');
  await put(dailyKey(id, date), JSON.stringify(data), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
}

export async function listDaily(id) {
  if (!enabled()) return [];
  const { list, get } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: `daily/${id}/` });
  const rows = await Promise.all(blobs.map(async b => {
    const r = await get(b.pathname, { access: 'private', useCache: false }).catch(() => null);
    const stream = r?.stream || r?.body;
    return stream ? JSON.parse(await new Response(stream).text()) : null;
  }));
  return rows.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}
