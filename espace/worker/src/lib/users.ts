import type { Env, User } from '../env';
import type { OAuthProfile } from './oauth';
import { welcomeFor } from './welcome';

export const parseJson = (s: any, fb: any) => { if (!s) return fb; try { return JSON.parse(s); } catch { return fb; } };
export const cleanStr = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const ownerEmails = (env: Env) => String(env.OWNER_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

async function byId(env: Env, id: number) {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
}

/**
 * Résout une identité OAuth en membre :
 *  1. identité déjà connue → son membre ;
 *  2. sinon email déjà connu → on attache l'identité à ce membre ;
 *  3. sinon création (fondateur si email propriétaire) + DM de bienvenue.
 * `attachTo` (mode attache) force le rattachement au membre connecté.
 */
export async function findOrCreateFromIdentity(env: Env, p: OAuthProfile, attachTo?: number): Promise<{ user: User; created: boolean }> {
  const db = env.DB;
  const known = await db.prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?').bind(p.provider, p.providerId).first<{ user_id: number }>();
  if (known) {
    await db.prepare('UPDATE identities SET email = ?, display_name = ?, avatar_url = ? WHERE provider = ? AND provider_id = ?')
      .bind(p.email, p.name, p.avatarUrl, p.provider, p.providerId).run();
    return { user: (await byId(env, known.user_id))!, created: false };
  }
  let userId = attachTo ?? null;
  if (userId == null) {
    const byEmail = await db.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(p.email).first<{ user_id: number }>();
    if (byEmail) userId = byEmail.user_id;
  }
  let created = false;
  if (userId == null) {
    const founder = ownerEmails(env).includes(p.email) ? 1 : 0;
    const dn = cleanStr(p.name, 60) || p.email.split('@')[0];
    const r = await db.prepare('INSERT INTO users (display_name, name, founder) VALUES (?, ?, ?)').bind(dn, p.name || null, founder).run();
    userId = r.meta.last_row_id as number;
    created = true;
  }
  await db.prepare('INSERT INTO identities (user_id, provider, provider_id, email, display_name, avatar_url) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(userId, p.provider, p.providerId, p.email, p.name, p.avatarUrl).run();
  await db.prepare("INSERT OR IGNORE INTO user_emails (email, user_id, verified_by) VALUES (?, ?, 'oauth')").bind(p.email, userId).run();
  if (created) {
    const f = await db.prepare('SELECT id, country FROM users WHERE founder = 1 AND id != ? ORDER BY id LIMIT 1').bind(userId).first<{ id: number }>();
    if (f) await db.prepare('INSERT INTO dms (from_user, to_user, text) VALUES (?, ?, ?)').bind(f.id, userId, welcomeFor(null as any)).run();
  }
  return { user: (await byId(env, userId))!, created };
}
