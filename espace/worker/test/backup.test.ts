import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { backupToR2 } from '../src/lib/backup';
import { mkUser } from './helpers';

describe('sauvegarde nocturne', () => {
  it('écrit un JSON daté avec les tables, et purge au-delà de 90 jours', async () => {
    await mkUser({ display_name: 'Sauvé' });
    await env.MEDIA.put('backups/2026-01-01.json', '{}');
    const r = await backupToR2(env, new Date('2026-09-06T03:00:00Z'));
    expect(r.key).toBe('backups/2026-09-06.json'); expect(r.deleted).toBe(1);
    const dump = JSON.parse(await (await env.MEDIA.get(r.key))!.text());
    expect(dump.users.some((u: any) => u.display_name === 'Sauvé')).toBe(true);
    expect(Object.keys(dump).sort()).toEqual(['blocks', 'dms', 'identities', 'link_requests', 'purchases', 'user_emails', 'users']);
    expect(await env.MEDIA.get('backups/2026-01-01.json')).toBeNull();
  });
});
