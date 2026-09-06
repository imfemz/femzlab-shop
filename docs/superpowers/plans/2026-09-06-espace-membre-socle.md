# Espace membre — Plan 1 : le socle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en ligne `femzlab.shop/espace` : connexion Google/Discord, profil persistant (D1 + R2), consentement, globe, messagerie privée, sauvegarde nocturne — Femz premier membre.

**Architecture:** Un Worker Cloudflare `femzlab-espace` (Hono + D1 + R2) monté sur la route `femzlab.shop/espace*`, qui sert l'API sous `/espace/api|auth|media` et l'app React existante (Vite `base:'/espace/'`, Workers Static Assets). Le code est copié depuis `neovision-platform/` dans `femzlab-shop-front/espace/` ; la logique métier de juillet est conservée, le mode démo `localStorage` supprimé, l'authentification passe de « liens magiques » à OAuth.

**Tech Stack:** Cloudflare Workers (wrangler 4), Hono 4.6, D1 (migrations), R2, Workers Static Assets, Vitest + `@cloudflare/vitest-pool-workers`, React 18 + Vite 5 + TypeScript + Tailwind, d3-geo, GSAP, Playwright pour la vérification navigateur.

**Spec:** `docs/superpowers/specs/2026-09-06-espace-membre-design.md` (sections 3 à 8, 11 à 14 ; les achats §4.2-4.3, les entrées §9 et l'admin §10 sont les Plans 2 et 3).

## Global Constraints

- Le site est l'identité ; Podia = caisse + cours. Aucune création de compte Podia depuis le site.
- Connexion **Google ou Discord uniquement**. Email exigé **vérifié** par le fournisseur. Pas d'email de connexion, pas de mot de passe.
- Tout état de profil vit côté serveur (D1 + R2). **Aucun repli `localStorage`** : backend injoignable ⇒ écran d'erreur explicite.
- Cookie `fz_session` : JWT HS256, 7 jours, `httpOnly`, `SameSite=Lax`, `Secure` en production, `Path=/`, `Domain=femzlab.shop` en production.
- Route Worker `femzlab.shop/espace*` et `www.femzlab.shop/espace*` ; l'apex redirige vers `www` pour `/espace`.
- Consentement : `visible` et `dms_open` **à 0 par défaut** ; non-consentant = point anonyme au niveau du pays, non cliquable ; `/espace/api/creators` **ne contient jamais d'email** (test regex).
- Uploads : ≤ 2 Mo, type vérifié par signature binaire (PNG/JPEG/WebP), 1 avatar + 3 vignettes de reels, clés R2 `avatars/<user_id>/<sha>.<ext>` et `reels/<user_id>/<n>-<sha>.<ext>`, aucune image en base.
- DM : 2 000 caractères max, **30 messages / 10 min / membre comptés en base** (`rate_events`), refus si `dms_open = 0` ou blocage dans un sens ou l'autre.
- DA : `neovision-platform/WEBDESIGN.md` (sombre, accent `#5EA2FF`, Instrument Sans, **zéro emoji, zéro monospace**). Textes FR, `i18n.js` pour l'EN.
- Fondateur = premier compte dont l'email ∈ `OWNER_EMAILS` (`fraps81@gmail.com,hello@imfemz.com`).
- Sauvegarde : cron `0 3 * * *` → `backups/AAAA-MM-JJ.json` dans R2, rétention 90 jours.
- Commits : messages en français, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` en dernière ligne. Une autre session Claude travaille dans `femzlab-shop-front` : toujours `git status` avant de committer et **ne stager que ses propres fichiers**.

---

## Structure des fichiers

```
femzlab-shop-front/espace/
├── worker/
│   ├── wrangler.jsonc            routes, D1, R2, assets, cron, vars
│   ├── package.json              hono, wrangler, vitest, pool-workers
│   ├── vitest.config.ts          pool Workers + migrations D1 en test
│   ├── migrations/0001_socle.sql users, identities, user_emails, dms, blocks, rate_events
│   ├── src/env.ts                type Env (bindings + vars + secrets)
│   ├── src/index.ts              assemblage Hono, routes, assets, scheduled
│   ├── src/lib/session.ts        JWT cookie, requireAuth, requireFounder
│   ├── src/lib/oauth.ts          Google / Discord : URL, échange, profil normalisé
│   ├── src/lib/users.ts          findOrCreateFromIdentity, profil, consentement, créateurs
│   ├── src/lib/media.ts          sniff image, R2 put/get/delete
│   ├── src/lib/dms.ts            conversations, envoi, lecture, blocages, débit
│   ├── src/lib/backup.ts         copie JSON nocturne → R2
│   ├── src/lib/geocode.ts        (copié) ville → lat/lon
│   ├── src/lib/welcome.ts        (copié, texte FemzLab) DM de bienvenue
│   ├── src/data/cities.json      (copié)
│   └── test/…                    helpers + un fichier de test par lib
└── web/                          (copié de neovision-platform/web, rebasé /espace/)
    ├── vite.config.ts            base '/espace/', proxy vers :8788
    ├── index.html                titre, chemins /espace/
    ├── public/…                  (copié : geojson, cities, logos, fonts, i18n.js)
    └── src/
        ├── main.tsx              bootstrap sans mode démo
        ├── App.tsx               Login | Error | Espace
        ├── lib/api.ts            état de session (anon/auth/error), préfixe /espace/api
        ├── lib/profile.ts        store profil (API seule)
        ├── lib/dm.ts             store DM (API seule)
        ├── lib/creators.ts       liste du globe (API seule)
        ├── components/Login.tsx  NOUVEAU : 2 boutons + compteur
        ├── components/ErrorScreen.tsx NOUVEAU
        ├── components/ProfilePanel.tsx NOUVEAU : sorti de CardNav
        ├── components/CardNav.tsx allégé (menu, messages, avatar)
        ├── components/ConsentModal.tsx toggles OFF par défaut
        └── components/GlobeSection.tsx chemins /espace/
```

---

### Task 0 : Copier le code, créer les ressources Cloudflare, installer l'outillage de test

**Files:**
- Create: `femzlab-shop-front/espace/worker/{wrangler.jsonc,package.json,vitest.config.ts,.gitignore,src/env.ts,test/apply-migrations.ts,test/smoke.test.ts}`
- Create (copie) : `femzlab-shop-front/espace/worker/src/lib/{geocode.ts,welcome.ts}`, `src/data/cities.json`, `femzlab-shop-front/espace/web/` (tout `neovision-platform/web` sauf `node_modules`, `dist`, `captures`)
- Create: `femzlab-shop-front/espace/web/dist/index.html` (fichier minimal pour que le binding assets existe avant le vrai build)

**Interfaces:**
- Produces: `Env` (`src/env.ts`) utilisé par toutes les libs ; `npm test` (vitest) ; base D1 `femzlab-espace-db` et bucket `femzlab-espace-media` créés sur le compte.

- [ ] **Step 1 : Copier depuis neovision-platform**

```bash
cd /Users/femz/Documents/FemzLAB/EDITOR/femzlab-shop-front
mkdir -p espace/worker/src/lib espace/worker/src/data espace/worker/test espace/worker/migrations
rsync -a --exclude node_modules --exclude dist --exclude captures --exclude .DS_Store \
  ../neovision-platform/web/ espace/web/
cp ../neovision-platform/worker/src/lib/geocode.ts espace/worker/src/lib/geocode.ts
cp ../neovision-platform/worker/src/lib/welcome.ts espace/worker/src/lib/welcome.ts
cp ../neovision-platform/worker/src/data/cities.json espace/worker/src/data/cities.json
mkdir -p espace/web/dist && printf '<!doctype html><title>build manquant</title>' > espace/web/dist/index.html
ls espace/web/src/components | wc -l   # attendu : 13
```

- [ ] **Step 2 : Créer la base D1 et le bucket R2 (le compte wrangler est déjà connecté)**

```bash
cd espace/worker
npx wrangler d1 create femzlab-espace-db      # copier le database_id affiché
npx wrangler r2 bucket create femzlab-espace-media
```

- [ ] **Step 3 : Écrire `wrangler.jsonc`** (remplacer `DATABASE_ID` par la valeur de l'étape 2)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "femzlab-espace",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "routes": [
    { "pattern": "femzlab.shop/espace*", "zone_name": "femzlab.shop" },
    { "pattern": "www.femzlab.shop/espace*", "zone_name": "femzlab.shop" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_name": "femzlab-espace-db", "database_id": "DATABASE_ID", "migrations_dir": "migrations" }
  ],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "femzlab-espace-media" }],
  "assets": {
    "directory": "../web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  },
  "triggers": { "crons": ["0 3 * * *"] },
  "vars": {
    "APP_URL": "https://www.femzlab.shop/espace",
    "ENV": "production",
    "OWNER_EMAILS": "fraps81@gmail.com,hello@imfemz.com",
    "COOKIE_DOMAIN": "femzlab.shop"
  }
}
```

- [ ] **Step 4 : `package.json`, `.gitignore`, `.dev.vars`**

```json
{
  "name": "femzlab-espace",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev --local --port 8788",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate:local": "wrangler d1 migrations apply femzlab-espace-db --local",
    "migrate:remote": "wrangler d1 migrations apply femzlab-espace-db --remote",
    "deploy": "npm --prefix ../web run build && wrangler deploy"
  },
  "dependencies": { "hono": "^4.6.14" },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^4.111.0"
  }
}
```

`.gitignore` :
```
node_modules/
.wrangler/
.dev.vars
```

`.dev.vars` (local uniquement, jamais commité ; valeurs de dev, l'OAuth réel se teste en prod) :
```
JWT_SECRET=dev-secret-change-me
ENV=development
GOOGLE_CLIENT_ID=dev
GOOGLE_CLIENT_SECRET=dev
DISCORD_CLIENT_ID=dev
DISCORD_CLIENT_SECRET=dev
```

Puis `npm install`.

- [ ] **Step 5 : `src/env.ts`**

```ts
export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  APP_URL: string;
  ENV: string;
  OWNER_EMAILS: string;
  COOKIE_DOMAIN?: string;
};
export type User = {
  id: number; created_at: string; display_name: string | null; name: string | null;
  avatar_key: string | null; country: string | null; city: string | null;
  lat: number | null; lon: number | null; socials: string | null; reels: string | null;
  lang: string | null; founder: number; visible: number; dms_open: number;
  consented_at: string | null; revoked: number; deleted_at: string | null;
};
export type Vars = { user: User };
```

- [ ] **Step 6 : `vitest.config.ts` et `test/apply-migrations.ts`**

```ts
// vitest.config.ts
import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              JWT_SECRET: 'test-secret',
              ENV: 'test',
              GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret',
              DISCORD_CLIENT_ID: 'did', DISCORD_CLIENT_SECRET: 'dsecret',
              APP_URL: 'http://localhost/espace',
              OWNER_EMAILS: 'fraps81@gmail.com,hello@imfemz.com',
            },
          },
        },
      },
    },
  };
});
```

```ts
// test/apply-migrations.ts
import { applyD1Migrations, env } from 'cloudflare:test';
declare module 'cloudflare:test' {
  interface ProvidedEnv { TEST_MIGRATIONS: D1Migration[]; DB: D1Database; MEDIA: R2Bucket; JWT_SECRET: string; ENV: string; APP_URL: string; OWNER_EMAILS: string; ASSETS: Fetcher; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; DISCORD_CLIENT_ID: string; DISCORD_CLIENT_SECRET: string; }
}
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 7 : Migration vide + test de fumée** (la vraie migration arrive en Task 1 ; ici on prouve que l'outillage tourne)

`migrations/0001_socle.sql` : une ligne `-- socle (rempli en Task 1)`.

```ts
// test/smoke.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('outillage', () => {
  it('D1 et R2 répondent', async () => {
    const r = await env.DB.prepare('SELECT 1 AS un').first<{ un: number }>();
    expect(r?.un).toBe(1);
    await env.MEDIA.put('t/x.txt', 'ok');
    expect(await (await env.MEDIA.get('t/x.txt'))?.text()).toBe('ok');
  });
});
```

Un `src/index.ts` minimal pour que le pool démarre :
```ts
export default { fetch: () => new Response('socle') };
```

Run: `npm test` — Expected: 1 test PASS.

- [ ] **Step 8 : Commit** (uniquement `espace/`)

```bash
cd /Users/femz/Documents/FemzLAB/EDITOR/femzlab-shop-front
git status --short   # ne stager que espace/
git add espace && git commit -m "espace: socle du Worker femzlab-espace — copie du front NéoVision, D1/R2 créés, vitest branché

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1 : Migration 0001 — le schéma du socle

