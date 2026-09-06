# Déploiement — espace membre (femzlab.shop/espace)

Worker `femzlab-espace` (Hono + D1 + R2 + Workers Static Assets), routé sur
`femzlab.shop/espace*` et `www.femzlab.shop/espace*` comme les autres Workers
du site (`avis-worker`, le Worker des licences). État au 2026-09-07 : la
migration D1 a été appliquée en distant, le bundle a été validé en
`--dry-run`, **rien n'a été publié**. Deux pré-requis bloquent encore le
premier vrai déploiement — ils ne peuvent être levés que par Femz depuis les
consoles Cloudflare / Google / Discord.

## a) Pré-requis Femz (bloquants, à faire avant `npm run deploy`)

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
- Développement local : `npm run dev` (= `wrangler dev --local --port 8788
  --local-upstream localhost:8788`) — voir `test/e2e/README.md` pour le
  détail du drapeau `--local-upstream` (nécessaire à cause des `routes` de
  zone déclarées dans `wrangler.jsonc`) et pour le parcours Playwright local.
- Le dépôt est **public** : jamais un identifiant OAuth ni un secret dans un
  fichier versionné. En local, ils vivent uniquement dans `.dev.vars`
  (ignoré par `espace/worker/.gitignore`) ; en production, uniquement via
  `wrangler secret put`.
