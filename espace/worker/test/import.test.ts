import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

describe('import admin des achats', () => {
  it('403 si non fondateur, 401 sans session', async () => {
    const membre = await mkUser();
    const body = JSON.stringify({ product: 'MetaVision', rows: [{ email: 'x@y.co', purchased_at: '2026-01-01' }] });
    expect((await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, env)).status).toBe(401);
    expect((await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { Cookie: await cookieFor(membre), 'content-type': 'application/json' }, body }, env)).status).toBe(403);
  });

  it('importe, rattache ce qui correspond déjà, idempotent au second passage, rejette les lignes invalides', async () => {
    const fondateur = await mkUser({ founder: 1 });
    const dejaMembre = await mkUser();
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('deja@e.co', ?, 'oauth')").bind(dejaMembre).run();
    const body = JSON.stringify({
      product: 'MetaVision',
      rows: [
        { email: 'nouveau@e.co', purchased_at: '2026-01-01' },
        { email: 'deja@e.co', purchased_at: '2026-01-02' },
        { email: 'pas-un-email', purchased_at: '2026-01-03' },
      ],
    });
    const r1: any = await (await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { Cookie: await cookieFor(fondateur), 'content-type': 'application/json' }, body }, env)).json();
    expect(r1).toEqual({ inserted: 2, attached: 1, rejetees: 1 });
    const p = await env.DB.prepare("SELECT user_id FROM purchases WHERE email = 'deja@e.co'").first<any>();
    expect(p.user_id).toBe(dejaMembre);

    const r2: any = await (await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { Cookie: await cookieFor(fondateur), 'content-type': 'application/json' }, body }, env)).json();
    expect(r2.inserted).toBe(0); // même (email, produit, date) déjà présent
  });

  it('refuse un produit non canonique (mauvaise casse) sans traiter la moindre ligne', async () => {
    const fondateur = await mkUser({ founder: 1 });
    const body = JSON.stringify({ product: 'Metavision', rows: [{ email: 'x@y.co', purchased_at: '2026-01-01' }] });
    const res = await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { Cookie: await cookieFor(fondateur), 'content-type': 'application/json' }, body }, env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'produit inconnu' });
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first<any>();
    expect(n.n).toBe(0);
  });
});
