import type { Env } from '../env';

export const MAX_BYTES = 2 * 1024 * 1024;
const MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Type réel par signature binaire — jamais par extension ni en-tête client. */
export function sniffImage(b: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'webp';
  return null;
}

export async function storeUserImage(env: Env, userId: number, prefix: 'avatars' | 'reels', bytes: Uint8Array, kind: 'png' | 'jpeg' | 'webp', n?: number) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha = [...digest.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const key = prefix === 'avatars' ? `avatars/${userId}/${sha}.${kind}` : `reels/${userId}/${n}-${sha}.${kind}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: MIME[kind], cacheControl: 'public, max-age=31536000, immutable' } });
  return key;
}
export async function deleteKey(env: Env, key: string | null) { if (key) await env.MEDIA.delete(key); }

/**
 * Lit et valide le corps d'un upload ; renvoie l'erreur HTTP à rendre sinon.
 * Le corps est lu en flux et abandonné dès que le total dépasse MAX_BYTES :
 * `content-length` est déclaratif (absent en chunked, ou mensonger), il ne
 * sert que de pré-contrôle pour couper avant même de lire.
 */
export async function readImage(req: Request): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpeg' | 'webp' } | { status: 413 | 415 }> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return { status: 413 };
  const reader = req.body?.getReader();
  if (!reader) return { status: 415 };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel().catch(() => {}); return { status: 413 }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  const kind = sniffImage(bytes);
  if (!kind) return { status: 415 };
  return { bytes, kind };
}
