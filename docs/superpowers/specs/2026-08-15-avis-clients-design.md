# Avis clients — collecte et affichage défilant

**Date** : 2026-08-15
**Statut** : validé, prêt pour le plan d'implémentation

## Problème

La section `#avis` de l'accueil contient trois cartes, dont **une seule est un vrai avis
client** (« Super formation ! », 2 mots). Les deux autres sont des contenus de remplissage :
une carte de statistiques signée Femz et une invitation à venir sur le Discord.

Femz veut remplacer cette grille par un **marquee horizontal** (cartes qui défilent en
continu, façon bulles de messagerie) et supprimer les deux cartes de remplissage.

Ces deux exigences sont incompatibles en l'état : un marquee affiche ~3,5 cartes
simultanément et boucle. Avec un seul avis, il ne peut pas tourner. **Il faut donc
collecter des avis avant de pouvoir construire l'affichage demandé.**

## Objectif

Un pipeline complet et durable : les clients déposent un avis via un formulaire de marque,
Femz le vérifie et le publie, et il apparaît dans un marquee sur l'accueil.

## Gisement disponible

Export des factures Podia : **139 factures, ~70 clients distincts ayant payé au moins une
fois**, de novembre 2022 à juillet 2026. Environ 30 ont acheté MetaVision, environ 25 sont
des acheteurs récurrents (2 achats ou plus).

Les acheteurs récurrents sont la cible prioritaire de la première campagne : quelqu'un qui
est revenu trois ou quatre fois répond plus volontiers qu'un acheteur unique de 2023.

À un taux de réponse de 10 à 20 % sur un envoi ciblé, cela représente **7 à 14 avis** —
le seuil à partir duquel le marquee tourne sans donner l'impression de se répéter.

> Les noms et emails des clients ne figurent **jamais** dans ce dépôt (voir Contraintes).

## Non-objectifs

Explicitement hors périmètre, et pourquoi :

- **Pas de base de données.** Le volume attendu est de l'ordre de 15 avis. Une base pour
  15 lignes est de l'infrastructure à maintenir sans contrepartie.
- **Pas d'interface d'administration.** La notification Discord et un fichier JSON versionné
  remplissent le même rôle sans rien à héberger.
- **Pas de vérification automatique de l'achat.** Une liste d'emails hachés dans le Worker
  a été envisagée puis écartée : un hash d'email reste une donnée personnelle et se
  brute-force (entropie trop faible), et le dépôt est public. La vérification se fait à la
  main dans la recherche Podia — quelques secondes par avis.
- **Pas d'étoiles affichées** tant qu'il n'y a pas assez de notes réelles. Femz a toujours
  refusé les étoiles inventées ; la note est collectée mais pas affichée au lancement.
- **Pas de captcha** tant qu'aucun spam n'est constaté. Un champ piège suffit au départ.

## Architecture

Trois composants, un seul flux, aucun service tiers.

```
Client                     Cloudflare                    Femz
  |                            |                           |
  |-- remplit /avis ---------->|                           |
  |                            |-- POST /api/avis          |
  |                            |   (Pages Function)        |
  |                            |-- webhook ------------->  | notification Discord
  |<-- confirmation -----------|                           |
                                                           |-- vérifie l'email dans Podia
                                                           |-- colle dans src/reviews.json
                                                           |-- build.py + wrangler deploy
                                                           v
                                                    marquee sur l'accueil
```

### ① Page `femzlab.shop/avis`

Nouveau fichier `src/avis.html`, ajouté à la liste `PAGES` de `build.py` avec pour cible
`avis/index.html`.

Reprend à l'identique la structure des deux pages existantes : logo fixe, dock de
navigation, footer, DA claire, et le traducteur FR/EN runtime (TreeWalker + dictionnaire,
même motif que `index.html` et `portfolio.html`).

Champs du formulaire :

| Champ | Type | Obligatoire | Publié | Note |
|---|---|---|---|---|
| Produit | select | oui | oui | inclut les anciens noms (voir ci-dessous) |
| Email d'achat | email | oui | **non** | sert uniquement à la vérification |
| Prénom ou pseudo | texte, 2-40 | oui | oui | c'est ce qui s'affiche |
| Avis | textarea, 40-400 | oui | oui | borné pour des hauteurs de cartes cohérentes |
| Note sur 5 | select | non | pas au lancement | permettra une moyenne réelle plus tard |
| Consentement | case | oui | — | autorise la publication du pseudo et du texte |
| Champ piège | caché | — | — | anti-spam : doit rester vide |

