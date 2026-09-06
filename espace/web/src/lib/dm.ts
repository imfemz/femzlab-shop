/**
 * NVDM — store des conversations DM.
 * Aucun repli local : hydraté par initDmsFromApi() avant le premier rendu
 * (GET /espace/api/dms) ; envois/lectures répliqués sur le backend
 * (optimiste côté UI — un échec de l'envoi retire le message local et
 * relance l'erreur pour que l'UI affiche le refus : dms fermés, blocage, 429).
 */
import { API, apiJson } from './api';

export type DmMsg = { f: 'me' | 'them'; x: string; t: number };
export type DmConv = { name: string; founder: boolean; msgs: DmMsg[]; unread: number; avatar?: string | null };
export type DmData = Record<string, DmConv>;

let data: DmData = {};

let version = 0;
const subs = new Set<() => void>();
function emit() {
  version++;
  subs.forEach((f) => f());
}

/* ── Mode API ── */

type ApiConv = { peer: number; name: string; founder: boolean; avatar: string | null; unread: number; msgs: DmMsg[] };

/** Hydrate le store depuis GET /espace/api/dms (clé de conversation = id backend du peer). */
export async function initDmsFromApi(): Promise<void> {
  const convs = await apiJson<ApiConv[]>(`${API}/dms`);
  const d: DmData = {};
  for (const c of convs) {
    d[String(c.peer)] = { name: c.name, founder: c.founder, msgs: c.msgs, unread: c.unread, avatar: c.avatar };
  }
  data = d;
  emit();
}

export const NVDM = {
  convs(): DmData {
    return data;
  },
  get(id: string): DmConv | undefined {
    return data[id];
  },
  /** Crée la conversation si besoin, la retourne (côté serveur elle naît au premier message). */
  open(id: string, name: string, founder?: boolean): DmConv {
    if (!data[id]) {
      data[id] = { name, founder: !!founder, msgs: [], unread: 0 };
      emit();
    }
    return data[id];
  },
  /**
   * Envoi optimiste ; en cas de refus serveur (dms fermés, blocage, 429…) le
   * message local est retiré et l'erreur relancée avec le texte `error` du
   * corps JSON quand le serveur en fournit un (l'UI l'affiche tel quel).
   */
  async send(id: string, text: string): Promise<void> {
    const msg: DmMsg = { f: 'me', x: text, t: Date.now() };
    data[id].msgs.push(msg);
    emit();
    try {
      const r = await fetch(`${API}/dms/${id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        let errMsg = `POST ${API}/dms/${id} → ${r.status}`;
        try {
          const body = (await r.json()) as { error?: string };
          if (body?.error) errMsg = body.error;
        } catch {
          /* corps non-JSON : on garde le message générique */
        }
        throw new Error(errMsg);
      }
    } catch (e) {
      const i = data[id].msgs.indexOf(msg);
      if (i > -1) data[id].msgs.splice(i, 1);
      emit();
      throw e;
    }
  },
  read(id: string) {
    const c = data[id];
    if (c && c.unread) {
      c.unread = 0;
      emit();
      apiJson(`${API}/dms/${id}/read`, { method: 'POST', body: '{}' }).catch(() => {});
    }
  },
  unread(): number {
    let n = 0;
    for (const k in data) n += data[k].unread || 0;
    return n;
  },
  fmt(t: number): string {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
  subscribe(f: () => void): () => void {
    subs.add(f);
    return () => subs.delete(f);
  },
  version(): number {
    return version;
  },
};
