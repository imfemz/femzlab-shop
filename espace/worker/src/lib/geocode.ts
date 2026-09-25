// Géocodage déclaratif d'un lieu écrit à la main → [lat, lon].
// Trois tables embarquées (bundlées dans le Worker via l'import JSON) :
//   cities.json        ~3000 villes, clés anglophones
//   countries.json     243 pays ISO-3166 → centre
//   country-names.json 461 noms de pays (FR + EN + alias) → code ISO
// Les deux tables pays sont produites par scripts/gen-countries.mjs.
import CITIES from '../data/cities.json';
import COUNTRIES from '../data/countries.json';
import COUNTRY_NAMES from '../data/country-names.json';

const DB = CITIES as Record<string, [number, number]>;
const PAYS = COUNTRIES as Record<string, [number, number]>;
const NOMS_PAYS = COUNTRY_NAMES as Record<string, string>;

/** minuscules, sans accents ni ponctuation — doit rester alignée sur gen-countries.mjs */
function norm(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La base de villes est anglophone : un public francophone tape « Bruxelles »,
 * pas « brussels », et n'était donc pas géocodé du tout. Exonymes courants →
 * clé réelle de la base. À compléter au fil des villes qui reviennent.
 */
const ALIAS: Record<string, string> = {
  bruxelles: 'brussels', londres: 'london', geneve: 'geneva', anvers: 'antwerp',
  gand: 'gent', bruges: 'brugge', cologne: 'koln', lisbonne: 'lisbon', seville: 'sevilla', saragosse: 'zaragoza',
  barcelone: 'barcelona', varsovie: 'warsaw', moscou: 'moscow',
  copenhague: 'copenhagen', athenes: 'athens', 'la haye': 'the hague',
  pekin: 'beijing', 'le caire': 'cairo', alger: 'algiers', tanger: 'tangier',
  beyrouth: 'beirut', singapour: 'singapore', 'new york': 'new york city',
  'la nouvelle orleans': 'new orleans', edimbourg: 'edinburgh',
  vienne: 'vienna', bale: 'basel', berne: 'bern',
};

const ville = (n: string) => DB[n] || DB[ALIAS[n]] || null;

/**
 * Centres réglés à la main d'origine : ils priment sur la table générée, dont
 * certains centres géométriques tombent mal (Canada à 60°N, en plein Arctique).
 * Tout pays absent d'ici prend le centre de countries.json.
 */
const AJUSTES: Record<string, [number, number]> = {
  FR: [46.6, 2.4], BE: [50.6, 4.7], CH: [46.8, 8.2], DE: [51.1, 10.4], LU: [49.8, 6.1], MC: [43.74, 7.42],
  ES: [40.3, -3.7], PT: [39.6, -8.0], IT: [42.8, 12.5], GB: [52.6, -1.5], US: [39.8, -98.6], CA: [50.0, -95.0],
  MA: [31.8, -7.1], DZ: [35.7, 2.9], TN: [34.9, 9.6], SN: [14.5, -14.5], CI: [7.5, -5.5], CM: [5.7, 12.3],
  BR: [-14.2, -51.9], MX: [23.6, -102.5], AT: [47.6, 14.1], NL: [52.2, 5.3],
};

/** Centre d'un pays depuis son code ISO-2 (celui de Cloudflare, par exemple). */
export function countryCenter(code?: string | null): { lat: number; lon: number } | null {
  if (!code) return null;
  const k = code.toUpperCase();
  const c = AJUSTES[k] || PAYS[k];
  return c ? { lat: c[0], lon: c[1] } : null;
}

/** Code ISO-2 d'un pays écrit en toutes lettres, en français ou en anglais. */
export function countryCode(nom: string): string | null {
  return NOMS_PAYS[norm(nom)] || null;
}

/**
 * Géocode ce que le membre a écrit dans « Ville ». Dans l'ordre :
 *   1. la ville (« Bruxelles », « Casablanca ») ;
 *   2. « Ville, Pays » : la ville d'abord, puis le pays si elle est inconnue ;
 *   3. un pays écrit seul (« Belgique », « Japan »).
 * Renvoie null seulement si rien n'est reconnu — l'appelant se rabat alors sur
 * le pays de connexion.
 */
export function geocode(lieu: string): { lat: number; lon: number } | null {
  if (!lieu) return null;
  const parts = String(lieu).split(',').map((x) => norm(x)).filter(Boolean);
  if (!parts.length) return null;
  const v = ville(parts[0]);
  if (v) return { lat: v[0], lon: v[1] };
  /* la dernière partie est souvent le pays (« Trifouillis, Maroc ») */
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = countryCenter(NOMS_PAYS[parts[i]]);
    if (c) return c;
  }
  /* toute la chaîne comme nom de pays (« Côte d'Ivoire » contient une virgule ? non, mais « Congo, Rép. » oui) */
  return countryCenter(NOMS_PAYS[norm(lieu)]);
}
