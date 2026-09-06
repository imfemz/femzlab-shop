/**
 * NVDM — store des conversations DM.
 * Mode API (session active) : hydraté par initDmsFromApi() avant le premier
 * rendu ; envois/lectures répliqués sur le backend (optimiste côté UI).
 * Mode démo (sans backend) : persistance localStorage, structure identique
 * à la maquette v30 — y compris le DM de bienvenue multilingue.
 */
import { apiJson } from './api';

export type DmMsg = { f: 'me' | 'them'; x: string; t: number };
export type DmConv = { name: string; founder: boolean; msgs: DmMsg[]; unread: number };
export type DmData = Record<string, DmConv>;

const KEY = 'nv_dms';

/* DM de bienvenue multilingue — la langue suit le pays du compte membre.
   (version serveur : server/lib/welcome.js — utilisée à la création des comptes) */
const WELCOME: Record<string, string> = {
  fr: "Bienvenue dans NéoVision ! Ravi de te compter parmi nous. Si tu bloques sur un épisode ou que tu as la moindre question, réponds ici — je lis tout. Bon VFX ! — Femz",
  en: "Welcome to NéoVision! Glad to have you on board. If you get stuck on an episode or have any question, just reply here — I read everything. Happy VFX! — Femz",
  es: "¡Bienvenido a NéoVision! Encantado de tenerte con nosotros. Si te atascas en un episodio o tienes cualquier duda, responde aquí — lo leo todo. ¡Buen VFX! — Femz",
  pt: "Bem-vindo ao NéoVision! Feliz por ter você conosco. Se travar em algum episódio ou tiver dúvidas, responda aqui — eu leio tudo. Bom VFX! — Femz",
  de: "Willkommen bei NéoVision! Schön, dass du dabei bist. Wenn du bei einer Episode feststeckst oder Fragen hast, antworte einfach hier — ich lese alles. Viel Spaß! — Femz",
};

/* pays → langue du message de bienvenue (mapping de la maquette) */
const LANG: Record<string, string> = {
  FR: 'fr', BE: 'fr', CH: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CM: 'fr', CI: 'fr',
  ML: 'fr', BF: 'fr', BJ: 'fr', TG: 'fr', GA: 'fr', CD: 'fr', CG: 'fr', MG: 'fr',
  KM: 'fr', HT: 'fr', RE: 'fr', GP: 'fr', MQ: 'fr', YT: 'fr', MA: 'fr', DZ: 'fr', TN: 'fr',
  ES: 'es', MX: 'es', AR: 'es', PE: 'es', CO: 'es', VE: 'es',
  BR: 'pt', PT: 'pt',
  DE: 'de', AT: 'de',
};

function welcomeFor(cc: string): string {
  return WELCOME[LANG[cc] || 'en'] || WELCOME.en;
}

let remote = false;

let data: DmData | null = null;
try {
  data = JSON.parse(localStorage.getItem(KEY) || 'null');
} catch {
  /* stockage indisponible : on repart de zéro */
}
if (!data) {
  const cc = 'FR'; /* pays du compte membre (démo — le backend gère le vrai cas) */
  data = {
    femz: { name: 'Femz', founder: true, msgs: [{ f: 'them', x: welcomeFor(cc), t: Date.now() }], unread: 1 },
  };
  persist();
}

function persist() {
  if (remote) return; /* en mode API le backend est la source de vérité */
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota / navigation privée : on continue en mémoire */
  }
}

let version = 0;
const subs = new Set<() => void>();
function emit() {
  version++;
  subs.forEach((f) => f());
}

/* ── Mode API ── */

type ApiConv = { peer: number; name: string; founder: boolean; unread: number; msgs: DmMsg[] };

/** Hydrate le store depuis GET /api/dms (clé de conversation = id backend du peer). */
export async function initDmsFromApi(): Promise<void> {
  const convs = await apiJson<ApiConv[]>('/api/dms');
  const d: DmData = {};
  for (const c of convs) {
    d[String(c.peer)] = { name: c.name, founder: c.founder, msgs: c.msgs, unread: c.unread };
  }
  data = d;
  remote = true;
  emit();
}

export const NVDM = {
  convs(): DmData {
    return data as DmData;
  },
  get(id: string): DmConv | undefined {
    return (data as DmData)[id];
  },
  /** Crée la conversation si besoin, la retourne (côté serveur elle naît au premier message). */
  open(id: string, name: string, founder?: boolean): DmConv {
    const d = data as DmData;
    if (!d[id]) {
      d[id] = { name, founder: !!founder, msgs: [], unread: 0 };
      persist();
      emit();
    }
    return d[id];
  },
  send(id: string, text: string) {
    (data as DmData)[id].msgs.push({ f: 'me', x: text, t: Date.now() });
    persist();
    emit();
    if (remote) {
      apiJson(`/api/dms/${id}`, { method: 'POST', body: JSON.stringify({ text }) }).catch((e) =>
        console.warn('DM non envoyé au serveur :', e),
      );
    }
  },
  read(id: string) {
    const c = (data as DmData)[id];
    if (c && c.unread) {
      c.unread = 0;
      persist();
      emit();
      if (remote) {
        apiJson(`/api/dms/${id}/read`, { method: 'POST', body: '{}' }).catch(() => {});
      }
    }
  },
  unread(): number {
    let n = 0;
    const d = data as DmData;
    for (const k in d) n += d[k].unread || 0;
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