**Files:**
- Modify: `espace/worker/migrations/0001_socle.sql`
- Test: `espace/worker/test/schema.test.ts`

**Interfaces:**
- Produces: tables `users`, `identities`, `user_emails`, `dms`, `blocks`, `rate_events` (colonnes exactes ci-dessous, utilisées par toutes les libs).

- [ ] **Step 1 : Test qui échoue**

```ts
// test/schema.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('schéma socle', () => {
  it('crée les 6 tables et refuse un provider inconnu', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(['blocks', 'dms', 'identities', 'rate_events', 'user_emails', 'users']);
    await env.DB.prepare("INSERT INTO users (display_name) VALUES ('x')").run();
    await expect(
      env.DB.prepare("INSERT INTO identities (user_id, provider, provider_id, email) VALUES (1, 'facebook', 'p', 'a@b.co')").run(),
    ).rejects.toThrow();
  });
});
```

Run: `npm test -- schema` — Expected: FAIL (tables absentes).

- [ ] **Step 2 : La migration**

```sql
-- 0001_socle.sql — espace membre FemzLab (spec §5, périmètre Plan 1)
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  display_name TEXT,
  name         TEXT,
  avatar_key   TEXT,
  country      TEXT,
  city         TEXT,
  lat          REAL,
  lon          REAL,
  socials      TEXT,            -- JSON {ig,tt,yt}
  reels        TEXT,            -- JSON [{url,thumb_key}] (max 3)
  lang         TEXT,
  founder      INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 0,
  dms_open     INTEGER NOT NULL DEFAULT 0,
  consented_at TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0,
  deleted_at   TEXT
);
CREATE INDEX idx_users_visible ON users(visible);

CREATE TABLE identities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  provider     TEXT NOT NULL CHECK (provider IN ('google', 'discord')),
  provider_id  TEXT NOT NULL,
  email        TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_id)
);
CREATE INDEX idx_identities_user ON identities(user_id);

CREATE TABLE user_emails (
  email       TEXT PRIMARY KEY,   -- toujours en minuscules
  user_id     INTEGER NOT NULL REFERENCES users(id),
  verified_by TEXT NOT NULL CHECK (verified_by IN ('oauth', 'admin')),
  added_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_user_emails_user ON user_emails(user_id);

CREATE TABLE dms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user  INTEGER NOT NULL REFERENCES users(id),
  to_user    INTEGER NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_dms_from ON dms(from_user);
CREATE INDEX idx_dms_to   ON dms(to_user);

CREATE TABLE blocks (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  blocked_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, blocked_id)
);

CREATE TABLE rate_events (
  user_id INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  at      INTEGER NOT NULL           -- epoch ms
);
CREATE INDEX idx_rate_events ON rate_events(user_id, kind, at);
```

- [ ] **Step 3 : Run `npm test -- schema`** — Expected: PASS.

- [ ] **Step 4 : Commit** — `git add espace/worker/migrations espace/worker/test/schema.test.ts && git commit -m "espace: migration 0001, schéma du socle"`.

---

### Task 2 : Session — cookie JWT, `requireAuth`, `requireFounder`

**Files:**
- Create: `espace/worker/src/lib/session.ts`, `espace/worker/test/helpers.ts`
- Test: `espace/worker/test/session.test.ts`

**Interfaces:**
- Produces: `COOKIE = 'fz_session'`, `signSession(userId, secret): Promise<string>`, `setSession(c, userId)`, `clearSession(c)`, `currentUser(c): Promise<User|null>`, middlewares `requireAuth`, `requireFounder`. Helpers de test : `mkUser(env, partial?) → id`, `cookieFor(userId) → 'fz_session=<jwt>'`.

- [ ] **Step 1 : Helpers de test**

```ts
// test/helpers.ts
import { env } from 'cloudflare:test';
import { signSession } from '../src/lib/session';

export async function mkUser(p: Partial<{ display_name: string; city: string; lat: number; lon: number; country: string; visible: number; dms_open: number; founder: number; consented_at: string; revoked: number; deleted_at: string; avatar_key: string; socials: string; reels: string }> = {}) {
  const cols = Object.keys(p);
  const sql = cols.length
    ? `INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
    : "INSERT INTO users (display_name) VALUES ('Membre')";
  const r = await env.DB.prepare(sql).bind(...Object.values(p)).run();
  return r.meta.last_row_id as number;
}
export async function cookieFor(userId: number) {
  return `fz_session=${await signSession(userId, env.JWT_SECRET)}`;
}
```

- [ ] **Step 2 : Test qui échoue**

```ts
// test/session.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requireAuth, requireFounder, setSession, clearSession, COOKIE } from '../src/lib/session';
import { mkUser, cookieFor } from './helpers';

const app = new Hono<{ Bindings: typeof env }>()
  .get('/me', requireAuth as any, (c: any) => c.json({ id: c.get('user').id }))
  .get('/admin', requireAuth as any, requireFounder as any, (c) => c.text('ok'))
  .get('/login/:id', async (c) => { await setSession(c as any, Number(c.req.param('id'))); return c.text('ok'); })
  .get('/logout', (c) => { clearSession(c as any); return c.text('ok'); });

describe('session', () => {
  it('401 sans cookie, 200 avec, 403 non-fondateur, cookie posé et effacé', async () => {
    const uid = await mkUser();
    expect((await app.request('/me', {}, env)).status).toBe(401);
    const ok = await app.request('/me', { headers: { Cookie: await cookieFor(uid) } }, env);
    expect(await ok.json()).toEqual({ id: uid });
    expect((await app.request('/admin', { headers: { Cookie: await cookieFor(uid) } }, env)).status).toBe(403);
    const f = await mkUser({ founder: 1 });
    expect((await app.request('/admin', { headers: { Cookie: await cookieFor(f) } }, env)).status).toBe(200);
    const set = (await app.request(`/login/${uid}`, {}, env)).headers.get('set-cookie') || '';
    expect(set).toContain(`${COOKIE}=`); expect(set).toContain('HttpOnly'); expect(set).toContain('SameSite=Lax');
    const del = (await app.request('/logout', {}, env)).headers.get('set-cookie') || '';
    expect(del).toContain('Max-Age=0');
  });
  it('refuse un utilisateur révoqué ou supprimé', async () => {
    const r = await mkUser({ revoked: 1 });
    expect((await app.request('/me', { headers: { Cookie: await cookieFor(r) } }, env)).status).toBe(401);
    const d = await mkUser({ deleted_at: '2026-01-01' });
    expect((await app.request('/me', { headers: { Cookie: await cookieFor(d) } }, env)).status).toBe(401);
  });
});
```

Run: `npm test -- session` — Expected: FAIL (module absent).

- [ ] **Step 3 : Implémentation**

```ts
// src/lib/session.ts
import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { Env, User, Vars } from '../env';

export const COOKIE = 'fz_session';
const SEVEN_DAYS = 7 * 24 * 3600;
type C = Context<{ Bindings: Env; Variables: Vars }>;

