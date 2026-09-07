import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser } from './helpers';
import { createLinkRequest } from '../src/lib/link-requests';

async function tokenFor(userId: number, email: string): Promise<string> {
  const fake = { send: async (m: any) => { (globalThis as any).__lastHtml = m.html; } };
  await createLinkRequest({ ...env, EMAIL: fake as any }, userId, email);
  return (globalThis as any).__lastHtml.match(/\/espace\/admin\/link\/([a-f0-9]+)\//)[1];
}

describe('routes approve/deny', () => {
  it('approve : 200, page de confirmation, rattache ; un second clic dit "déjà traité"', async () => {
    const u = await mkUser({ display_name: 'Q' });
    const token = await tokenFor(u, 'q@ok.co');
    const r1 = await app.request(`/espace/admin/link/${token}/approve`, {}, env);
    expect(r1.status).toBe(200);
    expect(await r1.text()).toContain('approuvée');
    const row = await env.DB.prepare("SELECT verified_by FROM user_emails WHERE email = 'q@ok.co'").first<any>();
    expect(row.verified_by).toBe('admin');
    const r2 = await app.request(`/espace/admin/link/${token}/approve`, {}, env);
    expect(r2.status).toBe(200);
    expect(await r2.text()).toContain('déjà');
  });
  it('deny : 200, page de confirmation, ne crée pas de user_emails', async () => {
    const u = await mkUser();
    const token = await tokenFor(u, 'r@ok.co');
    const r = await app.request(`/espace/admin/link/${token}/deny`, {}, env);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('refusée');
    expect(await env.DB.prepare("SELECT 1 FROM user_emails WHERE email = 'r@ok.co'").first()).toBeNull();
  });
  it('jeton introuvable → page d\'erreur, toujours 200 (lien déjà cliqué ou expiré)', async () => {
    const r = await app.request(`/espace/admin/link/${'0'.repeat(48)}/approve`, {}, env);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('introuvable');
  });
});
