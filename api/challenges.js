// GET /api/challenges : liste + chiffres clés (instantané pour les terminés).
import challenges from '../lib/challenges.js';
import { summary } from '../lib/compute.js';
import { getSnapshot } from '../lib/store.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const list = await Promise.all(challenges.map(async ch => {
    const base = { id: ch.id, name: ch.name, startDate: ch.startDate, endDate: ch.endDate, status: ch.status };
    if (ch.status === 'live') return { ...base, frozen: false, summary: null };
    const snap = await getSnapshot(ch.id).catch(() => null);
    return { ...base, frozen: !!snap, frozenAt: snap?.generatedAt || null, summary: snap ? summary(snap) : null };
  }));
  res.status(200).json({ challenges: list.reverse() });
}
