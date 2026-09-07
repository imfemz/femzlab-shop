# Parcours e2e (Playwright contre `wrangler dev`)

Script Playwright autonome (pas de test runner), exécuté avec `node`.
Il vérifie le parcours réel d'un membre en local : connexion dev, modale de
consentement, profil (ville géocodée, visible sur le globe, aucun email
exposé) et avatar persistant après rechargement.

Prérequis : la pile locale tourne sur `http://localhost:8788` (worker
`wrangler dev`, migrations D1 locales appliquées).

```bash
cd espace/worker
cp .dev.vars.example .dev.vars   # ENV=development, secret de dev ; jamais versionné
npm run migrate:local
npm run dev &            # http://localhost:8788 (ENV=development via .dev.vars)
```

`.dev.vars` est ignoré par git ; `.dev.vars.example` en est le modèle versionné
(sans aucun secret réel). Les deux identifiants OAuth y sont vides : le parcours
local passe par `dev-login`, qui n'a besoin d'aucun fournisseur. `ENV` doit
valoir `development` ou `test`, sinon `dev-login` répond 404 (liste blanche) et
les cookies sont posés en `Secure`, donc perdus en http local.

`npm run dev` lance `wrangler dev --local --port 8788 --local-upstream localhost:8788`.
Le drapeau `--local-upstream` est nécessaire : `wrangler.jsonc` déclare des
`routes` pour le déploiement (zone `femzlab.shop`), et sans ce drapeau,
`wrangler dev` simule ce hostname de zone même en local — la requête vue par
le Worker a alors un `url.hostname` de `femzlab.shop` plutôt que `localhost`,
ce qui déclenche systématiquement le middleware apex→www de `src/index.ts` et
renvoie un `301` vers `https://www.femzlab.shop/...` au lieu de servir la
page en local.

Pour rejouer le parcours depuis zéro (le script suppose un 1er login, donc la
modale de consentement doit s'afficher — si `fraps81@gmail.com` existe déjà
dans la base locale d'un essai précédent, cette modale n'apparaît plus) :
arrêtez le serveur `wrangler dev` s'il tourne, repartez d'une base vide, puis
relancez la pile locale.

```bash
rm -rf .wrangler/state   # `.dev.vars` est conservé
npm run migrate:local
npm run dev &
```

Puis, dans `espace/worker` :

```bash
npx playwright install chromium   # playwright est déjà en devDependency
node test/e2e/parcours.spec.mjs
```

Sortie attendue : `PARCOURS OK`.

Le DM (messagerie) n'est pas testé ici : il faudrait un second membre, et ce
scénario est déjà couvert par les tests Worker (vitest). Ce script se limite
à un seul membre (`fraps81@gmail.com` via la route de dev `dev-login`, active
uniquement hors production).
