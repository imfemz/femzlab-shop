// test/profile.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

const json = (u: number, body: object, method = 'PUT') => async (path: string) =>
  app.request(path, { method, headers: { Cookie: await cookieFor(u), 'content-type': 'application/json' }, body: JSON.stringify(body) }, env);

describe('profil & globe', () => {
  it('/me : 401 sans session, identité + fournisseurs avec', async () => {
    expect((await app.request('/espace/api/me', {}, env)).status).toBe(401);
    const u = await mkUser({ display_name: 'Zoé' });
    await env.DB.prepare("INSERT INTO identities (user_id, provider, provider_id, email) VALUES (?, 'discord', 'x', 'z@e.co')").bind(u).run();
    const me: any = await (await app.request('/espace/api/me', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(me).toMatchObject({ id: u, display_name: 'Zoé', founder: false, visible: false, dms_open: false, providers: ['discord'] });
    expect(me).not.toHaveProperty('email');
  });
  it('PUT profil : ville géocodée, nom, réseaux, reels bornés à 3', async () => {
    const u = await mkUser();
    const r = await (await json(u, { city: 'Cannes', display_name: '  Léo  ', socials: { ig: '@leo', tt: '', yt: 'x'.repeat(200) }, reels: [{ url: 'https://x.co/a' }, { url: 'https://x.co/b' }, { url: 'https://x.co/c' }, { url: 'https://x.co/d' }] })('/espace/api/profile')).json() as any;
    expect(r.city).toBe('Cannes'); expect(r.lat).toBeCloseTo(43.55, 1); expect(r.display_name).toBe('Léo');
    expect(r.socials.yt.length).toBe(100); expect(r.reels.length).toBe(3);
    expect((await json(u, { display_name: '' })('/espace/api/profile')).status).toBe(400);
  });
  it('PUT profil : une URL de reel non http(s) est refusée, une vide est acceptée', async () => {
    const u = await mkUser();
    const ko = await json(u, { reels: [{ url: 'javascript:alert(1)' }] })('/espace/api/profile');
    expect(ko.status).toBe(400);
    expect(await ko.json()).toEqual({ error: 'lien de reel invalide (http(s) uniquement)' });
    const ok = await json(u, { reels: [{ url: 'https://www.instagram.com/reel/x' }, { url: '' }] })('/espace/api/profile');
    expect(ok.status).toBe(200);
    const p: any = await ok.json();
    expect(p.reels.map((r: any) => r.url)).toEqual(['https://www.instagram.com/reel/x', '']);
  });
  it('PUT consent : un corps sans booléens est refusé et ne pose pas consented_at', async () => {
    const u = await mkUser();
    const ko = await json(u, {})('/espace/api/consent');
    expect(ko.status).toBe(400);
    expect(await ko.json()).toEqual({ error: 'visible et dms_open (booléens) requis' });
    const avant = await env.DB.prepare('SELECT consented_at FROM users WHERE id = ?').bind(u).first<any>();
    expect(avant.consented_at).toBeNull();
    const ok = await json(u, { visible: true, dms_open: false })('/espace/api/consent');
    expect(ok.status).toBe(200);
    const apres = await env.DB.prepare('SELECT consented_at, visible, dms_open FROM users WHERE id = ?').bind(u).first<any>();
    expect(apres.consented_at).not.toBeNull();
    expect([apres.visible, apres.dms_open]).toEqual([1, 0]);
  });
  it('consentement puis /creators : nommé sans email, anonymes en points pays, fondateur en premier', async () => {
    const f = await mkUser({ display_name: 'Femz', founder: 1, visible: 1, city: 'Paris', lat: 48.85, lon: 2.35, consented_at: 'x' });
    const a = await mkUser({ display_name: 'Anon', country: 'BE' });
    const v = await mkUser({ display_name: 'Vue', lat: 43.5, lon: 7.0, city: 'Cannes' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('vue@e.co', ?, 'oauth')").bind(v).run();
    await json(v, { visible: true, dms_open: true })('/espace/api/consent');
    const list: any[] = await (await app.request('/espace/api/creators', { headers: { Cookie: await cookieFor(a) } }, env)).json();
    expect(JSON.stringify(list)).not.toMatch(/@/);
    expect(list[0].display_name).toBe('Femz');
    expect(list.find((x) => x.display_name === 'Vue')).toMatchObject({ id: v, dms_open: true, lat: 43.5 });
    const anon = list.find((x) => x.anon);
    expect(anon).toMatchObject({ anon: true }); expect(anon).not.toHaveProperty('display_name');
    expect((await app.request('/espace/api/creators', {}, env)).status).toBe(401);
  });
  it('/stats est public et compte les membres non supprimés', async () => {
    await mkUser(); await mkUser({ deleted_at: 'x' });
    const s: any = await (await app.request('/espace/api/stats', {}, env)).json();
    expect(s.membres).toBe(1);
  });
});