export function signSession(userId: number, secret: string): Promise<string> {
  return sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS }, secret, 'HS256');
}
function cookieOpts(c: C) {
  const prod = c.env.ENV === 'production';
  return { httpOnly: true, sameSite: 'Lax' as const, secure: prod, path: '/', domain: prod ? c.env.COOKIE_DOMAIN : undefined };
}
export async function setSession(c: C, userId: number) {
  setCookie(c, COOKIE, await signSession(userId, c.env.JWT_SECRET), { ...cookieOpts(c), maxAge: SEVEN_DAYS });
}
export function clearSession(c: C) {
  deleteCookie(c, COOKIE, cookieOpts(c));
}
export async function currentUser(c: C): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  try {
    const p: any = await verify(token, c.env.JWT_SECRET, 'HS256');
    const u = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').bind(p.sub).first<User>();
    return u && !u.revoked ? u : null;
  } catch { return null; }
}
export async function requireAuth(c: C, next: Next) {
  const u = await currentUser(c);
  if (!u) return c.json({ error: 'non authentifié' }, 401);
  c.set('user', u);
  await next();
}
export async function requireFounder(c: C, next: Next) {
  if (!c.get('user')?.founder) return c.json({ error: 'réservé au fondateur' }, 403);
  await next();
}
```

- [ ] **Step 4 : Run `npm test -- session`** — Expected: PASS (2 tests).
- [ ] **Step 5 : Commit** — `git add espace/worker/src/lib/session.ts espace/worker/test/helpers.ts espace/worker/test/session.test.ts && git commit -m "espace: session JWT cookie fz_session, requireAuth/requireFounder"`.

---

### Task 3 : OAuth Google / Discord et création de compte

**Files:**
- Create: `espace/worker/src/lib/oauth.ts`, `espace/worker/src/lib/users.ts` (partie identité), `espace/worker/src/index.ts` (routes `/espace/auth/*`)
- Modify: `espace/worker/src/lib/welcome.ts` (texte FemzLab)
- Test: `espace/worker/test/oauth.test.ts`

**Interfaces:**
- Produces: `authorizeUrl(provider, env, redirectUri, state)`, `exchange(provider, env, redirectUri, code): Promise<OAuthProfile>`, type `OAuthProfile = { provider:'google'|'discord'; providerId:string; email:string; emailVerified:boolean; name:string; avatarUrl:string|null }`, `findOrCreateFromIdentity(env, profile, attachTo?: number): Promise<{ user: User; created: boolean }>`, `welcomeFor(country)`. Routes : `GET /espace/auth/:provider`, `GET /espace/auth/:provider/callback`, `POST /espace/auth/logout`, `GET /espace/auth/dev-login?email=` (hors production).
- Écart assumé avec la spec §4.1 : pas de `nonce` — le profil est lu sur l'endpoint userinfo avec l'access token obtenu côté serveur (le `state` couvre le CSRF).

- [ ] **Step 1 : Test qui échoue**

```ts
// test/oauth.test.ts
import { env, fetchMock } from 'cloudflare:test';
import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import app from '../src/index';
import { cookieFor } from './helpers';

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => fetchMock.assertNoPendingInterceptors());

function mockGoogle(profile: object) {
  fetchMock.get('https://oauth2.googleapis.com').intercept({ path: '/token', method: 'POST' }).reply(200, { access_token: 'at', id_token: 'x' });
  fetchMock.get('https://openidconnect.googleapis.com').intercept({ path: '/v1/userinfo' }).reply(200, profile);
}
function mockDiscord(user: object) {
  fetchMock.get('https://discord.com').intercept({ path: '/api/oauth2/token', method: 'POST' }).reply(200, { access_token: 'at' });
  fetchMock.get('https://discord.com').intercept({ path: '/api/users/@me' }).reply(200, user);
}
async function callback(provider: string, state: string, cookie: string) {
  return app.request(`/espace/auth/${provider}/callback?code=abc&state=${state}`, { headers: { Cookie: cookie } }, env);
}
const stateCookie = (s: string) => `fz_oauth=${s}`;

describe('OAuth', () => {
  it('redirige vers Google avec state et scopes', async () => {
    const r = await app.request('/espace/auth/google', {}, env);
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(loc.searchParams.get('scope')).toBe('openid email profile');
    expect(r.headers.get('set-cookie')).toContain('fz_oauth=');
  });
  it('refuse un state qui ne correspond pas', async () => {
    expect((await callback('google', 'bad', stateCookie('good'))).status).toBe(400);
  });
  it('crée le compte, pose la session, fondateur si email propriétaire', async () => {
    mockGoogle({ sub: 'g1', email: 'Fraps81@gmail.com', email_verified: true, name: 'Femz', picture: null });
    const r = await callback('google', 's1', stateCookie('s1'));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/espace/');
    expect(r.headers.get('set-cookie')).toContain('fz_session=');
    const u = await env.DB.prepare("SELECT * FROM users WHERE display_name = 'Femz'").first<any>();
    expect(u.founder).toBe(1);
    const e = await env.DB.prepare("SELECT * FROM user_emails WHERE email = 'fraps81@gmail.com'").first<any>();
    expect(e.user_id).toBe(u.id);
  });
  it('un nouveau membre reçoit le DM de bienvenue du fondateur', async () => {
    mockGoogle({ sub: 'g1', email: 'fraps81@gmail.com', email_verified: true, name: 'Femz', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    mockDiscord({ id: 'd7', username: 'leo', global_name: 'Léo', email: 'leo@example.com', verified: true, avatar: null });
    await callback('discord', 's2', stateCookie('s2'));
    const dm = await env.DB.prepare("SELECT d.text FROM dms d JOIN users u ON u.id = d.to_user WHERE u.display_name = 'Léo'").first<any>();
    expect(dm.text).toContain('FemzLab');
  });
  it('même email via un autre fournisseur → même compte ; email non vérifié → refus', async () => {
    mockGoogle({ sub: 'g2', email: 'anna@example.com', email_verified: true, name: 'Anna', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    mockDiscord({ id: 'd2', username: 'anna', global_name: 'Anna D', email: 'ANNA@example.com', verified: true, avatar: null });
    await callback('discord', 's2', stateCookie('s2'));
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE display_name LIKE 'Anna%'").first<any>();
    expect(n.n).toBe(1);
    const ids = await env.DB.prepare('SELECT COUNT(*) AS n FROM identities').first<any>();
    expect(ids.n).toBe(2);
    mockDiscord({ id: 'd3', username: 'x', global_name: 'X', email: 'x@example.com', verified: false, avatar: null });
    const r = await callback('discord', 's3', stateCookie('s3'));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/espace/?erreur=email_non_verifie');
  });
  it('mode attache : un membre connecté ajoute un 2e fournisseur', async () => {
    mockGoogle({ sub: 'g9', email: 'p@example.com', email_verified: true, name: 'P', picture: null });
    await callback('google', 's1', stateCookie('s1'));
    const u = await env.DB.prepare("SELECT id FROM users WHERE display_name = 'P'").first<any>();
    mockDiscord({ id: 'd9', username: 'p', global_name: 'P', email: 'autre@example.com', verified: true, avatar: null });
    await callback('discord', 's2', `${stateCookie('s2')}; ${await cookieFor(u.id)}`);
    const ids = await env.DB.prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider').bind(u.id).all<any>();
    expect(ids.results.map((i) => i.provider)).toEqual(['discord', 'google']);
    const emails = await env.DB.prepare('SELECT email FROM user_emails WHERE user_id = ? ORDER BY email').bind(u.id).all<any>();
    expect(emails.results.map((e) => e.email)).toEqual(['autre@example.com', 'p@example.com']);
  });
  it('logout efface le cookie ; dev-login interdit en production', async () => {
    const r = await app.request('/espace/auth/logout', { method: 'POST' }, env);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    const prodEnv = { ...env, ENV: 'production' };
    expect((await app.request('/espace/auth/dev-login?email=a@b.co', {}, prodEnv)).status).toBe(404);
  });
});
```

Run: `npm test -- oauth` — Expected: FAIL.

- [ ] **Step 2 : `src/lib/oauth.ts`**

```ts
import type { Env } from '../env';

export type Provider = 'google' | 'discord';
export type OAuthProfile = {
  provider: Provider; providerId: string; email: string; emailVerified: boolean;
  name: string; avatarUrl: string | null;
};
export const PROVIDERS: Provider[] = ['google', 'discord'];

const CFG = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  discord: {
    authorize: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    userinfo: 'https://discord.com/api/users/@me',
    scope: 'identify email',
  },
} as const;

function creds(p: Provider, env: Env) {
  return p === 'google'
    ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }
    : { id: env.DISCORD_CLIENT_ID, secret: env.DISCORD_CLIENT_SECRET };
}

export function authorizeUrl(p: Provider, env: Env, redirectUri: string, state: string): string {
  const u = new URL(CFG[p].authorize);
  u.searchParams.set('client_id', creds(p, env).id);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', CFG[p].scope);
  u.searchParams.set('state', state);
  if (p === 'google') u.searchParams.set('prompt', 'select_account');
  if (p === 'discord') u.searchParams.set('prompt', 'none');
  return u.toString();
}

/** Échange le code, lit le profil, le normalise. Lève en cas d'échec réseau ou de refus. */
export async function exchange(p: Provider, env: Env, redirectUri: string, code: string): Promise<OAuthProfile> {
  const { id, secret } = creds(p, env);
  const body = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const tr = await fetch(CFG[p].token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!tr.ok) throw new Error(`token ${p} ${tr.status}`);
  const tok: any = await tr.json();
  const ur = await fetch(CFG[p].userinfo, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!ur.ok) throw new Error(`userinfo ${p} ${ur.status}`);
  const u: any = await ur.json();
  if (p === 'google') {
    return { provider: p, providerId: String(u.sub), email: String(u.email || '').toLowerCase(), emailVerified: u.email_verified === true, name: String(u.name || ''), avatarUrl: u.picture || null };
  }
  return {
    provider: p, providerId: String(u.id), email: String(u.email || '').toLowerCase(), emailVerified: u.verified === true,
    name: String(u.global_name || u.username || ''),
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null,
  };
}
```

- [ ] **Step 3 : `src/lib/users.ts` (partie identité) et texte de bienvenue**

Dans `welcome.ts`, remplacer les cinq textes par la version FemzLab (même structure, « NéoVision » → « l'espace FemzLab », « un épisode » → « quelque chose ») :
```ts
const WELCOME: Record<string, string> = {
  fr: "Bienvenue dans l'espace FemzLab ! Ravi de te compter parmi nous. Une question, un blocage, une idée : réponds ici — je lis tout. — Femz",
  en: "Welcome to the FemzLab space! Glad to have you on board. A question, a blocker, an idea: just reply here — I read everything. — Femz",
  es: "¡Bienvenido al espacio FemzLab! Encantado de tenerte con nosotros. Una duda, un bloqueo, una idea: responde aquí — lo leo todo. — Femz",
  pt: "Bem-vindo ao espaço FemzLab! Feliz por ter você conosco. Uma dúvida, um bloqueio, uma ideia: responda aqui — eu leio tudo. — Femz",
  de: "Willkommen im FemzLab-Space! Schön, dass du dabei bist. Eine Frage, ein Hindernis, eine Idee: antworte einfach hier — ich lese alles. — Femz",
};
```

```ts
// src/lib/users.ts
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
```

(`welcomeFor(null)` rend la version anglaise par défaut ; le pays n'est pas connu à l'inscription — la langue de l'app est gérée par `i18n.js`.)

- [ ] **Step 4 : `src/index.ts` — routes auth**

```ts
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, Vars } from './env';
import { PROVIDERS, authorizeUrl, exchange, type Provider } from './lib/oauth';
import { findOrCreateFromIdentity } from './lib/users';
import { currentUser, setSession, clearSession } from './lib/session';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const OAUTH_COOKIE = 'fz_oauth';

function redirectUri(c: any, p: Provider) { return `${c.env.APP_URL.replace(/\/$/, '')}/auth/${p}/callback`; }
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

app.get('/espace/auth/:provider', (c) => {
  const p = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(p)) return c.text('fournisseur inconnu', 404);
  const state = hex(crypto.getRandomValues(new Uint8Array(16)));
  setCookie(c, OAUTH_COOKIE, state, { httpOnly: true, sameSite: 'Lax', secure: c.env.ENV === 'production', path: '/espace/auth', maxAge: 600 });
  return c.redirect(authorizeUrl(p, c.env, redirectUri(c, p), state), 302);
});

app.get('/espace/auth/:provider/callback', async (c) => {
  const p = c.req.param('provider') as Provider;
  if (!PROVIDERS.includes(p)) return c.text('fournisseur inconnu', 404);
  const state = c.req.query('state') || '', code = c.req.query('code') || '';
  const expected = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: '/espace/auth' });
  if (!code || !state || !expected || state !== expected) return c.text('état OAuth invalide', 400);
  let profile;
  try { profile = await exchange(p, c.env, redirectUri(c, p), code); }
  catch (e) { console.error('oauth', p, e); return c.redirect('/espace/?erreur=oauth', 302); }
  if (!profile.email || !profile.emailVerified) return c.redirect('/espace/?erreur=email_non_verifie', 302);
  const me = await currentUser(c);
  const { user } = await findOrCreateFromIdentity(c.env, profile, me?.id);
  await setSession(c, user.id);
  return c.redirect('/espace/', 302);
});

app.post('/espace/auth/logout', (c) => { clearSession(c); return c.json({ ok: true }); });

// Connexion de dev sans OAuth (Playwright local). Jamais en production.
app.get('/espace/auth/dev-login', async (c) => {
  if (c.env.ENV === 'production') return c.text('indisponible', 404);
  const email = String(c.req.query('email') || '').trim().toLowerCase();
  if (!email) return c.text('email requis', 400);
  const { user } = await findOrCreateFromIdentity(c.env, { provider: 'google', providerId: 'dev:' + email, email, emailVerified: true, name: email.split('@')[0], avatarUrl: null });
  await setSession(c, user.id);
  return c.redirect('/espace/', 302);
});

export default app;
```

- [ ] **Step 5 : Run `npm test -- oauth`** — Expected: PASS (7 tests). Si `fetchMock.assertNoPendingInterceptors` échoue sur le test « refuse un state », c'est qu'un intercepteur a été déclaré avant le refus : ce test n'en déclare aucun, vérifier l'ordre.
- [ ] **Step 6 : Commit** — `git add espace/worker/src espace/worker/test/oauth.test.ts && git commit -m "espace: OAuth Google/Discord, création de compte, fondateur, DM de bienvenue"`.

---

### Task 4 : Profil, consentement, liste du globe

**Files:**
- Modify: `espace/worker/src/lib/users.ts` (ajouts), `espace/worker/src/index.ts` (routes `/espace/api/me|profile|consent|creators|stats`)
- Test: `espace/worker/test/profile.test.ts`

**Interfaces:**
- Produces: `profileOf(env, id)`, `updateProfile(env, id, body)`, `setConsent(env, id, visible, dmsOpen)`, `creatorsList(env)`, `stats(env)`, `mediaUrl(key)`. Réponse `/espace/api/me` : `{ id, display_name, avatar, founder, visible, dms_open, consented_at, providers: string[] }`.

- [ ] **Step 1 : Test qui échoue**

```ts
// test/profile.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { mkUser, cookieFor } from './helpers';

