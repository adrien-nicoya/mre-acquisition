// POST /api/freeze?c=<id> : recalcule un challenge terminé et enregistre l'instantané.
import challenges from '../lib/challenges.js';
import { compute } from '../lib/compute.js';
import { saveSnapshot } from '../lib/store.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ errors: ['POST uniquement'] });
  const id = new URL(req.url, 'http://x').searchParams.get('c');
  const ch = challenges.find(c => c.id === id);
  if (!ch) return res.status(404).json({ errors: ['Challenge inconnu'] });
  if (ch.status === 'live') return res.status(400).json({ errors: ['Un challenge en cours ne se fige pas'] });

  const data = await compute(ch);
  if (data.errors.length) return res.status(502).json({ ...data, frozen: false });
  try {
    await saveSnapshot(ch.id, data);
    res.status(200).json({ ...data, frozen: true });
  } catch (e) {
    res.status(500).json({ ...data, frozen: false, errors: [e.message] });
  }
}
