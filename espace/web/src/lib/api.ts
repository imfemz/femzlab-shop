/** Session : trois états, jamais de repli local (spec §3). */
export type Me = {
  id: number;
  display_name: string | null;
  avatar: string | null;
  founder: boolean;
  visible: boolean;
  dms_open: boolean;
  consented_at: string | null;
  providers: string[];
};
export type SessionState = 'anon' | 'auth' | 'error';
export const API = '/espace/api';

let me: Me | null = null;
let state: SessionState = 'anon';

/** À appeler une fois au boot (main.tsx), avant le premier rendu. */
export async function initSession(): Promise<SessionState> {
  try {
    const r = await fetch(`${API}/me`, { credentials: 'same-origin' });
    if (r.status === 401) {
      state = 'anon';
      me = null;
    } else if (r.ok) {
      me = (await r.json()) as Me;
      state = 'auth';
    } else {
      state = 'error';
    }
  } catch {
    state = 'error';
  }
  return state;
}
export const sessionState = () => state;
export const hasSession = () => state === 'auth';
export const getMe = () => me;

/** La modale de consentement doit-elle s'afficher ? (session sans choix posé) */
export const needsConsent = () => me !== null && !me.consented_at;

/** Réplique localement le consentement enregistré (PUT /api/consent). */
export function applyConsentLocal(visible: boolean, dmsOpen: boolean) {
  if (me) me = { ...me, visible, dms_open: dmsOpen, consented_at: new Date().toISOString() };
}

/** Enregistre le choix de confidentialité (modale de consentement + toggles du profil). */
export async function saveConsent(visible: boolean, dmsOpen: boolean) {
  await apiJson(`${API}/consent`, { method: 'PUT', body: JSON.stringify({ visible, dms_open: dmsOpen }) });
  applyConsentLocal(visible, dmsOpen);
}

export function setMeAvatar(url: string | null) {
  if (me) me = { ...me, avatar: url };
}

export async function logout() {
  await fetch('/espace/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.assign('/espace/');
}

/**
 * fetch JSON même-origine ; jette sur toute réponse non-2xx avec le message
 * français du Worker (`{ error: '…' }`) quand il y en a un — sinon le repli
 * générique `MÉTHODE url → code`.
 */
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `${init?.method || 'GET'} ${url} → ${r.status}`);
  }
  return (await r.json()) as T;
}
