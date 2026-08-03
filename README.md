# femzlab.shop

Code source du site **[femzlab.shop](https://femzlab.shop)** et de sa page
**[/portfolio](https://femzlab.shop/portfolio)**.

Site statique hébergé sur Cloudflare Pages. Le paiement, les comptes et la
livraison des produits restent gérés par Podia, déplacé sur
`pay.femzlab.shop` — les anciens liens sont redirigés via `src/_redirects`.

## Structure

```
src/
├── index.html        page principale du shop  (75 Ko)
├── portfolio.html    page portfolio          (40 Ko)
├── assets/           images, vidéos, polices (51 fichiers)
└── _redirects        redirections vers Podia
build.py              src/ → dist/ (ré-embarque les assets en base64)
```

`src/` fait foi. Les deux pages s'ouvrent directement dans un navigateur
depuis `src/` — les assets sont référencés en chemins relatifs.

`dist/` n'est pas versionné : `build.py` le régénère à l'identique.

## Modifier le site

```bash
# 1. éditer src/index.html ou src/portfolio.html
# 2. reconstruire
python3 build.py

# 3. déployer
npx wrangler pages deploy dist --project-name femzlab-shop --branch main
```

Pour ajouter une image ou une vidéo : la déposer dans `src/assets/`, la
référencer en `assets/mon-fichier.jpg`, puis rebuilder. `build.py` s'occupe de
l'embarquer.

## Pourquoi les assets sont ré-embarqués au build

Les pages déployées sont des fichiers HTML uniques contenant tout en base64.
C'est la forme sous laquelle le site tourne aujourd'hui, conservée telle quelle
pour ne rien changer à son comportement en ligne. Le découpage `src/` +
`assets/` n'existe que pour rendre le code lisible et modifiable : sans lui,
`index.html` fait 4,6 Mo dont 98 % de base64, et GitHub refuse d'afficher un
fichier de cette taille.

## Notes

- Polices : Montserrat 800 (titres), Inter 400/700 (corps).
- Le patch `#mobile-fixes` en bas de `src/index.html` corrige deux bugs iOS :
  le dock fixe qui recouvrait la promo, et les cartes en verre qui perdent leur
  flou quand Safari plafonne le nombre de couches `backdrop-filter`.
