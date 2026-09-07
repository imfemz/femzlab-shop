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

const POST = { method: 'POST' };

describe('routes approve/deny', () => {
  it('approve : 200, page de confirmation, rattache ; un second clic dit "déjà traité"', async () => {
    const u = await mkUser({ display_name: 'Q' });
    const token = await tokenFor(u, 'q@ok.co');
    const r1 = await app.request(`/espace/admin/link/${token}/approve`, POST, env);
    expect(r1.status).toBe(200);
    expect(await r1.text()).toContain('approuvée');
    const row = await env.DB.prepare("SELECT verified_by FROM user_emails WHERE email = 'q@ok.co'").first<any>();
    expect(row.verified_by).toBe('admin');
    const r2 = await app.request(`/espace/admin/link/${token}/approve`, POST, env);
    expect(r2.status).toBe(200);
    expect(await r2.text()).toContain('déjà');
  });
  it('deny : 200, page de confirmation, ne crée pas de user_emails', async () => {
    const u = await mkUser();
    const token = await tokenFor(u, 'r@ok.co');
    const r = await app.request(`/espace/admin/link/${token}/deny`, POST, env);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('refusée');
    expect(await env.DB.prepare("SELECT 1 FROM user_emails WHERE email = 'r@ok.co'").first()).toBeNull();
  });
  it('jeton introuvable → page d\'erreur, toujours 200 (lien déjà cliqué ou expiré)', async () => {
    const r = await app.request(`/espace/admin/link/${'0'.repeat(48)}/approve`, POST, env);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('introuvable');
  });
  it('l\'email est échappé dans la page de confirmation', async () => {
    const u = await mkUser();
    const token = await tokenFor(u, '<b>x</b>@ok.co');
    const r = await app.request(`/espace/admin/link/${token}/approve`, POST, env);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain('<b>x</b>');
    expect(text).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('un GET ne décide rien : il affiche seulement un formulaire de confirmation', async () => {
    // Les passerelles de sécurité des clients mail préchargent les liens :
    // un GET (même automatique) ne doit rien modifier en base.
    const u = await mkUser({ display_name: 'S' });
    const token = await tokenFor(u, 's@ok.co');
    const g = await app.request(`/espace/admin/link/${token}/approve`, {}, env);
    expect(g.status).toBe(200);
    const html = await g.text();
    expect(html).toContain('Confirmer');
    expect(html).toContain('<form');
    const apres = await env.DB.prepare('SELECT status FROM link_requests WHERE user_id = ?').bind(u).first<any>();
    expect(apres.status).toBe('pending');
    expect(await env.DB.prepare("SELECT 1 FROM user_emails WHERE email = 's@ok.co'").first()).toBeNull();

    const p = await app.request(`/espace/admin/link/${token}/approve`, POST, env);
    expect(p.status).toBe(200);
    expect(await p.text()).toContain('approuvée');
    const fin = await env.DB.prepare('SELECT status FROM link_requests WHERE user_id = ?').bind(u).first<any>();
    expect(fin.status).toBe('approved');
  });
});
