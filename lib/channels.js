// Classement des tags AWeber "[ch] …" en canaux / sous-sources (identique pour toutes les éditions MRE).
// Les tags sont comparés en minuscules, espaces normalisés.
export const CHANNEL_LABELS = {
  META: 'Ads', AFFILIATION: 'Affiliation', EMAIL: 'Emails',
  PARTENAIRES: 'Partenaires génériques (WhatsApp)', ORGANIQUE: 'Organique', SETTING: 'Setting',
};
// Ordre d'affichage : tous ces canaux sont affichés, même à 0.
export const CHANNEL_ORDER = ['META', 'AFFILIATION', 'EMAIL', 'PARTENAIRES', 'ORGANIQUE', 'SETTING'];

// Tag global d'un canal.
export const CHANNEL_TAGS = {
  '[ch] meta': 'META',
  '[ch] organique': 'ORGANIQUE',
  '[ch] mail': 'EMAIL',
  '[ch] affiliation': 'AFFILIATION',
  '[ch] setting': 'SETTING',
  '[ch] partenaires generiques': 'PARTENAIRES',
};

// Sous-sources nommées.
export const SOURCE_TAGS = {
  '[ch] facebook-organique': ['ORGANIQUE', 'Facebook'],
  '[ch] instagram-organique': ['ORGANIQUE', 'Instagram'],
  '[ch] youtube-organique': ['ORGANIQUE', 'YouTube'],
  '[ch] mfe': ['AFFILIATION', 'Michaël Ferrari'],
  '[ch] nca': ['AFFILIATION', 'Nathalie Cariou'],
  '[ch] mri': ['AFFILIATION', 'Maxence Rigottier'],
  '[ch] immoscan': ['AFFILIATION', 'Immoscan'],
  '[ch] tda': ['AFFILIATION', 'Thomas Dardour'],
  '[ch] jyv': ['AFFILIATION', 'Jérôme Yvon'],
  '[ch] setting-facebook': ['SETTING', 'Facebook'],
  '[ch] setting-linkedin': ['SETTING', 'LinkedIn'],
  '[ch] setting-instagram': ['SETTING', 'Instagram'],
};

// Tags ignorés pour les canaux : tags communs à tous les inscrits (« … -inscrits »).
export const IGNORED_TAGS = ['[ch] mre-inscrits', '[ch] nicoya-inscrits'];
const IGNORED_RE = /-inscrits$/;

export const normTag = t => String(t).trim().toLowerCase().replace(/\s+/g, ' ');

// → { channel, source, key } | { ignored: true } | null (tag [ch] inconnu) | undefined (pas un tag [ch])
export function classify(tag) {
  const t = normTag(tag);
  if (!t.startsWith('[ch]')) return undefined;
  if (IGNORED_TAGS.includes(t) || IGNORED_RE.test(t)) return { ignored: true };
  if (CHANNEL_TAGS[t]) return { channel: CHANNEL_TAGS[t], source: null };
  if (SOURCE_TAGS[t]) { const [channel, source] = SOURCE_TAGS[t]; return { channel, source, key: source }; }
  let m = t.match(/^\[ch\] gen-?0*(\d+)$/);
  if (m) return { channel: 'PARTENAIRES', source: 'GEN' + m[1].padStart(2, '0'), key: 'gen' + m[1] };
  m = t.match(/^\[ch\] (?:e?mails?)[\s#-]*(\d+)$/);
  if (m) return { channel: 'EMAIL', source: 'Email #' + Number(m[1]), key: String(Number(m[1])) };
  return null;
}
