import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { isDevLike, type Env, type Vars } from './env';
import { PROVIDERS, authorizeUrl, exchange, type Provider } from './lib/oauth';
import { findOrCreateFromIdentity, ConflitIdentite, profileOf, updateProfile, setConsent, creatorsList, stats, mediaUrl, parseJson } from './lib/users';
import { currentUser, setSession, clearSession, requireAuth } from './lib/session';
import { readImage, storeUserImage, deleteKey } from './lib/media';
import { peer, listConvs, thread, sendDm, markRead, block, unblock } from './lib/dms';
import { backupToR2 } from './lib/backup';
import { langFrom } from './lib/welcome';
import { recordPurchase, attachPurchases, purchasesFor } from './lib/purchases';
import { createLinkRequest, decideLinkRequest, escapeHtml } from './lib/link-requests';
import { productFromSlug } from './lib/products';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// Apex → www (un seul origin pour les cookies et l'OAuth) ; /espace → /espace/.
// En local (localhost/127.0.0.1) on garde le protocole d'origine (http), sinon on force https.
app.use('/espace*', async (c, next) => {
  const u = new URL(c.req.url);
  const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.hostname === 'femzlab.shop') {
    u.hostname = 'www.femzlab.shop';
    u.protocol = isLocal ? u.protocol : 'https:';
    return c.redirect(u.toString(), 301);
  }
  if (u.pathname === '/espace') {
    u.pathname = '/espace/';
    u.protocol = isLocal ? u.protocol : 'https:';
    return c.redirect(u.toString(), 301);
  }
  await next();
});

// En-têtes de sécurité. Pas de CSP dans cette vague : elle demande une
// vérification navigateur (globe canvas, vidéos, polices) faite à part — d'où
// l'absence volontaire de `contentSecurityPolicy` ici (secureHeaders n'en pose
// aucune par défaut ; la clé n'accepte pas `false` dans le typage Hono).
// Enregistré avant csrf : un 403 CSRF (ou toute erreur) doit porter ces
// en-têtes, pas en sortir nu (secureHeaders/no-store enveloppent tout ce qui
// est enregistré après eux, y compris les réponses courtes de csrf).
app.use('/espace/*', secureHeaders({ xFrameOptions: 'DENY', referrerPolicy: 'strict-origin-when-cross-origin' }));

// Aucune réponse d'API ne doit être mise en cache (profil, DM, liste des membres).
app.use('/espace/api/*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });

// Origines de confiance pour les requêtes mutantes. En production, seul le
// front lui-même ; les ports de dev local ne sont de confiance qu'en dev/test
// (sinon un déploiement prod ferait encore confiance à localhost:8788/5173).
const ORIGINS = (env: Env) =>
  isDevLike(env) ? ['https://www.femzlab.shop', 'http://localhost:8788', 'http://localhost:5173'] : ['https://www.femzlab.shop'];

// CSRF : SameSite=Lax bloque les tiers, pas un sous-domaine same-site
// (pay.femzlab.shop est un CNAME Podia). Un <form enctype="text/plain"> y
// produit du JSON valide que c.req.json() accepte sans vérifier le
// content-type. Le middleware ne vise que les méthodes non sûres avec un
// content-type de formulaire (urlencoded, multipart, text/plain) : les appels
// JSON et les uploads image/* du front ne sont pas concernés.
app.use('/espace/api/*', csrf({ origin: (origin, c) => ORIGINS(c.env).includes(origin) }));
app.use('/espace/auth/logout', csrf({ origin: (origin, c) => ORIGINS(c.env).includes(origin) }));

const OAUTH_COOKIE = 'fz_oauth';
/**
 * Nom réel du cookie d'état OAuth : `__Host-fz_oauth` hors dev/test — même
 * raisonnement que le cookie de session (cf. lib/session.ts::cookieName).
 */
const oauthCookieName = (env: Env) => (isDevLike(env) ? OAUTH_COOKIE : '__Host-fz_oauth');

function redirectUri(c: any, p: Provider) { return `${c.env.APP_URL.replace(/\/$/, '')}/auth/${p}/callback`; }
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

// Connexion de dev sans OAuth (Playwright local). Jamais en production.
// Déclarée avant /espace/auth/:provider : sinon ce dernier capture "dev-login"
// comme valeur de :provider et répond 404 avant même d'atteindre cette route.
app.get('/espace/auth/dev-login', async (c) => {
  if (!isDevLike(c.env)) return c.text('indisponible', 404);
  const email = String(c.req.query('email') || '').trim().toLowerCase();
  if (!email) return c.text('email requis', 400);
  const { user } = await findOrCreateFromIdentity(c.env, { provider: 'google', providerId: 'dev:' + email, email, emailVerified: true, name: email.split('@')[0], avatarUrl: null }, undefined, langFrom(c.req.header('accept-language')));
  await setSession(c, user.id);
  return c.redirect('/espace/', 302);
});

app.get('/espace/auth/:provider', (c) => {
  const p = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(p)) return c.text('fournisseur inconnu', 404);
  const state = hex(crypto.getRandomValues(new Uint8Array(16)));
  setCookie(c, oauthCookieName(c.env), state, { httpOnly: true, sameSite: 'Lax', secure: !isDevLike(c.env), path: '/', maxAge: 600 });
  return c.redirect(authorizeUrl(p, c.env, redirectUri(c, p), state), 302);
});

