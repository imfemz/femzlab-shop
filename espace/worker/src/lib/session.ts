import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { isDevLike, type Env, type User, type Vars } from '../env';

export const COOKIE = 'fz_session';
const SEVEN_DAYS = 7 * 24 * 3600;
type C = Context<{ Bindings: Env; Variables: Vars }>;

/**
 * Nom réel du cookie de session : `__Host-fz_session` hors dev/test.
 * Un navigateur refuse tout cookie `__Host-*` posé avec `Domain=`, depuis un
 * autre hôte que celui qui le sert, ou sans `Secure`/`Path=/` — ça bloque la
 * fixation de session par un sous-domaine same-site (ex. `pay.femzlab.shop`,
 * CNAME Podia) qui ne peut plus imiter un cookie `__Host-*` de `www.femzlab.shop`.
 * En dev/test on garde `fz_session` sans préfixe : ces environnements servent
 * parfois en http (localhost), où `Secure` (donc `__Host-`) serait refusé.
 */
export const cookieName = (env: Pick<Env, 'ENV'>) => (isDevLike(env) ? COOKIE : '__Host-fz_session');

export function signSession(userId: number, secret: string): Promise<string> {
  return sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS }, secret, 'HS256');
}
/**
 * Cookie *host-only* : jamais de `Domain=`. Avec `Domain=femzlab.shop`, le
 * cookie de session partait vers tous les sous-domaines — dont `pay.femzlab.shop`
 * (CNAME Podia) — et une page de ce sous-domaine pouvait en poser un (fixation).
 */
function cookieOpts(c: C) {
  return { httpOnly: true, sameSite: 'Lax' as const, secure: !isDevLike(c.env), path: '/' };
}
export async function setSession(c: C, userId: number) {
  setCookie(c, cookieName(c.env), await signSession(userId, c.env.JWT_SECRET), { ...cookieOpts(c), maxAge: SEVEN_DAYS });
}
export function clearSession(c: C) {
  deleteCookie(c, cookieName(c.env), cookieOpts(c));
}
export async function currentUser(c: C): Promise<User | null> {
  const token = getCookie(c, cookieName(c.env));
  if (!token) return null;
  try {
    const p: any = await verify(token, c.env.JWT_SECRET, 'HS256');
    const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').bind(p.sub).first<User>();
    return u && !u.revoked ? u : null;
  } catch { return null; }
}
export async function requireAuth(c: C, next: Next) {
  const u = await currentUser(c);
  if (!u) return c.json({ error: 'non authentifié' }, 401);
  c.set('user', u);
  await next();
}
export async function requireFounder(c: C, next: Next) {
  if (!c.get('user')?.founder) return c.json({ error: 'réservé au fondateur' }, 403);
  await next();
}
