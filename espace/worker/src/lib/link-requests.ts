import type { Env } from '../env';
import { attachPurchases } from './purchases';

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(24)));
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return hex(new Uint8Array(digest));
}
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

async function notifyFemz(env: Env, subject: string, html: string) {
  await env.EMAIL.send({ from: { email: env.EXPEDITEUR, name: 'FemzLab — espace membre' }, to: 'hello@imfemz.com', subject, html, text: html.replace(/<[^>]+>/g, ' ') });
}

/** Crée une demande de liaison et prévient Femz par email. Une seule demande `pending` à la fois par membre ; un email déjà lié à un autre membre est refusé d'office (et signalé). */
export async function createLinkRequest(env: Env, userId: number, rawEmail: string): Promise<{ error: string } | { ok: true }> {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!isEmail(email)) return { error: 'email_invalide' };

  const existing = await env.DB.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(email).first<{ user_id: number }>();
  if (existing && existing.user_id !== userId) {
    await notifyFemz(env, 'Conflit — email déjà lié à un autre membre', `<p>Le membre #${userId} a demandé à relier <b>${email}</b>, déjà rattachée au membre #${existing.user_id}. Aucune action requise ; à vérifier si besoin.</p>`);
    return { error: 'deja_utilisee' };
  }
  if (existing && existing.user_id === userId) return { error: 'deja_reliee' };

  const pending = await env.DB.prepare("SELECT id FROM link_requests WHERE user_id = ? AND status = 'pending'").bind(userId).first();
  if (pending) return { error: 'demande_en_attente' };

  const requester = await env.DB.prepare('SELECT display_name FROM users WHERE id = ?').bind(userId).first<{ display_name: string | null }>();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const r = await env.DB.prepare('INSERT INTO link_requests (user_id, email, token_hash) VALUES (?, ?, ?)').bind(userId, email, tokenHash).run();
  const id = r.meta.last_row_id;
  const base = `${env.APP_URL.replace(/\/$/, '').replace(/\/espace$/, '')}/espace/admin/link/${token}`;
  await notifyFemz(env, `Relier une adresse — ${requester?.display_name || 'membre #' + userId}`,
    `<p><b>${requester?.display_name || 'Un membre'}</b> (#${userId}) demande à relier l'adresse d'achat <b>${email}</b> à son compte.</p>
     <p><a href="${base}/approve">Approuver</a> · <a href="${base}/deny">Refuser</a></p>
     <p style="color:#888">Demande #${id}, valable 30 jours.</p>`);
  return { ok: true };
}

/** Applique la décision d'un jeton reçu par email. À usage unique : seule la première décision produit un effet, une présentation ultérieure du même jeton retrouve la demande (déjà traitée) au lieu de la modifier à nouveau. */
export async function decideLinkRequest(env: Env, token: string, decision: 'approved' | 'denied'): Promise<{ error: string } | { ok: true; email: string; userId: number }> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT id, user_id, email, status, created_at FROM link_requests WHERE token_hash = ?").bind(tokenHash).first<any>();
  if (!row) return { error: 'introuvable' };
  if (row.status !== 'pending') return { error: 'deja_traite' };
  const ageMs = Date.now() - Date.parse(String(row.created_at).replace(' ', 'T') + 'Z');
  if (ageMs > 30 * 24 * 3600 * 1000) { await env.DB.prepare("UPDATE link_requests SET status = 'denied', decided_at = datetime('now') WHERE id = ?").bind(row.id).run(); return { error: 'expire' }; }

  await env.DB.prepare("UPDATE link_requests SET status = ?, decided_at = datetime('now') WHERE id = ?").bind(decision, row.id).run();
  if (decision === 'approved') {
    await env.DB.prepare("INSERT OR IGNORE INTO user_emails (email, user_id, verified_by) VALUES (?, ?, 'admin')").bind(row.email, row.user_id).run();
    await attachPurchases(env, row.user_id);
  }
  return { ok: true, email: row.email, userId: row.user_id };
}
