// test/media.test.ts
import { env, fetchMock } from 'cloudflare:test';
import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 9]);
const upload = async (u: number, path: string, bytes: Uint8Array, type = 'image/png') =>
  app.request(path, { method: 'POST', headers: { Cookie: await cookieFor(u), 'content-type': type }, body: bytes }, env);

describe('media', () => {
  it('avatar : stocke, sert, remplace et supprime l’ancien', async () => {
    const u = await mkUser();
    const r1: any = await (await upload(u, '/espace/api/media/avatar', PNG)).json();
    expect(r1.url).toMatch(new RegExp(`^/espace/media/avatars/${u}/[0-9a-f]{16}\\.png$`));
    const served = await app.request(r1.url, {}, env);
    expect(served.status).toBe(200); expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toContain('immutable');
    const r2: any = await (await upload(u, '/espace/api/media/avatar', WEBP, 'image/webp')).json();
    expect(r2.url).toMatch(/\.webp$/);
    expect((await app.request(r1.url, {}, env)).status).toBe(404);
    const me: any = await (await app.request('/espace/api/me', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(me.avatar).toBe(r2.url);
  });
  it('refuse ce qui n’est pas une image, ce qui est trop lourd, et un index de reel hors 0-2', async () => {
    const u = await mkUser();
    expect((await upload(u, '/espace/api/media/avatar', new TextEncoder().encode('<svg/>'), 'image/svg+xml')).status).toBe(415);
    expect((await upload(u, '/espace/api/media/avatar', new Uint8Array(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await upload(u, '/espace/api/media/reel/3', PNG)).status).toBe(400);
  });
  it('vignette de reel : écrite dans reels[n].thumb_key', async () => {
    const u = await mkUser({ reels: JSON.stringify([{ url: 'https://instagram.com/reel/a' }]) });
    const r: any = await (await upload(u, '/espace/api/media/reel/0', PNG)).json();
    const p: any = await (await app.request('/espace/api/profile', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(p.reels[0]).toEqual({ url: 'https://instagram.com/reel/a', thumb: r.url });
  });
  it('la route média ne sert que les avatars et les vignettes', async () => {
    await env.MEDIA.put('backups/2026-09-06.json', '{"users":[]}');
    expect((await app.request('/espace/media/backups/2026-09-06.json', {}, env)).status).toBe(404);
    await env.MEDIA.put('avatars/1/abc.png', PNG, { httpMetadata: { contentType: 'image/png' } });
    const r = await app.request('/espace/media/avatars/1/abc.png', {}, env);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
  });
});

describe('avatar du fournisseur copié à l’inscription', () => {
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
  async function callback(provider: string, state: string, cookie: string) {
    return app.request(`/espace/auth/${provider}/callback?code=abc&state=${state}`, { headers: { Cookie: cookie } }, env);
  }
  const stateCookie = (s: string) => `fz_oauth=${s}`;

  it('l’avatar du fournisseur est copié dans R2 à l’inscription, et son absence n’empêche rien', async () => {
    mockGoogle({ sub: 'g1', email: 'avatar1@example.com', email_verified: true, name: 'Avatar1', picture: 'https://lh3.googleusercontent.com/a/photo' });
    fetchMock.get('https://lh3.googleusercontent.com').intercept({ path: '/a/photo' }).reply(200, Buffer.from(PNG), { headers: { 'content-type': 'image/png' } });
    const r1 = await callback('google', 's1', stateCookie('s1'));
    expect(r1.status).toBe(302);
    const u1 = await env.DB.prepare("SELECT id, avatar_key FROM users WHERE display_name = 'Avatar1'").first<any>();
    expect(u1.avatar_key).toMatch(/^avatars\/\d+\/[0-9a-f]{16}\.png$/);
    const served = await app.request(`/espace/media/${u1.avatar_key}`, {}, env);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');

    mockDiscord({ id: 'd42', username: 'avatar2', global_name: 'Avatar2', email: 'avatar2@example.com', verified: true, avatar: 'x' });
    fetchMock.get('https://cdn.discordapp.com').intercept({ path: '/avatars/d42/x.png?size=256' }).reply(500, 'erreur');
    const r2 = await callback('discord', 's2', stateCookie('s2'));
    expect(r2.status).toBe(302);
    const u2 = await env.DB.prepare("SELECT id, avatar_key FROM users WHERE display_name = 'Avatar2'").first<any>();
    expect(u2).toBeTruthy();
    expect(u2.avatar_key).toBeNull();
  });

  it('un avatar fournisseur trop lourd est ignoré sans bloquer l’inscription', async () => {
    mockGoogle({ sub: 'g3', email: 'avatarbig@example.com', email_verified: true, name: 'AvatarBig', picture: 'https://lh3.googleusercontent.com/a/big' });
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG, 0);
    fetchMock.get('https://lh3.googleusercontent.com').intercept({ path: '/a/big' }).reply(200, Buffer.from(big), { headers: { 'content-type': 'image/png' } });
    const r = await callback('google', 's3', stateCookie('s3'));
    expect(r.status).toBe(302);
    const u = await env.DB.prepare("SELECT id, avatar_key FROM users WHERE display_name = 'AvatarBig'").first<any>();
    expect(u).toBeTruthy();
    expect(u.avatar_key).toBeNull();
  });
});
