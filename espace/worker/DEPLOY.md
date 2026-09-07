# Déploiement — espace membre (femzlab.shop/espace)

Worker `femzlab-espace` (Hono + D1 + R2 + Workers Static Assets), routé sur
`femzlab.shop/espace*` et `www.femzlab.shop/espace*` comme les autres Workers
du site (`avis-worker`, le Worker des licences). État au 2026-09-07 : la
migration D1 a été appliquée en distant, le bundle a été validé en
`--dry-run`, **rien n'a été publié**. Quatre pré-requis bloquent encore le
premier vrai déploiement — ils ne peuvent être levés que par Femz depuis les
consoles Cloudflare / Google / Discord.

## a) Pré-requis Femz (bloquants, à faire avant `npm run deploy`)

**Redirection apex → www sur tout le site** — Cloudflare → Rules → Redirect
Rules : `femzlab.shop/*` → `https://www.femzlab.shop/$1` en 301. Le cookie de
session est désormais *host-only* (posé sur `www.femzlab.shop` seul, plus de
`Domain=femzlab.shop` qui l'envoyait aussi à `pay.femzlab.shop`, le CNAME
Podia). Conséquence : l'entrée « Mon espace » des pages du site (Plan 3) ne
verra la session que si **tout le site** vit sur `www` — une page servie sur
l'apex n'enverra jamais le cookie. Le Worker redirige déjà `femzlab.shop/espace*`,
mais lui seul : la règle de zone couvre le reste du site.

**R2** — le bucket `femzlab-espace-media` n'existe pas, le compte n'a pas R2
activé (`wrangler r2 bucket create` échoue avec `10042 NotEntitled`) :