app.get('/espace/auth/:provider/callback', async (c) => {
  const p = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(p)) return c.text('fournisseur inconnu', 404);
  const state = c.req.query('state') || '', code = c.req.query('code') || '';
  const expected = getCookie(c, oauthCookieName(c.env));
  // Mêmes attributs qu'à la pose : un cookie __Host-* sans `secure` fait
  // lever `_serialize` ("__Host- Cookie must have Secure attributes") avant
  // même la vérification du state — 500 sur chaque callback OAuth en prod.
  deleteCookie(c, oauthCookieName(c.env), { path: '/', secure: !isDevLike(c.env), httpOnly: true, sameSite: 'Lax' });
  if (!code || !state || !expected || state !== expected) return c.text('état OAuth invalide', 400);
  let profile;
  try { profile = await exchange(p, c.env, redirectUri(c, p), code); }
  catch (e) { console.error('oauth', p, e); return c.redirect('/espace/?erreur=oauth', 302); }
  if (!profile.email || !profile.emailVerified) return c.redirect('/espace/?erreur=email_non_verifie', 302);
  const me = await currentUser(c);
  let user;
  try { ({ user } = await findOrCreateFromIdentity(c.env, profile, me?.id, langFrom(c.req.header('accept-language')))); }
  catch (e) {
    if (e instanceof ConflitIdentite) return c.redirect(`/espace/?erreur=${e.code}`, 302);
    throw e;
  }
  await attachPurchases(c.env, user.id).catch((e) => console.warn('attachPurchases (login) ignoré', (e as Error).message));
  await setSession(c, user.id);
  return c.redirect('/espace/', 302);
});

app.post('/espace/auth/logout', (c) => { clearSession(c); return c.json({ ok: true }); });

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
  // Un corps invalide ne doit jamais valoir « consentement enregistré à tout
  // refusé » : sans les deux booléens, rien n'est écrit (consented_at reste nul).
  if (typeof b.visible !== 'boolean' || typeof b.dms_open !== 'boolean') return c.json({ error: 'visible et dms_open (booléens) requis' }, 400);
  await setConsent(c.env, c.get('user').id, b.visible, b.dms_open);
  return c.json({ ok: true, visible: b.visible, dms_open: b.dms_open });
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
  // Le bucket MEDIA accueillera d'autres préfixes (ex. backups/ en tâche 7) qui ne doivent
  // jamais être servables publiquement par cette route sans authentification.
  if (!/^(avatars|reels)\//.test(key)) return c.text('introuvable', 404);
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.text('introuvable', 404);
  // On lit entièrement le corps ici (plutôt que de streamer obj.body) : sous le pool
  // vitest-pool-workers, un flux R2 non consommé par l'appelant fait échouer le
  // stockage isolé en fin de fichier de test (cf. « Consume response bodies » dans
  // les known issues Cloudflare). Le tamponnage vide le flux côté Worker dans tous les cas.
  const bytes = await obj.arrayBuffer();
  return new Response(bytes, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', etag: obj.httpEtag } });
});

async function withPeer(c: any) {
  const p = await peer(c.env, Number(c.req.param('peer')));
  return p ? { p } : { err: c.json({ error: 'membre introuvable' }, 404) };
}
app.get('/espace/api/dms', requireAuth, async (c) => c.json(await listConvs(c.env, c.get('user').id)));
app.get('/espace/api/dms/:peer', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; return c.json(await thread(c.env, c.get('user').id, p)); });
app.post('/espace/api/dms/:peer', requireAuth, async (c) => {
  const { p, err } = await withPeer(c); if (err) return err;
  const body: any = await c.req.json().catch(() => ({}));
  const r = await sendDm(c.env, c.get('user').id, p, body.text);
  if ('error' in r) return c.json({ error: r.error }, r.status);
  return c.json({ ok: true, msg: r.msg });
});
app.post('/espace/api/dms/:peer/read', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; return c.json({ ok: true, read: await markRead(c.env, c.get('user').id, p.id) }); });
app.post('/espace/api/blocks/:peer', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; await block(c.env, c.get('user').id, p.id); return c.json({ ok: true }); });
app.delete('/espace/api/blocks/:peer', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; await unblock(c.env, c.get('user').id, p.id); return c.json({ ok: true }); });