**Anciens noms de produits à inclure dans le select.** Le catalogue a été renommé au fil du
temps ; un acheteur de 2023 ne retrouverait pas son produit dans une liste ne contenant que
les intitulés actuels :

| Intitulé actuel | Anciens intitulés vus dans les factures |
|---|---|
| METAVISION - Formation VFX | META VISION - Comment vivre de sa passion ? |
| Presets Pack | VFX Presets Pack |
| Whoosh Sound Pack | SFX Whoosh Pack, Whoosh Pack |
| Ghost FX | Ghost FX (Preset After Effects) |
| Ultimate iOS Pack | — |
| Vortex Sound Pack | — |
| 3D Text Pack / 3D Text Pack Pro | — |

Validation côté client (feedback immédiat) **et** côté serveur (la seule qui fait foi).
État de succès affiché en place, sans rechargement.

### ② Endpoint `functions/api/avis.js`

Pages Function à la racine du dépôt. Vérifié empiriquement : `wrangler pages deploy dist`
compile un dossier `functions/` situé à la racine du répertoire courant, pas dans `dist/`.
Aucun Worker séparé, aucun sous-domaine, aucune configuration CORS.

Traitement :

1. Rejette tout ce qui n'est pas `POST` avec un corps JSON.
2. Rejette si le champ piège est rempli.
3. Valide chaque champ selon le tableau ci-dessus ; renvoie les erreurs par champ.
4. Poste sur le webhook Discord, dans un salon privé.
5. Renvoie `200` avec un corps de confirmation, ou `400` avec le détail des erreurs.

L'URL du webhook est un **secret Cloudflare** (`DISCORD_WEBHOOK_AVIS`), jamais dans le
dépôt. Le message Discord contient tous les champs, email inclus, pour que Femz puisse
vérifier sans quitter Discord.

Si du spam apparaît : une règle de rate limiting Cloudflare sur `/api/avis`, configurée au
tableau de bord, sans toucher au code.

### ③ Marquee sur l'accueil

La section `#avis` de `src/index.html` est refaite. Les deux cartes de remplissage
(statistiques Femz, invitation Discord) sont supprimées.

Structure : un conteneur en `overflow: hidden` avec un fondu sur les bords
(`mask-image`), une piste en flex dont la liste d'avis est **dupliquée exactement une
fois** (la copie en `aria-hidden`), et une animation `translateX` linéaire en boucle.
Pause au survol pour laisser le temps de lire.

