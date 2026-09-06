/**
 * Détection de session + petit client HTTP.
 * Mode API si /api/me répond 200 en JSON (cookie de session posé par
 * /auth/magic/:token ou /auth/dev-login) ; sinon les stores restent en
 * localStorage — la démo sans backend continue de marcher à l'identique.
 */

export type Me = {
  id: number;
  email: string;
  name: string | null;
  display_name: string | null;
  tier: string;
  formations: string[];
  visible: boolean;
  dms_open: boolean;
  consented_at: string | null;
};

let me: Me | null = null;

/** À appeler une fois au boot (main.tsx), avant le premier rendu. */
export async function initSession(): Promise<Me | null> {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    const isJson = (r.headers.get('content-type') || '').includes('application/json');
    me = r.ok && isJson ? ((await r.json()) as Me) : null;
  } catch {
    me = null; /* pas de backend : mode démo localStorage */
  }
  return me;
}

export function hasSession(): boolean {
  return me !== null;
}

export function getMe(): Me | null {
  return me;
}

/** Le membre a-t-il accès au contenu NéoVision ? (ex "neovision:createur") */
export function hasNeovision(): boolean {
  return !!me?.formations?.some((f) => typeof f === 'string' && f.startsWith('neovision'));
}

/** La modale de consentement doit-elle s'afficher ? (session sans choix posé) */
export function needsConsent(): boolean {
  return me !== null && !me.consented_at;
}

/** Réplique localement le consentement enregistré (PUT /api/consent). */
export function applyConsentLocal(visible: boolean, dmsOpen: boolean): void {
  if (me) me = { ...me, visible, dms_open: dmsOpen, consented_at: new Date().toISOString() };
}

/** Enregistre le choix de confidentialité (modale de consentement + toggles du profil). */
export async function saveConsent(visible: boolean, dmsOpen: boolean): Promise<void> {
  if (me) {
    await apiJson('/api/consent', {
      method: 'PUT',
      body: JSON.stringify({ visible, dms_open: dmsOpen }),
    });
  }
  applyConsentLocal(visible, dmsOpen);
}

/** fetch JSON même-origine ; jette sur toute réponse non-2xx. */
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!r.ok) throw new Error(`${init?.method || 'GET'} ${url} → ${r.status}`);
  return (await r.json()) as T;
}
