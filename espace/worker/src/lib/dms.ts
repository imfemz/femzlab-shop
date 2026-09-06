import type { Env } from '../env';
import { cleanStr } from './users';

export const DM_MAX = 2000, DM_LIMIT = 30, DM_WINDOW_MS = 10 * 60 * 1000;
const toMs = (d: string) => { const t = Date.parse(String(d).replace(' ', 'T') + 'Z'); return Number.isNaN(t) ? Date.parse(d) || 0 : t; };
const fmt = (m: any, me: number) => ({ f: m.from_user === me ? 'me' : 'them', x: m.text, t: toMs(m.created_at) });

export async function peer(env: Env, id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return env.DB.prepare('SELECT id, display_name, founder, dms_open, avatar_key FROM users WHERE id = ? AND revoked = 0 AND deleted_at IS NULL').bind(id).first<any>();
}
export async function isBlocked(env: Env, a: number, b: number) {
  const r = await env.DB.prepare('SELECT 1 AS x FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?) LIMIT 1').bind(a, b, b, a).first();
  return !!r;
}
export async function block(env: Env, me: number, other: number) {
  await env.DB.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)').bind(me, other).run();
}
export async function unblock(env: Env, me: number, other: number) {
  await env.DB.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').bind(me, other).run();
}

export async function listConvs(env: Env, me: number) {
  const { results } = await env.DB.prepare('SELECT * FROM dms WHERE from_user = ? OR to_user = ? ORDER BY id ASC').bind(me, me).all<any>();
  const byPeer = new Map<number, { msgs: any[]; unread: number }>();
  for (const m of results) {
    const p = m.from_user === me ? m.to_user : m.from_user;
    if (!byPeer.has(p)) byPeer.set(p, { msgs: [], unread: 0 });
    const conv = byPeer.get(p)!; conv.msgs.push(fmt(m, me));
    if (m.to_user === me && !m.read) conv.unread++;
  }
  const ids = [...byPeer.keys()];
  const names = new Map<number, any>();
  if (ids.length) {
    const { results: us } = await env.DB.prepare(`SELECT id, display_name, founder, avatar_key FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<any>();
    for (const u of us) names.set(u.id, u);
  }
  return ids.map((p) => {
    const u = names.get(p), conv = byPeer.get(p)!;
    return { peer: p, name: u?.display_name || 'Membre', founder: !!u?.founder, avatar: u?.avatar_key ? `/espace/media/${u.avatar_key}` : null, unread: conv.unread, msgs: conv.msgs };
  }).sort((a, b) => (b.msgs.at(-1)?.t || 0) - (a.msgs.at(-1)?.t || 0));
}

export async function thread(env: Env, me: number, other: any) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM dms WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY id ASC').bind(me, other.id, other.id, me).all<any>();
  return { peer: other.id, name: other.display_name || 'Membre', founder: !!other.founder, msgs: results.map((m) => fmt(m, me)) };
}

export async function sendDm(env: Env, me: number, other: any, raw: any): Promise<{ msg: any } | { error: string; status: 400 | 403 | 429 }> {
  if (other.id === me) return { error: 'impossible de s’écrire à soi-même', status: 400 };
  const text = cleanStr(raw, DM_MAX + 1);
  if (!text) return { error: 'text requis', status: 400 };
  if (text.length > DM_MAX) return { error: `${DM_MAX} caractères maximum`, status: 400 };
  if (!other.dms_open || (await isBlocked(env, me, other.id))) return { error: 'ce membre n’accepte pas les messages privés', status: 403 };
  const since = Date.now() - DM_WINDOW_MS;
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_events WHERE user_id = ? AND kind = 'dm' AND at > ?").bind(me, since).first<{ n: number }>();
  if ((n?.n || 0) >= DM_LIMIT) return { error: 'trop de messages d’affilée — réessaie dans quelques minutes', status: 429 };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO rate_events (user_id, kind, at) VALUES (?, 'dm', ?)").bind(me, Date.now()),
    env.DB.prepare("DELETE FROM rate_events WHERE at < ?").bind(since - DM_WINDOW_MS),
  ]);
  const r = await env.DB.prepare('INSERT INTO dms (from_user, to_user, text) VALUES (?, ?, ?)').bind(me, other.id, text).run();
  const row = await env.DB.prepare('SELECT * FROM dms WHERE id = ?').bind(r.meta.last_row_id).first<any>();
  return { msg: fmt(row, me) };
}

export async function markRead(env: Env, me: number, other: number) {
  const r = await env.DB.prepare('UPDATE dms SET read = 1 WHERE from_user = ? AND to_user = ? AND read = 0').bind(other, me).run();
  return r.meta.changes;
}
