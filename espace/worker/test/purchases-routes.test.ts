import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';
import { createLinkRequest, decideLinkRequest } from '../src/lib/link-requests';

describe('/api/purchases et /api/link-requests', () => {
  it('/api/purchases : 401 sans session, liste triée avec session', async () => {
    expect((await app.request('/espace/api/purchases', {}, env)).status).toBe(401);
    const u = await mkUser();
    await env.DB.prepare("INSERT INTO purchases (email, product, user_id, source, purchased_at) VALUES ('z@z.co', 'MetaVision', ?, 'checkout', '2026-01-01')").bind(u).run();
    const list: any[] = await (await app.request('/espace/api/purchases', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(list).toEqual([{ product: 'MetaVision', purchased_at: '2026-01-01' }]);
  });

  it('/api/link-requests : POST crée, GET reflète l\'état, email invalide → 400', async () => {
    const u = await mkUser();
    const anonyme = (email: string) => app.request('/espace/api/link-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }, env);
    const withAuth = async (email: string) => app.request('/espace/api/link-requests', { method: 'POST', headers: { Cookie: await cookieFor(u), 'content-type': 'application/json' }, body: JSON.stringify({ email }) }, env);
    expect((await anonyme('a@b.co')).status).toBe(401);
    expect((await withAuth('pas-un-email')).status).toBe(400);
    expect((await withAuth('ok@mail.co')).status).toBe(200);
    const etat: any = await (await app.request('/espace/api/link-requests', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(etat).toEqual({ status: 'pending' });
    expect((await withAuth('deux@mail.co')).status).toBe(409);
  });

  it('/api/link-requests : après un refus, GET renvoie denied', async () => {
    const u = await mkUser();
    const fake = { send: async (m: any) => { (globalThis as any).__lastHtml = m.html; } };
    await createLinkRequest({ ...env, EMAIL: fake as any }, u, 'refus@mail.co');
    const token = (globalThis as any).__lastHtml.match(/\/espace\/admin\/link\/([a-f0-9]+)\//)[1];
    expect(await decideLinkRequest(env, token, 'denied')).toMatchObject({ ok: true });
    const etat: any = await (await app.request('/espace/api/link-requests', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(etat).toEqual({ status: 'denied' });
  });
});
