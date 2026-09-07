import { env as testEnv } from 'cloudflare:test';
import { signSession, cookieName } from '../src/lib/session';
import type { Env } from '../src/env';

export async function mkUser(p: Partial<{ display_name: string; city: string; lat: number; lon: number; country: string; visible: number; dms_open: number; founder: number; consented_at: string; revoked: number; deleted_at: string; avatar_key: string; socials: string; reels: string }> = {}) {
  const cols = Object.keys(p);
  const sql = cols.length
    ? `INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    : "INSERT INTO users (display_name) VALUES ('Membre')";
  const r = await testEnv.DB.prepare(sql).bind(...Object.values(p)).run();
  return r.meta.last_row_id as number;
}
/** Cookie de session signé pour `userId` ; nom selon l'environnement (`env` ?? l'env de test réel). */
export async function cookieFor(userId: number, env?: Pick<Env, 'ENV'>) {
  return `${cookieName(env ?? testEnv)}=${await signSession(userId, testEnv.JWT_SECRET)}`;
}
