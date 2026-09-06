/**
 * Les créateurs du globe.
 * Mode API (session active) : la liste vient de GET /api/creators —
 * initCreatorsFromApi() remplace le contenu du tableau AVANT le premier rendu.
 * Mode démo (sans backend) : tableau EXACT de la maquette v30 ci-dessous.
 * Prénom + initiale, jamais d'email. Ville déclarative.
 * Le tableau est un singleton mutable : le profil « Mon espace »
 * met à jour l'entrée Femz (index 0, toujours le fondateur) via le Globe.
 */
import { apiJson } from './api';

export type Creator = {
  n: string;
  h: string;
  city: string;
  lat: number;
  lon: number;
  stats: string;
  f: string[];
  founder?: boolean;
  socials?: { ig?: string; tt?: string; yt?: string };
  reels?: { url: string; thumb: string }[];
  av?: string;
  /** id du user côté backend (mode API) — sert d'identifiant de conversation DM */
  uid?: number;
  /** false = le membre a fermé ses DM (bouton « DM fermés ») ; absent = ouverts */
  dmsOpen?: boolean;
  /* champs runtime (projection écran) */
  front?: boolean;
  sx?: number;
  sy?: number;
};

/** Point anonymisé (membre non consentant) — position pays, rien d'autre. */
export type AnonPoint = {
  lat: number;
  lon: number;
  /* champs runtime (projection écran) */
  front?: boolean;
  sx?: number;
  sy?: number;
};

/** Les membres non consentants du globe (mode API). Vide en mode démo. */
export const ANON: AnonPoint[] = [];