const json = (u: number, body: object, method = 'PUT') => async (path: string) =>
  app.request(path, { method, headers: { Cookie: await cookieFor(u), 'content-type': 'application/json' }, body: JSON.stringify(body) }, env);

describe('profil & globe', () => {
  it('/me : 401 sans session, identité + fournisseurs avec', async () => {
    expect((await app.request('/espace/api/me', {}, env)).status).toBe(401);
    const u = await mkUser({ display_name: 'Zoé' });
    await env.DB.prepare("INSERT INTO identities (user_id, provider, provider_id, email) VALUES (?, 'discord', 'x', 'z@e.co')").bind(u).run();
    const me: any = await (await app.request('/espace/api/me', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(me).toMatchObject({ id: u, display_name: 'Zoé', founder: false, visible: false, dms_open: false, providers: ['discord'] });
    expect(me).not.toHaveProperty('email');
  });
  it('PUT profil : ville géocodée, nom, réseaux, reels bornés à 3', async () => {
    const u = await mkUser();
    const r = await (await json(u, { city: 'Cannes', display_name: '  Léo  ', socials: { ig: '@leo', tt: '', yt: 'x'.repeat(200) }, reels: [{ url: 'a' }, { url: 'b' }, { url: 'c' }, { url: 'd' }] })('/espace/api/profile')).json() as any;
    expect(r.city).toBe('Cannes'); expect(r.lat).toBeCloseTo(43.55, 1); expect(r.display_name).toBe('Léo');
    expect(r.socials.yt.length).toBe(100); expect(r.reels.length).toBe(3);
    expect((await json(u, { display_name: '' })('/espace/api/profile')).status).toBe(400);
  });
  it('consentement puis /creators : nommé sans email, anonymes en points pays, fondateur en premier', async () => {
    const f = await mkUser({ display_name: 'Femz', founder: 1, visible: 1, city: 'Paris', lat: 48.85, lon: 2.35, consented_at: 'x' });
    const a = await mkUser({ display_name: 'Anon', country: 'BE' });
    const v = await mkUser({ display_name: 'Vue', lat: 43.5, lon: 7.0, city: 'Cannes' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('vue@e.co', ?, 'oauth')").bind(v).run();
    await json(v, { visible: true, dms_open: true })('/espace/api/consent');
    const list: any[] = await (await app.request('/espace/api/creators', { headers: { Cookie: await cookieFor(a) } }, env)).json();
    expect(JSON.stringify(list)).not.toMatch(/@/);
    expect(list[0].display_name).toBe('Femz');
    expect(list.find((x) => x.display_name === 'Vue')).toMatchObject({ id: v, dms_open: true, lat: 43.5 });
    const anon = list.find((x) => x.anon);
    expect(anon).toMatchObject({ anon: true }); expect(anon).not.toHaveProperty('display_name');
    expect((await app.request('/espace/api/creators', {}, env)).status).toBe(401);
  });
  it('/stats est public et compte les membres non supprimés', async () => {
    await mkUser(); await mkUser({ deleted_at: 'x' });
    const s: any = await (await app.request('/espace/api/stats', {}, env)).json();
    expect(s.membres).toBe(1);
  });
});
```

Run: `npm test -- profile` — Expected: FAIL.

- [ ] **Step 2 : Ajouts dans `users.ts`**

```ts
import { geocode } from './geocode';

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
```

- [ ] **Step 3 : Routes dans `index.ts`** (après les routes auth)

```ts
import { requireAuth } from './lib/session';
import { profileOf, updateProfile, setConsent, creatorsList, stats, mediaUrl, parseJson } from './lib/users';

app.get('/espace/api/stats', async (c) => c.json(await stats(c.env)));

app.get('/espace/api/me', requireAuth, async (c) => {
  const u = c.get('user');
  const { results } = await c.env.DB.prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY provider').bind(u.id).all<{ provider: string }>();
  return c.json({
    id: u.id, display_name: u.display_name, avatar: mediaUrl(u.avatar_key), founder: !!u.founder,
    visible: !!u.visible, dms_open: !!u.dms_open, consented_at: u.consented_at, providers: results.map((r) => r.provider),
  });
});
app.get('/espace/api/profile', requireAuth, async (c) => c.json(await profileOf(c.env, c.get('user').id)));
app.put('/espace/api/profile', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const r = await updateProfile(c.env, c.get('user').id, body);
  if (r.error) return c.json(r, 400);
  return c.json(await profileOf(c.env, c.get('user').id));
});
app.put('/espace/api/consent', requireAuth, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  await setConsent(c.env, c.get('user').id, !!b.visible, !!b.dms_open);
  return c.json({ ok: true, visible: !!b.visible, dms_open: !!b.dms_open });
});
app.get('/espace/api/creators', requireAuth, async (c) => c.json(await creatorsList(c.env)));
```

- [ ] **Step 4 : Run `npm test -- profile`** — Expected: PASS (4 tests).
- [ ] **Step 5 : Commit** — `git add espace/worker && git commit -m "espace: profil géocodé, consentement, liste du globe sans email, stats publiques"`.

---

### Task 5 : Images sur R2 — avatar et vignettes de reels

**Files:**
- Create: `espace/worker/src/lib/media.ts`
- Modify: `espace/worker/src/index.ts` (routes `POST /espace/api/media/avatar`, `POST /espace/api/media/reel/:n`, `GET /espace/media/*`)
- Test: `espace/worker/test/media.test.ts`

**Interfaces:**
- Produces: `sniffImage(bytes: Uint8Array): 'png'|'jpeg'|'webp'|null`, `storeUserImage(env, userId, prefix, bytes): Promise<string key>`, `deleteKey(env, key)`. Réponses : `{ url: '/espace/media/<key>' }`.

- [ ] **Step 1 : Test qui échoue**

```ts
// test/media.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { mkUser, cookieFor } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), 9]);
const upload = async (u: number, path: string, bytes: Uint8Array, type = 'image/png') =>
  app.request(path, { method: 'POST', headers: { Cookie: await cookieFor(u), 'content-type': type }, body: bytes }, env);

describe('media', () => {
  it('avatar : stocke, sert, remplace et supprime l’ancien', async () => {
    const u = await mkUser();
    const r1: any = await (await upload(u, '/espace/api/media/avatar', PNG)).json();
    expect(r1.url).toMatch(new RegExp(`^/espace/media/avatars/${u}/[0-9a-f]{16}\\.png$`));
    const served = await app.request(r1.url, {}, env);
    expect(served.status).toBe(200); expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toContain('immutable');
    const r2: any = await (await upload(u, '/espace/api/media/avatar', WEBP, 'image/webp')).json();
    expect(r2.url).toMatch(/\.webp$/);
    expect((await app.request(r1.url, {}, env)).status).toBe(404);
    const me: any = await (await app.request('/espace/api/me', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(me.avatar).toBe(r2.url);
  });
  it('refuse ce qui n’est pas une image, ce qui est trop lourd, et un index de reel hors 0-2', async () => {
    const u = await mkUser();
    expect((await upload(u, '/espace/api/media/avatar', new TextEncoder().encode('<svg/>'), 'image/svg+xml')).status).toBe(415);
    expect((await upload(u, '/espace/api/media/avatar', new Uint8Array(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await upload(u, '/espace/api/media/reel/3', PNG)).status).toBe(400);
  });
  it('vignette de reel : écrite dans reels[n].thumb_key', async () => {
    const u = await mkUser({ reels: JSON.stringify([{ url: 'https://instagram.com/reel/a' }]) });
    const r: any = await (await upload(u, '/espace/api/media/reel/0', PNG)).json();
    const p: any = await (await app.request('/espace/api/profile', { headers: { Cookie: await cookieFor(u) } }, env)).json();
    expect(p.reels[0]).toEqual({ url: 'https://instagram.com/reel/a', thumb: r.url });
  });
});
```

Run: `npm test -- media` — Expected: FAIL.

- [ ] **Step 2 : `src/lib/media.ts`**

```ts
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

/** Lit et valide le corps d'un upload ; renvoie l'erreur HTTP à rendre sinon. */
export async function readImage(req: Request): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpeg' | 'webp' } | { status: 413 | 415 }> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return { status: 413 };
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_BYTES) return { status: 413 };
  const kind = sniffImage(bytes);
  if (!kind) return { status: 415 };
  return { bytes, kind };
}
```

- [ ] **Step 3 : Routes dans `index.ts`**

```ts
import { readImage, storeUserImage, deleteKey } from './lib/media';

app.post('/espace/api/media/avatar', requireAuth, async (c) => {
  const img = await readImage(c.req.raw);
  if ('status' in img) return c.json({ error: img.status === 413 ? 'image trop lourde (2 Mo max)' : 'format accepté : PNG, JPEG, WebP' }, img.status);
  const u = c.get('user');
  const key = await storeUserImage(c.env, u.id, 'avatars', img.bytes, img.kind);
  await c.env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(key, u.id).run();
  if (u.avatar_key && u.avatar_key !== key) await deleteKey(c.env, u.avatar_key);
  return c.json({ url: mediaUrl(key) });
});

app.post('/espace/api/media/reel/:n', requireAuth, async (c) => {
  const n = Number(c.req.param('n'));
  if (!Number.isInteger(n) || n < 0 || n > 2) return c.json({ error: 'index de reel 0 à 2' }, 400);
  const img = await readImage(c.req.raw);
  if ('status' in img) return c.json({ error: img.status === 413 ? 'image trop lourde (2 Mo max)' : 'format accepté : PNG, JPEG, WebP' }, img.status);
  const u = c.get('user');
  const reels: any[] = parseJson(u.reels, []);
  while (reels.length <= n) reels.push({ url: '', thumb_key: null });
  const key = await storeUserImage(c.env, u.id, 'reels', img.bytes, img.kind, n);
  const old = reels[n].thumb_key; reels[n].thumb_key = key;
  await c.env.DB.prepare('UPDATE users SET reels = ? WHERE id = ?').bind(JSON.stringify(reels), u.id).run();
  if (old && old !== key) await deleteKey(c.env, old);
  return c.json({ url: mediaUrl(key) });
});

