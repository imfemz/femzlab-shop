import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('schéma socle', () => {
  it('crée les 6 tables et refuse un provider inconnu', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(['blocks', 'dms', 'identities', 'rate_events', 'user_emails', 'users']);
    await env.DB.prepare("INSERT INTO users (display_name) VALUES ('x')").run();
    await expect(
      env.DB.prepare("INSERT INTO identities (user_id, provider, provider_id, email) VALUES (1, 'facebook', 'p', 'a@b.co')").run(),
    ).rejects.toThrow();
  });
});
