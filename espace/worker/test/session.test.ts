import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requireAuth, requireFounder, setSession, clearSession, COOKIE } from '../src/lib/session';
import { mkUser, cookieFor } from './helpers';

const app = new Hono<{ Bindings: typeof env }>()
  .get('/me', requireAuth as any, (c: any) => c.json({ id: c.get('user').id }))
  .get('/admin', requireAuth as any, requireFounder as any, (c) => c.text('ok'))
  .get('/login/:id', async (c) => { await setSession(c as any, Number(c.req.param('id'))); return c.text('ok'); })
  .get('/logout', (c) => { clearSession(c as any); return c.text('ok'); });

describe('session', () => {
  it('401 sans cookie, 200 avec, 403 non-fondateur, cookie posé et effacé', async () => {
    const uid = await mkUser();
    expect((await app.request('/me', {}, env)).status).toBe(401);
    const ok = await app.request('/me', { headers: { Cookie: await cookieFor(uid) } }, env);
    expect(await ok.json()).toEqual({ id: uid });
    expect((await app.request('/admin', { headers: { Cookie: await cookieFor(uid) } }, env)).status).toBe(403);
    const f = await mkUser({ founder: 1 });
    expect((await app.request('/admin', { headers: { Cookie: await cookieFor(f) } }, env)).status).toBe(200);
    const set = (await app.request(`/login/${uid}`, {}, env)).headers.get('set-cookie') || '';
    expect(set).toContain(`${COOKIE}=`); expect(set).toContain('HttpOnly'); expect(set).toContain('SameSite=Lax');
    const del = (await app.request('/logout', {}, env)).headers.get('set-cookie') || '';
    expect(del).toContain('Max-Age=0');
  });
  it('refuse un utilisateur révoqué ou supprimé', async () => {
    const r = await mkUser({ revoked: 1 });
    expect((await app.request('/me', { headers: { Cookie: await cookieFor(r) } }, env)).status).toBe(401);
    const d = await mkUser({ deleted_at: '2026-01-01' });
    expect((await app.request('/me', { headers: { Cookie: await cookieFor(d) } }, env)).status).toBe(401);
  });
});
