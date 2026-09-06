import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { Env, User, Vars } from '../env';

export const COOKIE = 'fz_session';
const SEVEN_DAYS = 7 * 24 * 3600;
type C = Context<{ Bindings: Env; Variables: Vars }>;

export function signSession(userId: number, secret: string): Promise<string> {
  return sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS }, secret, 'HS256');
}
function cookieOpts(c: C) {
  const prod = c.env.ENV === 'production';
  return { httpOnly: true, sameSite: 'Lax' as const, secure: prod, path: '/', domain: prod ? c.env.COOKIE_DOMAIN : undefined };
}
export async function setSession(c: C, userId: number) {
  setCookie(c, COOKIE, await signSession(userId, c.env.JWT_SECRET), { ...cookieOpts(c), maxAge: SEVEN_DAYS });
}
export function clearSession(c: C) {
  deleteCookie(c, COOKIE, cookieOpts(c));
}
export async function currentUser(c: C): Promise<User | null> {
  const token = getCookie(c, COOKIE);
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
