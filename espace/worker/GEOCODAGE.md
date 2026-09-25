# Géocodage de l'espace membre — état et règles

Contexte à charger avant toute intervention sur le placement des membres sur le
globe de `femzlab.shop/espace`. Rédigé le 2026-09-25, après correction d'un bug
où se rendre visible faisait DISPARAÎTRE le membre du globe.

## Le problème d'origine

Un membre à Bruxelles bascule « Apparaître sur le globe » → il n'apparaît nulle
part. Trois causes cumulées, toutes corrigées :

1. **La base de villes est anglophone.** « Bruxelles » n'existait pas (seul
   `brussels`), donc aucune coordonnée n'était enregistrée. 27 villes sur 64
   testées manquaient : Londres, Barcelone, Genève, New York, Moscou, Alger…
2. **Sans coordonnées, un membre visible n'était affiché nulle part.** Le serveur
   ne l'envoyait plus en point anonyme (puisqu'il est visible) et le front ignore
   les entrées sans `lat`/`lon`. Invisible, il était au moins un point anonyme ;
   visible, il s'effaçait.
3. **Le basculement ne rafraîchissait pas le globe.** Seul « Enregistrer »
   rechargeait la liste des créateurs.

## Où ça vit

| fichier | rôle |
|---|---|
| `src/lib/geocode.ts` | tout le géocodage : villes, pays, alias, centres |
| `src/data/cities.json` | 2 958 villes, clés anglophones minuscules |
| `src/data/countries.json` | 243 pays ISO-3166 → `[lat, lon]` |
| `src/data/country-names.json` | 461 noms de pays (FR + EN + alias) → code ISO |
| `scripts/gen-countries.mjs` | génère les deux tables pays (versionnées) |
| `src/lib/users.ts` | `updateProfile` (écriture) et `creatorsList` (lecture) |
| `test/geocode.test.ts` | 71 assertions sur des saisies réalistes |
| `test/profile.test.ts` | bout en bout : profil → `/api/creators` |

Le front ne géocode pas : il charge `cities.json` mais ne s'en sert pas
(`citiesRef` dans `GlobeSection.tsx` est assigné, jamais lu). **Toute la logique
est côté Worker** — c'est le seul endroit à modifier.

## Comment un lieu est résolu

`geocode(lieu)` essaie dans cet ordre :

1. la **ville** : `cities.json`, puis la table `ALIAS` (28 exonymes français :
   bruxelles→brussels, londres→london, pekin→beijing…) ;
2. si la saisie contient une virgule (« Trifouillis, Maroc »), les segments sont
   lus **de droite à gauche** comme noms de pays ;
3. la chaîne entière comme **nom de pays** (« Belgique », « Japan »).

Normalisation commune : minuscules, accents retirés (NFD), apostrophes, tirets
et points remplacés par des espaces. Elle doit rester identique entre
`geocode.ts` et `gen-countries.mjs`, sinon les clés générées ne correspondent
plus.

`countryCenter(code)` : centre d'un pays ISO-2. La table `AJUSTES` (22 pays
réglés à la main) **prime** sur `countries.json` — le centre géométrique du
Canada tombe à 60°N, en plein Arctique.

## Règles à ne pas casser

- **Un membre visible et nommé a TOUJOURS des coordonnées.** Dans
  `creatorsList` : coordonnées enregistrées → sinon re-géocodage de la ville à la
  lecture → sinon centre du pays de connexion avec une dispersion stable par
  membre. Sans ce repli, le bug d'origine revient.
- **Le re-géocodage à la lecture** existe pour que les profils enregistrés avant
  les alias retrouvent leur ville sans que le membre ait à ressaisir quoi que ce
  soit. Ne pas le supprimer sans migration des lignes concernées.
- **Après un changement de consentement**, le front rappelle
  `initCreatorsFromApi()` (`ProfilePanel.tsx`), sinon le globe ne bouge pas.
- Un alias ne doit jamais pointer vers une clé absente de `cities.json` : la
  vérification est dans `test/geocode.test.ts`.

## Commandes

```bash
node scripts/gen-countries.mjs   # régénère countries.json + country-names.json
npx vitest run                   # 156 tests (dont 71 de géocodage)
npm run deploy                   # build du front + wrangler deploy
```

## Limites connues

- Les 243 centres de pays ne sont pas audités visuellement : pour un pays très
  étiré ou insulaire, le repli peut tomber en mer. Correction = une ligne dans
  `AJUSTES`.
- La dispersion de ±1,5° lat / ±2° lon appliquée aux points de repli peut sortir
  un membre d'un micro-État (Monaco, Singapour) de son territoire.
- `cities.json` reste anglophone : une ville française absente passe par le repli
  pays. Ajouter l'exonyme dans `ALIAS` quand une ville revient souvent.
