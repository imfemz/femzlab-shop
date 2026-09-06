/**
 * Les créateurs du globe.
 * Aucun repli local : la liste vient de GET /espace/api/creators —
 * initCreatorsFromApi() remplace le contenu du tableau AVANT le premier rendu.
 * Prénom + initiale, jamais d'email. Ville déclarative.
 * Le tableau est un singleton mutable : le profil « Mon espace »
 * met à jour l'entrée Femz (index 0, toujours le fondateur) via le Globe.
 */
import { API, apiJson } from './api';

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

/** Les membres non consentants du globe (points pays anonymisés). */
export const ANON: AnonPoint[] = [];

/** Les créateurs consentants du globe. Hydraté par initCreatorsFromApi(). */
export const CREATORS: Creator[] = [];

/* ── Mode API ── */

type ApiCreator = {
  id: number;
  display_name: string;
  city: string;
  lat?: number;
  lon?: number;
  badges: string[];
  socials?: { ig?: string; tt?: string; yt?: string };
  reels?: { url: string; thumb: string }[];
  founder: boolean;
  avatar?: string;
  dms_open?: boolean;
};

type ApiAnon = { anon: true; lat: number; lon: number };

/* Compteur du globe : total backend (nommés + anonymes). */
let remoteTotal: number | null = null;
export function creatorsTotal(): number {
  return remoteTotal ?? 0;
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

/**
 * Remplace le contenu de CREATORS (consentants nommés) et d'ANON (points pays
 * anonymisés) par la liste du backend (fondateur en premier, garanti par l'API).
 * Les membres nommés sans lat/lon ne sont pas plaçables → ignorés du globe
 * mais comptés dans le total. Mutation en place : la boucle de rendu du Globe
 * référence ces tableaux.
 */
export async function initCreatorsFromApi(): Promise<void> {
  const list = await apiJson<(ApiCreator | ApiAnon)[]>(`${API}/creators`);
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
      stats: u.founder ? 'Fondateur · FemzLab' : u.badges.length ? u.badges.join(' · ') : 'Membre FemzLab',
      f: u.badges,
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