app.get('/espace/media/*', async (c) => {
  const key = c.req.path.replace(/^\/espace\/media\//, '');
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.text('introuvable', 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', etag: obj.httpEtag } });
});
```

- [ ] **Step 4 : Run `npm test -- media`** — Expected: PASS (3 tests).
- [ ] **Step 5 : Commit** — `git add espace/worker && git commit -m "espace: avatars et vignettes de reels sur R2, servis en immuable"`.

---

### Task 6 : Messagerie privée — conversations, blocages, limite de débit

**Files:**
- Create: `espace/worker/src/lib/dms.ts`
- Modify: `espace/worker/src/index.ts`
- Test: `espace/worker/test/dms.test.ts`

**Interfaces:**
- Produces: `listConvs(env, me)`, `thread(env, me, peer)`, `sendDm(env, me, peer, text): Promise<{ msg } | { error, status }>`, `markRead(env, me, peer)`, `block(env, me, peer)`, `unblock(env, me, peer)`, `isBlocked(env, a, b)`. Constantes `DM_MAX = 2000`, `DM_LIMIT = 30`, `DM_WINDOW_MS = 600000`. Format message : `{ f: 'me'|'them', x: string, t: epochMs }`.

- [ ] **Step 1 : Test qui échoue**

```ts
// test/dms.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { mkUser, cookieFor } from './helpers';

const post = async (u: number, path: string, body: object = {}) =>
  app.request(path, { method: 'POST', headers: { Cookie: await cookieFor(u), 'content-type': 'application/json' }, body: JSON.stringify(body) }, env);
const get = async (u: number, path: string) => app.request(path, { headers: { Cookie: await cookieFor(u) } }, env);

describe('DM', () => {
  it('envoi, fil, liste, lecture', async () => {
    const a = await mkUser({ display_name: 'A', dms_open: 1 }), b = await mkUser({ display_name: 'B', dms_open: 1 });
    const r: any = await (await post(a, `/espace/api/dms/${b}`, { text: 'salut' })).json();
    expect(r.msg).toMatchObject({ f: 'me', x: 'salut' });
    const th: any = await (await get(b, `/espace/api/dms/${a}`)).json();
    expect(th.msgs[0]).toMatchObject({ f: 'them', x: 'salut' });
    const convs: any[] = await (await get(b, '/espace/api/dms')).json();
    expect(convs[0]).toMatchObject({ peer: a, name: 'A', unread: 1 });
    await post(b, `/espace/api/dms/${a}/read`);
    expect(((await (await get(b, '/espace/api/dms')).json()) as any[])[0].unread).toBe(0);
  });
  it('refus : dms fermés, soi-même, texte vide ou trop long, membre inconnu', async () => {
    const a = await mkUser({ dms_open: 1 }), ferme = await mkUser({ dms_open: 0 });
    expect((await post(a, `/espace/api/dms/${ferme}`, { text: 'x' })).status).toBe(403);
    expect((await post(a, `/espace/api/dms/${a}`, { text: 'x' })).status).toBe(400);
    expect((await post(a, `/espace/api/dms/${ferme}`, { text: '' })).status).toBe(400);
    expect((await post(a, `/espace/api/dms/9999`, { text: 'x' })).status).toBe(404);
    const b = await mkUser({ dms_open: 1 });
    expect((await post(a, `/espace/api/dms/${b}`, { text: 'x'.repeat(2001) })).status).toBe(400);
  });
  it('blocage : silencieux et bidirectionnel, levée possible', async () => {
    const a = await mkUser({ dms_open: 1 }), b = await mkUser({ dms_open: 1 });
    expect((await post(a, `/espace/api/blocks/${b}`)).status).toBe(200);
    expect((await post(b, `/espace/api/dms/${a}`, { text: 'x' })).status).toBe(403);
    expect((await post(a, `/espace/api/dms/${b}`, { text: 'x' })).status).toBe(403);
    expect((await app.request(`/espace/api/blocks/${b}`, { method: 'DELETE', headers: { Cookie: await cookieFor(a) } }, env)).status).toBe(200);
    expect((await post(b, `/espace/api/dms/${a}`, { text: 'x' })).status).toBe(200);
  });
  it('limite : 30 messages par 10 minutes, le 31e est refusé (429)', async () => {
    const a = await mkUser({ dms_open: 1 }), b = await mkUser({ dms_open: 1 });
    for (let i = 0; i < 30; i++) expect((await post(a, `/espace/api/dms/${b}`, { text: `m${i}` })).status).toBe(200);
    expect((await post(a, `/espace/api/dms/${b}`, { text: 'trop' })).status).toBe(429);
  });
});
```

Run: `npm test -- dms` — Expected: FAIL.

- [ ] **Step 2 : `src/lib/dms.ts`**

```ts
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
```

- [ ] **Step 3 : Routes dans `index.ts`**

```ts
import { peer, listConvs, thread, sendDm, markRead, block, unblock } from './lib/dms';

async function withPeer(c: any) {
  const p = await peer(c.env, Number(c.req.param('peer')));
  return p ? { p } : { err: c.json({ error: 'membre introuvable' }, 404) };
}
app.get('/espace/api/dms', requireAuth, async (c) => c.json(await listConvs(c.env, c.get('user').id)));
app.get('/espace/api/dms/:peer', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; return c.json(await thread(c.env, c.get('user').id, p)); });
app.post('/espace/api/dms/:peer', requireAuth, async (c) => {
  const { p, err } = await withPeer(c); if (err) return err;
  const body: any = await c.req.json().catch(() => ({}));
  const r = await sendDm(c.env, c.get('user').id, p, body.text);
  if ('error' in r) return c.json({ error: r.error }, r.status);
  return c.json({ ok: true, msg: r.msg });
});
app.post('/espace/api/dms/:peer/read', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; return c.json({ ok: true, read: await markRead(c.env, c.get('user').id, p.id) }); });
app.post('/espace/api/blocks/:peer', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; await block(c.env, c.get('user').id, p.id); return c.json({ ok: true }); });
app.delete('/espace/api/blocks/:peer', requireAuth, async (c) => { const { p, err } = await withPeer(c); if (err) return err; await unblock(c.env, c.get('user').id, p.id); return c.json({ ok: true }); });
```

- [ ] **Step 4 : Run `npm test -- dms`** — Expected: PASS (4 tests).
- [ ] **Step 5 : Commit** — `git add espace/worker && git commit -m "espace: messagerie privée, blocages silencieux, limite de débit en base"`.

---

### Task 7 : Servir l'app sous `/espace/`, redirection apex, sauvegarde nocturne

**Files:**
- Create: `espace/worker/src/lib/backup.ts`
- Modify: `espace/worker/src/index.ts` (catch-all assets, redirections, export `scheduled`)
- Test: `espace/worker/test/serve.test.ts`, `espace/worker/test/backup.test.ts`

**Interfaces:**
- Produces: `backupToR2(env, now: Date): Promise<{ key: string; deleted: number }>` ; export par défaut `{ fetch, scheduled }`.

- [ ] **Step 1 : Tests qui échouent**

```ts
// test/serve.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('service de l’app', () => {
  it('/espace → /espace/ ; apex → www ; l’app est servie (repli SPA)', async () => {
    const r1 = await app.request('http://www.femzlab.shop/espace', {}, env);
    expect(r1.status).toBe(301); expect(r1.headers.get('location')).toBe('https://www.femzlab.shop/espace/');
    const r2 = await app.request('http://femzlab.shop/espace/profil', {}, env);
    expect(r2.status).toBe(301); expect(r2.headers.get('location')).toBe('https://www.femzlab.shop/espace/profil');
    const r3 = await app.request('http://www.femzlab.shop/espace/', {}, env);
    expect(r3.status).toBe(200); expect(await r3.text()).toContain('<!doctype html>');
    const r4 = await app.request('http://www.femzlab.shop/espace/nimporte/quoi', {}, env);
    expect(r4.status).toBe(200);
  });
  it('les routes API inconnues rendent du JSON 404, pas l’app', async () => {
    const r = await app.request('http://www.femzlab.shop/espace/api/inconnu', {}, env);
    expect(r.status).toBe(404); expect(r.headers.get('content-type')).toContain('json');
  });
});
```

```ts
// test/backup.test.ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { backupToR2 } from '../src/lib/backup';
import { mkUser } from './helpers';

describe('sauvegarde nocturne', () => {
  it('écrit un JSON daté avec les tables, et purge au-delà de 90 jours', async () => {
    await mkUser({ display_name: 'Sauvé' });
    await env.MEDIA.put('backups/2026-01-01.json', '{}');
    const r = await backupToR2(env, new Date('2026-09-06T03:00:00Z'));
    expect(r.key).toBe('backups/2026-09-06.json'); expect(r.deleted).toBe(1);
    const dump = JSON.parse(await (await env.MEDIA.get(r.key))!.text());
    expect(dump.users.some((u: any) => u.display_name === 'Sauvé')).toBe(true);
    expect(Object.keys(dump).sort()).toEqual(['blocks', 'dms', 'identities', 'user_emails', 'users']);
    expect(await env.MEDIA.get('backups/2026-01-01.json')).toBeNull();
  });
});
```

Run: `npm test -- serve backup` — Expected: FAIL.

- [ ] **Step 2 : `src/lib/backup.ts`**

```ts
import type { Env } from '../env';
const TABLES = ['users', 'identities', 'user_emails', 'dms', 'blocks'];
const RETENTION_DAYS = 90;

export async function backupToR2(env: Env, now = new Date()) {
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) dump[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  const day = now.toISOString().slice(0, 10);
  const key = `backups/${day}.json`;
  await env.MEDIA.put(key, JSON.stringify(dump), { httpMetadata: { contentType: 'application/json' } });
  const limit = new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  let deleted = 0;
  const listed = await env.MEDIA.list({ prefix: 'backups/' });
  for (const o of listed.objects) {
    const d = o.key.slice('backups/'.length, 'backups/'.length + 10);
    if (d < limit) { await env.MEDIA.delete(o.key); deleted++; }
  }
  return { key, deleted };
}
```

- [ ] **Step 3 : Fin de `index.ts`**

```ts
import { backupToR2 } from './lib/backup';

// Apex → www (un seul origin pour les cookies et l'OAuth) ; /espace → /espace/.
app.use('/espace*', async (c, next) => {
  const u = new URL(c.req.url);
  if (u.hostname === 'femzlab.shop') { u.hostname = 'www.femzlab.shop'; u.protocol = 'https:'; return c.redirect(u.toString(), 301); }
  if (u.pathname === '/espace') { u.pathname = '/espace/'; u.protocol = c.env.ENV === 'production' ? 'https:' : u.protocol; return c.redirect(u.toString(), 301); }
  await next();
});

app.all('/espace/api/*', (c) => c.json({ error: 'route inconnue' }, 404));

// L'app React : les fichiers sont à la racine de web/dist, l'URL publique sous /espace/.
app.all('/espace/*', (c) => {
  const u = new URL(c.req.url);
  u.pathname = u.pathname.replace(/^\/espace/, '') || '/';
  return c.env.ASSETS.fetch(new Request(u.toString(), c.req.raw));
});

export default {
  fetch: app.fetch,
  scheduled: async (_e: ScheduledEvent, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(backupToR2(env)); },
};
```

Ajuster les tests qui importent `app` : exporter aussi `export { app }` et importer `{ app }` dans les fichiers de test (`import { app } from '../src/index'`). Le middleware apex/`/espace` doit être déclaré **avant** les routes auth/api (le placer en tête du fichier, juste après `const app = …`).

- [ ] **Step 4 : Run `npm test`** — Expected: tous les tests PASS (smoke, schema, session, oauth, profile, media, dms, serve, backup).
- [ ] **Step 5 : Commit** — `git add espace/worker && git commit -m "espace: app servie sous /espace, redirection apex, sauvegarde nocturne dans R2"`.

---

### Task 8 : Front — base `/espace/`, fin du mode démo, préfixe d'API

**Files:**
- Modify: `espace/web/vite.config.ts`, `espace/web/index.html`, `espace/web/src/index.css:9`, `espace/web/src/lib/api.ts`, `espace/web/src/lib/profile.ts`, `espace/web/src/lib/dm.ts`, `espace/web/src/lib/creators.ts`, `espace/web/src/components/GlobeSection.tsx:117-118`, `espace/web/src/components/CardNav.tsx:229-230`

**Interfaces:**
- Produces: `api.ts` → `type SessionState = 'anon' | 'auth' | 'error'`, `initSession(): Promise<SessionState>`, `sessionState()`, `getMe(): Me | null`, `API = '/espace/api'`, `apiJson`, `needsConsent`, `saveConsent`, `logout()`. `Me = { id, display_name, avatar, founder, visible, dms_open, consented_at, providers }`.

- [ ] **Step 1 : Vite et HTML**

`vite.config.ts` :
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/espace/',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/espace/api': 'http://localhost:8788', '/espace/auth': 'http://localhost:8788', '/espace/media': 'http://localhost:8788' } },
});
```

