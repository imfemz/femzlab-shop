import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';

describe('service de l’app', () => {
  it('/espace → /espace/ ; apex → www ; l’app est servie (repli SPA)', async () => {
    const r1 = await app.request('http://www.femzlab.shop/espace', {}, env);
    expect(r1.status).toBe(301); expect(r1.headers.get('location')).toBe('https://www.femzlab.shop/espace/');
    const r2 = await app.request('http://femzlab.shop/espace/profil', {}, env);
    expect(r2.status).toBe(301); expect(r2.headers.get('location')).toBe('https://www.femzlab.shop/espace/profil');
    const r3 = await app.request('http://www.femzlab.shop/espace/', {}, env);
    expect(r3.status).toBe(200); expect(await r3.text()).toContain('<!doctype html>');
    const r4 = await app.request('http://www.femzlab.shop/espace/nimporte/quoi', {}, env);
    expect(r4.status).toBe(200);
  });
  it('les routes API inconnues rendent du JSON 404, pas l’app', async () => {
    const r = await app.request('http://www.femzlab.shop/espace/api/inconnu', {}, env);
    expect(r.status).toBe(404); expect(r.headers.get('content-type')).toContain('json');
  });
});
