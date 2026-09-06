# femzlab.shop

Code source du site **[femzlab.shop](https://femzlab.shop)** et de ses pages
**[/portfolio](https://femzlab.shop/portfolio)** et
**[/avis](https://femzlab.shop/avis)**.

Site statique hébergé sur Cloudflare Pages. Le paiement, les comptes et la
livraison des produits restent gérés par Podia, déplacé sur
`pay.femzlab.shop` — les anciens liens sont redirigés via `src/_redirects`.

## Structure

```
src/
├── index.html        page principale du shop  (75 Ko)
├── portfolio.html    page portfolio          (40 Ko)
├── avis.html         formulaire de collecte d'avis (28 Ko)
├── assets/           images, vidéos, polices (51 fichiers)
└── _redirects        redirections vers Podia
build.py              src/ → dist/ (ré-embarque les assets en base64)
```

`src/` fait foi. Les pages s'ouvrent directement dans un navigateur
depuis `src/` — les assets sont référencés en chemins relatifs.

`dist/` n'est pas versionné : `build.py` le régénère à l'identique.

## Modifier le site

```bash
# 1. éditer src/index.html, src/portfolio.html ou src/avis.html
# 2. reconstruire
python3 build.py

# 3. déployer
npx wrangler pages deploy dist --project-name femzlab-shop --branch main
```

Pour ajouter une image ou une vidéo : la déposer dans `src/assets/`, la
référencer en `assets/mon-fichier.jpg`, puis rebuilder. `build.py` s'occupe de
l'embarquer.

## Publier un avis client

1. Une notification arrive sur Discord quand quelqu'un remplit `/avis`.
2. Vérifier l'email dans Podia (recherche en haut de la liste des factures)
   pour confirmer l'achat.
3. Ajouter une entrée dans `src/reviews.json` — **pseudo uniquement, jamais
   l'email** : le dépôt est public. Champs : `pseudo`, `produit` (doit
   correspondre exactement au `produit="…"` du marqueur de la page), `texte`,
   `date` (ISO, sert au tri), et facultatifs `instagram` (pseudo sans @) +
   `avatar` (fichier dans `src/assets/`, ex. `avatar-<pseudo>.jpg`) : présents
   tous les deux, la carte affiche sa vraie photo et `@pseudo` à la place du
   nom. La photo se télécharge une fois et s'héberge ici — jamais de lien
   direct vers le CDN Instagram (URLs signées, elles expirent).
4. `python3 build.py` puis déployer.

Les avis s'affichent sur la page du produit concerné (plus sur l'accueil
depuis le 2026-09-06), via le marqueur
`<!-- reviews:start produit="MetaVision" --><!-- reviews:end -->` posé dans
une `section.band#avis` avec son `.sec-head`. Pour une prochaine page produit :
même section, même marqueur avec son `produit`, les deux clés i18n de
l'en-tête, et `#avis .mqwrap{padding-top:26px}` pour l'écart en-tête→contenu.
Sans avis pour ce produit, la section se masque seule. Le style et le moteur
de défilement (repris d'editingshift.com) sont injectés par `build.py` avec le
bloc : une seule source, rien à copier d'une page à l'autre.

Un seul avis reste posé, centré ; à partir de deux, ça défile. La carte ne
porte ni produit, ni date, ni mention de collecte (décision du 2026-09-06) —
la phrase « publiés sans sélection sur la note » ne vit plus que sur `/avis`.

**Ne jamais purger, archiver-puis-nettoyer ou supprimer ce salon Discord.**
C'est la seule trace de ce qui a été soumis, en face de ce qui a été publié
dans `reviews.json` — la preuve que la mention « publiés sans sélection sur
la note » est respectée. La perdre, c'est perdre la conformité du dispositif.

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
