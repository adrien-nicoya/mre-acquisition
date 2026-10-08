// Calcul des données d'un challenge (AWeber + Meta, en direct).
import { aw, awAll, getAccountId, listNum } from './aweber.js';
import { CHANNEL_LABELS, classify } from './channels.js';
const env = process.env;
const LEAD_ACTIONS = (env.META_LEAD_ACTION || 'lead').split(',').map(s => s.trim()).filter(Boolean);
const META_VERSION = env.META_API_VERSION || 'v23.0';

// ---------- AWeber : inscrits par tag sur la liste du challenge ----------
async function countTag(acc, list, tag) {
  const j = await aw(`/accounts/${acc}/lists/${list}/subscribers`, {
    'ws.op': 'find', 'ws.show': 'total_size', tags: JSON.stringify([tag]),
  });
  return Number(typeof j === 'object' ? (j.total_size ?? j) : j) || 0;
}

export async function getSignups(ch, warnings = []) {
  const acc = await getAccountId();
  const list = listNum(ch.awList);
  const [info, tags] = await Promise.all([
    aw(`/accounts/${acc}/lists/${list}`),
    aw(`/accounts/${acc}/lists/${list}/tags`),
  ]);
  const listTotal = Number(info.total_subscribers ?? 0) || null;

  const parsed = [];
  const unknown = [];
  for (const tag of tags || []) {
    const c = classify(tag);
    if (c === undefined || c?.ignored) continue;
    if (c === null) { unknown.push(tag); continue; }
    parsed.push({ tag, ...c });
  }
  if (!parsed.length) throw new Error(`Aucun tag [ch] trouvé sur la liste ${ch.awList}`);
  if (unknown.length) warnings.push(`Tags non classés (comptés nulle part) : ${unknown.join(', ')}`);

  const counts = [];
  for (const p of parsed) counts.push(await countTag(acc, list, p.tag));

  // Total : premier tag de ch.totalTags présent sur la liste (sinon, taille de la liste).
  const tagSet = new Set((tags || []).map(t => t.trim().toLowerCase()));
  const totalTag = (ch.totalTags || []).find(t => tagSet.has(t.toLowerCase()));
  const tagTotal = totalTag ? await countTag(acc, list, (tags || []).find(t => t.trim().toLowerCase() === totalTag.toLowerCase())) : null;

  const byCh = {};
  const get = k => (byCh[k] ??= { global: null, sources: [] });
  parsed.forEach((p, i) => {
    const c = get(p.channel);
    if (p.source) c.sources.push({ name: p.source, key: p.key, count: counts[i] });
    else c.global = counts[i];
  });

  const channels = Object.entries(byCh).map(([key, c]) => {
    const sources = c.sources.filter(s => s.count > 0);
    const sum = sources.reduce((a, s) => a + s.count, 0);
    const total = Math.max(c.global ?? 0, sum);
    if (sum > 0 && c.global != null && c.global - sum > 0) sources.push({ name: 'Sans sous-source', key: '', count: c.global - sum, rest: true });
    sources.sort((a, b) => (a.rest ? 1 : b.rest ? -1 : b.count - a.count));
    return { key, label: CHANNEL_LABELS[key] || key, total, sources };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const sumChannels = channels.reduce((a, c) => a + c.total, 0);
  const total = tagTotal ?? listTotal ?? sumChannels;
  if (!totalTag && ch.totalTags?.length) warnings.push(`Tag total introuvable (${ch.totalTags.join(' / ')}) : total = taille de la liste.`);
  if (total && sumChannels > total) warnings.push('La somme des canaux dépasse le total : certains contacts portent plusieurs tags de canal.');
  return { total, totalFromTag: tagTotal != null, totalTag: totalTag || null, channels };
}

// ---------- AWeber : broadcasts d'invitation ----------
const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] != null) return Number(o[k]); return null; };

