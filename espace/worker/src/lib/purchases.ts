import type { Env } from '../env';

export type NewPurchase = { email: string; product: string; source: 'checkout' | 'import' | 'admin'; purchasedAt: string; externalRef?: string };

/** Enregistre un achat, non rattaché tant qu'aucun membre ne correspond. Doublon exact (email+produit+date) ignoré. */
export async function recordPurchase(env: Env, p: NewPurchase): Promise<{ inserted: boolean }> {
  const email = p.email.trim().toLowerCase();
  const r = await env.DB.prepare(
    'INSERT OR IGNORE INTO purchases (email, product, source, purchased_at, external_ref) VALUES (?, ?, ?, ?, ?)',
  ).bind(email, p.product, p.source, p.purchasedAt, p.externalRef || null).run();
  return { inserted: (r.meta.changes || 0) > 0 };
}

/** Rattache à `userId` tout achat non rattaché dont l'email figure dans ses `user_emails`. Rend le nombre d'achats rattachés. */
export async function attachPurchases(env: Env, userId: number): Promise<number> {
  const { results } = await env.DB.prepare('SELECT email FROM user_emails WHERE user_id = ?').bind(userId).all<{ email: string }>();
  if (!results.length) return 0;
  const emails = results.map((r) => r.email);
  const placeholders = emails.map(() => '?').join(',');
  const r = await env.DB.prepare(
    `UPDATE purchases SET user_id = ? WHERE user_id IS NULL AND email IN (${placeholders})`,
  ).bind(userId, ...emails).run();
  return r.meta.changes || 0;
}

export async function purchasesFor(env: Env, userId: number): Promise<{ product: string; purchased_at: string }[]> {
  const { results } = await env.DB.prepare(
    'SELECT product, purchased_at FROM purchases WHERE user_id = ? ORDER BY purchased_at ASC',
  ).bind(userId).all<{ product: string; purchased_at: string }>();
  return results;
}

/** Version par lot pour `/creators` : liste triée des produits distincts par membre. */
export async function badgesForMany(env: Env, userIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!userIds.length) return out;
  const placeholders = userIds.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT user_id, product FROM purchases WHERE user_id IN (${placeholders})`,
  ).bind(...userIds).all<{ user_id: number; product: string }>();
  for (const r of results) {
    if (!out.has(r.user_id)) out.set(r.user_id, []);
    out.get(r.user_id)!.push(r.product);
  }
  for (const arr of out.values()) arr.sort();
  return out;
}
