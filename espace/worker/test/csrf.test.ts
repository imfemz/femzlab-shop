// test/csrf.test.ts — protection CSRF des routes mutantes.
// SameSite=Lax ne protège pas d'un sous-domaine same-site (ex. pay.femzlab.shop,
// CNAME Podia) : un <form enctype="text/plain"> y produit du JSON valide, que
// c.req.json() accepte. Le middleware csrf de Hono refuse ces requêtes de
// formulaire quand ni Origin ni Sec-Fetch-Site ne sont de confiance.
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

describe('CSRF', () => {
  it('refuse un POST « formulaire » d’origine étrangère, accepte l’appel JSON du front', async () => {
    const a = await mkUser({ dms_open: 1 }), b = await mkUser({ dms_open: 1 });
    const cookie = await cookieFor(a);

    const attaque = await app.request(`/espace/api/blocks/${b}`, {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'text/plain', Origin: 'https://evil.example' },
      body: JSON.stringify({}),
    }, env);
    expect(attaque.status).toBe(403);

    const legit = await app.request(`/espace/api/blocks/${b}`, {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }, env);
    expect(legit.status).toBe(200);
  });

  it('refuse un logout « formulaire » d’origine étrangère, accepte celui du front (same-origin)', async () => {
    const attaque = await app.request('/espace/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', Origin: 'https://evil.example' },
      body: '',
    }, env);
    expect(attaque.status).toBe(403);

    const legit = await app.request('/espace/auth/logout', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    }, env);
    expect(legit.status).toBe(200);
    expect(legit.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
