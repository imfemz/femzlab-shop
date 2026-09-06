import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, Vars } from './env';
import { PROVIDERS, authorizeUrl, exchange, type Provider } from './lib/oauth';
import { findOrCreateFromIdentity, ConflitIdentite, profileOf, updateProfile, setConsent, creatorsList, stats, mediaUrl, parseJson } from './lib/users';
import { currentUser, setSession, clearSession, requireAuth } from './lib/session';
import { readImage, storeUserImage, deleteKey } from './lib/media';

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

app.post('/espace/api/media/avatar', requireAuth, async (c) => {
  const img = await readImage(c.req.raw);
  if ('status' in img) return c.json({ error: img.status === 413 ? 'image trop lourde (2 Mo max)' : 'format accepté : PNG, JPEG, WebP' }, img.status);
  const u = c.get('user');
  const key = await storeUserImage(c.env, u.id, 'avatars', img.bytes, img.kind);
  await c.env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, u.id).run();
  if (u.avatar_key && u.avatar_key !== key) await deleteKey(c.env, u.avatar_key);
  return c.json({ url: mediaUrl(key) });
});

app.post('/espace/api/media/reel/:n', requireAuth, async (c) => {
  const n = Number(c.req.param('n'));
  if (!Number.isInteger(n) || n < 0 || n > 2) return c.json({ error: 'index de reel 0 à 2' }, 400);
  const img = await readImage(c.req.raw);
  if ('status' in img) return c.json({ error: img.status === 413 ? 'image trop lourde (2 Mo max)' : 'format accepté : PNG, JPEG, WebP' }, img.status);
  const u = c.get('user');
  const reels: any[] = parseJson(u.reels, []);
  while (reels.length <= n) reels.push({ url: '', thumb_key: null });
  const key = await storeUserImage(c.env, u.id, 'reels', img.bytes, img.kind, n);
  const old = reels[n].thumb_key; reels[n].thumb_key = key;
  await c.env.DB.prepare('UPDATE users SET reels = ? WHERE id = ?').bind(JSON.stringify(reels), u.id).run();
  if (old && old !== key) await deleteKey(c.env, old);
  return c.json({ url: mediaUrl(key) });
});

app.get('/espace/media/*', async (c) => {
  const key = c.req.path.replace(/^\/espace\/media\//, '');
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.text('introuvable', 404);
  // On lit entièrement le corps ici (plutôt que de streamer obj.body) : sous le pool
  // vitest-pool-workers, un flux R2 non consommé par l'appelant fait échouer le
  // stockage isolé en fin de fichier de test (cf. « Consume response bodies » dans
  // les known issues Cloudflare). Le tamponnage vide le flux côté Worker dans tous les cas.
  const bytes = await obj.arrayBuffer();
  return new Response(bytes, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', etag: obj.httpEtag } });
});

export default app;
