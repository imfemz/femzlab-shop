import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, Vars } from './env';
import { PROVIDERS, authorizeUrl, exchange, type Provider } from './lib/oauth';
import { findOrCreateFromIdentity, ConflitIdentite, profileOf, updateProfile, setConsent, creatorsList, stats, mediaUrl } from './lib/users';
import { currentUser, setSession, clearSession, requireAuth } from './lib/session';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const OAUTH_COOKIE = 'fz_oauth';

function redirectUri(c: any, p: Provider) { return `${c.env.APP_URL.replace(/\/$/, '')}/auth/${p}/callback`; }
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

app.get('/espace/auth/:provider', (c) => {
  const p = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(p)) return c.text('fournisseur inconnu', 404);
  const state = hex(crypto.getRandomValues(new Uint8Array(16)));
  setCookie(c, OAUTH_COOKIE, state, { httpOnly: true, sameSite: 'Lax', secure: c.env.ENV === 'production', path: '/espace/auth', maxAge: 600 });
  return c.redirect(authorizeUrl(p, c.env, redirectUri(c, p), state), 302);
});

app.get('/espace/auth/:provider/callback', async (c) => {
  const p = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(p)) return c.text('fournisseur inconnu', 404);
  const state = c.req.query('state') || '', code = c.req.query('code') || '';
  const expected = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: '/espace/auth' });
  if (!code || !state || !expected || state !== expected) return c.text('état OAuth invalide', 400);
  let profile;
  try { profile = await exchange(p, c.env, redirectUri(c, p), code); }
  catch (e) { console.error('oauth', p, e); return c.redirect('/espace/?erreur=oauth', 302); }
  if (!profile.email || !profile.emailVerified) return c.redirect('/espace/?erreur=email_non_verifie', 302);
  const me = await currentUser(c);
  let user;
  try { ({ user } = await findOrCreateFromIdentity(c.env, profile, me?.id)); }
  catch (e) {
    if (e instanceof ConflitIdentite) return c.redirect(`/espace/?erreur=${e.code}`, 302);
    throw e;
  }
  await setSession(c, user.id);
  return c.redirect('/espace/', 302);
});

app.post('/espace/auth/logout', (c) => { clearSession(c); return c.json({ ok: true }); });

// Connexion de dev sans OAuth (Playwright local). Jamais en production.
app.get('/espace/auth/dev-login', async (c) => {
  if (c.env.ENV === 'production') return c.text('indisponible', 404);
  const email = String(c.req.query('email') || '').trim().toLowerCase();
  if (!email) return c.text('email requis', 400);
  const { user } = await findOrCreateFromIdentity(c.env, { provider: 'google', providerId: 'dev:' + email, email, emailVerified: true, name: email.split('@')[0], avatarUrl: null });
  await setSession(c, user.id);
  return c.redirect('/espace/', 302);
});

app.get('/espace/api/stats', async (c) => c.json(await stats(c.env)));

app.get('/espace/api/me', requireAuth, async (c) => {
  const u = c.get('user');
  const { results } = await c.env.DB.prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider').bind(u.id).all<{ provider: string }>();
  return c.json({
    id: u.id, display_name: u.display_name, avatar: mediaUrl(u.avatar_key), founder: !!u.founder,
    visible: !!u.visible, dms_open: !!u.dms_open, consented_at: u.consented_at, providers: results.map((r) => r.provider),
  });
});
app.get('/espace/api/profile', requireAuth, async (c) => c.json(await profileOf(c.env, c.get('user').id)));
app.put('/espace/api/profile', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = await updateProfile(c.env, c.get('user').id, body);
  if (r.error) return c.json(r, 400);
  return c.json(await profileOf(c.env, c.get('user').id));
});
app.put('/espace/api/consent', requireAuth, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  await setConsent(c.env, c.get('user').id, !!b.visible, !!b.dms_open);
  return c.json({ ok: true, visible: !!b.visible, dms_open: !!b.dms_open });
});
app.get('/espace/api/creators', requireAuth, async (c) => c.json(await creatorsList(c.env)));

export default app;
