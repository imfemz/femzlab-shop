// test/oauth.test.ts
import { env, fetchMock } from 'cloudflare:test';
import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { cookieFor } from './helpers';

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => fetchMock.assertNoPendingInterceptors());

function mockGoogle(profile: object) {
  fetchMock.get('https://oauth2.googleapis.com').intercept({ path: '/token', method: 'POST' }).reply(200, { access_token: 'at', id_token: 'x' });
  fetchMock.get('https://openidconnect.googleapis.com').intercept({ path: '/v1/userinfo' }).reply(200, profile);
}
function mockDiscord(user: object) {
  fetchMock.get('https://discord.com').intercept({ path: '/api/oauth2/token', method: 'POST' }).reply(200, { access_token: 'at' });
  fetchMock.get('https://discord.com').intercept({ path: '/api/users/@me' }).reply(200, user);
}
async function callback(provider: string, state: string, cookie: string, headers: Record<string, string> = {}) {
  return app.request(`/espace/auth/${provider}/callback?code=abc&state=${state}`, { headers: { Cookie: cookie, ...headers } }, env);
}
const stateCookie = (s: string) => `fz_oauth=${s}`;

describe('OAuth', () => {
  it('redirige vers Google avec state et scopes', async () => {
    const r = await app.request('/espace/auth/google', {}, env);
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(loc.searchParams.get('scope')).toBe('openid email profile');
    expect(r.headers.get('set-cookie')).toContain('fz_oauth=');
  });
  it('en production le cookie d’état OAuth est préfixé __Host- avec Path=/', async () => {
    const prodEnv = { ...env, ENV: 'production' };
    const r = await app.request('/espace/auth/google', {}, prodEnv);
    const set = r.headers.get('set-cookie') || '';
    expect(set.startsWith('__Host-fz_oauth=')).toBe(true);
    expect(set).toContain('Path=/');
    expect(set).toContain('Secure');
  });
  it('refuse un state qui ne correspond pas', async () => {
    expect((await callback('google', 'bad', stateCookie('good'))).status).toBe(400);
  });
  it('crée le compte, pose la session, fondateur si email propriétaire', async () => {
    mockGoogle({ sub: 'g1', email: 'Fraps81@gmail.com', email_verified: true, name: 'Femz', picture: null });
    const r = await callback('google', 's1', stateCookie('s1'));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/espace/');
    expect(r.headers.get('set-cookie')).toContain('fz_session=');
    const u = await env.DB.prepare("SELECT * FROM users WHERE display_name = 'Femz'").first<any>();
    expect(u.founder).toBe(1);
    const e = await env.DB.prepare("SELECT * FROM user_emails WHERE email = 'fraps81@gmail.com'").first<any>();
    expect(e.user_id).toBe(u.id);
  });
  it('un nouveau membre reçoit le DM de bienvenue du fondateur', async () => {
    mockGoogle({ sub: 'g1', email: 'fraps81@gmail.com', email_verified: true, name: 'Femz', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    mockDiscord({ id: 'd7', username: 'leo', global_name: 'Léo', email: 'leo@example.com', verified: true, avatar: null });
    await callback('discord', 's2', stateCookie('s2'));
    const dm = await env.DB.prepare("SELECT d.text FROM dms d JOIN users u ON u.id = d.to_user WHERE u.display_name = 'Léo'").first<any>();
    expect(dm.text).toContain('FemzLab');
  });
  it('le DM de bienvenue suit Accept-Language, et vaut français par défaut', async () => {
    mockGoogle({ sub: 'g1', email: 'fraps81@gmail.com', email_verified: true, name: 'Femz', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    mockDiscord({ id: 'd7', username: 'leo', global_name: 'Léo', email: 'leo@example.com', verified: true, avatar: null });
    await callback('discord', 's2', stateCookie('s2'), { 'Accept-Language': 'fr-FR,fr;q=0.9' });
    const leo = await env.DB.prepare("SELECT id, lang FROM users WHERE display_name = 'Léo'").first<any>();
    expect(leo.lang).toBe('fr');
    const dm = await env.DB.prepare('SELECT text FROM dms WHERE to_user = ?').bind(leo.id).first<any>();
    expect(dm.text).toContain("Bienvenue dans l'espace FemzLab");

    mockGoogle({ sub: 'g5', email: 'sans@example.com', email_verified: true, name: 'Sans', picture: null });
    await callback('google', 's3', stateCookie('s3'));
    const sans = await env.DB.prepare("SELECT id, lang FROM users WHERE display_name = 'Sans'").first<any>();
    expect(sans.lang).toBe('fr');
    const dm2 = await env.DB.prepare('SELECT text FROM dms WHERE to_user = ?').bind(sans.id).first<any>();
    expect(dm2.text).toContain("Bienvenue dans l'espace FemzLab");
  });
  it('langFrom refuse une langue inconnue ou un en-tête abusif, français par défaut', async () => {
    mockGoogle({ sub: 'g1', email: 'fraps81@gmail.com', email_verified: true, name: 'Femz', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    mockDiscord({ id: 'd7', username: 'leo', global_name: 'Léo', email: 'leo@example.com', verified: true, avatar: null });
    await callback('discord', 's2', stateCookie('s2'), { 'Accept-Language': 'zz-ZZ' });
    const leo = await env.DB.prepare("SELECT lang FROM users WHERE display_name = 'Léo'").first<any>();
    expect(leo.lang).toBe('fr');

    mockGoogle({ sub: 'g5', email: 'sans@example.com', email_verified: true, name: 'Sans', picture: null });
    await callback('google', 's3', stateCookie('s3'), { 'Accept-Language': 'a'.repeat(500) });
    const sans = await env.DB.prepare("SELECT lang FROM users WHERE display_name = 'Sans'").first<any>();
    expect(sans.lang).toBe('fr');
  });
  it('même email via un autre fournisseur → même compte ; email non vérifié → refus', async () => {
    mockGoogle({ sub: 'g2', email: 'anna@example.com', email_verified: true, name: 'Anna', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    mockDiscord({ id: 'd2', username: 'anna', global_name: 'Anna D', email: 'ANNA@example.com', verified: true, avatar: null });
    await callback('discord', 's2', stateCookie('s2'));
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE display_name LIKE 'Anna%'").first<any>();
    expect(n.n).toBe(1);
    const ids = await env.DB.prepare('SELECT COUNT(*) AS n FROM identities').first<any>();
    expect(ids.n).toBe(2);
    mockDiscord({ id: 'd3', username: 'x', global_name: 'X', email: 'x@example.com', verified: false, avatar: null });
    const r = await callback('discord', 's3', stateCookie('s3'));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/espace/?erreur=email_non_verifie');
  });
  it('mode attache : un membre connecté ajoute un 2e fournisseur', async () => {
    mockGoogle({ sub: 'g9', email: 'p@example.com', email_verified: true, name: 'P', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    const u = await env.DB.prepare("SELECT id FROM users WHERE display_name = 'P'").first<any>();
    mockDiscord({ id: 'd9', username: 'p', global_name: 'P', email: 'autre@example.com', verified: true, avatar: null });
    await callback('discord', 's2', `${stateCookie('s2')}; ${await cookieFor(u.id)}`);
    const ids = await env.DB.prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider').bind(u.id).all<any>();
    expect(ids.results.map((i) => i.provider)).toEqual(['discord', 'google']);
    const emails = await env.DB.prepare('SELECT email FROM user_emails WHERE user_id = ? ORDER BY email').bind(u.id).all<any>();
    expect(emails.results.map((e) => e.email)).toEqual(['autre@example.com', 'p@example.com']);
  });
  it('logout efface le cookie ; dev-login interdit en production', async () => {
    // sec-fetch-site : posé par le navigateur sur le fetch même-origine du front
    // (sans lui ni Origin de confiance, csrf refuse — cf. test/csrf.test.ts).
    const r = await app.request('/espace/auth/logout', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }, env);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    const prodEnv = { ...env, ENV: 'production' };
    expect((await app.request('/espace/auth/dev-login?email=a@b.co', {}, prodEnv)).status).toBe(404);
  });
  it('dev-login reste fermé si ENV est absent (liste blanche, pas liste noire)', async () => {
    const sansEnv = { ...env, ENV: undefined as unknown as string };
    expect((await app.request('/espace/auth/dev-login?email=a@b.co', {}, sansEnv)).status).toBe(404);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<any>();
    expect(n.n).toBe(0);
  });
  it('dev-login hors production connecte et pose la session', async () => {
    const r = await app.request('/espace/auth/dev-login?email=leo@example.com', {}, env);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/espace/');
    expect(r.headers.get('set-cookie')).toContain('fz_session=');
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<any>();
    expect(n.n).toBe(1);
  });
  it('attache refusée : identité déjà liée à un autre membre', async () => {
    mockDiscord({ id: 'd1', username: 'b', global_name: 'B', email: 'b@example.com', verified: true, avatar: null });
    await callback('discord', 's1', stateCookie('s1'));
    const b = await env.DB.prepare("SELECT id FROM users WHERE display_name = 'B'").first<any>();
    mockGoogle({ sub: 'ga', email: 'a@example.com', email_verified: true, name: 'A', picture: null });
    await callback('google', 's2', stateCookie('s2'));
    const a = await env.DB.prepare("SELECT id FROM users WHERE display_name = 'A'").first<any>();
    mockDiscord({ id: 'd1', username: 'b', global_name: 'B', email: 'b@example.com', verified: true, avatar: null });
    const r = await callback('discord', 's3', `${stateCookie('s3')}; ${await cookieFor(a.id)}`);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/espace/?erreur=identite_deja_liee');
    expect(r.headers.get('set-cookie') || '').not.toContain('fz_session=');
    const ids = await env.DB.prepare('SELECT COUNT(*) AS n FROM identities').first<any>();
    expect(ids.n).toBe(2);
    const owner = await env.DB.prepare("SELECT user_id FROM identities WHERE provider = 'discord' AND provider_id = 'd1'").first<any>();
    expect(owner.user_id).toBe(b.id);
  });
  it('attache refusée : email déjà rattaché à un tiers', async () => {
    mockGoogle({ sub: 'gc', email: 'c@example.com', email_verified: true, name: 'C', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    const c = await env.DB.prepare("SELECT id FROM users WHERE display_name = 'C'").first<any>();
    mockGoogle({ sub: 'ga2', email: 'a2@example.com', email_verified: true, name: 'A2', picture: null });
    await callback('google', 's2', stateCookie('s2'));
    const a = await env.DB.prepare("SELECT id FROM users WHERE display_name = 'A2'").first<any>();
    mockDiscord({ id: 'dz', username: 'z', global_name: 'Z', email: 'c@example.com', verified: true, avatar: null });
    const r = await callback('discord', 's3', `${stateCookie('s3')}; ${await cookieFor(a.id)}`);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/espace/?erreur=email_deja_utilise');
    expect(r.headers.get('set-cookie') || '').not.toContain('fz_session=');
    const idsForA = await env.DB.prepare('SELECT COUNT(*) AS n FROM identities WHERE user_id = ?').bind(a.id).first<any>();
    expect(idsForA.n).toBe(1);
    const email = await env.DB.prepare("SELECT user_id FROM user_emails WHERE email = 'c@example.com'").first<any>();
    expect(email.user_id).toBe(c.id);
  });
  it('un seul fondateur', async () => {
    mockGoogle({ sub: 'gf1', email: 'fraps81@gmail.com', email_verified: true, name: 'Femz', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    mockDiscord({ id: 'df2', username: 'hello', global_name: 'Hello', email: 'hello@imfemz.com', verified: true, avatar: null });
    await callback('discord', 's2', stateCookie('s2'));
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE founder = 1').first<any>();
    expect(n.n).toBe(1);
    const hello = await env.DB.prepare("SELECT founder FROM users WHERE display_name = 'Hello'").first<any>();
    expect(hello.founder).toBe(0);
  });
});
