import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { recordPurchase, attachPurchases, purchasesFor, badgesForMany } from '../src/lib/purchases';
import { mkUser } from './helpers';

describe('achats', () => {
  it('enregistre un achat non rattaché (user_id NULL) et ignore un doublon exact', async () => {
    const r1 = await recordPurchase(env, { email: 'A@B.co', product: 'MetaVision', source: 'checkout', purchasedAt: '2026-01-01', externalRef: 'p1' });
    expect(r1.inserted).toBe(true);
    const r2 = await recordPurchase(env, { email: 'a@b.co', product: 'MetaVision', source: 'checkout', purchasedAt: '2026-01-01', externalRef: 'p1' });
    expect(r2.inserted).toBe(false);
    const row = await env.DB.prepare("SELECT email, user_id FROM purchases WHERE external_ref = 'p1'").first<any>();
    expect(row.email).toBe('a@b.co'); expect(row.user_id).toBeNull();
  });

  it('rattache les achats en attente dès qu\'un email vérifié correspond', async () => {
    await recordPurchase(env, { email: 'c@d.co', product: 'MotionLAB', source: 'checkout', purchasedAt: '2026-02-01' });
    await recordPurchase(env, { email: 'c@d.co', product: 'Fade Pack', source: 'import', purchasedAt: '2026-02-02' });
    const u = await mkUser({ display_name: 'C' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('c@d.co', ?, 'oauth')").bind(u).run();
    const n = await attachPurchases(env, u);
    expect(n).toBe(2);
    const rows = await env.DB.prepare('SELECT user_id FROM purchases WHERE email = ?').bind('c@d.co').all<any>();
    expect(rows.results.every((r: any) => r.user_id === u)).toBe(true);
    // idempotent : un second appel ne rattache rien de nouveau
    expect(await attachPurchases(env, u)).toBe(0);
  });

  it('purchasesFor et badgesForMany ne renvoient que les achats rattachés, triés par date', async () => {
    const u = await mkUser();
    await recordPurchase(env, { email: 'e@f.co', product: 'MetaVision', source: 'checkout', purchasedAt: '2026-03-01' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('e@f.co', ?, 'oauth')").bind(u).run();
    await attachPurchases(env, u);
    await recordPurchase(env, { email: 'e@f.co', product: 'Ghost FX', source: 'checkout', purchasedAt: '2026-01-01' });
    await attachPurchases(env, u);
    const mine = await purchasesFor(env, u);
    expect(mine.map((p) => p.product)).toEqual(['Ghost FX', 'MetaVision']);
    const badges = await badgesForMany(env, [u, 999999]);
    expect(badges.get(u)?.sort()).toEqual(['Ghost FX', 'MetaVision']);
    expect(badges.get(999999)).toBeUndefined();
  });
});
