import { API, apiJson } from './api';

export type Purchase = { product: string; purchased_at: string };
export type LinkStatus = 'pending' | 'denied' | 'aucune';

export const getPurchases = () => apiJson<Purchase[]>(`${API}/purchases`);
export const getLinkStatus = () => apiJson<{ status: LinkStatus }>(`${API}/link-requests`).then((r) => r.status);
export const submitLinkRequest = (email: string) => apiJson<{ ok: true }>(`${API}/link-requests`, { method: 'POST', body: JSON.stringify({ email }) });

/**
 * Le contenu (leçons, fichiers) reste livré par Podia : l'espace ne débloque rien, il y mène.
 * Nom canonique (`worker/src/lib/products.ts`) → slug Podia. `/p/products/<slug>` est la vue
 * membre commune aux formations et aux téléchargements ; Podia demande la connexion si besoin.
 */
const PODIA = 'https://pay.femzlab.shop';
const SLUG: Record<string, string> = {
  MotionLAB: 'motionlab',
  MetaVision: 'metavision',
  'Fade Pack': 'fade-pack',
  'Ghost FX': 'ghost-fx-preset-after-effects',
  'Whoosh Sound Pack': 'sfx-whoosh-pack',
  'Ultimate iOS Pack': 'ultimate-ios-pack',
  'Vortex Sound Pack': 'vortex-pack',
  'Presets Pack': 'presets-pack',
  '3D Text Pack': '3d-text-pack',
  '3D Text Pack Pro': '3d-text-pack-pro',
};
/** Lien d'accès au contenu acheté ; produit inconnu → page de connexion Podia (jamais un lien mort). */
export const accessUrl = (product: string) => (SLUG[product] ? `${PODIA}/p/products/${SLUG[product]}` : `${PODIA}/login`);
export const PODIA_RESET = `${PODIA}/forgot-password`;
