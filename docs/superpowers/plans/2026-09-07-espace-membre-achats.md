# Espace membre — Plan 2 : les achats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rattacher automatiquement les achats Podia (existants et futurs) aux comptes de l'espace membre — badges, carte « Mes produits », rattrapage manuel quand l'email Google/Discord diffère de l'email Podia.

**Architecture:** Le snippet Podia existant (aujourd'hui limité à MotionLAB) est étendu à tous les produits et poste vers une nouvelle route publique du Worker `femzlab-espace` (`POST /espace/hooks/checkout`), qui déduit le produit du slug de la page de remerciement. Chaque achat est enregistré dans une table `purchases` (email, produit, source) ; il se rattache à un membre dès qu'une de ses `user_emails` correspond — à la connexion, à l'import, ou à l'approbation d'une demande de liaison. Une deuxième table `link_requests` porte le rattrapage manuel : un membre dont l'email d'achat diffère de son email de connexion demande une liaison, Femz reçoit un email avec deux liens signés (Approuver / Refuser), au clic la liaison s'applique.

**Tech Stack:** Identique au socle (Hono 4, D1, R2, Vitest + `@cloudflare/vitest-pool-workers`, React 18 + Vite). Nouveau : binding `send_email` sur `femzlab-espace` (déjà utilisé par `avis-worker`, même compte).

**Spec:** `docs/superpowers/specs/2026-09-06-espace-membre-design.md` — §4.2 (achats), §4.3 (email différent), §5 (tables `purchases`/`link_requests`), §7 (routes), §8 (carte « Mes produits »), §12-§13 (sécurité/erreurs), §14 (tests), §15 phase 3.

Hors périmètre de ce plan (phases 4-5, futur Plan 3) : onglet Admin complet dans l'app, import CSV *en ligne* (glisser-déposer), entrées « partout » sur le site (`espace-entree.html`), export/suppression RGPD, signalements (`reports`), rôles Discord automatiques.

## Global Constraints

- `purchases` : `source ∈ {'checkout','import','admin'}`, `UNIQUE(email, product, purchased_at)`, email toujours en minuscules, produit toujours un nom canonique (jamais le nom brut Podia).
- Hook `POST /espace/hooks/checkout` : **public, sans authentification**, corps ≤ 8 Ko, ne donne accès à aucun contenu — seulement un badge. Un achat est **tracé** (`external_ref` = `podia_id`) et révocable.
- `link_requests` : un email déjà présent dans `user_emails` pour un **autre** membre est refusé d'office, et le conflit est signalé à Femz par email. Une seule demande `pending` à la fois par membre.
- Liens Approuver/Refuser : jeton aléatoire (pas de secret partagé à gérer), stocké haché (`token_hash` = SHA-256), **à usage unique** (le `status` passe à `approved`/`denied` et `token_hash` est vidé après décision — un clic répété ne réapplique rien), expire à **30 jours** (calculé depuis `created_at`, pas de colonne d'expiration séparée).
- Aucun email n'est jamais envoyé au client final (spec §4.3) — seul Femz reçoit des emails, sur `hello@imfemz.com`, via le binding `send_email` (gratuit, déjà vérifié sur ce compte par `avis-worker`).
- `/espace/api/creators` et toute réponse API **ne contiennent jamais d'email** (contrainte héritée du socle, toujours valable).
- Table de correspondance produits (slug de page / nom Podia → nom canonique) dupliquée depuis `avis-worker/src/index.js` (pas de mécanisme de partage de code entre les deux Workers déployés séparément) — commentaire de synchronisation des deux côtés.
- Commits : messages en français, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` en dernière ligne. Une autre session Claude travaille dans `femzlab-shop-front` : toujours `git status` avant de committer et **ne stager que ses propres fichiers**.

---

## Structure des fichiers

```
espace/worker/
├── migrations/0002_achats.sql        purchases, link_requests
├── src/lib/products.ts               slug/nom Podia → nom canonique
├── src/lib/purchases.ts              enregistrement, rattachement, badges
├── src/lib/link-requests.ts          création/décision des demandes de liaison + email
├── src/index.ts                      + routes hooks/checkout, api/purchases,
│                                        api/link-requests, admin/link/:token/*,
│                                        api/admin/purchases/import
├── wrangler.jsonc                    + binding send_email (EMAIL), var EXPEDITEUR
├── podia-snippet.html                (nouveau) snippet étendu à tous les produits
├── scripts/import-purchases.mjs      (nouveau) appelle l'import admin depuis un CSV local
└── test/{products,purchases,link-requests,checkout,creators}.test.ts (+ ajouts)

espace/web/
├── src/lib/purchases.ts              getPurchases, getLinkRequests, submitLinkRequest
└── src/components/ProfilePanel.tsx   + carte « Mes produits », + « Relier une autre adresse »
```

---

### Task 0 : Migration 0002, table de correspondance des produits

**Files:**
- Create: `espace/worker/migrations/0002_achats.sql`
- Create: `espace/worker/src/lib/products.ts`
- Test: `espace/worker/test/products.test.ts`, `espace/worker/test/schema-achats.test.ts`

**Interfaces:**
- Produces : tables `purchases(id, email, user_id, product, source, purchased_at, external_ref)`, `link_requests(id, user_id, email, status, token_hash, created_at, decided_at)`. `productFromSlug(slug: string): string | null`, `productFromPodiaName(name: string): string | null`, exportées de `products.ts`.

- [ ] **Step 1 : Tests qui échouent**

```ts
// test/schema-achats.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('schéma achats', () => {
  it('crée purchases et link_requests, applique les contraintes', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('purchases','link_requests')",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name).sort()).toEqual(['link_requests', 'purchases']);

    await env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('a@b.co', 'MetaVision', 'checkout', '2026-01-01')").run();
    await expect(
      env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('a@b.co', 'MetaVision', 'invalide', '2026-01-01')").run(),
    ).rejects.toThrow();
    // même (email, produit, date) → violation UNIQUE
    await expect(
      env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('a@b.co', 'MetaVision', 'import', '2026-01-01')").run(),
    ).rejects.toThrow();

    await env.DB.prepare("INSERT INTO users (display_name) VALUES ('X')").run();
    await env.DB.prepare("INSERT INTO link_requests (user_id, email) VALUES (1, 'x@y.co')").run();
    const lr = await env.DB.prepare('SELECT status FROM link_requests WHERE id = 1').first<{ status: string }>();
    expect(lr?.status).toBe('pending');
    await expect(
      env.DB.prepare("INSERT INTO link_requests (user_id, email, status) VALUES (1, 'z@z.co', 'autre')").run(),
    ).rejects.toThrow();
  });
});
```

```ts
// test/products.test.ts
import { describe, it, expect } from 'vitest';
import { productFromSlug, productFromPodiaName } from '../src/lib/products';

describe('correspondance des produits', () => {
  it('déduit le produit canonique depuis le slug de la page de remerciement', () => {
    expect(productFromSlug('/motionlab/thanks')).toBe('MotionLAB');
    expect(productFromSlug('/metavision/thanks')).toBe('MetaVision');
    expect(productFromSlug('/vortex-pack/thanks')).toBe('Vortex Sound Pack');
    expect(productFromSlug('/sfx-whoosh-pack/thanks')).toBe('Whoosh Sound Pack');
    expect(productFromSlug('/produit-inconnu/thanks')).toBeNull();
    expect(productFromSlug('')).toBeNull();
  });
  it('déduit le produit canonique depuis le nom Podia (import CSV)', () => {
    expect(productFromPodiaName('METAVISION - Formation VFX')).toBe('MetaVision');
    expect(productFromPodiaName('MotionLAB')).toBe('MotionLAB');
    expect(productFromPodiaName('Produit disparu')).toBeNull();
  });
});
```

Run: `npm test -- products schema-achats` — Expected: FAIL (fichiers/tables absents).

- [ ] **Step 2 : La migration**

```sql
-- 0002_achats.sql — Plan 2 : achats Podia, rattachement, demandes de liaison
CREATE TABLE purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,                  -- toujours en minuscules
  user_id      INTEGER REFERENCES users(id),   -- NULL tant que non rattaché
  product      TEXT NOT NULL,                  -- nom canonique (ex. "MetaVision")
  source       TEXT NOT NULL CHECK (source IN ('checkout', 'import', 'admin')),
  purchased_at TEXT NOT NULL,
  external_ref TEXT,
  UNIQUE (email, product, purchased_at)
);
CREATE INDEX idx_purchases_email ON purchases(email);
CREATE INDEX idx_purchases_user  ON purchases(user_id);

CREATE TABLE link_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  email      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  token_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX idx_link_requests_user ON link_requests(user_id);
```

- [ ] **Step 3 : `src/lib/products.ts`**

```ts
/**
 * Correspondance produits, dupliquée depuis `avis-worker/src/index.js` (const
 * PRODUITS) faute de mécanisme de partage entre Workers déployés séparément.
 * Ajouter une entrée ici à chaque nouveau produit vendu sur Podia — et
 * l'équivalent côté avis-worker si on veut aussi collecter des avis dessus.
 */

// Slug de la page de remerciement (/<slug>/thanks) → nom canonique.
// Utilisé par le hook de checkout (POST /espace/hooks/checkout).
const BY_SLUG: Record<string, string> = {
  motionlab: 'MotionLAB',
  metavision: 'MetaVision',
  'fade-pack': 'Fade Pack',
  'ghost-fx-preset-after-effects': 'Ghost FX',
  'sfx-whoosh-pack': 'Whoosh Sound Pack',
  'ultimate-ios-pack': 'Ultimate iOS Pack',
  'vortex-pack': 'Vortex Sound Pack',
};

// Nom du produit tel qu'exporté par Podia (colonne "Product" du CSV des
// ventes) → nom canonique. Utilisé par l'import admin.
const BY_PODIA_NAME: Record<string, string> = {
  MotionLAB: 'MotionLAB',
  'METAVISION - Formation VFX': 'MetaVision',
  'META VISION - Comment vivre de sa passion ?': 'MetaVision',
  'Ultimate iOS Pack': 'Ultimate iOS Pack',
  'Ghost FX': 'Ghost FX',
  'Presets Pack': 'Presets Pack',
  'VFX Presets Pack': 'Presets Pack',
  'Vortex Sound Pack': 'Vortex Sound Pack',
  'Whoosh Sound Pack': 'Whoosh Sound Pack',
  'SFX Whoosh Pack': 'Whoosh Sound Pack',
  '3D Text Pack': '3D Text Pack',
  '3D Text Pack Pro': '3D Text Pack Pro',
  'Fade Pack': 'Fade Pack',
};

/** Déduit le produit depuis le chemin de la page de remerciement Podia. */
export function productFromSlug(pagePath: string): string | null {
  const slug = String(pagePath || '').toLowerCase().split('/').filter(Boolean)[0] || '';
  return BY_SLUG[slug] || null;
}

/** Déduit le produit canonique depuis le nom brut exporté par Podia. */
export function productFromPodiaName(name: string): string | null {
  return BY_PODIA_NAME[String(name || '').trim()] || null;
}
```

- [ ] **Step 4 : Run `npm test -- products schema-achats`** — Expected: PASS (2 + 3 tests). Puis `npm test` complet — Expected: tous verts (48 tests existants + ces 5).
- [ ] **Step 5 : Commit**

```bash
cd /path/to/femzlab-shop-front
git status --short
git add espace/worker/migrations/0002_achats.sql espace/worker/src/lib/products.ts espace/worker/test/products.test.ts espace/worker/test/schema-achats.test.ts
git commit -m "espace: migration achats (purchases, link_requests), table de correspondance des produits

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 1 : `purchases.ts` — enregistrement et rattachement automatique

**Files:**
- Create: `espace/worker/src/lib/purchases.ts`
- Test: `espace/worker/test/purchases.test.ts`

**Interfaces:**
- Consumes : migration de Task 0 (`purchases`), `parseJson`/`cleanStr` de `../lib/users` (inutile ici en fait — pas d'import croisé nécessaire).
- Produces : `recordPurchase(env, { email, product, source, purchasedAt, externalRef }): Promise<{ inserted: boolean }>` ; `attachPurchases(env, userId): Promise<number>` (nombre d'achats nouvellement rattachés) ; `purchasesFor(env, userId): Promise<{ product: string; purchased_at: string }[]>` ; `badgesForMany(env, userIds: number[]): Promise<Map<number, string[]>>`. Consommées par Task 3 (hook), Task 4 (login), Task 6 (route + `creatorsList`), Task 7 (import).

- [ ] **Step 1 : Test qui échoue**

```ts
// test/purchases.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { recordPurchase, attachPurchases, purchasesFor, badgesForMany } from '../src/lib/purchases';
import { mkUser } from './helpers';

describe('achats', () => {
  it('enregistre un achat non rattaché (user_id NULL) et ignore un doublon exact', async () => {
    const r1 = await recordPurchase(env, { email: 'A@B.co', product: 'MetaVision', source: 'checkout', purchasedAt: '2026-01-01', externalRef: 'p1' });
    expect(r1.inserted).toBe(true);
    const r2 = await recordPurchase(env, { email: 'a@b.co', product: 'MetaVision', source: 'checkout', purchasedAt: '2026-01-01', externalRef: 'p1' });
    expect(r2.inserted).toBe(false);
    const row = await env.DB.prepare("SELECT email, user_id FROM purchases WHERE external_ref = 'p1'").first<any>();
    expect(row.email).toBe('a@b.co'); expect(row.user_id).toBeNull();
  });

  it('rattache les achats en attente dès qu\'un email vérifié correspond', async () => {
    await recordPurchase(env, { email: 'c@d.co', product: 'MotionLAB', source: 'checkout', purchasedAt: '2026-02-01' });
    await recordPurchase(env, { email: 'c@d.co', product: 'Fade Pack', source: 'import', purchasedAt: '2026-02-02' });
    const u = await mkUser({ display_name: 'C' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('c@d.co', ?, 'oauth')").bind(u).run();
    const n = await attachPurchases(env, u);
    expect(n).toBe(2);
    const rows = await env.DB.prepare('SELECT user_id FROM purchases WHERE email = ?').bind('c@d.co').all<any>();
    expect(rows.results.every((r: any) => r.user_id === u)).toBe(true);
    // idempotent : un second appel ne rattache rien de nouveau
    expect(await attachPurchases(env, u)).toBe(0);
  });

  it('purchasesFor et badgesForMany ne renvoient que les achats rattachés, triés par date', async () => {
    const u = await mkUser();
    await recordPurchase(env, { email: 'e@f.co', product: 'MetaVision', source: 'checkout', purchasedAt: '2026-03-01' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('e@f.co', ?, 'oauth')").bind(u).run();
    await attachPurchases(env, u);
    await recordPurchase(env, { email: 'e@f.co', product: 'Ghost FX', source: 'checkout', purchasedAt: '2026-01-01' });
    await attachPurchases(env, u);
    const mine = await purchasesFor(env, u);
    expect(mine.map((p) => p.product)).toEqual(['Ghost FX', 'MetaVision']);
    const badges = await badgesForMany(env, [u, 999999]);
    expect(badges.get(u)?.sort()).toEqual(['Ghost FX', 'MetaVision']);
    expect(badges.get(999999)).toBeUndefined();
  });
});
```

Run: `npm test -- purchases` — Expected: FAIL (module absent).

- [ ] **Step 2 : `src/lib/purchases.ts`**

```ts
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
```

- [ ] **Step 3 : Run `npm test -- purchases`** — Expected: PASS (3 tests).
- [ ] **Step 4 : Commit** — `git add espace/worker/src/lib/purchases.ts espace/worker/test/purchases.test.ts && git commit -m "espace: enregistrement et rattachement automatique des achats"` (+ trailer).

---

### Task 2 : Binding email et bibliothèque des demandes de liaison

**Files:**
- Modify: `espace/worker/wrangler.jsonc`, `espace/worker/vitest.config.ts`, `espace/worker/.dev.vars.example`
- Create: `espace/worker/src/lib/link-requests.ts`
- Test: `espace/worker/test/link-requests.test.ts`

**Interfaces:**
- Consumes : `Env.EMAIL` (nouveau binding `send_email`), `Env.EXPEDITEUR`, `Env.APP_URL`.
- Produces : `createLinkRequest(env, userId, rawEmail): Promise<{ error: string } | { ok: true }>` ; `decideLinkRequest(env, token, decision): Promise<{ error: string } | { ok: true; email: string; userId: number }>`. Consommées par Task 4 (route POST) et Task 5 (routes approve/deny).

- [ ] **Step 1 : `wrangler.jsonc`** — ajouter, au même niveau que `d1_databases`/`r2_buckets` :

```jsonc
  "send_email": [
    { "name": "EMAIL", "destination_address": "hello@imfemz.com" }
  ],
```

et dans `vars` :

```jsonc
    "EXPEDITEUR": "espace@femzlab.shop",
```

- [ ] **Step 2 : `.dev.vars.example`** — ajouter une ligne (aucune vraie valeur, ce fichier est versionné) :

```
EXPEDITEUR=espace@femzlab.shop
```

(`EMAIL` est un binding déclaré dans `wrangler.jsonc`, pas un secret : rien à ajouter à `.dev.vars` pour lui.)

- [ ] **Step 3 : `vitest.config.ts`** — le binding `send_email` est lu depuis `wrangler.jsonc` par le pool de test comme `DB`/`MEDIA`/`ASSETS` ; ajouter seulement la variable dans les `bindings` de test :

```ts
              EXPEDITEUR: 'espace@femzlab.shop',
```

(à côté de `APP_URL: 'http://localhost/espace'` existant).

- [ ] **Step 4 : Test qui échoue**

```ts
// test/link-requests.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import { createLinkRequest, decideLinkRequest } from '../src/lib/link-requests';
import { mkUser } from './helpers';

function fakeEmail() {
  return { send: vi.fn(async () => {}) };
}

describe('demandes de liaison', () => {
  it('crée une demande, envoie un email à Femz avec deux liens, refuse une seconde demande en attente', async () => {
    const u = await mkUser({ display_name: 'A' });
    const fake = fakeEmail();
    const r1 = await createLinkRequest({ ...env, EMAIL: fake as any }, u, 'Autre@Mail.com');
    expect(r1).toEqual({ ok: true });
    expect(fake.send).toHaveBeenCalledTimes(1);
    const call = fake.send.mock.calls[0][0];
    expect(call.to).toBe('hello@imfemz.com');
    expect(call.html).toContain('/espace/admin/link/');
    expect(call.html).toContain('/approve');
    expect(call.html).toContain('/deny');
    const row = await env.DB.prepare('SELECT email, status, token_hash FROM link_requests WHERE user_id = ?').bind(u).first<any>();
    expect(row.email).toBe('autre@mail.com'); expect(row.status).toBe('pending'); expect(row.token_hash).toBeTruthy();

    const r2 = await createLinkRequest({ ...env, EMAIL: fakeEmail() as any }, u, 'encore@autre.com');
    expect(r2).toEqual({ error: 'demande_en_attente' });
  });

  it('refuse d\'office un email déjà lié à un autre membre, et prévient Femz', async () => {
    const proprio = await mkUser({ display_name: 'P' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('pris@x.co', ?, 'oauth')").bind(proprio).run();
    const demandeur = await mkUser({ display_name: 'D' });
    const fake = fakeEmail();
    const r = await createLinkRequest({ ...env, EMAIL: fake as any }, demandeur, 'pris@x.co');
    expect(r).toEqual({ error: 'deja_utilisee' });
    expect(fake.send).toHaveBeenCalledTimes(1); // email de conflit à Femz
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM link_requests WHERE user_id = ?').bind(demandeur).first<any>();
    expect(n.n).toBe(0);
  });

  it('approuver rattache l\'email et les achats en attente ; refuser ne rattache rien ; un jeton ne sert qu\'une fois', async () => {
    const u = await mkUser({ display_name: 'M' });
    await env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('m@ok.co', 'MetaVision', 'checkout', '2026-01-01')").run();
    await createLinkRequest({ ...env, EMAIL: fakeEmail() as any }, u, 'm@ok.co');
    const { token_hash } = (await env.DB.prepare('SELECT token_hash FROM link_requests WHERE user_id = ?').bind(u).first<any>())!;
    // le jeton en clair n'est jamais stocké : on le récupère depuis l'appel d'email du test précédent n'est pas possible ici,
    // donc ce test relit le jeton via un deuxième createLinkRequest dont on intercepte l'email.
    const fake = fakeEmail();
    await env.DB.prepare('DELETE FROM link_requests').run();
    await createLinkRequest({ ...env, EMAIL: fake as any }, u, 'm@ok.co');
    const html: string = fake.send.mock.calls[0][0].html;
    const token = html.match(/\/espace\/admin\/link\/([a-f0-9]+)\//)![1];

    const d1 = await decideLinkRequest(env, token, 'approved');
    expect(d1).toMatchObject({ ok: true, email: 'm@ok.co', userId: u });
    const email = await env.DB.prepare("SELECT verified_by FROM user_emails WHERE email = 'm@ok.co'").first<any>();
    expect(email.verified_by).toBe('admin');
    const purchase = await env.DB.prepare("SELECT user_id FROM purchases WHERE email = 'm@ok.co'").first<any>();
    expect(purchase.user_id).toBe(u);

    const d2 = await decideLinkRequest(env, token, 'denied');
    expect(d2).toEqual({ error: 'deja_traite' });
  });

  it('un jeton inconnu ou invalide est refusé', async () => {
    expect(await decideLinkRequest(env, 'ff'.repeat(24), 'approved')).toEqual({ error: 'introuvable' });
  });
});
```

Run: `npm test -- link-requests` — Expected: FAIL (module absent).

- [ ] **Step 5 : `src/lib/link-requests.ts`**

```ts
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

/** Applique la décision d'un jeton reçu par email. À usage unique : le jeton est invalidé après la première décision. */
export async function decideLinkRequest(env: Env, token: string, decision: 'approved' | 'denied'): Promise<{ error: string } | { ok: true; email: string; userId: number }> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT id, user_id, email, status, created_at FROM link_requests WHERE token_hash = ?").bind(tokenHash).first<any>();
  if (!row) return { error: 'introuvable' };
  if (row.status !== 'pending') return { error: 'deja_traite' };
  const ageMs = Date.now() - Date.parse(String(row.created_at).replace(' ', 'T') + 'Z');
  if (ageMs > 30 * 24 * 3600 * 1000) { await env.DB.prepare("UPDATE link_requests SET status = 'denied', decided_at = datetime('now'), token_hash = NULL WHERE id = ?").bind(row.id).run(); return { error: 'expire' }; }

  await env.DB.prepare("UPDATE link_requests SET status = ?, decided_at = datetime('now'), token_hash = NULL WHERE id = ?").bind(decision, row.id).run();
  if (decision === 'approved') {
    await env.DB.prepare("INSERT OR IGNORE INTO user_emails (email, user_id, verified_by) VALUES (?, ?, 'admin')").bind(row.email, row.user_id).run();
    await attachPurchases(env, row.user_id);
  }
  return { ok: true, email: row.email, userId: row.user_id };
}
```

- [ ] **Step 6 : Ajouter `EMAIL: EmailSendBinding` et `EXPEDITEUR: string` à `Env`** dans `espace/worker/src/env.ts` (type minimal, pas de dépendance à un paquet de types externe) :

```ts
export type EmailSendBinding = { send(msg: { from: { email: string; name?: string }; to: string; subject: string; html: string; text?: string; replyTo?: string }): Promise<void> };
```

et ajouter au type `Env` existant : `EMAIL: EmailSendBinding; EXPEDITEUR: string;`.

- [ ] **Step 7 : Run `npm test -- link-requests`** — Expected: PASS (4 tests).
- [ ] **Step 8 : Commit** — `git add espace/worker/wrangler.jsonc espace/worker/vitest.config.ts espace/worker/.dev.vars.example espace/worker/src/env.ts espace/worker/src/lib/link-requests.ts espace/worker/test/link-requests.test.ts && git commit -m "espace: binding email, demandes de liaison (créer, approuver, refuser)"` (+ trailer).

---

### Task 3 : Hook de checkout et snippet Podia étendu

**Files:**
- Modify: `espace/worker/src/index.ts` (route `POST /espace/hooks/checkout`)
- Create: `espace/worker/podia-snippet.html`
- Test: `espace/worker/test/checkout.test.ts`

**Interfaces:**
- Consumes : `recordPurchase`, `attachPurchases` (Task 1), `productFromSlug` (Task 0).
- Produces : route publique `POST /espace/hooks/checkout` — corps `{email, podia_id, page}`, réponse `{ok:true}` toujours (jamais d'erreur visible côté client Podia, spec §13).

- [ ] **Step 1 : Test qui échoue**

```ts
// test/checkout.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

const post = (body: unknown) => app.request('/espace/hooks/checkout', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) }, env);

describe('hook de checkout', () => {
  it('enregistre un achat non rattaché déduit du slug de la page', async () => {
    const r = await post({ email: 'Client@Exemple.com', podia_id: 'pd_1', page: '/vortex-pack/thanks' });
    expect(r.status).toBe(200);
    const row = await env.DB.prepare("SELECT email, product, source, external_ref, user_id FROM purchases WHERE external_ref = 'pd_1'").first<any>();
    expect(row).toMatchObject({ email: 'client@exemple.com', product: 'Vortex Sound Pack', source: 'checkout', user_id: null });
  });

  it('rattache immédiatement si le membre est déjà connu', async () => {
    const u = await mkUser({ display_name: 'V' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('v@e.co', ?, 'oauth')").bind(u).run();
    await post({ email: 'v@e.co', podia_id: 'pd_2', page: '/motionlab/thanks' });
    const row = await env.DB.prepare("SELECT user_id FROM purchases WHERE external_ref = 'pd_2'").first<any>();
    expect(row.user_id).toBe(u);
  });

  it('ignore silencieusement un corps invalide, un produit inconnu, ou un corps trop lourd — jamais d\'erreur visible', async () => {
    expect((await app.request('/espace/hooks/checkout', { method: 'POST', body: 'pas du json' }, env)).status).toBe(200);
    expect((await post({ email: 'x@y.co', page: '/produit-inexistant/thanks' })).status).toBe(200);
    expect((await post({ page: '/motionlab/thanks' })).status).toBe(200); // email absent
    const gros = 'a'.repeat(9000);
    expect((await app.request('/espace/hooks/checkout', { method: 'POST', body: gros }, env)).status).toBe(200);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first<any>();
    expect(n.n).toBe(2); // seuls les deux achats valides des tests précédents
  });
});
```

Run: `npm test -- checkout` — Expected: FAIL (route absente, `export { app }` pas encore utilisé ici — voir Step 2).

- [ ] **Step 2 : Route dans `src/index.ts`** (après les routes existantes, avant les catch-all `/espace/api/*` et `/espace/*`) :

```ts
import { recordPurchase, attachPurchases } from './lib/purchases';
import { productFromSlug } from './lib/products';

app.post('/espace/hooks/checkout', async (c) => {
  try {
    const raw = await c.req.text();
    if (raw.length > 8000) return c.json({ ok: true });
    const body = JSON.parse(raw || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    const product = productFromSlug(String(body.page || ''));
    if (!email || !product) return c.json({ ok: true });
    await recordPurchase(c.env, { email, product, source: 'checkout', purchasedAt: new Date().toISOString(), externalRef: body.podia_id ? String(body.podia_id) : undefined });
    const owner = await c.env.DB.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(email).first<{ user_id: number }>();
    if (owner) await attachPurchases(c.env, owner.user_id);
  } catch (e) {
    console.warn('hook checkout ignoré', (e as Error).message);
  }
  return c.json({ ok: true });
});
```

Le hook répond toujours `200 {ok:true}` (spec §13 : « Hook checkout invalide → 400 silencieux côté Podia (le client n'en voit rien) » — ici on choisit 200 uniforme, plus simple à auditer côté logs Worker sans jamais faire échouer `sendBeacon` côté client).

- [ ] **Step 3 : `podia-snippet.html`** (remplace l'usage de l'ancien snippet MotionLAB-only ; ce fichier vit désormais dans `espace/worker/`, pas dans `MotionLAB/license-worker/`)

```html
<!--
  FemzLab — enregistrement automatique des acheteurs (tous produits).

  OÙ LE COLLER : dans Podia, sur CHAQUE produit vendu → Settings → Analytics
  (« Conversion tracking code », celui qui ne s'exécute QUE sur la page de
  remerciement — jamais le « Website tracking code »). Nécessite un plan
  Podia Mover ou Shaker.

  CE QU'IL FAIT : sur la page de remerciement d'un achat, il lit l'email de
  l'acheteur exposé par Podia et l'envoie à l'espace membre, qui enregistre
  l'achat (badge visible sur le profil et le globe une fois le compte créé —
  aucun accès à un contenu n'est débloqué par ce seul enregistrement).

  POURQUOI sendBeacon : la requête doit survivre à la fermeture de l'onglet, et
  un Blob text/plain évite la requête préalable CORS.
-->
<script>
(function () {
  try {
    if (!window.Podia || !Podia.Conversion || !Podia.Customer) return;
    var email = Podia.Customer.email;
    if (!email) return;
    var payload = JSON.stringify({ email: email, podia_id: Podia.Customer.id, page: location.pathname });
    var url = 'https://www.femzlab.shop/espace/hooks/checkout';
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'text/plain' }));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'text/plain');
      xhr.send(payload);
    }
  } catch (e) {
    // Un achat ne doit jamais échouer à cause de ce script.
  }
})();
</script>
```

- [ ] **Step 4 : Run `npm test -- checkout`** — Expected: PASS (3 tests). Puis `npm test` complet.
- [ ] **Step 5 : Commit** — `git add espace/worker/src/index.ts espace/worker/podia-snippet.html espace/worker/test/checkout.test.ts && git commit -m "espace: hook de checkout public, snippet Podia étendu à tous les produits"` (+ trailer).

---

### Task 4 : Rattachement à la connexion, routes `/api/purchases` et `/api/link-requests`

**Files:**
- Modify: `espace/worker/src/index.ts` (callback OAuth existant + nouvelles routes)
- Test: `espace/worker/test/purchases-routes.test.ts`, modification de `espace/worker/test/oauth.test.ts`

**Interfaces:**
- Consumes : `attachPurchases`, `purchasesFor` (Task 1), `createLinkRequest` (Task 2).
- Produces : `GET /espace/api/purchases` → `{ product, purchased_at }[]` ; `POST /espace/api/link-requests` `{ email }` → `{ ok:true }` ou 400/409 `{ error }` ; `GET /espace/api/link-requests` → `{ status: 'pending'|'aucune' }` (pas d'historique détaillé — suffisant pour l'UI de Task 8).

- [ ] **Step 1 : Rattachement au login — modifier le callback OAuth existant**

Dans `espace/worker/src/index.ts`, repérer `await setSession(c, user.id);` dans `app.get('/espace/auth/:provider/callback', ...)` (Task 3 du socle) et ajouter juste avant, en best-effort :

```ts
  await attachPurchases(c.env, user.id).catch((e) => console.warn('attachPurchases (login) ignoré', (e as Error).message));
  await setSession(c, user.id);
```

- [ ] **Step 2 : Test qui échoue (rattachement à la connexion)** — ajouter à `test/oauth.test.ts`, dans le `describe('OAuth', ...)` existant :

```ts
  it('un achat en attente se rattache automatiquement à la connexion', async () => {
    await env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('nouveau@compte.co', 'Fade Pack', 'import', '2026-01-01')").run();
    mockGoogle({ sub: 'g50', email: 'nouveau@compte.co', email_verified: true, name: 'Nouveau', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    const u = await env.DB.prepare("SELECT id FROM users WHERE display_name = 'Nouveau'").first<any>();
    const p = await env.DB.prepare('SELECT user_id FROM purchases WHERE email = ?').bind('nouveau@compte.co').first<any>();
    expect(p.user_id).toBe(u.id);
  });
```

Run: `npm test -- oauth` — Expected: FAIL (rattachement pas encore branché).

- [ ] **Step 3 : Test qui échoue (nouvelles routes)**

```ts
// test/purchases-routes.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

describe('/api/purchases et /api/link-requests', () => {
  it('/api/purchases : 401 sans session, liste triée avec session', async () => {
    expect((await app.request('/espace/api/purchases', {}, env)).status).toBe(401);
    const u = await mkUser();
    await env.DB.prepare("INSERT INTO purchases (email, product, user_id, source, purchased_at) VALUES ('z@z.co', 'MetaVision', ?, 'checkout', '2026-01-01')").bind(u).run();
    const list: any[] = await (await app.request('/espace/api/purchases', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(list).toEqual([{ product: 'MetaVision', purchased_at: '2026-01-01' }]);
  });

  it('/api/link-requests : POST crée, GET reflète l\'état, email invalide → 400', async () => {
    const u = await mkUser();
    const anonyme = (email: string) => app.request('/espace/api/link-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }, env);
    const withAuth = async (email: string) => app.request('/espace/api/link-requests', { method: 'POST', headers: { Cookie: await cookieFor(u), 'content-type': 'application/json' }, body: JSON.stringify({ email }) }, env);
    expect((await anonyme('a@b.co')).status).toBe(401);
    expect((await withAuth('pas-un-email')).status).toBe(400);
    expect((await withAuth('ok@mail.co')).status).toBe(200);
    const etat: any = await (await app.request('/espace/api/link-requests', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(etat).toEqual({ status: 'pending' });
    expect((await withAuth('deux@mail.co')).status).toBe(409);
  });
});
```

Run: `npm test -- purchases-routes` — Expected: FAIL (routes absentes).

- [ ] **Step 4 : Routes dans `src/index.ts`** (avec les autres routes `/espace/api/*` session)

```ts
import { purchasesFor } from './lib/purchases';
import { createLinkRequest } from './lib/link-requests';

app.get('/espace/api/purchases', requireAuth, async (c) => c.json(await purchasesFor(c.env, c.get('user').id)));

app.post('/espace/api/link-requests', requireAuth, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  const r = await createLinkRequest(c.env, c.get('user').id, String(b.email || ''));
  if ('error' in r) {
    const status = r.error === 'email_invalide' ? 400 : r.error === 'demande_en_attente' ? 409 : 409;
    return c.json({ error: r.error }, status);
  }
  return c.json({ ok: true });
});

app.get('/espace/api/link-requests', requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT id FROM link_requests WHERE user_id = ? AND status = 'pending'").bind(c.get('user').id).first();
  return c.json({ status: row ? 'pending' : 'aucune' });
});
```

- [ ] **Step 5 : Run `npm test -- oauth purchases-routes`** — Expected: PASS. Puis `npm test` complet.
- [ ] **Step 6 : Commit** — `git add espace/worker/src/index.ts espace/worker/test/oauth.test.ts espace/worker/test/purchases-routes.test.ts && git commit -m "espace: rattachement des achats à la connexion, routes purchases et link-requests"` (+ trailer).

---

### Task 5 : Routes publiques Approuver / Refuser

**Files:**
- Modify: `espace/worker/src/index.ts`
- Test: `espace/worker/test/link-decide-routes.test.ts`

**Interfaces:**
- Consumes : `decideLinkRequest` (Task 2).
- Produces : `GET /espace/admin/link/:token/approve`, `GET /espace/admin/link/:token/deny` — pages HTML minimales (pas de session requise, cliquées depuis un client mail).

- [ ] **Step 1 : Test qui échoue**

```ts
// test/link-decide-routes.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser } from './helpers';
import { createLinkRequest } from '../src/lib/link-requests';

async function tokenFor(userId: number, email: string): Promise<string> {
  const fake = { send: async (m: any) => { (globalThis as any).__lastHtml = m.html; } };
  await createLinkRequest({ ...env, EMAIL: fake as any }, userId, email);
  return (globalThis as any).__lastHtml.match(/\/espace\/admin\/link\/([a-f0-9]+)\//)[1];
}

describe('routes approve/deny', () => {
  it('approve : 200, page de confirmation, rattache ; un second clic dit "déjà traité"', async () => {
    const u = await mkUser({ display_name: 'Q' });
    const token = await tokenFor(u, 'q@ok.co');
    const r1 = await app.request(`/espace/admin/link/${token}/approve`, {}, env);
    expect(r1.status).toBe(200);
    expect(await r1.text()).toContain('approuvée');
    const row = await env.DB.prepare("SELECT verified_by FROM user_emails WHERE email = 'q@ok.co'").first<any>();
    expect(row.verified_by).toBe('admin');
    const r2 = await app.request(`/espace/admin/link/${token}/approve`, {}, env);
    expect(r2.status).toBe(200);
    expect(await r2.text()).toContain('déjà');
  });
  it('deny : 200, page de confirmation, ne crée pas de user_emails', async () => {
    const u = await mkUser();
    const token = await tokenFor(u, 'r@ok.co');
    const r = await app.request(`/espace/admin/link/${token}/deny`, {}, env);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('refusée');
    expect(await env.DB.prepare("SELECT 1 FROM user_emails WHERE email = 'r@ok.co'").first()).toBeNull();
  });
  it('jeton introuvable → page d\'erreur, toujours 200 (lien déjà cliqué ou expiré)', async () => {
    const r = await app.request(`/espace/admin/link/${'0'.repeat(48)}/approve`, {}, env);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('introuvable');
  });
});
```

Run: `npm test -- link-decide-routes` — Expected: FAIL (routes absentes).

- [ ] **Step 2 : Routes dans `src/index.ts`**

```ts
import { decideLinkRequest } from './lib/link-requests';

function pageDecision(titre: string, corps: string) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${titre}</title>
<body style="font:16px system-ui;background:#0B0C0F;color:#E7E9EE;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center;max-width:480px;padding:24px"><h1 style="font-size:20px">${titre}</h1><p>${corps}</p></div></body></html>`;
}

app.get('/espace/admin/link/:token/:decision{approve|deny}', async (c) => {
  const decision = c.req.param('decision') === 'approve' ? 'approved' : 'denied';
  const r = await decideLinkRequest(c.env, c.req.param('token'), decision);
  if ('error' in r) {
    const messages: Record<string, string> = { introuvable: 'Lien introuvable ou déjà utilisé.', deja_traite: 'Cette demande a déjà été traitée.', expire: 'Ce lien a expiré (30 jours).' };
    return c.html(pageDecision('Lien introuvable', messages[r.error] || 'Une erreur est survenue.'));
  }
  return c.html(pageDecision(decision === 'approved' ? 'Liaison approuvée' : 'Demande refusée',
    decision === 'approved' ? `${r.email} est désormais rattachée au membre #${r.userId}, ses achats connus sont rattachés.` : `${r.email} n'a pas été rattachée.`));
});
```

Hono route pattern `:decision{approve|deny}` contraint le segment aux deux valeurs attendues (404 sinon, comportement par défaut de Hono pour un motif non satisfait).

- [ ] **Step 3 : Run `npm test -- link-decide-routes`** — Expected: PASS (3 tests). Puis `npm test` complet.
- [ ] **Step 4 : Commit** — `git add espace/worker/src/index.ts espace/worker/test/link-decide-routes.test.ts && git commit -m "espace: pages Approuver/Refuser cliquées depuis l'email à Femz"` (+ trailer).

---

### Task 6 : Badges sur `/creators`

**Files:**
- Modify: `espace/worker/src/lib/users.ts` (fonction `creatorsList`)
- Test: `espace/worker/test/profile.test.ts` (ajout)

**Interfaces:**
- Consumes : `badgesForMany` (Task 1).
- Produces : `creatorsList` inchangée dans sa signature, `badges: string[]` désormais rempli (au lieu du tableau vide codé en dur depuis le socle).

- [ ] **Step 1 : Test qui échoue** — ajouter dans `test/profile.test.ts`, au `describe('profil & globe', ...)` existant :

```ts
  it('/creators porte les badges dérivés des achats rattachés', async () => {
    const v = await mkUser({ display_name: 'Vue', visible: 1, city: 'Cannes' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('vue2@e.co', ?, 'oauth')").bind(v).run();
    await env.DB.prepare("INSERT INTO purchases (email, product, user_id, source, purchased_at) VALUES ('vue2@e.co', 'MotionLAB', ?, 'checkout', '2026-01-01')").bind(v).run();
    const a = await mkUser();
    const list: any[] = await (await app.request('/espace/api/creators', { headers: { Cookie: await cookieFor(a) } }, env)).json();
    expect(list.find((x) => x.display_name === 'Vue').badges).toEqual(['MotionLAB']);
  });
```

(`test/profile.test.ts` importe déjà `import { app } from '../src/index'` et `mkUser`/`cookieFor` depuis `./helpers` — mêmes imports que Task 4, rien à ajouter.)

Run: `npm test -- profile` — Expected: FAIL (badges toujours `[]`).

- [ ] **Step 2 : Modifier `creatorsList` dans `src/lib/users.ts`**

```ts
import { badgesForMany } from './purchases';

export async function creatorsList(env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM users WHERE revoked = 0 AND deleted_at IS NULL ORDER BY founder DESC, id ASC').all<User>();
  const visibles = results.filter((u) => u.visible && u.display_name);
  const badges = await badgesForMany(env, visibles.map((u) => u.id));
  return results.map((u) => {
    if (!u.visible || !u.display_name) return anonPoint(u);
    const out: any = {
      id: u.id, display_name: u.display_name, city: u.city || u.country || '',
      socials: parseJson(u.socials, {}), founder: !!u.founder, dms_open: !!u.dms_open,
      reels: (parseJson(u.reels, []) as any[]).filter((r) => r.url || r.thumb_key).map((r) => ({ url: r.url || '', thumb: mediaUrl(r.thumb_key || null) })),
      badges: badges.get(u.id) || [],
    };
    if (u.lat != null && u.lon != null) { out.lat = u.lat; out.lon = u.lon; }
    if (u.avatar_key) out.avatar = mediaUrl(u.avatar_key);
    return out;
  });
}
```

(Seule la ligne `badges: [] as string[]` devient `badges: badges.get(u.id) || []`, plus le calcul de `badges` en une requête groupée avant la boucle — pas de N+1.)

- [ ] **Step 3 : Run `npm test -- profile`** — Expected: PASS. Puis `npm test` complet.
- [ ] **Step 4 : Commit** — `git add espace/worker/src/lib/users.ts espace/worker/test/profile.test.ts && git commit -m "espace: badges dérivés des achats sur /creators"` (+ trailer).

---

### Task 7 : Import admin (API) et script local

**Files:**
- Modify: `espace/worker/src/index.ts`
- Create: `espace/worker/scripts/import-purchases.mjs`
- Test: `espace/worker/test/import.test.ts`

**Interfaces:**
- Consumes : `recordPurchase`, `attachPurchases` (Task 1), `requireFounder` (socle).
- Produces : `POST /espace/api/admin/purchases/import` (founder) — corps `{ product: string, rows: { email: string; purchased_at: string }[] }` → `{ inserted: number, attached: number, rejetees: number }`. Pas d'UI (Phase 5) : Femz invoque via le script Node de ce Task, en local, une fois qu'il a exporté un CSV depuis Podia.

- [ ] **Step 1 : Test qui échoue**

```ts
// test/import.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

describe('import admin des achats', () => {
  it('403 si non fondateur, 401 sans session', async () => {
    const membre = await mkUser();
    const body = JSON.stringify({ product: 'MetaVision', rows: [{ email: 'x@y.co', purchased_at: '2026-01-01' }] });
    expect((await app.request('/espace/api/admin/purchases/import', { method: 'POST', body }, env)).status).toBe(401);
    expect((await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { Cookie: await cookieFor(membre) }, body }, env)).status).toBe(403);
  });

  it('importe, rattache ce qui correspond déjà, idempotent au second passage, rejette les lignes invalides', async () => {
    const fondateur = await mkUser({ founder: 1 });
    const dejaMembre = await mkUser();
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('deja@e.co', ?, 'oauth')").bind(dejaMembre).run();
    const body = JSON.stringify({
      product: 'MetaVision',
      rows: [
        { email: 'nouveau@e.co', purchased_at: '2026-01-01' },
        { email: 'deja@e.co', purchased_at: '2026-01-02' },
        { email: 'pas-un-email', purchased_at: '2026-01-03' },
      ],
    });
    const r1: any = await (await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { Cookie: await cookieFor(fondateur), 'content-type': 'application/json' }, body }, env)).json();
    expect(r1).toEqual({ inserted: 2, attached: 1, rejetees: 1 });
    const p = await env.DB.prepare("SELECT user_id FROM purchases WHERE email = 'deja@e.co'").first<any>();
    expect(p.user_id).toBe(dejaMembre);

    const r2: any = await (await app.request('/espace/api/admin/purchases/import', { method: 'POST', headers: { Cookie: await cookieFor(fondateur), 'content-type': 'application/json' }, body }, env)).json();
    expect(r2.inserted).toBe(0); // même (email, produit, date) déjà présent
  });
});
```

Run: `npm test -- import` — Expected: FAIL (route absente).

- [ ] **Step 2 : Route dans `src/index.ts`**

```ts
app.post('/espace/api/admin/purchases/import', requireAuth, requireFounder, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  const product = String(b.product || '');
  const rows: any[] = Array.isArray(b.rows) ? b.rows : [];
  let inserted = 0, attached = 0, rejetees = 0;
  for (const row of rows) {
    const email = String(row?.email || '').trim().toLowerCase();
    const purchasedAt = String(row?.purchased_at || '').trim();
    if (!product || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !purchasedAt) { rejetees++; continue; }
    const { inserted: ok } = await recordPurchase(c.env, { email, product, source: 'import', purchasedAt });
    if (ok) inserted++;
    const owner = await c.env.DB.prepare('SELECT user_id FROM user_emails WHERE email = ?').bind(email).first<{ user_id: number }>();
    if (owner && ok) { await attachPurchases(c.env, owner.user_id); attached++; }
  }
  return c.json({ inserted, attached, rejetees });
});
```

- [ ] **Step 3 : Script local `scripts/import-purchases.mjs`** (Node ≥ 18, aucune dépendance)

```js
#!/usr/bin/env node
// Usage : node scripts/import-purchases.mjs <fichier.csv> "<Nom canonique du produit>"
// Le CSV attend deux colonnes avec en-tête : email,purchased_at (AAAA-MM-JJ)
// Exporté à la main depuis le CSV de ventes Podia (colonnes Email / Purchased At).
import { readFileSync } from 'node:fs';

const [, , fichier, produit] = process.argv;
if (!fichier || !produit) { console.error('Usage: node scripts/import-purchases.mjs <fichier.csv> "<Produit canonique>"'); process.exit(1); }

const lignes = readFileSync(fichier, 'utf8').trim().split('\n').slice(1); // ignore l'en-tête
const rows = lignes.map((l) => { const [email, purchased_at] = l.split(',').map((s) => s.trim()); return { email, purchased_at }; }).filter((r) => r.email);

const res = await fetch('https://www.femzlab.shop/espace/api/admin/purchases/import', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `fz_session=${process.env.FZ_SESSION}` },
  body: JSON.stringify({ product: produit, rows }),
});
console.log(res.status, await res.json());
```

`FZ_SESSION` : Femz récupère la valeur de son cookie `__Host-fz_session` depuis les DevTools de son navigateur (déjà connecté sur `/espace`), et la passe en variable d'environnement au script — aucun identifiant n'est jamais écrit dans un fichier.

- [ ] **Step 4 : Run `npm test -- import`** — Expected: PASS (2 tests). Puis `npm test` complet — Expected: tous verts.
- [ ] **Step 5 : Commit** — `git add espace/worker/src/index.ts espace/worker/scripts/import-purchases.mjs espace/worker/test/import.test.ts && git commit -m "espace: import admin des achats (API + script local, sans interface — Phase 5)"` (+ trailer).

---

### Task 8 : Front — carte « Mes produits » et « Relier une autre adresse »

**Files:**
- Create: `espace/web/src/lib/purchases.ts`
- Modify: `espace/web/src/components/ProfilePanel.tsx`
- Modify: `espace/web/public/i18n.js` (nouvelles chaînes)

**Interfaces:**
- Consumes : `API`, `apiJson` de `../lib/api`.
- Produces : `getPurchases(): Promise<{product:string; purchased_at:string}[]>`, `getLinkStatus(): Promise<'pending'|'aucune'>`, `submitLinkRequest(email: string): Promise<void>` (lève avec le message serveur en cas d'erreur, comme `apiJson` le fait déjà pour le reste de l'app).

- [ ] **Step 1 : `espace/web/src/lib/purchases.ts`**

```ts
import { API, apiJson } from './api';

export type Purchase = { product: string; purchased_at: string };
export type LinkStatus = 'pending' | 'aucune';

export const getPurchases = () => apiJson<Purchase[]>(`${API}/purchases`);
export const getLinkStatus = () => apiJson<{ status: LinkStatus }>(`${API}/link-requests`).then((r) => r.status);
export const submitLinkRequest = (email: string) => apiJson<{ ok: true }>(`${API}/link-requests`, { method: 'POST', body: JSON.stringify({ email }) });
```

- [ ] **Step 2 : `ProfilePanel.tsx`** — ajouter l'état, le chargement, et les deux blocs UI. Modifier les imports en tête de fichier :

```ts
import { getPurchases, getLinkStatus, submitLinkRequest, type Purchase } from '../lib/purchases';
```

Ajouter, avec les autres `useState` :

```ts
  const [produits, setProduits] = useState<Purchase[]>([]);
  const [lienStatut, setLienStatut] = useState<'pending' | 'aucune' | null>(null);
  const [lienEmail, setLienEmail] = useState('');
  const [lienMsg, setLienMsg] = useState('');
```

Ajouter, avec le `useEffect` existant (`profileStore.subscribe(...)`) :

```ts
  useEffect(() => { getPurchases().then(setProduits).catch(() => {}); getLinkStatus().then(setLienStatut).catch(() => {}); }, []);
```

Ajouter la fonction d'envoi, à côté de `save`/`toggle` :

```ts
  async function envoyerLiaison() {
    setLienMsg('');
    try { await submitLinkRequest(lienEmail); setLienStatut('pending'); setLienEmail(''); }
    catch (e: any) { setLienMsg(e.message); }
  }
```

Insérer la carte « Mes produits » juste après le bloc `.pf-reels` (avant `.pf-privacy`) :

```tsx
      <div className="pf-products">
        <span className="pf-sub">Mes produits</span>
        {produits.length === 0 && <p className="pf-sub" style={{ opacity: .7 }}>Aucun produit rattaché pour l'instant.</p>}
        {produits.map((p) => (
          <a key={p.product} className="pf-badge" href="https://www.femzlab.shop" target="_blank" rel="noopener">{p.product}</a>
        ))}
      </div>
```

Insérer le bloc « Relier une autre adresse » à la fin de `.pf-privacy`, juste avant la fermeture de cette `<div>` (après le paragraphe « Connexions : … ») :

```tsx
        {lienStatut === 'pending' ? (
          <p className="pf-sub" style={{ marginTop: 10 }}>Demande de liaison envoyée — en attente de validation par Femz.</p>
        ) : (
          <div className="pf-link-row" style={{ marginTop: 10 }}>
            <input type="email" placeholder="Email utilisé pour l'achat" value={lienEmail} onChange={(e) => setLienEmail(e.target.value)} />
            <button className="btn" type="button" onClick={() => void envoyerLiaison()}>Relier une autre adresse</button>
          </div>
        )}
        {lienMsg && <p className="login-err" role="alert">{lienMsg}</p>}
```

- [ ] **Step 3 : CSS minimal** — ajouter en fin d'`espace/web/src/index.css` :

```css
.pf-products{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.pf-badge{display:inline-block;align-self:flex-start;padding:5px 12px;border-radius:999px;background:rgba(94,162,255,.14);color:#5EA2FF;font-size:12.5px;font-weight:600;text-decoration:none}
.pf-link-row{display:flex;gap:8px;flex-wrap:wrap}
.pf-link-row input{flex:1;min-width:180px}
```

- [ ] **Step 4 : `public/i18n.js`** — ajouter au `DICT`, section « Profile panel » :

```js
    "Mes produits": "My products",
    "Aucun produit rattaché pour l'instant.": "No product linked yet.",
    "Email utilisé pour l'achat": "Email used for the purchase",
    "Relier une autre adresse": "Link another address",
    "Demande de liaison envoyée — en attente de validation par Femz.": "Link request sent — waiting for Femz to review it.",
```

- [ ] **Step 5 : Vérifier** — `cd espace/web && npx tsc --noEmit` (0 erreur) puis `npm run build` (OK).
- [ ] **Step 6 : Commit** — `git add espace/web/src/lib/purchases.ts espace/web/src/components/ProfilePanel.tsx espace/web/src/index.css espace/web/public/i18n.js && git commit -m "espace(web): carte Mes produits et Relier une autre adresse dans le profil"` (+ trailer).

---

### Task 9 : Déploiement, snippet sur tous les produits, import réel

**Files:**
- Modify: `espace/worker/DEPLOY.md`

**Interfaces:** aucune (opérationnel).

- [ ] **Step 1 : Migration distante** — `cd espace/worker && npm run migrate:remote`, vérifier :

```bash
npx wrangler d1 execute femzlab-espace-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

→ `blocks, d1_migrations, dms, identities, link_requests, purchases, rate_events, user_emails, users` (+ tables internes).

- [ ] **Step 2 : Déployer** — `npm run deploy`. Vérifier :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.femzlab.shop/espace/hooks/checkout --data '{}'   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://www.femzlab.shop/espace/api/purchases                       # 401
curl -s -o /dev/null -w "%{http_code}\n" https://www.femzlab.shop/espace/admin/link/0000/approve             # 200 (page « introuvable »)
```

- [ ] **Step 3 : Pré-requis Femz — coller le nouveau snippet sur CHAQUE produit** — dans Podia, pour `motionlab`, `metavision`, `fade-pack`, `ghost-fx-preset-after-effects`, `sfx-whoosh-pack`, `ultimate-ios-pack`, `vortex-pack` : Settings → Analytics → « Conversion tracking code » → coller le contenu de `espace/worker/podia-snippet.html`. **Retirer l'ancien snippet MotionLAB-only** (`MotionLAB/license-worker/podia-snippet.html`) de la page MotionLAB s'il y est encore, pour ne pas poster deux fois (sans risque de doublon métier — `UNIQUE(email,product,purchased_at)` et le service de licences restent indépendants — mais deux requêtes réseau pour rien).
- [ ] **Step 4 : Import réel des acheteurs existants** — Femz exporte, depuis Podia (par produit) : Students/Customers → Export CSV. Pour chaque export : ouvrir le CSV, garder les colonnes email + date d'achat, les mettre au format `email,purchased_at` (AAAA-MM-JJ) attendu par le script. Puis, depuis `espace/worker` :

```bash
FZ_SESSION=<valeur du cookie __Host-fz_session, copiée depuis les DevTools> \
  node scripts/import-purchases.mjs metavision.csv "MetaVision"
FZ_SESSION=<idem> node scripts/import-purchases.mjs motionlab.csv "MotionLAB"
```

Vérifier ensuite dans l'app (`/espace/` → profil) que les badges apparaissent pour les membres déjà connectés qui figuraient dans ces exports.

- [ ] **Step 5 : `DEPLOY.md`** — ajouter une section « Achats (Plan 2) » couvrant les étapes 1 à 4 ci-dessus, à la suite des sections existantes.
- [ ] **Step 6 : Commit** — `git add espace/worker/DEPLOY.md && git commit -m "espace: documente le déploiement des achats (snippet, import initial)"` (+ trailer).

---

## Auto-revue du plan

- **Couverture de la spec** : §4.2 achats (Task 0, 1, 3, 7, 9) · §4.3 email différent (Task 2, 4, 5) · §5 modèle `purchases`/`link_requests` (Task 0) · §6 images : inchangé, hors périmètre de ce plan · §7 API : `hooks/checkout`, `api/purchases`, `api/link-requests`, `admin/link/:token/*`, `api/admin/purchases/import` tous couverts (Tasks 3-7) ; `api/admin/*` plus large (membres, signalements) reste Phase 5 comme prévu · §8 carte « Mes produits » (Task 8) · §12 sécurité (hook ≤8 Ko toujours 200, jeton haché à usage unique, conflit signalé) (Task 2, 3, 5) · §13 erreurs (hook toujours 200 ; import ligne par ligne rejetée/comptée) (Task 3, 7) · §14 tests : OAuth+achat testé (Task 4), rattachement par import/approbation testé (Task 1, 2, 7) ; le parcours Playwright complet (bouton « Relier une adresse » en conditions réelles) n'est pas repris dans ce plan — mineur, à faire manuellement par Femz après déploiement (Task 9 Step 4 sert de vérification de fait) · §15 phase 3 : couverte en totalité.
  Non couvert intentionnellement (Phase 4-5, hors périmètre déclaré en tête de ce plan) : `espace-entree.html`, onglet Admin de l'app (import CSV en ligne, gestion des membres, signalements), `/espace/api/export`, `DELETE /espace/api/account`.
- **Placeholders** : aucun — chaque étape a son code complet. Le seul répertoire non fourni littéralement est le CSV réel des acheteurs (données personnelles, jamais dans un fichier versionné) : la Task 9 documente la procédure sans les données.
- **Cohérence des noms** : `recordPurchase`/`attachPurchases`/`purchasesFor`/`badgesForMany` (Task 1) réutilisés identiquement dans Tasks 3, 4, 6, 7 ; `createLinkRequest`/`decideLinkRequest` (Task 2) réutilisés dans Tasks 4, 5 avec la même forme de retour (`{error}` ou objet de succès) ; `productFromSlug`/`productFromPodiaName` (Task 0) consommés respectivement par Task 3 (hook) et Task 7 (import) ; le type `Purchase` du front (Task 8) correspond exactement à la forme JSON rendue par `purchasesFor` (Task 1) via la route de Task 4.
