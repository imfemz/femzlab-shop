import type { Env } from '../env';
import { attachPurchases } from './purchases';

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(24)));
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return hex(new Uint8Array(digest));
}
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function notifyFemz(env: Env, subject: string, html: string) {
  await env.EMAIL.send({ from: { email: env.EXPEDITEUR, name: 'FemzLab — espace membre' }, to: 'hello@imfemz.com', subject, html, text: html.replace(/<[^>]+>/g, ' ') });
}

/** Crée une demande de liaison et prévient Femz par email. Une seule demande `pending` à la fois par membre ; un email déjà lié à un autre membre est refusé d'office (et signalé). */
export async function createLinkRequest(env: Env, userId: number, rawEmail: string): Promise<{ error: string } | { ok: true }> {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!isEmail(email)) return { error: 'email_invalide' };

  const existing = await env.DB.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(email).first<{ user_id: number }>();
  // Email déjà rattaché à un AUTRE membre : la réponse est volontairement
  // identique au succès (pas de code d'erreur distinct), sinon n'importe quel
  // membre pourrait tester si une adresse est inscrite (oracle d'énumération).
  // Et un seul email de conflit est envoyé à Femz par (membre, adresse) et par
  // tranche de 24 h : sans cela, ce chemin — qui n'insérait rien — pouvait
  // être rejoué à l'infini pour l'inonder.
  if (existing && existing.user_id !== userId) {
    const recent = await env.DB.prepare(
      "SELECT 1 FROM link_requests WHERE user_id = ? AND email = ? AND created_at > datetime('now', '-1 day')",
    ).bind(userId, email).first();
    if (!recent) {
      await env.DB.prepare("INSERT INTO link_requests (user_id, email, status, decided_at) VALUES (?, ?, 'denied', datetime('now'))").bind(userId, email).run();
      await notifyFemz(env, 'Conflit — email déjà lié à un autre membre', `<p>Le membre #${userId} a demandé à relier <b>${escapeHtml(email)}</b>, déjà rattachée au membre #${existing.user_id}. Aucune action requise ; à vérifier si besoin.</p>`);
    }
    return { ok: true };
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
  const displayName = requester?.display_name || 'Un membre';
  // Le pseudo est contrôlé par l'utilisateur : dans le SUJET (en-tête d'email),
  // un retour à la ligne permettrait d'injecter d'autres en-têtes.
  const sujetNom = (requester?.display_name || 'membre #' + userId).replace(/[\r\n]/g, ' ');
  await notifyFemz(env, `Relier une adresse — ${sujetNom}`,
    `<p><b>${escapeHtml(displayName)}</b> (#${userId}) demande à relier l'adresse d'achat <b>${escapeHtml(email)}</b> à son compte.</p>
     <p><a href="${base}/approve">Approuver</a> · <a href="${base}/deny">Refuser</a></p>
     <p style="color:#888">Demande #${id}, valable 30 jours.</p>`);
  return { ok: true };
}

/** Lecture seule : l'état d'une demande sans jamais la modifier (sert la page de confirmation GET, jamais exécutée par un simple préchargement de lien). */
export async function peekLinkRequest(env: Env, token: string): Promise<{ status: string } | null> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT status FROM link_requests WHERE token_hash = ?').bind(tokenHash).first<{ status: string }>();
  return row || null;
}

/** Applique la décision d'un jeton reçu par email. À usage unique : seule la première décision produit un effet, une présentation ultérieure du même jeton retrouve la demande (déjà traitée) au lieu de la modifier à nouveau. */
export async function decideLinkRequest(env: Env, token: string, decision: 'approved' | 'denied'): Promise<{ error: string } | { ok: true; email: string; userId: number }> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT id, user_id, email, status, created_at FROM link_requests WHERE token_hash = ?").bind(tokenHash).first<any>();
  if (!row) return { error: 'introuvable' };
  if (row.status !== 'pending') return { error: 'deja_traite' };
  const ageMs = Date.now() - Date.parse(String(row.created_at).replace(' ', 'T') + 'Z');
  if (ageMs > 30 * 24 * 3600 * 1000) { await env.DB.prepare("UPDATE link_requests SET status = 'denied', decided_at = datetime('now') WHERE id = ?").bind(row.id).run(); return { error: 'expire' }; }

  // L'email visé a pu être rattaché à un AUTRE membre entre la demande et le
  // clic (jusqu'à 30 jours plus tard) : l'`INSERT OR IGNORE` ci-dessous
  // n'écraserait rien, mais la demande serait quand même marquée `approved` et
  // Femz lirait « rattachée » alors que rien ne l'a été. On vérifie donc AVANT
  // d'écrire le statut, pour ne jamais marquer approuvé ce qui n'est pas honoré.
  if (decision === 'approved') {
    const already = await env.DB.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(row.email).first<{ user_id: number }>();
    if (already && already.user_id !== row.user_id) {
      await env.DB.prepare("UPDATE link_requests SET status = 'denied', decided_at = datetime('now') WHERE id = ?").bind(row.id).run();
      return { error: 'deja_utilisee' };
    }
  }
  await env.DB.prepare("UPDATE link_requests SET status = ?, decided_at = datetime('now') WHERE id = ?").bind(decision, row.id).run();
  if (decision === 'approved') {
    await env.DB.prepare("INSERT OR IGNORE INTO user_emails (email, user_id, verified_by) VALUES (?, ?, 'admin')").bind(row.email, row.user_id).run();
    await attachPurchases(env, row.user_id);
  }
  return { ok: true, email: row.email, userId: row.user_id };
}