`index.html` : `<title>FemzLab — Mon espace</title>` ; `href="/espace/fonts/InstrumentSans.woff2"` ; `<script src="/espace/i18n.js"></script>`.
`index.css` ligne 9 : `src: url('/espace/fonts/InstrumentSans.woff2') format('woff2');`.
`GlobeSection.tsx` 117-118 : `fetch('/espace/land110.geojson')`, `fetch('/espace/cities.json')`.
`CardNav.tsx` 229-230 : `src="/espace/FemzLab-logo-safari.mov"`, `src="/espace/FemzLab-logo.webm"`.

- [ ] **Step 2 : `lib/api.ts` réécrit**

```ts
/** Session : trois états, jamais de repli local (spec §3). */
export type Me = { id: number; display_name: string | null; avatar: string | null; founder: boolean; visible: boolean; dms_open: boolean; consented_at: string | null; providers: string[] };
export type SessionState = 'anon' | 'auth' | 'error';
export const API = '/espace/api';

let me: Me | null = null;
let state: SessionState = 'anon';

export async function initSession(): Promise<SessionState> {
  try {
    const r = await fetch(`${API}/me`, { credentials: 'same-origin' });
    if (r.status === 401) { state = 'anon'; me = null; }
    else if (r.ok) { me = (await r.json()) as Me; state = 'auth'; }
    else state = 'error';
  } catch { state = 'error'; }
  return state;
}
export const sessionState = () => state;
export const hasSession = () => state === 'auth';
export const getMe = () => me;
export const needsConsent = () => me !== null && !me.consented_at;

export function applyConsentLocal(visible: boolean, dmsOpen: boolean) {
  if (me) me = { ...me, visible, dms_open: dmsOpen, consented_at: new Date().toISOString() };
}
export async function saveConsent(visible: boolean, dmsOpen: boolean) {
  await apiJson(`${API}/consent`, { method: 'PUT', body: JSON.stringify({ visible, dms_open: dmsOpen }) });
  applyConsentLocal(visible, dmsOpen);
}
export function setMeAvatar(url: string | null) { if (me) me = { ...me, avatar: url }; }
export async function logout() {
  await fetch('/espace/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.assign('/espace/');
}
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...init });
  if (!r.ok) throw new Error(`${init?.method || 'GET'} ${url} → ${r.status}`);
  return (await r.json()) as T;
}
```

- [ ] **Step 3 : Stores sans `localStorage`**

`lib/profile.ts` — remplacer tout le fichier :
```ts
import { API, apiJson } from './api';
export type ProfileReel = { url: string; thumb: string | null };
export type ProfileData = { display_name: string; city: string; av: string | null; socials: { ig: string; tt: string; yt: string }; reels: ProfileReel[] };
type ApiProfile = { display_name: string | null; city: string; lat: number | null; lon: number | null; avatar: string | null; socials: { ig?: string; tt?: string; yt?: string }; reels: ProfileReel[] };
let cache: ProfileData | null = null;
const subs = new Set<(d: ProfileData) => void>();
const fromApi = (p: ApiProfile): ProfileData => ({ display_name: p.display_name || '', city: p.city || '', av: p.avatar, socials: { ig: p.socials?.ig || '', tt: p.socials?.tt || '', yt: p.socials?.yt || '' }, reels: p.reels || [] });
export async function initProfileFromApi() { cache = fromApi(await apiJson<ApiProfile>(`${API}/profile`)); }
export const profileStore = {
  load: () => cache,
  /** Enregistre côté serveur ; résout avec le profil renvoyé (ville géocodée). Lève si le serveur refuse. */
  async save(d: Pick<ProfileData, 'display_name' | 'city' | 'socials' | 'reels'>) {
    const p = await apiJson<ApiProfile>(`${API}/profile`, { method: 'PUT', body: JSON.stringify({ display_name: d.display_name, city: d.city, socials: d.socials, reels: d.reels.map((r) => ({ url: r.url })) }) });
    cache = fromApi(p); subs.forEach((f) => f(cache!)); return cache;
  },
  setAvatar(url: string | null) { if (cache) { cache = { ...cache, av: url }; subs.forEach((f) => f(cache!)); } },
  setReelThumb(i: number, url: string) { if (cache) { const reels = [...cache.reels]; while (reels.length <= i) reels.push({ url: '', thumb: null }); reels[i] = { ...reels[i], thumb: url }; cache = { ...cache, reels }; subs.forEach((f) => f(cache!)); } },
  subscribe(f: (d: ProfileData) => void) { subs.add(f); return () => subs.delete(f); },
};
```

`lib/dm.ts` — supprimer `KEY`, `WELCOME`, `LANG`, `welcomeFor`, `remote`, `persist()`, le bloc `if (!data) {…}` ; `let data: DmData = {}` ; `initDmsFromApi` inchangé sauf `apiJson(\`${API}/dms\`)` ; `send()` : pousser le message localement puis `apiJson(\`${API}/dms/${id}\`, …)` et, en cas d'erreur, **retirer le message local et relancer** (`throw`) pour que l'UI affiche le refus (dms fermés, blocage, 429) ; `read()` : `apiJson(\`${API}/dms/${id}/read\`, …)`. Ajouter `avatar?: string | null` à `DmConv` (renseigné depuis l'API).

`lib/creators.ts` — supprimer le tableau de démo `CREATORS = [ … ]` (le remplacer par `export const CREATORS: Creator[] = [];`), `creatorsTotal()` rend `remoteTotal ?? 0`, `ApiCreator` gagne `badges: string[]` et perd `formations` ; dans `initCreatorsFromApi` : `stats: u.founder ? 'Fondateur · FemzLab' : (u.badges.length ? u.badges.join(' · ') : 'Membre FemzLab')`, `f: u.badges`, `apiJson(\`${API}/creators\`)`. Supprimer la fonction `badge()`.

- [ ] **Step 4 : Vérifier la compilation** — `cd espace/web && npm install && npx tsc --noEmit`. Les erreurs attendues à ce stade viennent de `CardNav.tsx`, `App.tsx`, `main.tsx`, `GlobeSection.tsx` (champs `formations`, `profileStore.save` synchrone) — elles sont traitées en Tasks 9-10 ; noter la liste, ne rien contourner.
- [ ] **Step 5 : Commit** — `git add espace/web && git commit -m "espace(web): base /espace, session à trois états, stores sans localStorage"`.

---

### Task 9 : Front — écran de connexion, écran d'erreur, `App` et `main`

**Files:**
- Create: `espace/web/src/components/Login.tsx`, `espace/web/src/components/ErrorScreen.tsx`
- Modify: `espace/web/src/App.tsx`, `espace/web/src/main.tsx`, `espace/web/src/index.css` (styles `.login*`, `.errscreen`)
- Delete: `espace/web/src/components/{Hero,Modules,Packs,Upsell,TestimonialsSlider}.tsx`

- [ ] **Step 1 : `Login.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const ERREURS: Record<string, string> = {
  oauth: 'La connexion a échoué chez le fournisseur. Réessaie.',
  email_non_verifie: 'Ton email n’est pas vérifié chez ce fournisseur : vérifie-le, puis reviens.',
};

export default function Login() {
  const [membres, setMembres] = useState<number | null>(null);
  const erreur = new URLSearchParams(location.search).get('erreur');
  useEffect(() => { fetch(`${API}/stats`).then((r) => r.json()).then((s) => setMembres(s.membres)).catch(() => {}); }, []);
  return (
    <main className="login wrap">
      <h1 className="login-h">Ton espace FemzLab</h1>
      <p className="login-p">Ton profil, la carte des créateurs, tes messages — et tes produits, réunis au même endroit.</p>
      {erreur && <p className="login-err" role="alert">{ERREURS[erreur] || 'Connexion impossible pour le moment.'}</p>}
      <div className="login-btns">
        <a className="btn btn-acc" href="/espace/auth/google">Continuer avec Google</a>
        <a className="btn" href="/espace/auth/discord">Continuer avec Discord</a>
      </div>
      {membres !== null && <p className="login-count">{membres} {membres > 1 ? 'créateurs' : 'créateur'} dans la communauté</p>}
      <p className="login-note">Aucune adresse e-mail n’est jamais affichée. Tu choisis toi-même si tu apparais sur la carte.</p>
    </main>
  );
}
```

`ErrorScreen.tsx` :
```tsx
export default function ErrorScreen() {
  return (
    <main className="errscreen wrap" role="alert">
      <h1 className="login-h">L’espace est momentanément indisponible</h1>
      <p className="login-p">Le serveur ne répond pas. Rien n’est perdu : ton profil vit sur nos serveurs, pas dans ce navigateur. Réessaie dans un instant.</p>
      <button className="btn btn-acc" onClick={() => location.reload()}>Réessayer</button>
    </main>
  );
}
```

CSS à ajouter en fin d'`index.css` (tokens existants) :
```css
.login,.errscreen{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:18px;position:relative;z-index:1}
.login-h{font-size:clamp(28px,4vw,44px);font-weight:700;text-wrap:balance;letter-spacing:-.02em}
.login-p{color:var(--muted);max-width:520px}
.login-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px}
.login-count{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.login-note{font-size:12px;color:var(--muted);max-width:420px}
.login-err{color:#ff8a8a;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.25);border-radius:var(--r-sm);padding:10px 14px;font-size:14px}
```

- [ ] **Step 2 : `App.tsx`**

```tsx
import { useRef, useState } from 'react';
import Aurora from './components/Aurora';
import DotField from './components/DotField';
import CardNav, { type CardNavHandle } from './components/CardNav';
import DmModal from './components/DmModal';
import ConsentModal from './components/ConsentModal';
import GlobeSection from './components/GlobeSection';
import GradualBlur from './components/GradualBlur';
import Login from './components/Login';
import ErrorScreen from './components/ErrorScreen';
import { useGlobalEffects } from './hooks/useGlobalEffects';
import { sessionState } from './lib/api';

/** Espace membre FemzLab : Connexion | Erreur | Espace (nav, globe, DM, consentement). */
export default function App() {
  const navRef = useRef<CardNavHandle>(null);
  const [conv, setConv] = useState<string | null>(null);
  useGlobalEffects();
  const st = sessionState();
  return (
    <>
      <Aurora />
      <DotField />
      {st === 'error' && <ErrorScreen />}
      {st === 'anon' && <Login />}
      {st === 'auth' && (
        <>
          <CardNav ref={navRef} onOpenConv={setConv} />
          <GlobeSection />
          <div className="wrap" style={{ paddingTop: 0 }}>
            <footer><span>FemzLab — l’espace des créateurs</span><span>Support · Discord · femzlab.shop</span></footer>
          </div>
          <DmModal convId={conv} onClosed={() => setConv(null)} onBackToList={() => { setConv(null); navRef.current?.openDms(); }} />
          <ConsentModal />
        </>
      )}
      <GradualBlur />
    </>
  );
}
```

- [ ] **Step 3 : `main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initSession } from './lib/api';
import { initProfileFromApi } from './lib/profile';
import { initDmsFromApi } from './lib/dm';
import { initCreatorsFromApi } from './lib/creators';

/** Session résolue AVANT le premier rendu ; connecté → les stores s'hydratent depuis l'API. Pas de repli local. */
async function bootstrap() {
  const state = await initSession();
  if (state === 'auth') {
    const results = await Promise.allSettled([initProfileFromApi(), initDmsFromApi(), initCreatorsFromApi()]);
    for (const r of results) if (r.status === 'rejected') console.warn('Hydratation API partielle :', r.reason);
  }
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
void bootstrap();
```

- [ ] **Step 4 : Supprimer les composants cours** — `git rm espace/web/src/components/{Hero,Modules,Packs,Upsell,TestimonialsSlider}.tsx` ; retirer du CSS uniquement les blocs qui ne servent plus si `tsc`/`vite build` s'en plaint (le CSS mort n'est pas une erreur ; ne pas passer du temps à le purger dans ce plan).
- [ ] **Step 5 : `npx tsc --noEmit`** — Expected: seules restent les erreurs de `CardNav.tsx` et `GlobeSection.tsx` (Task 10).
- [ ] **Step 6 : Commit** — `git add -A espace/web && git commit -m "espace(web): écran de connexion Google/Discord, écran d'erreur, app sans sections cours"`.

