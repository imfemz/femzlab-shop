# Parcours e2e (Playwright contre `wrangler dev`)

Script Playwright autonome (pas de test runner), exécuté avec `node`.
Il vérifie le parcours réel d'un membre en local : connexion dev, modale de
consentement, profil (ville géocodée, visible sur le globe, aucun email
exposé) et avatar persistant après rechargement.

Prérequis : la pile locale tourne sur `http://localhost:8788` (worker
`wrangler dev`, migrations D1 locales appliquées).

```bash
cd espace/worker
npm run migrate:local
npm run dev &            # http://localhost:8788 (ENV=development via .dev.vars)
```

Puis, dans `espace/worker` :

```bash
npm i -D playwright
npx playwright install chromium
node test/e2e/parcours.spec.mjs
```

Sortie attendue : `PARCOURS OK`.

Le DM (messagerie) n'est pas testé ici : il faudrait un second membre, et ce
scénario est déjà couvert par les tests Worker (vitest). Ce script se limite
à un seul membre (`fraps81@gmail.com` via la route de dev `dev-login`, active
uniquement hors production).
