import { env } from 'cloudflare:test';
import { signSession } from '../src/lib/session';

export async function mkUser(p: Partial<{ display_name: string; city: string; lat: number; lon: number; country: string; visible: number; dms_open: number; founder: number; consented_at: string; revoked: number; deleted_at: string; avatar_key: string; socials: string; reels: string }> = {}) {
  const cols = Object.keys(p);
  const sql = cols.length
    ? `INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    : "INSERT INTO users (display_name) VALUES ('Membre')";
  const r = await env.DB.prepare(sql).bind(...Object.values(p)).run();
  return r.meta.last_row_id as number;
}
export async function cookieFor(userId: number) {
  return `fz_session=${await signSession(userId, env.JWT_SECRET)}`;
}
