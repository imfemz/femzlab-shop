import type { Env, User } from '../env';
import type { OAuthProfile } from './oauth';
import { welcomeFor } from './welcome';
import { geocode } from './geocode';
import { sniffImage, storeUserImage, MAX_BYTES } from './media';

export const parseJson = (s: any, fb: any) => { if (!s) return fb; try { return JSON.parse(s); } catch { return fb; } };
export const cleanStr = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const ownerEmails = (env: Env) => String(env.OWNER_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export class ConflitIdentite extends Error {
  constructor(public code: 'identite_deja_liee' | 'email_deja_utilise') { super(code); }
}

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
  if (known && attachTo != null && known.user_id !== attachTo) {
    throw new ConflitIdentite('identite_deja_liee');
  }
  if (known) {
    await db.prepare('UPDATE identities SET email = ?, display_name = ?, avatar_url = ? WHERE provider = ? AND provider_id = ?')
      .bind(p.email, p.name, p.avatarUrl, p.provider, p.providerId).run();
    return { user: (await byId(env, known.user_id))!, created: false };
  }
  let userId = attachTo ?? null;
  if (userId != null) {
    const byEmail = await db.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(p.email).first<{ user_id: number }>();
    if (byEmail && byEmail.user_id !== userId) throw new ConflitIdentite('email_deja_utilise');
  } else {
    const byEmail = await db.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(p.email).first<{ user_id: number }>();
    if (byEmail) userId = byEmail.user_id;
  }
  let created = false;
  if (userId == null) {
    const existingFounder = await db.prepare('SELECT 1 FROM users WHERE founder = 1 LIMIT 1').first();
    const founder = !existingFounder && ownerEmails(env).includes(p.email) ? 1 : 0;
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
    if (p.avatarUrl) await copyProviderAvatar(env, userId, p.avatarUrl);
  }
  return { user: (await byId(env, userId))!, created };
}

/**
 * Best-effort : copie la photo du fournisseur (avatarUrl) dans R2 comme avatar initial.
 * Toute erreur (réseau, type, taille) est ignorée — loggée seulement — et ne bloque jamais la création du compte.
 */
async function copyProviderAvatar(env: Env, userId: number, avatarUrl: string) {
  try {
    const r = await fetch(avatarUrl, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('trop lourd (content-length)');
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error('trop lourd');
    const kind = sniffImage(bytes);
    if (!kind) throw new Error('type non reconnu');
    const key = await storeUserImage(env, userId, 'avatars', bytes, kind);
    await env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, userId).run();
  } catch (e) {
    console.warn('avatar fournisseur ignoré', userId, avatarUrl, e);
  }
}

export const mediaUrl = (key: string | null) => (key ? `/espace/media/${key}` : null);

const COUNTRY_CENTER: Record<string, [number, number]> = {
  FR: [46.6, 2.4], BE: [50.6, 4.7], CH: [46.8, 8.2], DE: [51.1, 10.4], LU: [49.8, 6.1], MC: [43.74, 7.42],
  ES: [40.3, -3.7], PT: [39.6, -8.0], IT: [42.8, 12.5], GB: [52.6, -1.5], US: [39.8, -98.6], CA: [50.0, -95.0],
  MA: [31.8, -7.1], DZ: [35.7, 2.9], TN: [34.9, 9.6], SN: [14.5, -14.5], CI: [7.5, -5.5], CM: [5.7, 12.3],
  BR: [-14.2, -51.9], MX: [23.6, -102.5], AT: [47.6, 14.1], NL: [52.2, 5.3],
};
const seeded = (id: number, k: number) => { const x = Math.sin(id * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
function anonPoint(u: User) {
  const c = COUNTRY_CENTER[u.country || ''] || COUNTRY_CENTER.FR;
  return { anon: true as const, lat: +(c[0] + (seeded(u.id, 1) - 0.5) * 3).toFixed(2), lon: +(c[1] + (seeded(u.id, 2) - 0.5) * 4).toFixed(2) };
}

export async function profileOf(env: Env, id: number) {
  const u = (await byId(env, id))!;
  return {
    display_name: u.display_name, city: u.city || '', country: u.country, lat: u.lat, lon: u.lon,
    avatar: mediaUrl(u.avatar_key), socials: parseJson(u.socials, { ig: '', tt: '', yt: '' }),
    reels: (parseJson(u.reels, []) as any[]).map((r) => ({ url: r.url || '', thumb: mediaUrl(r.thumb_key || null) })),
  };
}

export async function updateProfile(env: Env, id: number, body: any): Promise<{ error?: string }> {
  const sets: string[] = [], args: any[] = [];
  if (body.city !== undefined) {
    const city = cleanStr(body.city, 80); const g = geocode(city);
    sets.push('city = ?', 'lat = ?', 'lon = ?'); args.push(city, g ? g.lat : null, g ? g.lon : null);
  }
  if (body.display_name !== undefined) {
    const dn = cleanStr(body.display_name, 60);
    if (!dn) return { error: 'display_name vide' };
    sets.push('display_name = ?'); args.push(dn);
  }
  if (body.socials !== undefined) {
    const s = body.socials && typeof body.socials === 'object' ? body.socials : {};
    sets.push('socials = ?'); args.push(JSON.stringify({ ig: cleanStr(s.ig, 100), tt: cleanStr(s.tt, 100), yt: cleanStr(s.yt, 100) }));
  }
  if (body.reels !== undefined) {
    if (!Array.isArray(body.reels)) return { error: 'reels doit être un tableau' };
    const prev = parseJson((await byId(env, id))!.reels, []) as any[];
    const reels = body.reels.slice(0, 3).map((r: any, i: number) => ({ url: cleanStr(r && r.url, 300), thumb_key: prev[i]?.thumb_key || null }));
    sets.push('reels = ?'); args.push(JSON.stringify(reels));
  }
  if (!sets.length) return { error: 'aucun champ à mettre à jour' };
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  return {};
}

export async function setConsent(env: Env, id: number, visible: boolean, dmsOpen: boolean) {
  await env.DB.prepare("UPDATE users SET visible = ?, dms_open = ?, consented_at = datetime('now') WHERE id = ?").bind(visible ? 1 : 0, dmsOpen ? 1 : 0, id).run();
}

export async function creatorsList(env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM users WHERE revoked = 0 AND deleted_at IS NULL ORDER BY founder DESC, id ASC').all<User>();
  return results.map((u) => {
    if (!u.visible || !u.display_name) return anonPoint(u);
    const out: any = {
      id: u.id, display_name: u.display_name, city: u.city || u.country || '',
      socials: parseJson(u.socials, {}), founder: !!u.founder, dms_open: !!u.dms_open,
      reels: (parseJson(u.reels, []) as any[]).filter((r) => r.url || r.thumb_key).map((r) => ({ url: r.url || '', thumb: mediaUrl(r.thumb_key || null) })),
      badges: [] as string[], // Plan 2 : produits achetés
    };
    if (u.lat != null && u.lon != null) { out.lat = u.lat; out.lon = u.lon; }
    if (u.avatar_key) out.avatar = mediaUrl(u.avatar_key);
    return out;
  });
}

export async function stats(env: Env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL AND revoked = 0').first<{ n: number }>();
  return { membres: r?.n ?? 0 };
}
