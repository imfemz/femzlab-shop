/**
 * Store du profil membre.
 * Aucun repli local : hydraté par initProfileFromApi() avant le premier
 * rendu (GET /espace/api/profile) ; save() réplique en PUT /espace/api/profile
 * (la ville y est géocodée serveur, qui renvoie le profil à jour).
 * Le panneau « Mon espace » écrit, le Globe s'abonne pour synchroniser
 * la carte Femz (ville géocodée → le point bouge, avatar, réseaux, reels).
 */
import { API, apiJson } from './api';

export type ProfileReel = { url: string; thumb: string | null };
export type ProfileData = {
  display_name: string;
  city: string;
  av: string | null;
  socials: { ig: string; tt: string; yt: string };
  reels: ProfileReel[];
};

type ApiProfile = {
  display_name: string | null;
  city: string;
  lat: number | null;
  lon: number | null;
  avatar: string | null;
  socials: { ig?: string; tt?: string; yt?: string };
  reels: ProfileReel[];
};

let cache: ProfileData | null = null;

const subs = new Set<(d: ProfileData) => void>();

const fromApi = (p: ApiProfile): ProfileData => ({
  display_name: p.display_name || '',
  city: p.city || '',
  av: p.avatar,
  socials: { ig: p.socials?.ig || '', tt: p.socials?.tt || '', yt: p.socials?.yt || '' },
  reels: p.reels || [],
});

/** Hydrate le store depuis GET /espace/api/profile. */
export async function initProfileFromApi(): Promise<void> {
  cache = fromApi(await apiJson<ApiProfile>(`${API}/profile`));
}

export const profileStore = {
  load(): ProfileData | null {
    return cache;
  },
  /** Enregistre côté serveur ; résout avec le profil renvoyé (ville géocodée). Lève si le serveur refuse. */
  async save(d: Pick<ProfileData, 'display_name' | 'city' | 'socials' | 'reels'>): Promise<ProfileData> {
    const p = await apiJson<ApiProfile>(`${API}/profile`, {
      method: 'PUT',
      body: JSON.stringify({
        display_name: d.display_name,
        city: d.city,
        socials: d.socials,
        reels: d.reels.map((r) => ({ url: r.url })),
      }),
    });
    cache = fromApi(p);
    subs.forEach((f) => f(cache!));
    return cache;
  },
  setAvatar(url: string | null) {
    if (cache) {
      cache = { ...cache, av: url };
      subs.forEach((f) => f(cache!));
    }
  },
  setReelThumb(i: number, url: string) {
    if (cache) {
      const reels = [...cache.reels];
      while (reels.length <= i) reels.push({ url: '', thumb: null });
      reels[i] = { ...reels[i], thumb: url };
      cache = { ...cache, reels };
      subs.forEach((f) => f(cache!));
    }
  },
  subscribe(f: (d: ProfileData) => void): () => void {
    subs.add(f);
    return () => subs.delete(f);
  },
};
