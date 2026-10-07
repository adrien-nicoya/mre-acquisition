// GET /api/report?c=<id> : challenge en cours → direct ; challenge figé → instantané.
import challenges from '../lib/challenges.js';
import { compute, applyEmailDaily, applyMetaDaily, applySignupsDaily } from '../lib/compute.js';
import { getSnapshot } from '../lib/store.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = new URL(req.url, 'http://x').searchParams.get('c');
  const ch = challenges.find(c => c.id === id) || challenges.find(c => c.status === 'live') || challenges.at(-1);
  if (!ch) return res.status(404).json({ errors: ['Challenge inconnu'] });

  if (ch.status !== 'live') {
    const snap = await getSnapshot(ch.id).catch(() => null);
    if (snap) {
      const data = applySignupsDaily(applyMetaDaily(applyEmailDaily(snap, ch), ch), ch);
      data.challenge = { ...data.challenge, targets: ch.targets || null };
      return res.status(200).json({ ...data, frozen: true });
    }
  }
  const data = await compute(ch);
  res.status(data.signups || data.meta || data.emails ? 200 : 502).json({ ...data, frozen: false });
}
