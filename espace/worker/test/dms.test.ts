import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

const post = async (u: number, path: string, body: object = {}) =>
  app.request(path, { method: 'POST', headers: { Cookie: await cookieFor(u), 'content-type': 'application/json' }, body: JSON.stringify(body) }, env);
const get = async (u: number, path: string) => app.request(path, { headers: { Cookie: await cookieFor(u) } }, env);

describe('DM', () => {
  it('envoi, fil, liste, lecture', async () => {
    const a = await mkUser({ display_name: 'A', dms_open: 1 }), b = await mkUser({ display_name: 'B', dms_open: 1 });
    const r: any = await (await post(a, `/espace/api/dms/${b}`, { text: 'salut' })).json();
    expect(r.msg).toMatchObject({ f: 'me', x: 'salut' });
    const th: any = await (await get(b, `/espace/api/dms/${a}`)).json();
    expect(th.msgs[0]).toMatchObject({ f: 'them', x: 'salut' });
    const convs: any[] = await (await get(b, '/espace/api/dms')).json();
    expect(convs[0]).toMatchObject({ peer: a, name: 'A', unread: 1 });
    await post(b, `/espace/api/dms/${a}/read`);
    expect(((await (await get(b, '/espace/api/dms')).json()) as any[])[0].unread).toBe(0);
  });
  it('refus : dms fermés, soi-même, texte vide ou trop long, membre inconnu', async () => {
    const a = await mkUser({ dms_open: 1 }), ferme = await mkUser({ dms_open: 0 });
    expect((await post(a, `/espace/api/dms/${ferme}`, { text: 'x' })).status).toBe(403);
    expect((await post(a, `/espace/api/dms/${a}`, { text: 'x' })).status).toBe(400);
    expect((await post(a, `/espace/api/dms/${ferme}`, { text: '' })).status).toBe(400);
    expect((await post(a, `/espace/api/dms/9999`, { text: 'x' })).status).toBe(404);
    const b = await mkUser({ dms_open: 1 });
    expect((await post(a, `/espace/api/dms/${b}`, { text: 'x'.repeat(2001) })).status).toBe(400);
  });
  it('blocage : silencieux et bidirectionnel, levée possible', async () => {
    const a = await mkUser({ dms_open: 1 }), b = await mkUser({ dms_open: 1 });
    expect((await post(a, `/espace/api/blocks/${b}`)).status).toBe(200);
    expect((await post(b, `/espace/api/dms/${a}`, { text: 'x' })).status).toBe(403);
    expect((await post(a, `/espace/api/dms/${b}`, { text: 'x' })).status).toBe(403);
    // sec-fetch-site : posé par le navigateur sur toute requête même-origine ;
    // sans lui ni content-type, le middleware csrf traite la requête comme un
    // formulaire d'origine inconnue (cf. test/csrf.test.ts).
    expect((await app.request(`/espace/api/blocks/${b}`, { method: 'DELETE', headers: { Cookie: await cookieFor(a), 'sec-fetch-site': 'same-origin' } }, env)).status).toBe(200);
    expect((await post(b, `/espace/api/dms/${a}`, { text: 'x' })).status).toBe(200);
  });
  it('limite : 30 messages par 10 minutes, le 31e est refusé (429)', async () => {
    const a = await mkUser({ dms_open: 1 }), b = await mkUser({ dms_open: 1 });
    for (let i = 0; i < 30; i++) expect((await post(a, `/espace/api/dms/${b}`, { text: `m${i}` })).status).toBe(200);
    expect((await post(a, `/espace/api/dms/${b}`, { text: 'trop' })).status).toBe(429);
  });
  it('la purge ne touche pas les autres kinds', async () => {
    const a = await mkUser({ dms_open: 1 }), b = await mkUser({ dms_open: 1 });
    const old = Date.now() - 3 * 600000;
    await env.DB.prepare("INSERT INTO rate_events (user_id, kind, at) VALUES (?, 'autre', ?)").bind(1, old).run();
    await env.DB.prepare("INSERT INTO rate_events (user_id, kind, at) VALUES (?, 'dm', ?)").bind(a, old).run();
    expect((await post(a, `/espace/api/dms/${b}`, { text: 'salut' })).status).toBe(200);
    const autre = await env.DB.prepare("SELECT * FROM rate_events WHERE user_id = 1 AND kind = 'autre'").first();
    expect(autre).not.toBeNull();
    const vieuxDm = await env.DB.prepare("SELECT * FROM rate_events WHERE kind = 'dm' AND at < ?").bind(Date.now() - 20 * 60 * 1000).first();
    expect(vieuxDm).toBeNull();
  });
});