---

### Task 10 : Front — `ProfilePanel`, `CardNav` allégé, consentement OFF par défaut, globe

**Files:**
- Create: `espace/web/src/components/ProfilePanel.tsx`
- Modify: `espace/web/src/components/CardNav.tsx` (remplacement complet), `ConsentModal.tsx:14-15`, `GlobeSection.tsx` (champ `f` déjà = badges ; retirer toute référence à `formations` ; `profileStore` asynchrone), `index.css` (`.pf-*` conservés)

**Interfaces:**
- Consumes: `profileStore` (Task 8), `getMe/setMeAvatar/logout/needsConsent` (Task 8), `NVDM`.
- Produces: `ProfilePanel({ onClose })` — formulaire complet ; `CardNav` expose toujours `openDms()` et `onOpenConv`.

- [ ] **Step 1 : `ProfilePanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { profileStore, type ProfileReel } from '../lib/profile';
import { API, getMe, saveConsent, setMeAvatar, logout } from '../lib/api';
import { Pencil } from './Icons';

/** Réduit une image côté navigateur (max 512 px, WebP) avant envoi — pas de traitement serveur. */
async function shrink(file: File, max = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res) => cv.toBlob((b) => res(b!), 'image/webp', 0.86));
}
async function upload(path: string, blob: Blob): Promise<string> {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type }, body: blob });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as any).error || `upload ${r.status}`);
  return ((await r.json()) as { url: string }).url;
}

export default function ProfilePanel({ onClose }: { onClose: () => void }) {
  const p = profileStore.load();
  const me = getMe();
  const [name, setName] = useState(p?.display_name || me?.display_name || '');
  const [city, setCity] = useState(p?.city || '');
  const [ig, setIg] = useState(p?.socials.ig || '');
  const [tt, setTt] = useState(p?.socials.tt || '');
  const [yt, setYt] = useState(p?.socials.yt || '');
  const [av, setAv] = useState<string | null>(p?.av || me?.avatar || null);
  const [reels, setReels] = useState<ProfileReel[]>(() => [0, 1, 2].map((i) => p?.reels[i] || { url: '', thumb: null }));
  const [visible, setVisible] = useState(!!me?.visible);
  const [dmsOpen, setDmsOpen] = useState(!!me?.dms_open);
  const [label, setLabel] = useState('Enregistrer');
  const [err, setErr] = useState('');
  useEffect(() => profileStore.subscribe((d) => setAv(d.av)), []);

  async function pickAvatar(f: File) {
    try { const url = await upload(`${API}/media/avatar`, await shrink(f)); setAv(url); profileStore.setAvatar(url); setMeAvatar(url); }
    catch (e: any) { setErr(e.message); }
  }
  async function pickThumb(i: number, f: File) {
    try { const url = await upload(`${API}/media/reel/${i}`, await shrink(f, 720)); setReels((rs) => rs.map((x, j) => (j === i ? { ...x, thumb: url } : x))); profileStore.setReelThumb(i, url); }
    catch (e: any) { setErr(e.message); }
  }
  async function save() {
    setErr('');
    try {
      await profileStore.save({ display_name: name, city, socials: { ig: ig.trim(), tt: tt.trim(), yt: yt.trim() }, reels });
      setLabel('Enregistré'); setTimeout(() => { setLabel('Enregistrer'); onClose(); }, 900);
    } catch (e: any) { setErr('Enregistrement refusé : ' + e.message); }
  }
  const toggle = (which: 'visible' | 'dms') => () => {
    const v = which === 'visible' ? !visible : visible, d = which === 'dms' ? !dmsOpen : dmsOpen;
    setVisible(v); setDmsOpen(d);
    saveConsent(v, d).catch(() => setErr('Réglage de confidentialité non enregistré — réessaie.'));
  };

  return (
    <>
      <div className="pf-head">
        <label className="pf-av" title="Changer la photo de profil" style={av ? { backgroundImage: `url(${av})` } : undefined}>
          {av ? '' : (name || '?').slice(0, 2).toUpperCase()}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); }} />
          <span className="pf-av-edit"><Pencil /></span>
        </label>
        <div><b>{name || 'Ton profil'}</b><span>{me?.founder ? 'Fondateur · FemzLab' : 'Membre FemzLab'}</span></div>
      </div>
      <div className="pf-right">
        <label>Nom affiché <input type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Ville <input type="text" maxLength={80} value={city} placeholder="Paris" onChange={(e) => setCity(e.target.value)} /></label>
        <label>Instagram <input type="text" placeholder="@pseudo" value={ig} onChange={(e) => setIg(e.target.value)} /></label>
        <label>TikTok <input type="text" placeholder="@pseudo" value={tt} onChange={(e) => setTt(e.target.value)} /></label>
        <label>YouTube <input type="text" placeholder="@chaîne" value={yt} onChange={(e) => setYt(e.target.value)} /></label>
      </div>
      <div className="pf-reels">
        <span className="pf-sub">Mes 3 reels <em>— ils s'affichent sur ta carte du globe</em></span>
        {reels.map((r, i) => (
          <div className="pf-reel" key={i}>
            <label className={'pf-thumb' + (r.thumb ? ' filled' : '')} style={r.thumb ? { backgroundImage: `url(${r.thumb})` } : undefined}>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickThumb(i, f); }} />
              +
            </label>
            <input type="url" placeholder={i === 0 ? 'Lien du reel 1 (Instagram / TikTok)' : `Lien du reel ${i + 1}`} value={r.url}
              onChange={(e) => setReels((rs) => rs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <div className="pf-privacy">
        <span className="pf-sub">Confidentialité</span>
        <button className="pf-tgrow" type="button" onClick={toggle('visible')}><span>Apparaître sur le globe</span><span className={'tg' + (visible ? ' on' : '')} aria-hidden="true"><i /></span></button>
        <button className="pf-tgrow" type="button" onClick={toggle('dms')}><span>Recevoir des messages</span><span className={'tg' + (dmsOpen ? ' on' : '')} aria-hidden="true"><i /></span></button>
        <p className="pf-sub" style={{ marginTop: 10 }}>Connexions : {(me?.providers || []).join(' · ') || '—'}
          {!me?.providers.includes('google') && <> · <a href="/espace/auth/google">ajouter Google</a></>}
          {!me?.providers.includes('discord') && <> · <a href="/espace/auth/discord">ajouter Discord</a></>}
        </p>
      </div>
      {err && <p className="login-err" role="alert">{err}</p>}
      <button className="btn btn-acc pf-save" onClick={() => void save()}>{label}</button>
      <button className="btn pf-save" type="button" onClick={() => void logout()}>Se déconnecter</button>
    </>
  );
}
```

- [ ] **Step 2 : `CardNav.tsx` allégé** (remplacement complet — même nav Glass, sans anneau de progression ni liens cours)

```tsx
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { NVDM } from '../lib/dm';
import { profileStore } from '../lib/profile';
import { prefersReducedMotion } from '../lib/motion';
import { MessageBubble } from './Icons';
import { getMe } from '../lib/api';
import ProfilePanel from './ProfilePanel';

gsap.registerPlugin(CustomEase);
const nvEase = CustomEase.create('nvNav', '0.22,1,0.36,1');
type Panel = 'menu' | 'profile' | 'msgs' | null;
export type CardNavHandle = { openDms: () => void };
type Props = { onOpenConv: (id: string) => void };

const CardNav = forwardRef<CardNavHandle, Props>(function CardNav({ onOpenConv }, ref) {
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [av, setAv] = useState<string | null>(profileStore.load()?.av || getMe()?.avatar || null);
  useEffect(() => profileStore.subscribe((d) => setAv(d.av)), []);
  useSyncExternalStore(NVDM.subscribe, NVDM.version);
  const convs = NVDM.convs();
  const unread = NVDM.unread() > 0;
  const me = getMe();
  useImperativeHandle(ref, () => ({ openDms: () => setPanel('msgs') }));

  useLayoutEffect(() => {
    const nav = navRef.current!;
    let h = 94;
    if (panel === 'menu') h = 94 + (contentRef.current?.scrollHeight || 0) + 2;
    if (panel === 'profile') h = 94 + (profileRef.current?.scrollHeight || 0) + 2;
    if (panel === 'msgs') h = 94 + (msgsRef.current?.scrollHeight || 0) + 2;
    if (Math.abs(nav.offsetHeight - h) < 1) return;
    gsap.to(nav, { height: h, duration: prefersReducedMotion() ? 0 : 0.45, ease: nvEase, overwrite: 'auto' });
  });
  useLayoutEffect(() => {
    if (panel !== 'menu') return;
    const cards = contentRef.current?.querySelectorAll('.ncard');
    if (!cards?.length) return;
    if (prefersReducedMotion()) { gsap.set(cards, { y: 0, opacity: 1 }); return; }
    gsap.fromTo(cards, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: nvEase, stagger: 0.08, delay: 0.06 });
  }, [panel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    const onClick = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.cnav-wrap')) setPanel(null); };
    addEventListener('keydown', onKey); document.addEventListener('click', onClick);
    return () => { removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const navClass = 'cnav' + (panel === 'menu' ? ' open' : '') + (panel === 'profile' ? ' profile' : '') + (panel === 'msgs' ? ' msgs' : '');
  const initials = (me?.display_name || '?').slice(0, 2).toUpperCase();
  const convIds = Object.keys(convs);

  return (
    <div className="cnav-wrap">
      <nav className={navClass} ref={navRef}>
        <div className="cnav-top">
          <button className="hamb" aria-label="Ouvrir le menu" aria-expanded={panel === 'menu'} onClick={() => toggle('menu')}><i /><i /></button>
          <div className="cnav-brand">
            <a className="cnav-home" href="https://www.femzlab.shop" aria-label="Retour sur femzlab.shop">
              <video className="cnav-logovid" autoPlay muted loop playsInline aria-hidden="true" onLoadedMetadata={(e) => { e.currentTarget.play().catch(() => {}); }}>
                <source src="/espace/FemzLab-logo-safari.mov" type='video/mp4; codecs="hvc1"' />
                <source src="/espace/FemzLab-logo.webm" type="video/webm" />
              </video>
            </a>
            <div className="cnav-logo">MON <em>ESPACE</em></div>
          </div>
          <div className="cnav-right">
            <button className={'msg-btn' + (unread ? ' unread' : '')} aria-expanded={panel === 'msgs'} aria-controls="cnavMsgs" aria-label="Messages" onClick={() => toggle('msgs')}>
              <MessageBubble /><span className="msg-dot" />
            </button>
            <button className="me-btn" aria-expanded={panel === 'profile'} aria-controls="cnavProfile" onClick={() => toggle('profile')}>
              <span className="me-av" style={av ? { backgroundImage: `url(${av})` } : undefined}>{av ? '' : initials}</span>
              <span className="me-label">Mon espace</span>
            </button>
          </div>
        </div>

        <div className="cnav-profile" id="cnavProfile" ref={profileRef} aria-hidden={panel !== 'profile'}>
          {panel === 'profile' && <ProfilePanel onClose={() => setPanel(null)} />}
        </div>

        <div className="cnav-msgs" id="cnavMsgs" ref={msgsRef} aria-hidden={panel !== 'msgs'}>
          <p className="dm-title">Messages</p>
          {convIds.length === 0 && <p className="dm-title dm-empty">Aucune conversation — clique un créateur sur le globe.</p>}
          {convIds.map((id) => {
            const c = convs[id]; const last = c.msgs[c.msgs.length - 1];
            return (
              <button key={id} className="dm-item" onClick={() => { setPanel(null); onOpenConv(id); }}>
                {c.avatar ? <span className="dm-av" style={{ backgroundImage: `url(${c.avatar})` }} /> : <span className="dm-av">{c.name.slice(0, 2).toUpperCase()}</span>}
                <div><b>{c.name}</b><span>{last ? (last.f === 'me' ? 'Toi : ' : '') + last.x : ''}</span></div>
                {c.unread > 0 && <span className="du" />}
              </button>
            );
          })}
        </div>

        <div className="cnav-content" id="cnavContent" ref={contentRef} aria-hidden={panel !== 'menu'}>
          <div className="ncard ncard-1">
            <div className="ncard-label">Communauté</div>
            <div className="ncard-links">
              <a href="#globe" onClick={() => setPanel(null)}><b>↗</b> Le globe</a>
              <a href="https://discord.gg/xmwq2NMDTw" target="_blank" rel="noopener"><b>↗</b> Discord</a>
            </div>
          </div>
          <div className="ncard ncard-2">
            <div className="ncard-label">Mon compte</div>
            <div className="ncard-links">
              <a href="#" onClick={(e) => { e.preventDefault(); setPanel('profile'); }}><b>↗</b> Mon profil</a>
              <a href="#" onClick={(e) => { e.preventDefault(); setPanel('profile'); }}><b>↗</b> Confidentialité</a>
            </div>
          </div>
          <div className="ncard ncard-3">
            <div className="ncard-label">FemzLab</div>
            <div className="ncard-links">
              <a href="https://www.femzlab.shop"><b>↗</b> La boutique</a>
              <a href="mailto:hello@imfemz.com"><b>↗</b> Support</a>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
});
export default CardNav;
```