async function getEmails(ch, emailSources, warnings) {
  // AWeber n'a pas de nom interne de broadcast : on prend les envois de la liste pendant l'acquisition,
  // on écarte les sujets exclus (newsletters…) et on numérote dans l'ordre d'envoi (Email #1 = premier envoi).
  const acc = await getAccountId();
  const list = listNum(ch.emailList);
  const all = await awAll(`/accounts/${acc}/lists/${list}/broadcasts`, { status: 'sent' });
  const from = new Date(ch.startDate + 'T00:00:00+02:00').getTime();
  const to = new Date(ch.endDate + 'T23:59:59+02:00').getTime();
  const excl = (ch.emailExclude || []).map(x => x.toLowerCase());
  const selected = all
    .filter(b => { const t = new Date(b.sent_at).getTime(); return t >= from && t <= to; })
    .filter(b => !ch.emailSegment || (b.segment_name || '').toLowerCase() === ch.emailSegment.toLowerCase())
    .filter(b => !excl.some(x => (b.subject || '').toLowerCase().includes(x)))
    .sort((x, y) => new Date(x.sent_at) - new Date(y.sent_at));

  const rows = [];
  let n = 0;
  for (const b of selected) {
    const d = b.stats ? b : await aw(`/accounts/${acc}/lists/${list}/broadcasts/${b.broadcast_id ?? b.id}`).catch(() => b);
    const s = d.stats || {};
    const num = ++n;
    const sent = pick(s, 'num_emailed') ?? 0;
    const delivered = Math.max(sent - (pick(s, 'num_undeliv') ?? 0), 0);
    const opens = pick(s, 'unique_opens') ?? 0;
    const clicks = pick(s, 'unique_clicks') ?? 0;
    const src = emailSources.find(x => x.key === String(num));
    rows.push({
      id: d.broadcast_id ?? d.id, name: `Email #${num}`, number: num, subject: d.subject || null,
      sentAt: d.sent_at, sent, delivered, uniqueOpens: opens, uniqueClicks: clicks,
      deliverability: sent ? delivered / sent : null,
      openRate: delivered ? opens / delivered : null,
      clickRate: delivered ? clicks / delivered : null,
      signups: src ? src.count : null,
    });
  }
  return rows.sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
}

// ---------- Meta ----------
async function metaRows(id, since, until, daily) {
  const params = { fields: 'spend,actions', level: 'account', limit: '100',
    time_range: JSON.stringify({ since, until }), access_token: env.META_ACCESS_TOKEN };
  if (daily) params.time_increment = '1';
  let url = `https://graph.facebook.com/${META_VERSION}/${id}/insights?` + new URLSearchParams(params);
  const rows = [];
  while (url) {
    const j = await (await fetch(url)).json();
    if (j.error) throw new Error(j.error.message);
    rows.push(...(j.data || []));
    url = j.paging?.next || null;
  }
  return rows;
}

async function getMeta(since, until, warnings) {
  const ids = (env.META_AD_ACCOUNT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const byDay = {};
  const seen = {};
  let failed = 0;
  const accounts = await Promise.all(ids.map(async id => {
    let rows;
    try {
      rows = await metaRows(id, since, until, true);
    } catch (e1) {
      // Meta renvoie parfois une erreur sur un compte sans diffusion : on vérifie sans découpage par jour.
      try {
        const total = await metaRows(id, since, until, false);
        if (!total.length || !Number(total[0].spend)) return { id, spend: 0, leads: 0, inactive: true };
        rows = await metaRows(id, since, until, true);
      } catch (e2) {
        failed++;
        warnings.push(`Compte Meta ${id} ignoré (${e2.message}) : sa dépense n'est pas comptée.`);
        return { id, spend: 0, leads: 0, failed: true };
      }
    }
    let spend = 0, leads = 0;
    for (const row of rows) {
      const s = Number(row.spend) || 0;
      for (const a of row.actions || []) seen[a.action_type] = (seen[a.action_type] || 0) + Number(a.value || 0);
      const l = Number(LEAD_ACTIONS.map(t => (row.actions || []).find(a => a.action_type === t)).find(Boolean)?.value) || 0;
      spend += s; leads += l;
      const d = (byDay[row.date_start] ??= { date: row.date_start, spend: 0, leads: 0 });
      d.spend += s; d.leads += l;
    }
    return { id, spend, leads, inactive: spend === 0 };
  }));
  if (ids.length && failed === ids.length) throw new Error('Aucun compte Meta n\'a répondu');
  const daily = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, cpl: d.leads ? d.spend / d.leads : null }));
  const spend = accounts.reduce((a, x) => a + x.spend, 0);
  const leads = accounts.reduce((a, x) => a + x.leads, 0);
  if (spend > 0 && !leads) warnings.push(`Aucune conversion « ${LEAD_ACTIONS.join(' / ')} » chez Meta. Événements disponibles : ${Object.entries(seen).map(([k, v]) => `${k} (${v})`).join(', ') || 'aucun'}`);
  return { spend, leads, cplMeta: leads ? spend / leads : null, accounts, daily };
}