export const CREATORS: Creator[] = [
  { n: 'Femz', h: '@imfemz', city: 'Paris, France', lat: 48.85, lon: 2.35, stats: 'Fondateur · FemzLab', f: ['NéoVision · Studio', 'MetaVision'], founder: true },
  { n: 'Contact', h: '', city: 'France', lat: 47.44, lon: -1.59, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Adamrec', h: '', city: 'France', lat: 45.25, lon: 0.07, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Whosleoh', h: '', city: 'France', lat: 48.02, lon: 3.88, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Liaans', h: '', city: 'France', lat: 48.95, lon: -1.07, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Hvmza', h: '', city: 'France', lat: 46.13, lon: -1.55, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Cameronmaussin', h: '', city: 'Belgique', lat: 50.21, lon: 4.61, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Hanoa P.', h: '', city: 'France', lat: 43.76, lon: -0.13, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Emeric G.', h: '', city: 'France', lat: 47.5, lon: 2.78, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Landsecfilms', h: '', city: 'France', lat: 44.92, lon: 3.15, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Exilie', h: '', city: 'France', lat: 48.46, lon: -1.75, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Christopher L.', h: '', city: 'France', lat: 48.43, lon: 4.06, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Razmo', h: '', city: 'France', lat: 45.64, lon: -0.49, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Michael R.', h: '', city: 'France', lat: 49.34, lon: 1.03, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Elian R.', h: '', city: 'France', lat: 44.16, lon: -0.99, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Hugo B.', h: '', city: 'France', lat: 48.68, lon: 3.27, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Belvisi A.', h: '', city: 'Belgique', lat: 51.03, lon: 5.05, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Sinan Z.', h: '', city: 'France', lat: 46.82, lon: 6.37, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Hassim M.', h: '', city: 'France', lat: 45.87, lon: 2.84, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Amine F.', h: '', city: 'France', lat: 48.58, lon: 3.4, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Mourad K.', h: '', city: 'France', lat: 48.77, lon: 3.05, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Paul S.', h: '', city: 'France', lat: 47.83, lon: -1.42, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Tommy L.', h: '', city: 'France', lat: 44.97, lon: 0.63, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Omar E.', h: '', city: 'France', lat: 44.08, lon: 0.16, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Kevin A.', h: '', city: 'France', lat: 44.21, lon: 0.53, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Pierre B.', h: '', city: 'Belgique', lat: 50.79, lon: 4.34, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Nassim B.', h: '', city: 'Suisse', lat: 46.69, lon: 7.35, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Theo A.', h: '', city: 'France', lat: 45.2, lon: 6.07, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Adrien L.', h: '', city: 'France', lat: 47.49, lon: 3.32, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Mickael L.', h: '', city: 'France', lat: 44.63, lon: 4.32, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Nicolas D.', h: '', city: 'France', lat: 44.58, lon: 1.39, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Anis D.', h: '', city: 'France', lat: 49.54, lon: 3.58, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Georges A.', h: '', city: 'France', lat: 46.94, lon: 3.95, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Khalifa M.', h: '', city: 'France', lat: 48.66, lon: 4.72, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Siliareski', h: '', city: 'France', lat: 44.97, lon: -1.53, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Mayline', h: '', city: 'France', lat: 45.49, lon: 0.45, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Rhkprod', h: '', city: 'France', lat: 44.87, lon: 6.12, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
  { n: 'Sam S.', h: '', city: 'Allemagne', lat: 52.51, lon: 9.16, stats: 'Client MetaVision', f: ['MetaVision'], socials: {} },
];

/* ── Mode API ── */

type ApiCreator = {
  id: number;
  display_name: string;
  city: string;
  lat?: number;
  lon?: number;
  formations: string[];
  socials?: { ig?: string; tt?: string; yt?: string };
  reels?: { url: string; thumb: string }[];
  founder: boolean;
  avatar?: string;
  dms_open?: boolean;
};

type ApiAnon = { anon: true; lat: number; lon: number };

/* Compteur du globe : total backend (nommés + anonymes) ; 49 en mode démo
   (le libellé historique de la maquette, inchangé sans session). */
let remoteTotal: number | null = null;
export function creatorsTotal(): number {
  return remoteTotal ?? 49;
}

/* mini-store : le Globe se re-rend quand la liste change (ex. après consentement) */
let version = 0;
const subs = new Set<() => void>();
export function creatorsVersion(): number {
  return version;
}
export function subscribeCreators(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

/** "metavision" → "MetaVision", "neovision:createur" → "NéoVision · Créateur". */
function badge(f: string): string {
  if (f === 'metavision') return 'MetaVision';
  const m = /^neovision:(.+)$/.exec(f);
  if (m) return 'NéoVision · ' + m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return f;
}

/**
 * Remplace le contenu de CREATORS (consentants nommés) et d'ANON (points pays
 * anonymisés) par la liste du backend (fondateur en premier, garanti par l'API).
 * Les membres nommés sans lat/lon ne sont pas plaçables → ignorés du globe
 * mais comptés dans le total. Mutation en place : la boucle de rendu du Globe
 * référence ces tableaux.
 */
export async function initCreatorsFromApi(): Promise<void> {
  const list = await apiJson<(ApiCreator | ApiAnon)[]>('/api/creators');
  const mapped: Creator[] = [];
  const anons: AnonPoint[] = [];
  for (const u of list) {
    if ('anon' in u) {
      anons.push({ lat: u.lat, lon: u.lon });
      continue;
    }
    if (u.lat == null || u.lon == null) continue;
    mapped.push({
      n: u.display_name,
      h: u.socials?.ig || '',
      city: u.city,
      lat: u.lat,
      lon: u.lon,
      stats: u.founder
        ? 'Fondateur · FemzLab'
        : u.formations.some((f) => f.startsWith('neovision'))
          ? 'Élève NéoVision'
          : 'Client MetaVision',
      f: u.formations.map(badge),
      founder: u.founder || undefined,
      socials: u.socials || {},
      reels: u.reels && u.reels.length ? u.reels : undefined,
      av: u.avatar,
      uid: u.id,
      dmsOpen: u.dms_open === undefined ? true : !!u.dms_open,
    });
  }
  CREATORS.length = 0;
  CREATORS.push(...mapped);
  ANON.length = 0;
  ANON.push(...anons);
  remoteTotal = list.length;
  version++;
  subs.forEach((f) => f());
}

/** Identifiant de conversation DM pour un créateur (mode API : l'id backend). */
export function chatId(c: Creator): string {
  if (c.uid != null) return String(c.uid);
  return c.founder ? 'femz' : 'c_' + (c.n + (c.h || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Initiales affichées dans les avatars. */
export function initials(c: Creator): string {
  return c.n.slice(0, 2).toUpperCase();
}
