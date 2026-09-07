/**
 * Correspondance produits, dupliquée depuis `avis-worker/src/index.js` (const
 * PRODUITS) faute de mécanisme de partage entre Workers déployés séparément.
 * Ajouter une entrée ici à chaque nouveau produit vendu sur Podia — et
 * l'équivalent côté avis-worker si on veut aussi collecter des avis dessus.
 */

// Slug de la page de remerciement (/<slug>/thanks) → nom canonique.
// Utilisé par le hook de checkout (POST /espace/hooks/checkout).
const BY_SLUG: Record<string, string> = {
  motionlab: 'MotionLAB',
  metavision: 'MetaVision',
  'fade-pack': 'Fade Pack',
  'ghost-fx-preset-after-effects': 'Ghost FX',
  'sfx-whoosh-pack': 'Whoosh Sound Pack',
  'ultimate-ios-pack': 'Ultimate iOS Pack',
  'vortex-pack': 'Vortex Sound Pack',
};

// Nom du produit tel qu'exporté par Podia (colonne "Product" du CSV des
// ventes) → nom canonique. Utilisé par l'import admin.
const BY_PODIA_NAME: Record<string, string> = {
  MotionLAB: 'MotionLAB',
  'METAVISION - Formation VFX': 'MetaVision',
  'META VISION - Comment vivre de sa passion ?': 'MetaVision',
  'Ultimate iOS Pack': 'Ultimate iOS Pack',
  'Ghost FX': 'Ghost FX',
  'Presets Pack': 'Presets Pack',
  'VFX Presets Pack': 'Presets Pack',
  'Vortex Sound Pack': 'Vortex Sound Pack',
  'Whoosh Sound Pack': 'Whoosh Sound Pack',
  'SFX Whoosh Pack': 'Whoosh Sound Pack',
  '3D Text Pack': '3D Text Pack',
  '3D Text Pack Pro': '3D Text Pack Pro',
  'Fade Pack': 'Fade Pack',
};

/** Déduit le produit depuis le chemin de la page de remerciement Podia. */
export function productFromSlug(pagePath: string): string | null {
  const slug = String(pagePath || '').toLowerCase().split('/').filter(Boolean)[0] || '';
  return BY_SLUG[slug] || null;
}

/** Déduit le produit canonique depuis le nom brut exporté par Podia. */
export function productFromPodiaName(name: string): string | null {
  return BY_PODIA_NAME[String(name || '').trim()] || null;
}

const CANONICAL = new Set([...Object.values(BY_SLUG), ...Object.values(BY_PODIA_NAME)]);
/** Vrai si `name` est un nom de produit canonique connu (utilisé pour valider l'import admin). */
export function isCanonicalProduct(name: string): boolean {
  return CANONICAL.has(name);
}