// ---------- PostHog (A/B test de la page d'inscription) ----------
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

async function getAbTest(cfg, since, until) {
  if (!env.POSTHOG_PERSONAL_API_KEY) throw new Error('PostHog : variable POSTHOG_PERSONAL_API_KEY manquante');
  const host = (env.POSTHOG_HOST || 'https://eu.posthog.com').replace(/\/$/, '');
  const visitEvent = cfg.visitEvent || '$pageview';
  const signupEvent = cfg.signupEvent || 'inscription';
  const end = new Date(new Date(until + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10);
  const query = `SELECT properties.variant AS v, countIf(event = '${visitEvent}') AS visits, countIf(event = '${signupEvent}') AS signups
    FROM events
    WHERE event IN ('${visitEvent}', '${signupEvent}')
      AND timestamp >= toDateTime('${since} 00:00:00') AND timestamp < toDateTime('${end} 00:00:00')
      AND properties.variant IN ('A', 'B')
    GROUP BY v ORDER BY v`;
  const r = await fetch(`${host}/api/projects/${cfg.projectId}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PostHog ${r.status} : ${j.detail || 'requête refusée'}`);

  const variants = (j.results || []).map(([v, visits, signups]) => ({
    variant: v, visits: Number(visits) || 0, signups: Number(signups) || 0,
    rate: Number(visits) ? Number(signups) / Number(visits) : null,
  }));
  const A = variants.find(x => x.variant === 'A'), B = variants.find(x => x.variant === 'B');
  let test = null;
  if (A?.visits && B?.visits && A.rate != null && B.rate != null) {
    const p = (A.signups + B.signups) / (A.visits + B.visits);
    const se = Math.sqrt(p * (1 - p) * (1 / A.visits + 1 / B.visits));
    const z = se ? (B.rate - A.rate) / se : 0;
    const pValue = 2 * (1 - normCdf(Math.abs(z)));
    test = { uplift: A.rate ? B.rate / A.rate - 1 : null, pValue, significant: pValue < 0.05,
      leader: B.rate > A.rate ? 'B' : B.rate < A.rate ? 'A' : null };
  }
  return { variants, test };
}

// Inscrits par email à partir d'un relevé journalier (challenges passés).
const parisDate = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(d));
// Inscrits Meta AC par jour → CPL réel par jour sur la courbe.
export function applyMetaDaily(data, ch, byDay = ch.metaSignupsByDay) {
  if (!byDay || !data?.meta?.daily) return data;
  data.meta.daily = data.meta.daily.map(d => {
    const signups = byDay[d.date];
    return signups == null ? { ...d, signupsAC: null, cplReel: null }
      : { ...d, signupsAC: signups, cplReel: signups ? d.spend / signups : null };
  });
  return data;
}

export function applyEmailDaily(data, ch) {
  if (!Array.isArray(data?.emails)) return data;
  const excluded = ch.excludeEmails || [];
  if (excluded.length) data.emails = data.emails.filter(e => !excluded.includes(e.number));
  const byDay = ch.emailSignupsByDay;
  if (!byDay) return data;
  const seen = new Set();
  data.emails = data.emails.map(e => {
    if (e.signups != null && !e.fromDaily) return e;
    const day = parisDate(e.sentAt);
    if (seen.has(day) || byDay[day] == null) return { ...e, signups: null, fromDaily: false, sameDay: seen.has(day) };
    seen.add(day);
    return { ...e, signups: byDay[day], fromDaily: true };
  });
  return data;
}