1. Dashboard Cloudflare → R2 → « Commencer » (activer l'offre gratuite).
2. `npx wrangler r2 bucket create femzlab-espace-media`

**OAuth Google** — console.cloud.google.com → APIs & Services →
Identifiants → *Créer un ID client OAuth* :
- Type d'application : Web
- Origine JavaScript autorisée : `https://www.femzlab.shop`
- URI de redirection autorisé : `https://www.femzlab.shop/espace/auth/google/callback`
- Écran de consentement : type Externe, app « FemzLab », scopes email/profile,
  puis **publier l'app** (sinon la connexion est limitée à 100 testeurs).
- Récupérer le Client ID et le Client Secret générés.

**OAuth Discord** — discord.com/developers → application du bot existant →
OAuth2 → Redirects → ajouter `https://www.femzlab.shop/espace/auth/discord/callback` →
copier le Client ID et le Client Secret (bouton « Reset Secret » si besoin
d'en régénérer un).

## b) Secrets

Depuis `espace/worker` :

```bash
npx wrangler secret put JWT_SECRET          # valeur : openssl rand -hex 32
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
```

Chaque commande invite à coller la valeur ; rien n'est jamais écrit dans un
fichier du dépôt.

## c) Migration distante

```bash
npm run migrate:remote
```

**Déjà fait le 2026-09-07** : `0001_socle.sql` est appliqué sur la base
distante `femzlab-espace-db`. Vérifié avec :

```bash
npx wrangler d1 execute femzlab-espace-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

→ `blocks`, `d1_migrations`, `dms`, `identities`, `rate_events`,
`user_emails`, `users` (+ tables internes SQLite/D1 `_cf_KV`,
`sqlite_sequence`). Rien à rejouer sauf nouvelle migration future.

## d) Déployer et vérifier

Une fois (a) et (b) faits :

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

`npm run deploy` fait `npm --prefix ../web run build && wrangler deploy` : le
front est reconstruit à chaque déploiement, jamais publié tel quel depuis un
`dist/` périmé.

## e) Premier membre

Femz se connecte avec Google (`fraps81@gmail.com`) sur
`https://www.femzlab.shop/espace/`. Vérifier :

```bash
npx wrangler d1 execute femzlab-espace-db --remote \
  --command "SELECT id, display_name, founder FROM users"
```

→ 1 ligne, `founder = 1`. Il remplit ensuite son profil (photo, ville,
réseaux) : **c'est l'écran clé à lui faire valider** avant d'attaquer les
Plans 2 et 3.

## f) Exploitation

- **Restauration** — Time Travel D1 (rétention 7 jours sur le plan gratuit,
  30 jours en payant) :
  ```bash
  npx wrangler d1 time-travel restore femzlab-espace-db --timestamp=<unix>
  ```
- **Sauvegardes nocturnes** — cron `0 3 * * *` (03:00 UTC) déclenche
  `backupToR2` (`src/lib/backup.ts`) : dump JSON des tables `users`,
  `identities`, `user_emails`, `dms`, `blocks` dans le bucket R2, clé
  `backups/AAAA-MM-JJ.json`, rétention 90 jours (purge automatique des clés
  plus anciennes à chaque exécution). Ces objets ne sont **jamais** servis
  par `GET /espace/media/*` — cette route n'accepte que les préfixes
  `avatars/` et `reels/`.
- **Logs** — `npx wrangler tail femzlab-espace`

## g) Notes

- `compatibility_date` est fixé à `2026-03-10` : c'est le plafond accepté par
  le pool de test vitest (`@cloudflare/vitest-pool-workers`) au moment de
  l'écriture ; ne pas l'avancer sans revérifier que les tests passent encore.
- `espace/web/dist` est ignoré par git. Sur un clone frais, `wrangler.jsonc`
  référence ce dossier comme répertoire d'assets : **construire le front
  (`npm --prefix ../web run build`) ou au minimum créer
  `../web/dist/index.html`** avant de lancer `npm test` dans
  `espace/worker`, sinon le chargement de la config échoue.
- Développement local : `cp .dev.vars.example .dev.vars` puis `npm run dev`
  (= `wrangler dev --local --port 8788 --local-upstream localhost:8788`) —
  voir `test/e2e/README.md` pour le détail du drapeau `--local-upstream`
  (nécessaire à cause des `routes` de zone déclarées dans `wrangler.jsonc`) et
  pour le parcours Playwright local.
- `ENV` est une **liste blanche** : seules les valeurs `development` et `test`
  ouvrent la route `dev-login` et posent les cookies sans `Secure`. Une
  variable absente ou inconnue est traitée comme la production.
- En production, les cookies s'appellent `__Host-fz_session` et
  `__Host-fz_oauth` (préfixe `__Host-` : un navigateur les refuse s'ils sont
  posés avec `Domain=`, depuis un autre hôte, ou sans `Secure`/`Path=/`) — ils
  ne peuvent donc pas être posés par un sous-domaine comme `pay.femzlab.shop`.
  En dev/test ils restent `fz_session` / `fz_oauth`, sans préfixe.
- Le dépôt est **public** : jamais un identifiant OAuth ni un secret dans un
  fichier versionné. En local, ils vivent uniquement dans `.dev.vars` (ignoré
  par `espace/worker/.gitignore` ; `.dev.vars.example` en est le modèle
  versionné, sans valeur réelle) ; en production, uniquement via
  `wrangler secret put`.

## Achats (Plan 2)

Migration et déploiement faits le 2026-09-07 ; le snippet et l'import restent
à faire par Femz.

Ce plan ajoute les tables `purchases` et `link_requests`, le hook de
checkout Podia, les demandes de liaison (rattachement d'un achat fait avec
une autre adresse email), les badges produits et la carte « Mes produits »
côté front. Aucun nouveau secret, aucune nouvelle variable d'environnement :
mêmes bindings qu'au Plan 1.

**Migration distante** — `cd espace/worker && npm run migrate:remote` a
appliqué `0002_achats.sql` sur la base distante `femzlab-espace-db` (déjà à
jour pour `0001_socle.sql`). Vérifié avec :

```bash
npx wrangler d1 execute femzlab-espace-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

→ `blocks`, `d1_migrations`, `dms`, `identities`, `link_requests`,
`purchases`, `rate_events`, `user_emails`, `users` (+ tables internes
SQLite/D1 `_cf_KV`, `sqlite_sequence`) : 8 tables applicatives, `purchases`
et `link_requests` bien présentes.

**Déploiement** — `npm run deploy` (front reconstruit puis `wrangler
deploy`, comme au Plan 1). Vérifié avec les commandes de la section (d)
ci-dessus, plus deux vérifications propres à ce plan :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.femzlab.shop/espace/hooks/checkout --data '{}'   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://www.femzlab.shop/espace/admin/link/0000/approve             # 200 (page « introuvable »)
curl -s -o /dev/null -w "%{http_code}\n" https://www.femzlab.shop/espace/api/purchases                       # 401
```

**Reste à faire par Femz — pré-requis avant que les achats remontent
réellement :**

1. **Coller le nouveau snippet sur CHAQUE produit** — dans Podia, pour
   `motionlab`, `metavision`, `fade-pack`, `ghost-fx-preset-after-effects`,
   `sfx-whoosh-pack`, `ultimate-ios-pack`, `vortex-pack` : Settings →
   Analytics → « Conversion tracking code » → coller le contenu de
   `espace/worker/podia-snippet.html`. Retirer l'ancien snippet
   MotionLAB-only (`MotionLAB/license-worker/podia-snippet.html`) de la page
   MotionLAB s'il y est encore, pour ne pas poster deux fois (sans risque de
   doublon métier — `UNIQUE(email,product,purchased_at)` et le service de
   licences restent indépendants — mais deux requêtes réseau pour rien).
2. **Importer les acheteurs existants** — exporter depuis Podia (par
   produit) : Students/Customers → Export CSV. Pour chaque export : garder
   les colonnes email + date d'achat, les mettre au format
   `email,purchased_at` (AAAA-MM-JJ) attendu par le script. Puis, depuis
   `espace/worker` :

   ```bash
   FZ_SESSION=<valeur du cookie __Host-fz_session, copiée depuis les DevTools> \
     node scripts/import-purchases.mjs metavision.csv "MetaVision"
   FZ_SESSION=<idem> node scripts/import-purchases.mjs motionlab.csv "MotionLAB"
   ```

   Vérifier ensuite dans l'app (`/espace/` → profil) que les badges
   apparaissent pour les membres déjà connectés qui figuraient dans ces
   exports.
