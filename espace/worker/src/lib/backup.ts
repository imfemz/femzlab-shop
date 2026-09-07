import type { Env } from '../env';
const TABLES = ['users', 'identities', 'user_emails', 'dms', 'blocks', 'purchases', 'link_requests'];
const RETENTION_DAYS = 90;

export async function backupToR2(env: Env, now = new Date()) {
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) dump[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  const day = now.toISOString().slice(0, 10);
  const key = `backups/${day}.json`;
  await env.MEDIA.put(key, JSON.stringify(dump), { httpMetadata: { contentType: 'application/json' } });
  const limit = new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  let deleted = 0;
  const listed = await env.MEDIA.list({ prefix: 'backups/' });
  for (const o of listed.objects) {
    const d = o.key.slice('backups/'.length, 'backups/'.length + 10);
    if (d < limit) { await env.MEDIA.delete(o.key); deleted++; }
  }
  return { key, deleted };
}
