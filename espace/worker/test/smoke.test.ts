import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('outillage', () => {
  it('D1 et R2 repondent', async () => {
    const r = await env.DB.prepare('SELECT 1 AS un').first<{ un: number }>();
    expect(r?.un).toBe(1);
    await env.MEDIA.put('t/x.txt', 'ok');
    expect(await (await env.MEDIA.get('t/x.txt'))?.text()).toBe('ok');
  });
});