app.get('/espace/api/purchases', requireAuth, async (c) => c.json(await purchasesFor(c.env, c.get('user').id)));

app.post('/espace/api/link-requests', requireAuth, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  const r = await createLinkRequest(c.env, c.get('user').id, String(b.email || ''));
  if ('error' in r) {
    const status = r.error === 'email_invalide' ? 400 : r.error === 'demande_en_attente' ? 409 : 409;
    return c.json({ error: r.error }, status);
  }
  return c.json({ ok: true });
});

app.get('/espace/api/link-requests', requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT id FROM link_requests WHERE user_id = ? AND status = 'pending'").bind(c.get('user').id).first();
  return c.json({ status: row ? 'pending' : 'aucune' });
});

app.post('/espace/hooks/checkout', async (c) => {
  try {
    const raw = await c.req.text();
    if (raw.length > 8000) return c.json({ ok: true });
    const body = JSON.parse(raw || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const product = productFromSlug(String(body.page || ''));
    if (!email || !product) return c.json({ ok: true });
    await recordPurchase(c.env, { email, product, source: 'checkout', purchasedAt: new Date().toISOString(), externalRef: body.podia_id ? String(body.podia_id) : undefined });
    const owner = await c.env.DB.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(email).first<{ user_id: number }>();
    if (owner) await attachPurchases(c.env, owner.user_id);
  } catch (e) {
    console.warn('hook checkout ignoré', (e as Error).message);
  }
  return c.json({ ok: true });
});

function pageDecision(titre: string, corps: string) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${titre}</title>
<body style="font:16px system-ui;background:#0B0C0F;color:#E7E9EE;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center;max-width:480px;padding:24px"><h1 style="font-size:20px">${titre}</h1><p>${corps}</p></div></body></html>`;
}

// Cliqués depuis le client mail de Femz (lien envoyé par createLinkRequest) :
// pas de session, l'autorisation vient de la possession du jeton. Placée hors
// /espace/api/* (le CSRF ne s'applique pas — jamais soumise par un formulaire).
// Un segment :decision hors {approve|deny} ne produit pas un vrai 404 Hono :
// il tombe dans le catch-all SPA `/espace/*` plus bas, qui répond 200 avec
// l'app React (cf. test/serve.test.ts) — la contrainte sert seulement à
// écarter la route ici, pas à garantir un statut d'erreur au client.
app.get('/espace/admin/link/:token/:decision{approve|deny}', async (c) => {
  const decision = c.req.param('decision') === 'approve' ? 'approved' : 'denied';
  const r = await decideLinkRequest(c.env, c.req.param('token'), decision);
  if ('error' in r) {
    const titres: Record<string, string> = { introuvable: 'Lien introuvable', deja_traite: 'Déjà traité', expire: 'Lien expiré' };
    const messages: Record<string, string> = { introuvable: 'Lien introuvable ou déjà utilisé.', deja_traite: 'Cette demande a déjà été traitée.', expire: 'Ce lien a expiré (30 jours).' };
    return c.html(pageDecision(titres[r.error] || 'Lien introuvable', messages[r.error] || 'Une erreur est survenue.'));
  }
  const email = escapeHtml(r.email);
  return c.html(pageDecision(decision === 'approved' ? 'Liaison approuvée' : 'Demande refusée',
    decision === 'approved' ? `${email} est désormais rattachée au membre #${r.userId}, ses achats connus sont rattachés.` : `${email} n'a pas été rattachée.`));
});

app.all('/espace/api/*', (c) => c.json({ error: 'route inconnue' }, 404));

// L'app React : les fichiers sont à la racine de web/dist, l'URL publique sous /espace/.
app.all('/espace/*', async (c) => {
  const u = new URL(c.req.url);
  u.pathname = u.pathname.replace(/^\/espace/, '') || '/';
  const res = await c.env.ASSETS.fetch(new Request(u.toString(), c.req.raw));
  // Les en-têtes d'une réponse issue d'un fetch sont immuables : on la recopie
  // pour que secureHeaders puisse y poser X-Frame-Options & consorts.
  return new Response(res.body, res);
});

export { app };
export default {
  fetch: app.fetch,
  scheduled: async (_e: ScheduledEvent, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(backupToR2(env)); },
};