// Challenge en cours : inscrits par jour = écarts entre photos de minuit (+ aujourd'hui en direct).
async function liveByDay(ch, nowTotals, today) {
  const { listDaily } = await import('./store.js');
  const shots = await listDaily(ch.id).catch(() => []);
  const out = {};
  for (const key of Object.keys(nowTotals)) {
    const byDay = {};
    let prev = 0;
    for (const s of shots) {
      const v = s[key];
      if (v == null) continue;
      if (s.date < ch.startDate) { prev = v; continue; }
      byDay[s.date] = Math.max(v - prev, 0); prev = v;
    }
    if (nowTotals[key] != null && byDay[today] == null) byDay[today] = Math.max(nowTotals[key] - prev, 0);
    out[key] = byDay;
  }
  return out;
}

// Inscrits totaux par jour + cumul (graphique « Inscrits par jour »).
export function applySignupsDaily(data, ch, byDay = ch.totalSignupsByDay, today = null) {
  if (!byDay || !data) return data;
  let cumul = 0;
  data.signupsDaily = Object.keys(byDay).sort().map(date => {
    cumul += byDay[date];
    return { date, daily: byDay[date], total: cumul, today: date === today };
  });
  return data;
}

const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

export async function compute(ch) {
  const today = parisToday();
  const until = ch.endDate && ch.endDate < today ? ch.endDate : today;
  const errors = [];
  const warnings = [];

  // Acquisition pas encore démarrée : rien à interroger.
  if (until < ch.startDate) {
    return {
      generatedAt: new Date().toISOString(), notStarted: true,
      challenge: { id: ch.id, name: ch.name, startDate: ch.startDate, until, status: ch.status, targets: ch.targets || null },
      signups: null, meta: null, emails: [], abtest: ch.posthog?.projectId ? null : undefined, errors, warnings,
    };
  }

  const [signups, meta] = await Promise.all([
    getSignups(ch, warnings).catch(e => (errors.push(e.message), null)),
    getMeta(ch.startDate, until, warnings).catch(e => (errors.push(e.message), null)),
  ]);
  const emailChannel = signups?.channels.find(c => c.key === 'EMAIL');
  const emails = await getEmails(ch, emailChannel?.sources || [], warnings)
    .catch(e => (errors.push(e.message), null));

  const abtest = ch.posthog?.projectId
    ? await getAbTest(ch.posthog, ch.startDate, until).catch(e => (warnings.push(e.message), null))
    : undefined;

  const metaSignups = signups?.channels.find(c => c.key === 'META')?.total ?? null;
  if (meta) {
    meta.signupsAC = metaSignups;
    meta.cplReel = meta.spend && metaSignups ? meta.spend / metaSignups : null;
  }
  let data = {
    generatedAt: new Date().toISOString(),
    challenge: { id: ch.id, name: ch.name, startDate: ch.startDate, until, status: ch.status, targets: ch.targets || null },
    signups, meta, emails, abtest, errors, warnings,
  };
  data = applyEmailDaily(data, ch);
  if (ch.status === 'live' && signups) {
    const live = await liveByDay(ch, { total: signups.total, meta: metaSignups }, today);
    if (!ch.metaSignupsByDay && meta) data = applyMetaDaily(data, ch, live.meta);
    if (!ch.totalSignupsByDay) data = applySignupsDaily(data, ch, live.total, today);
  }
  if (ch.metaSignupsByDay) data = applyMetaDaily(data, ch);
  if (ch.totalSignupsByDay) data = applySignupsDaily(data, ch);
  return data;
}

export { parisToday };

export function summary(d) {
  return {
    total: d.signups?.total ?? null,
    spend: d.meta?.spend ?? null,
    cplReel: d.meta?.cplReel ?? null,
    cplMeta: d.meta?.cplMeta ?? null,
  };
}