Cartes : fond blanc plein, avatar en initiale dans un cercle (pas de photo — le formulaire
n'en collecte pas), pseudo, produit, texte. Largeur 260-340 px, hauteur automatique, piste
centrée verticalement pour retrouver le décalage de la référence.

**Deux contraintes non négociables :**

- **Aucun `backdrop-filter` sur ces cartes.** Safari iOS plafonne le nombre de couches de
  verre par page ; le marquee en duplique une vingtaine et ferait perdre le flou à
  d'autres éléments de la page. Ce piège est déjà documenté dans `#mobile-fixes`.
- **Repli statique** sous `prefers-reduced-motion: reduce` : animation coupée, copie
  masquée, avis présentés en grille.

### Format de `src/reviews.json`

```json
{
  "mise_a_jour": "2026-08-15",
  "avis": [
    {
      "id": "2026-08-15-01",
      "pseudo": "Théo A.",
      "produit": "METAVISION",
      "texte": "…",
      "note": 5,
      "date": "2026-08-14"
    }
  ]
}
```

`build.py` lit ce fichier et remplace le contenu entre deux marqueurs de la section `#avis`
de `src/index.html` :

```html
<!-- reviews:start -->…généré, ne pas éditer à la main…<!-- reviews:end -->
```

L'injection a lieu au build, sur le texte en cours de traitement, avant l'écriture dans
`dist/` — `src/index.html` n'est jamais modifié. Le site reste 100 % statique : aucun appel
réseau au chargement, aucun état de chargement à gérer.

`id` sert uniquement de repère pour Femz quand il retrouve un avis dans le fichier ; il
n'est ni rendu ni utilisé par le code. `note` est collectée et stockée mais pas rendue au
lancement.

## Flux opérationnel

1. Femz exporte le CSV des acheteurs depuis Podia (bouton **Export**) et cible en priorité
   les acheteurs récurrents et les acheteurs MetaVision.
2. Il leur envoie le lien `femzlab.shop/avis`.
3. Le client remplit le formulaire.
4. Femz reçoit une notification Discord.
5. Il recherche l'email dans Podia pour confirmer l'achat.
6. Il ajoute une entrée dans `src/reviews.json`.
7. `python3 build.py && npx wrangler pages deploy dist --project-name femzlab-shop --branch main`

## Conformité

L'article L.111-7-2 du Code de la consommation impose d'informer sur les modalités de
collecte et de traitement des avis, et de prendre des mesures pour vérifier qu'ils
proviennent de clients réels. La DGCCRF a relevé des irrégularités sur 55 % des sites
contrôlés en 2024.

Mesures retenues :

- **Vérification** : l'email d'achat est obligatoire et recoupé dans Podia avant publication.
- **Consentement** : case à cocher explicite pour la publication du pseudo et du texte.
- **Transparence** : ligne affichée sous le marquee — « Avis recueillis par formulaire
  auprès de clients ayant acheté le produit. Publiés sans sélection sur la note. » suivie
  de la date de dernière mise à jour.
- **Pas de tri sur la note.** Si un avis négatif arrive, il est publié. La modération ne
  porte que sur le spam, les insultes et le hors-sujet. Publier uniquement les avis
  positifs tout en affichant cette mention constituerait une pratique commerciale trompeuse.
- **Minimisation** : l'email n'est ni publié, ni stocké dans le dépôt, ni conservé ailleurs
  que dans le message Discord.

## Contraintes

- **Le dépôt `imfemz/femzlab-shop` est public.** Aucun email, aucun nom de client, aucun
  secret ne doit être commité. Cela vaut pour `reviews.json` (pseudos uniquement) comme
  pour ce document.
- `src/` fait foi ; `dist/` est régénéré par `build.py` et n'est pas versionné.
- Le déploiement reste manuel, par choix.
- Le patch `#mobile-fixes` en bas de `src/index.html` doit être préservé.
- Pas d'emoji dans l'interface (règle de DA établie).

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/avis.html` | nouveau — page formulaire |
| `src/reviews.json` | nouveau — avis publiés |
| `functions/api/avis.js` | nouveau — endpoint |
| `src/index.html` | modifié — section `#avis` refaite en marquee, 2 cartes supprimées |
| `build.py` | modifié — `avis.html` ajouté aux `PAGES`, injection de `reviews.json` |
| `README.md` | modifié — flux de publication d'un avis |
| `TRACKING.md` | modifié — CTA de la nouvelle page |

## Critères d'acceptation

1. `femzlab.shop/avis` s'affiche dans la DA du site, avec la même navigation et le même
   basculement FR/EN que les deux autres pages.
2. Une soumission valide déclenche un message Discord contenant tous les champs.
3. Une soumission invalide (champ manquant, texte trop court, consentement décoché, champ
   piège rempli) est rejetée côté serveur avec une erreur lisible par champ.
4. Ajouter une entrée dans `reviews.json` puis rebuilder fait apparaître la carte dans le
   marquee, sans autre modification.
5. Le marquee défile en continu, se met en pause au survol, et se replie en grille statique
   sous `prefers-reduced-motion`.
6. Sur iPhone, aucune carte de la page ne perd son flou après ajout du marquee.
7. Les cartes « Femz » et « Discord » ont disparu de la section `#avis`.
8. La mention de collecte est affichée sous le marquee.
9. `git grep` sur le dépôt ne remonte aucun email client ni l'URL du webhook.

## Risques

- **Taux de réponse plus faible que prévu.** Si la campagne rapporte moins de 6 avis, le
  marquee tournera trop vite sur lui-même et la répétition se verra. Le marquee reste ce
  qu'on construit ; le repli consiste à activer le rendu en grille déjà écrit pour
  `prefers-reduced-motion` — même `reviews.json`, même balisage, une classe sur le
  conteneur — jusqu'à ce que le seuil soit atteint. Décision à prendre au vu du nombre
  d'avis réellement collectés, pas maintenant.
- **Adresses obsolètes.** Une partie des acheteurs de 2022-2023 ne lira jamais le message.
  Atténuation : cibler d'abord les acheteurs récents et récurrents.
- **Avis négatif.** Il devra être publié. C'est le coût de la mention de transparence — et
  ce qui rend les autres crédibles.
