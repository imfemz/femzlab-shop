import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('schéma achats', () => {
  it('crée purchases et link_requests, applique les contraintes', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('purchases','link_requests')",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name).sort()).toEqual(['link_requests', 'purchases']);

    await env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('a@b.co', 'MetaVision', 'checkout', '2026-01-01')").run();
    await expect(
      env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('a@b.co', 'MetaVision', 'invalide', '2026-01-01')").run(),
    ).rejects.toThrow();
    // même (email, produit, date) → violation UNIQUE
    await expect(
      env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('a@b.co', 'MetaVision', 'import', '2026-01-01')").run(),
    ).rejects.toThrow();

    await env.DB.prepare("INSERT INTO users (display_name) VALUES ('X')").run();
    await env.DB.prepare("INSERT INTO link_requests (user_id, email) VALUES (1, 'x@y.co')").run();
    const lr = await env.DB.prepare('SELECT status FROM link_requests WHERE id = 1').first<{ status: string }>();
    expect(lr?.status).toBe('pending');
    await expect(
      env.DB.prepare("INSERT INTO link_requests (user_id, email, status) VALUES (1, 'z@z.co', 'autre')").run(),
    ).rejects.toThrow();
  });
});
