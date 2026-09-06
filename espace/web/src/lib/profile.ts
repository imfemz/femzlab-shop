/**
 * Store du profil élève.
 * Mode API (session active) : hydraté par initProfileFromApi() avant le premier
 * rendu ; save() réplique en PUT /api/profile (la ville y est géocodée serveur).
 * Mode démo (sans backend) : localStorage, comme la maquette.
 * Le panneau « Mon espace » écrit, le Globe s'abonne pour synchroniser
 * la carte Femz (ville géocodée → le point bouge, avatar, réseaux, reels).
 */
import { apiJson } from './api';

export type ProfileReel = { url: string; thumb: string };
export type ProfileData = {
  city: string;
  av: string | null;
  socials: { ig: string; tt: string; yt: string };
  reels: ProfileReel[];
};

const KEY = 'nv_profile';

let remote = false;
let cache: ProfileData | null = null;

const subs = new Set<(d: ProfileData) => void>();

type ApiProfile = {
  display_name: string | null;
  city: string;
  lat: number | null;
  lon: number | null;
  avatar: string | null;
  socials: { ig?: string; tt?: string; yt?: string };
  reels: ProfileReel[];
};

/** Hydrate le store depuis GET /api/profile. */
export async function initProfileFromApi(): Promise<void> {
  const p = await apiJson<ApiProfile>('/api/profile');
  cache = {
    city: p.city || '',
    av: p.avatar,
    socials: { ig: p.socials?.ig || '', tt: p.socials?.tt || '', yt: p.socials?.yt || '' },
    reels: p.reels || [],
  };
  remote = true;
}

export const profileStore = {
  load(): ProfileData | null {
    if (remote) return cache;
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  },
  save(d: ProfileData) {
    if (remote) {
      cache = d;
      apiJson('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ city: d.city, avatar: d.av, socials: d.socials, reels: d.reels }),
      }).catch((e) => console.warn('Profil non enregistré côté serveur :', e));
    } else {
      try {
        localStorage.setItem(KEY, JSON.stringify(d));
      } catch {
        /* stockage indisponible : la synchro fonctionne quand même */
      }
    }
    subs.forEach((f) => f(d));
  },
  subscribe(f: (d: ProfileData) => void): () => void {
    subs.add(f);
    return () => subs.delete(f);
  },
};