- [ ] **Step 3 : Consentement OFF par défaut** — `ConsentModal.tsx` lignes 14-15 : `useState(false)` pour `visible` **et** `dms` ; supprimer le `catch` silencieux de `confirm()` : en cas d'échec, afficher `Réglage non enregistré — réessaie.` sous le bouton (état `err`) et garder la modale ouverte.

- [ ] **Step 4 : `GlobeSection.tsx`** — `grep -n "formations\|profileStore.save\|creatorsTotal" GlobeSection.tsx` : remplacer les usages de `formations` par `f` (déjà les badges), rendre asynchrones les appels à `profileStore.save` (`void profileStore.save(...)` avec `.catch(() => {})` là où le globe synchronisait la carte Femz — désormais inutile : la carte se met à jour via `subscribeCreators` après `initCreatorsFromApi()` ; **après un enregistrement de profil réussi, rappeler `initCreatorsFromApi()`** depuis `ProfilePanel.save()` pour que le point bouge — ajouter `import { initCreatorsFromApi } from '../lib/creators'` et `await initCreatorsFromApi().catch(() => {})` après `profileStore.save`).

- [ ] **Step 5 : Compiler et construire** — `npx tsc --noEmit && npm run build` — Expected: 0 erreur, `dist/index.html` référence `/espace/assets/…`. Vérifier : `grep -c "/espace/assets/" dist/index.html` ≥ 1 et `grep -c "url(/espace/fonts" dist/assets/*.css` ≥ 1.
- [ ] **Step 6 : Commit** — `git add -A espace/web && git commit -m "espace(web): panneau profil avec uploads R2, nav allégée, consentement OFF par défaut"`.

---

### Task 11 : Parcours réel en local (Playwright contre `wrangler dev`)

**Files:**
- Create: `espace/worker/test/e2e/parcours.spec.mjs` (script Playwright autonome, exécuté avec `node`), `espace/worker/test/e2e/README.md`

- [ ] **Step 1 : Lancer la pile locale**

```bash
cd espace/web && npm run build && cd ../worker
npm run migrate:local
npm run dev &            # http://localhost:8788 (ENV=development via .dev.vars)
```

- [ ] **Step 2 : Le script**

```js
// test/e2e/parcours.spec.mjs — node test/e2e/parcours.spec.mjs
import { chromium } from 'playwright';
const B = 'http://localhost:8788';
const ok = (c, m) => { if (!c) { console.error('ÉCHEC :', m); process.exit(1); } console.log('ok  ', m); };
const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1280, height: 800 } });

await pg.goto(`${B}/espace/`);
ok(await pg.locator('text=Continuer avec Google').count() === 1, 'écran de connexion');
await pg.goto(`${B}/espace/auth/dev-login?email=fraps81@gmail.com`);
await pg.waitForURL(`${B}/espace/`);
ok(await pg.locator('.consent').count() === 1, 'modale de consentement au 1er login');
ok(await pg.locator('.consent .tg.on').count() === 0, 'les deux toggles OFF par défaut');
await pg.locator('.consent-row').first().click(); await pg.locator('.consent-cta').click();
await pg.waitForSelector('.consent', { state: 'detached' });
await pg.locator('.me-btn').click();
await pg.fill('input[placeholder="Paris"]', 'Cannes');
await pg.locator('.pf-save.btn-acc').click();
await pg.waitForTimeout(1200);
const creators = await (await pg.request.get(`${B}/espace/api/creators`)).json();
const femz = creators.find((c) => c.display_name === 'fraps81');
ok(femz && Math.abs(femz.lat - 43.55) < 0.1, 'profil enregistré, ville géocodée, visible sur le globe');
ok(!JSON.stringify(creators).includes('@'), 'aucun email dans /creators');
await pg.locator('.me-btn').click();
await pg.setInputFiles('.pf-av input[type=file]', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
await pg.waitForTimeout(800);
const me = await (await pg.request.get(`${B}/espace/api/me`)).json();
ok(/^\/espace\/media\/avatars\//.test(me.avatar || ''), 'avatar stocké dans R2');
await pg.reload(); await pg.waitForSelector('.me-av');
ok((await pg.locator('.me-av').getAttribute('style') || '').includes('/espace/media/avatars/'), 'avatar persistant après rechargement');
await br.close(); console.log('PARCOURS OK');
```

Run: `npm i -D playwright && npx playwright install chromium && node test/e2e/parcours.spec.mjs` — Expected: `PARCOURS OK`.
(`README.md` : les trois commandes ci-dessus. Le DM n'est pas testé ici : un seul membre en local ; il est couvert par les tests Worker.)

- [ ] **Step 3 : Commit** — `git add espace/worker/test/e2e && git commit -m "espace: parcours navigateur local (connexion dev, consentement, profil, avatar persistant)"`.

---

### Task 12 : Déploiement en production et premier membre

**Files:**
- Modify: `espace/worker/wrangler.jsonc` (rien à changer si l'id D1 est déjà en place), `femzlab-shop-front/README.md` (section « Espace membre »)
- Create: `espace/worker/DEPLOY.md`

- [ ] **Step 1 : Pré-requis fournis par Femz** (bloquant — demander avant de commencer cette tâche)
  - **Google** : console.cloud.google.com → APIs & Services → Identifiants → *Créer un ID client OAuth* (Application Web) → Origines : `https://www.femzlab.shop` ; URI de redirection : `https://www.femzlab.shop/espace/auth/google/callback`. Écran de consentement : type Externe, app « FemzLab », scopes email/profile ; **publier l'app** (sinon limite à 100 testeurs).
  - **Discord** : discord.com/developers → l'application du bot existant → OAuth2 → Redirects : `https://www.femzlab.shop/espace/auth/discord/callback` ; copier Client ID + Client Secret.

- [ ] **Step 2 : Secrets et migration distante**

```bash
cd espace/worker
npx wrangler secret put JWT_SECRET          # openssl rand -hex 32
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npm run migrate:remote
```

- [ ] **Step 3 : Déployer et vérifier**

```bash
npm run deploy
sleep 30
curl -s -o /dev/null -w "%{http_code}\n" https://www.femzlab.shop/espace/            # 200 (app)
curl -s https://www.femzlab.shop/espace/api/stats                                    # {"membres":0}
curl -s -o /dev/null -w "%{http_code}\n" https://www.femzlab.shop/espace/api/me      # 401
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://femzlab.shop/espace/ # 301 → https://www.femzlab.shop/espace/
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.femzlab.shop/espace/auth/google | grep -c accounts.google.com  # 1
curl -s -o /dev/null -w "%{http_code}\n" https://www.femzlab.shop/motionlab/          # 200 — le reste du site n'est pas touché
```

- [ ] **Step 4 : Premier membre** — Femz se connecte avec Google (`fraps81@gmail.com`) sur `https://www.femzlab.shop/espace/` ; vérifier : `npx wrangler d1 execute femzlab-espace-db --remote --command "SELECT id, display_name, founder FROM users"` → 1 ligne, `founder = 1`. Il remplit son profil (photo, ville, réseaux) → **c'est l'écran clé à lui faire valider** avant les Plans 2 et 3.

- [ ] **Step 5 : `DEPLOY.md`** (commandes des étapes 2-3, où trouver les identifiants OAuth, comment restaurer : `npx wrangler d1 time-travel restore femzlab-espace-db --timestamp=<unix>` et où sont les copies nocturnes `backups/` dans R2) ; section « Espace membre » dans le README du site (chemin `espace/`, `npm run deploy`, lien vers la spec et ce plan).

- [ ] **Step 6 : Commit** — `git add espace/worker/DEPLOY.md README.md && git commit -m "espace: déploiement en production sur femzlab.shop/espace, premier membre"`.

---

## Auto-revue du plan

- **Couverture de la spec (périmètre Plan 1)** : §3 architecture (T0, T7, T12) · §4.1 OAuth, identités, fondateur, attache d'un 2e fournisseur (T3) · §5 modèle (T1 ; `purchases`, `link_requests`, `reports` → Plan 2) · §6 images (T5, T10) · §7 API (T3-T7 ; `/purchases`, `/link-requests`, `/reports`, `/export`, `/account`, hooks et admin → Plans 2-3) · §8 app (T8-T10) · §11 consentement OFF par défaut, anonymisation, jamais d'email (T4, T10) · §12 sécurité (state OAuth T3, magic bytes T5, débit en base T6) · §13 erreurs (T9 écrans, T10 refus affichés) · §14 tests (T1-T7 Worker, T11 navigateur, T12 prod) · §15 phases 1-2 (T12).
  Reporté explicitement : « Télécharger mes données / Supprimer mon compte » (§11) et signalements → Plan 3 avec l'admin ; « Mes produits » → Plan 2.
- **Placeholders** : `DATABASE_ID` est remplacé à l'étape T0.3 par la valeur créée à T0.2 ; aucun autre.
- **Cohérence des noms** : `fz_session`/`COOKIE`, `API = '/espace/api'`, `mediaUrl`, `profileStore.save` (async, Task 8) utilisé en async dans Task 10, `ProfileReel.thumb: string | null` partout, `Me.providers` produit en Task 4 et consommé en Task 10, `badges` produit en Task 4 et consommé en Task 8 (`creators.ts`).
