# Avis clients — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collecter les avis clients via un formulaire de marque et les afficher dans un marquee défilant sur l'accueil, en remplacement des trois cartes actuelles.

**Architecture:** Trois pièces indépendantes reliées par un fichier JSON versionné. `src/reviews.json` contient les avis publiés ; `build.py` les injecte en HTML statique entre deux marqueurs de `src/index.html` au moment du build ; une Pages Function `functions/api/avis.js` reçoit les nouvelles soumissions et les poste sur un webhook Discord. Aucune base de données, aucun appel réseau au chargement des pages.

**Tech Stack:** HTML/CSS/JS sans framework · Python 3 (stdlib uniquement) pour le build · Cloudflare Pages Functions · `unittest` (stdlib) pour les tests du build.

## Global Constraints

- **Le dépôt `imfemz/femzlab-shop` est public.** Aucun email client, aucun nom de client, aucun secret ne doit être commité — y compris dans les tests et les fixtures.
- `src/` fait foi. `dist/` est régénéré par `build.py` et n'est pas versionné. Ne jamais éditer `dist/` à la main.
- Commande de build : `python3 build.py` — depuis la racine du dépôt.
- Commande de déploiement : `npx wrangler pages deploy dist --project-name femzlab-shop --branch main` — depuis la racine du dépôt. **Ne pas déployer sans l'accord explicite de Femz.**
- Aucun `backdrop-filter` sur les cartes du marquee (Safari iOS plafonne les couches de verre par page).
- Aucun emoji dans l'interface.
- Le bloc `<style id="mobile-fixes">` en fin de `src/index.html` doit être préservé intact.
- Variables CSS existantes à réutiliser : `--paper:#E4E4DF` · `--ink:#0A0A08` · `--charcoal:#161616` · `--muted:#67675F` · `--dim:#8D8D84` · `--line:rgba(20,20,15,.1)` · `--shadow:0 18px 44px rgba(25,25,18,.10)` · `--r-lg:18px` · `--lbl:'Inter',sans-serif`.
- Polices : `Montserrat` 800 (titres), `Inter` 400/700 (corps). Fichiers `assets/woff2-01..03.woff2`.
- Textes de l'interface en français ; la traduction anglaise passe par le dictionnaire i18n runtime existant.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/reviews.json` | **Créer.** Les avis publiés. Seule source de contenu du marquee. |
| `build.py` | **Modifier.** Ajoute `avis.html` aux pages et injecte les avis entre les marqueurs. |
| `tests/test_build.py` | **Créer.** Tests unitaires de l'échappement et de l'injection. |
| `src/index.html` | **Modifier.** CSS du marquee ; section `#avis` remplacée par les marqueurs. |
| `functions/api/avis.js` | **Créer.** Endpoint : valide la soumission, poste sur Discord. |
| `src/avis.html` | **Créer.** Page formulaire, coque copiée de `portfolio.html`. |
| `README.md` | **Modifier.** Flux de publication d'un avis. |
| `TRACKING.md` | **Modifier.** CTA de la nouvelle page. |

Ordre des tâches choisi pour que quelque chose de visible fonctionne au plus tôt : la couche de données d'abord (Tâche 1), puis l'affichage que Femz a demandé (Tâche 2), puis la collecte (Tâches 3 et 4).

---

## Task 1: Couche de données — `reviews.json` et injection au build

**Files:**
- Create: `src/reviews.json`
- Create: `tests/test_build.py`
- Modify: `build.py`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `build.echappe(texte: str) -> str`
  - `build.carte(avis: dict, dup: bool = False) -> str` — une `<figure class="mqcard">`
  - `build.bloc_avis(donnees: dict) -> str` — le bloc complet (conteneur + piste + mention)
  - `build.injecte_avis(texte: str, donnees: dict) -> str` — remplace entre les marqueurs
  - Marqueurs : `build.DEBUT = "<!-- reviews:start -->"`, `build.FIN = "<!-- reviews:end -->"`
  - Seuil : `build.SEUIL_MARQUEE = 6`

- [ ] **Step 1: Créer `src/reviews.json` avec le seul avis réel existant**

Le texte et l'auteur viennent de `src/index.html:849`. C'est le seul avis authentique dont dispose FemzLab à ce jour ; ne rien inventer d'autre.

```json
{
  "mise_a_jour": "2026-08-16",
  "avis": [
    {
      "id": "2026-08-16-01",
      "pseudo": "Georges A.",
      "produit": "METAVISION",
      "texte": "Super formation !",
      "note": null,
      "date": "2026-07-28"
    }
  ]
}
```

- [ ] **Step 2: Écrire les tests d'abord**

Créer `tests/test_build.py` :

```python
"""Tests de l'injection des avis dans le HTML au moment du build."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import build


def donnees(nombre):
    """Jeu de données synthétique de `nombre` avis."""
    return {
        "mise_a_jour": "2026-08-16",
        "avis": [
            {
                "id": f"t-{i}",
                "pseudo": f"Testeur {i}",
                "produit": "Presets Pack",
                "texte": "Un avis de test suffisamment long pour être realiste.",
                "note": 5,
                "date": "2026-08-16",
            }
            for i in range(nombre)
        ],
    }


class TestEchappement(unittest.TestCase):
    def test_neutralise_le_html_injecte(self):
        avis = {
            "pseudo": "Mallory",
            "produit": "Ghost FX",
            "texte": "<script>alert(1)</script>",
        }
        rendu = build.carte(avis)
        self.assertNotIn("<script>", rendu)
        self.assertIn("&lt;script&gt;", rendu)

    def test_neutralise_les_guillemets_et_esperluettes(self):
        rendu = build.carte(
            {"pseudo": 'A"B', "produit": "R&D", "texte": "x"}
        )
        self.assertIn("&quot;", rendu)
        self.assertIn("&amp;", rendu)

    def test_initiale_en_majuscule(self):
        rendu = build.carte(
            {"pseudo": "théo", "produit": "Presets Pack", "texte": "x"}
        )
        self.assertIn('<span class="av" aria-hidden="true">T</span>', rendu)

    def test_copie_marquee_masquee_aux_lecteurs_d_ecran(self):
        avis = {"pseudo": "Théo", "produit": "Presets Pack", "texte": "x"}
        # `assertIn` ne suffirait pas : l'avatar porte lui aussi aria-hidden.
        # C'est bien la <figure> qui doit être masquée, et seulement en copie.
        self.assertTrue(
            build.carte(avis, dup=True).startswith(
                '<figure class="mqcard" aria-hidden="true">'
            )
        )
        self.assertTrue(
            build.carte(avis).startswith('<figure class="mqcard">')
        )


class TestInjection(unittest.TestCase):
    def test_remplace_uniquement_entre_les_marqueurs(self):
        source = f"AVANT{build.DEBUT}vieux contenu{build.FIN}APRES"
        rendu = build.injecte_avis(source, donnees(1))
        self.assertTrue(rendu.startswith("AVANT"))
        self.assertTrue(rendu.endswith("APRES"))
        self.assertNotIn("vieux contenu", rendu)

    def test_marqueurs_conserves_pour_les_builds_suivants(self):
        source = f"{build.DEBUT}x{build.FIN}"
        rendu = build.injecte_avis(source, donnees(1))
        self.assertIn(build.DEBUT, rendu)
        self.assertIn(build.FIN, rendu)

    def test_une_carte_par_avis_dupliquee_pour_la_boucle(self):
        rendu = build.injecte_avis(f"{build.DEBUT}{build.FIN}", donnees(7))
        self.assertEqual(rendu.count('class="mqcard"'), 14)

    def test_grille_statique_sous_le_seuil(self):
        rendu = build.injecte_avis(f"{build.DEBUT}{build.FIN}", donnees(3))
        self.assertIn("mq-static", rendu)

    def test_defilement_a_partir_du_seuil(self):
        rendu = build.injecte_avis(
            f"{build.DEBUT}{build.FIN}", donnees(build.SEUIL_MARQUEE)
        )
        self.assertNotIn("mq-static", rendu)

    def test_mention_de_collecte_presente_avec_la_date(self):
        rendu = build.injecte_avis(f"{build.DEBUT}{build.FIN}", donnees(6))
        self.assertIn("sans sélection sur la note", rendu)
        self.assertIn("2026-08-16", rendu)


class TestFichierReel(unittest.TestCase):
    def test_reviews_json_est_valide(self):
        import json

        chemin = pathlib.Path(build.SRC) / "reviews.json"
        contenu = json.loads(chemin.read_text(encoding="utf-8"))
        self.assertIn("avis", contenu)
        for avis in contenu["avis"]:
            for cle in ("id", "pseudo", "produit", "texte"):
                self.assertIn(cle, avis)

    def test_aucun_email_dans_les_avis_publies(self):
        """Le dépôt est public : reviews.json ne doit contenir que des pseudos."""
        import re

        chemin = pathlib.Path(build.SRC) / "reviews.json"
        brut = chemin.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", brut))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `python3 -m unittest discover -s tests -v`
Expected: FAIL — `AttributeError: module 'build' has no attribute 'carte'`

- [ ] **Step 4: Implémenter dans `build.py`**

Ajouter `import json` en tête, aux côtés des imports existants. Puis, après la constante `MIME`, ajouter :

```python
REVIEWS = SRC / "reviews.json"
DEBUT = "<!-- reviews:start -->"
FIN = "<!-- reviews:end -->"

# En dessous de ce nombre d'avis, le marquee se répète de façon visible :
# on bascule sur la grille statique jusqu'à ce qu'il y ait de quoi défiler.
SEUIL_MARQUEE = 6

> **Mise à jour post-revue finale (2026-08-16) :** le texte de `MENTION`
> ci-dessous et la gestion de la date ont été revus après la revue finale de
> branche — voir Finding 1 du rapport de la Tâche 5. Ce bloc reflète la
> version effectivement livrée, pas la version d'origine du plan.

```python
# Texte de conformité (art. L.111-7-2 et D.111-17 du code de la consommation) :
# origine des avis, absence de tri sur la note, critère de classement retenu
# (chronologique — voir trie_avis). Ne jamais y réinjecter de date : la date de
# mise à jour vit dans son propre élément (voir bloc_avis) pour que cette clé
# de traduction reste stable d'une publication à l'autre, indépendamment des
# mises à jour de reviews.json.
MENTION = ("Avis de clients ayant acheté le produit, recueillis par formulaire "
           "ou transmis directement. Publiés sans sélection sur la note, "
           "classés du plus récent au plus ancien. Aucune contrepartie n'est "
           "fournie en échange d'un avis.")


def echappe(texte):
    """Neutralise le HTML — reviews.json contient du texte saisi par des tiers."""
    return (str(texte).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def date_fr(iso):
    """Convertit une date ISO (AAAA-MM-JJ) en JJ/MM/AAAA, lisible pour un visiteur FR."""
    return datetime.date.fromisoformat(iso).strftime("%d/%m/%Y")


def trie_avis(liste):
    """Trie les avis du plus récent au plus ancien (champ `date`, ISO AAAA-MM-JJ).

    Rend vraie par construction la mention « classés du plus récent au plus
    ancien » : l'ordre affiché ne dépend plus de l'ordre dans lequel les
    entrées sont collées dans reviews.json.
    """
    return sorted(liste, key=lambda a: a["date"], reverse=True)


def carte(avis, dup=False):
    """Une carte d'avis. `dup` marque la copie qui sert à boucler le défilement."""
    cache = ' aria-hidden="true"' if dup else ""
    initiale = echappe(avis["pseudo"][:1].upper())
    return (
        f'<figure class="mqcard"{cache}>'
        f'<blockquote>{echappe(avis["texte"])}</blockquote>'
        f'<figcaption class="who">'
        f'<span class="av" aria-hidden="true">{initiale}</span>'
        f'<span class="who-txt"><b>{echappe(avis["pseudo"])}</b>'
        f'<span>{echappe(avis["produit"])}</span>'
        f'<span class="rv-date">{echappe(date_fr(avis["date"]))}</span></span>'
        f'</figcaption></figure>'
    )


def bloc_avis(donnees):
    """Le contenu généré : conteneur, piste dupliquée, mention de collecte."""
    liste = trie_avis(donnees["avis"])
    piste = "".join(carte(a) for a in liste)
    copie = "".join(carte(a, dup=True) for a in liste)
    statique = "" if len(liste) >= SEUIL_MARQUEE else " mq-static"
    maj = echappe(donnees.get("mise_a_jour", ""))
    # La date de mise à jour est un élément séparé de la phrase traduite, et
    # le libellé « Mise à jour » un nœud de texte séparé de la date elle-même :
    # ni l'un ni l'autre ne change quand l'autre change, donc rien ne casse la
    # traduction anglaise au fil des mises à jour de reviews.json.
    return (
        f'<div class="mq{statique}"><div class="mqtrack">{piste}{copie}</div></div>'
        f'<p class="reviews-note rv">{MENTION} '
        f'<span class="reviews-updated">Mise à jour'
        f'<span class="reviews-updated-val">&nbsp;: {maj}.</span></span></p>'
    )
```

Note : `carte()` exige désormais un champ `date` (ISO AAAA-MM-JJ) sur chaque
avis — c'est la même clé que celle déjà présente dans le format `reviews.json`
documenté plus haut. `datetime` doit être importé en tête de `build.py`, aux
côtés de `base64`, `json`, `pathlib`, `shutil`, `sys`.


def injecte_avis(texte, donnees):
    """Remplace ce qui se trouve entre les marqueurs. Les marqueurs restent."""
    debut = texte.index(DEBUT) + len(DEBUT)
    fin = texte.index(FIN)
    return texte[:debut] + bloc_avis(donnees) + texte[fin:]
```

**Ne pas** toucher à `PAGES` dans cette tâche : `src/avis.html` n'existe pas encore et le build échouerait. C'est la Tâche 4, qui crée le fichier, qui ajoutera son entrée.

Dans `main()`, appeler l'injection sur les pages qui portent les marqueurs. Remplacer la boucle existante par :

```python
    donnees = json.loads(REVIEWS.read_text(encoding="utf-8"))

    for source, cible in PAGES:
        texte = (SRC / source).read_text(encoding="utf-8")
        if DEBUT in texte:
            texte = injecte_avis(texte, donnees)
        for chemin, uri in remplacements:
            texte = texte.replace(chemin, uri)

        destination = DIST / cible
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(texte, encoding="utf-8")
        print(f"dist/{cible:22} {destination.stat().st_size / 1e6:>5.1f} Mo")
```

L'injection a lieu **avant** le remplacement des assets, et opère sur le texte en mémoire : `src/index.html` n'est jamais modifié.

- [ ] **Step 5: Lancer les tests**

Run: `python3 -m unittest discover -s tests -v`
Expected: PASS — 11 tests.

Note : `build.SRC` est un `pathlib.Path`, `pathlib.Path(build.SRC)` fonctionne quand même.

Vérifier aussi que le build reste vert — aucune page ne porte encore les marqueurs, donc l'injection ne s'applique nulle part et la sortie doit être inchangée :

Run: `python3 build.py`
Expected: les deux lignes habituelles (`dist/index.html`, `dist/portfolio/index.html`) et `dist/_redirects`, sans erreur.

- [ ] **Step 6: Commit**

```bash
git add build.py src/reviews.json tests/test_build.py
git commit -m "Injecte les avis clients au build depuis src/reviews.json

Le contenu du marquee vit dans un JSON versionné plutôt que dans le HTML :
un avis s'ajoute en éditant un fichier, sans toucher au balisage. Le texte
saisi par des tiers est échappé — reviews.json finira par contenir des
phrases écrites par des clients.

En dessous de 6 avis le rendu bascule en grille statique : un marquee qui
boucle sur 3 cartes se répète de façon visible."
```

---

## Task 2: Marquee sur l'accueil

**Files:**
- Modify: `src/index.html:363-378` (bloc CSS `.reviews`), `src/index.html:840-863` (section `#avis`), `src/index.html:1100` (dictionnaire i18n)

**Interfaces:**
- Consumes: `build.injecte_avis` (Tâche 1), les marqueurs `<!-- reviews:start -->` / `<!-- reviews:end -->`, les classes générées `mq`, `mq-static`, `mqtrack`, `mqcard`, `who`, `av`, `who-txt`, `reviews-note`.
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Remplacer le bloc CSS des avis**

Dans `src/index.html`, remplacer intégralement les lignes 363 à 378 (du commentaire `/* ---------- retours clients ---------- */` jusqu'à la règle `.reviews-note` incluse) par :

```css
/* ---------- retours clients : marquee ---------- */
.mq{overflow:hidden;position:relative;padding:6px 0;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);
          mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.mqtrack{display:flex;align-items:center;gap:20px;width:max-content;
  animation:mqscroll 64s linear infinite}
.mq:hover .mqtrack,.mq:focus-within .mqtrack{animation-play-state:paused}
@keyframes mqscroll{to{transform:translateX(calc(-50% - 10px))}}

/* Pas de backdrop-filter ici : le marquee duplique une vingtaine de cartes et
   Safari iOS plafonne le nombre de couches de verre par page. Blanc plein. */
.mqcard{background:#fff;border-radius:var(--r-lg);box-shadow:var(--shadow);
  padding:22px 24px;width:clamp(258px,25vw,340px);flex:none;margin:0;
  display:flex;flex-direction:column;gap:14px}
.mqcard blockquote{margin:0;font-size:14.5px;line-height:1.55;color:#3A3A35;
  quotes:"\00ab\00a0" "\00a0\00bb"}
.mqcard blockquote::before{content:open-quote}
.mqcard blockquote::after{content:close-quote}
.mqcard .who{display:flex;align-items:center;gap:11px;
  border-top:1px solid var(--line);padding-top:14px}
.mqcard .av{width:34px;height:34px;border-radius:50%;background:var(--charcoal);
  color:#fff;display:flex;align-items:center;justify-content:center;flex:none;
  font-family:'Montserrat',sans-serif;font-weight:800;font-size:13px}
.mqcard .who-txt b{display:block;font-size:13.5px;line-height:1.2}
.mqcard .who-txt>span{font-family:var(--lbl);font-weight:700;font-size:9px;
  letter-spacing:.16em;color:var(--dim);text-transform:uppercase}
.reviews-note{margin-top:18px;font-size:10px;color:var(--dim);text-align:center;
  letter-spacing:.14em;line-height:1.7}

/* Repli en grille : sous le seuil d'avis (classe posée par build.py),
   ou si le visiteur a demandé moins d'animations. */
.mq-static{-webkit-mask-image:none;mask-image:none}
.mq-static .mqtrack{animation:none;width:auto;flex-wrap:wrap;justify-content:center}
.mq-static .mqcard[aria-hidden="true"]{display:none}
@media (prefers-reduced-motion:reduce){
  .mq{-webkit-mask-image:none;mask-image:none}
  .mqtrack{animation:none;width:auto;flex-wrap:wrap;justify-content:center}
  .mqcard[aria-hidden="true"]{display:none}
}
```

- [ ] **Step 2: Remplacer la section `#avis`**

Remplacer intégralement les lignes 840 à 863 de `src/index.html` (la balise `<section id="avis">` jusqu'à `</section>` incluse) par :

```html
  <section id="avis">
    <div class="sec-head rv">
      <span class="eyebrow">Retours clients</span>
      <h2>Ils l'utilisent déjà</h2>
    </div>
    <!-- reviews:start --><!-- reviews:end -->
  </section>
```

Cela supprime les trois cartes en dur : l'avis de Georges A. (désormais dans `reviews.json`), la carte de statistiques signée Femz et l'invitation Discord — ces deux dernières étant du remplissage que Femz a demandé à retirer.

- [ ] **Step 3: Mettre à jour le dictionnaire i18n**

Dans `src/index.html:1100`, le dictionnaire `T` contient trois entrées devenues mortes, correspondant aux cartes supprimées. Retirer ces trois paires clé/valeur :

- `"Colle ici un avis client depuis Podia (Admin → Produits → Avis).": "Paste a customer review here from Podia (Admin → Products → Reviews)."`
- `"Prénom N.": "First name L."`
- **les deux** entrées dont la clé est la chaîne vide — valeurs `"Placeholders to fill with your real Podia reviews — tell me and I'll add them."` et `"Redesign mockup · Podia backend unchanged"`.

Ces deux dernières n'ont jamais rien traduit : le traducteur teste `if(k&&T[k]!==undefined)`, et une clé vide est *falsy*. En JavaScript, deux clés identiques dans un littéral d'objet se recouvrent — seule la seconde subsistait, et elle était morte de toute façon. Les retirer supprime la dernière trace du mot « mockup » dans le dépôt.

> **Mise à jour post-revue finale (2026-08-16) :** ce qui suit remplace
> l'instruction d'origine — voir Finding 1 du rapport de la Tâche 5. La note
> d'entretien ci-dessous (« sortir la date dans un `<span>` distinct ») a été
> appliquée : ce n'est plus un YAGNI différé, c'est ce qui est livré.

Ajouter la traduction de la mention de collecte, en **deux** paires — le
traducteur compare le texte complet de chaque nœud après `trim()`, et
`build.MENTION` ne contient plus de date : c'est justement ce qui rend cette
clé stable d'une mise à jour de `reviews.json` à l'autre. La date de mise à
jour vit dans son propre nœud de texte (voir `build.bloc_avis`), jamais
traduit — ce sont des chiffres, pas de la langue — donc seul le libellé
« Mise à jour » a besoin d'une entrée séparée :

```
"Avis de clients ayant acheté le produit, recueillis par formulaire ou transmis directement. Publiés sans sélection sur la note, classés du plus récent au plus ancien. Aucune contrepartie n'est fournie en échange d'un avis.": "Reviews from customers who purchased the product, collected through the form or submitted directly. Published without filtering on rating, ranked from most recent to oldest. No compensation is provided in exchange for a review.", "Mise à jour": "Updated"
```

Vérification : le texte complet du nœud englobant reste correct après
traduction (`fr.replace(k, T[k])` ne touche que la sous-chaîne `k`, donc le
texte suivant — l'espace puis le `<span>` de la date — n'est jamais affecté).
Ne pas vérifier par recherche de sous-chaîne dans `src/index.html` : le
traducteur compare des nœuds de texte, pas des sous-chaînes de fichier — il
faut parcourir les nœuds texte du HTML **généré** (`dist/index.html`) pour
s'assurer qu'aucune clé i18n n'est orpheline.

- [ ] **Step 4: Vérifier que le rendu est correct**

Run:
```bash
python3 build.py && \
grep -c 'class="mqcard"' dist/index.html && \
grep -o 'class="mq[^"]*"' dist/index.html | head -2 && \
grep -c 'Colle ici un avis client' dist/index.html
```

Expected :
- `2` cartes (1 avis × 2 pour la boucle)
- `class="mq mq-static"` puis `class="mqtrack"` — la grille statique, puisque 1 < 6
- `0` occurrence de l'ancien placeholder

- [ ] **Step 5: Vérifier visuellement dans le navigateur**

Run: `open dist/index.html`

Vérifier : la section « Ils l'utilisent déjà » affiche une carte blanche centrée avec l'initiale « G », les cartes Femz et Discord ont disparu, et la mention de collecte est lisible en dessous.

- [ ] **Step 6: Commit**

```bash
git add src/index.html
git commit -m "Remplace la grille d'avis par un marquee défilant

Les cartes Femz et Discord étaient du remplissage, pas des avis : elles
partent. Le contenu vient désormais de reviews.json via build.py.

Cartes blanches pleines, sans backdrop-filter : le marquee duplique la
liste pour boucler et aurait fait sauter le quota de couches de verre de
Safari iOS, comme documenté dans #mobile-fixes."
```

---

## Task 3: Endpoint de collecte

**Files:**
- Create: `functions/api/avis.js`
- Create: `functions/api/README.md`

**Interfaces:**
- Consumes: rien.
- Produces: `POST /api/avis`.
  - Corps attendu (JSON) : `{produit: string, email: string, pseudo: string, texte: string, note: number|null, consent: true, site: ""}`
  - `200` → `{"ok": true}`
  - `400` → `{"erreurs": {"<champ>": "<message>"}}`
  - `405` → `{"erreurs": {"_": "Méthode non autorisée."}}`
  - Variable d'environnement requise : `DISCORD_WEBHOOK_AVIS`

- [ ] **Step 1: Écrire l'endpoint**

Créer `functions/api/avis.js` :

```js
// Endpoint de collecte des avis clients.
// Aucune persistance : la soumission part sur un webhook Discord privé et
// Femz la recopie dans src/reviews.json après avoir vérifié l'achat dans Podia.
// Le volume attendu (~15 avis) ne justifie pas une base de données.

// Les noms historiques sont conservés : le catalogue a été renommé plusieurs
// fois et un acheteur de 2023 ne retrouverait pas son produit autrement.
const PRODUITS = new Set([
  "METAVISION - Formation VFX",
  "META VISION - Comment vivre de sa passion ?",
  "Ultimate iOS Pack",
  "Ghost FX",
  "Presets Pack",
  "VFX Presets Pack",
  "Vortex Sound Pack",
  "Whoosh Sound Pack",
  "SFX Whoosh Pack",
  "3D Text Pack",
  "3D Text Pack Pro",
  "Fade Pack",
]);

const TEXTE_MIN = 40;
const TEXTE_MAX = 400;

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function valide(c) {
  const e = {};
  const texte = (v) => (typeof v === "string" ? v.trim() : "");

  if (!PRODUITS.has(texte(c.produit))) e.produit = "Choisis le produit concerné.";

  const email = texte(c.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    e.email = "Indique l'email utilisé lors de ton achat.";

  const pseudo = texte(c.pseudo);
  if (pseudo.length < 2 || pseudo.length > 40)
    e.pseudo = "Entre 2 et 40 caractères.";

  const avis = texte(c.texte);
  if (avis.length < TEXTE_MIN)
    e.texte = `Encore un peu — ${TEXTE_MIN} caractères minimum (${avis.length} pour l'instant).`;
  else if (avis.length > TEXTE_MAX)
    e.texte = `${TEXTE_MAX} caractères maximum (${avis.length} pour l'instant).`;

  if (c.note !== null && c.note !== undefined && c.note !== "") {
    const n = Number(c.note);
    if (!Number.isInteger(n) || n < 1 || n > 5) e.note = "Une note de 1 à 5.";
  }

  if (c.consent !== true)
    e.consent = "Il faut accepter la publication pour envoyer l'avis.";

  return e;
}

function messageDiscord(c) {
  const note = c.note ? `${c.note}/5` : "non renseignée";
  return {
    embeds: [
      {
        title: "Nouvel avis client",
        color: 0x5ea2ff,
        fields: [
          { name: "Pseudo (sera publié)", value: c.pseudo.trim() },
          { name: "Produit", value: c.produit.trim() },
          { name: "Email — à vérifier dans Podia", value: c.email.trim() },
          { name: "Note", value: note, inline: true },
          { name: "Avis", value: c.texte.trim() },
        ],
        footer: { text: "Vérifie l'achat, puis ajoute-le à src/reviews.json" },
      },
    ],
  };
}

export const onRequestPost = async ({ request, env }) => {
  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreurs: { _: "Corps de requête illisible." } }, 400);
  }

  // Champ piège : invisible pour un humain, rempli par les robots.
  // On répond 200 pour ne pas leur apprendre qu'ils ont été repérés.
  if (typeof corps.site === "string" && corps.site.trim() !== "")
    return json({ ok: true });

  const erreurs = valide(corps);
  if (Object.keys(erreurs).length) return json({ erreurs }, 400);

  if (!env.DISCORD_WEBHOOK_AVIS)
    return json({ erreurs: { _: "Collecte indisponible pour le moment." } }, 500);

  // Discord en panne ou DNS qui échoue fait *lever* fetch, il ne renvoie pas une
  // réponse en erreur. Sans ce filet, le client reçoit un 500 brut de la plateforme
  // au lieu du JSON que le formulaire sait lire.
  let envoi;
  try {
    envoi = await fetch(env.DISCORD_WEBHOOK_AVIS, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(messageDiscord(corps)),
    });
  } catch {
    return json({ erreurs: { _: "Envoi impossible, réessaie dans un instant." } }, 502);
  }

  if (!envoi.ok)
    return json({ erreurs: { _: "Envoi impossible, réessaie dans un instant." } }, 502);

  return json({ ok: true });
};

export const onRequest = async ({ request }) => {
  if (request.method === "POST") return; // laisse la main à onRequestPost
  return json({ erreurs: { _: "Méthode non autorisée." } }, 405);
};
```

- [ ] **Step 2: Documenter le secret**

Créer `functions/api/README.md` :

```markdown
# /api/avis

Reçoit les soumissions du formulaire `femzlab.shop/avis` et les poste sur un
webhook Discord privé. Aucune persistance.

## Secret requis

`DISCORD_WEBHOOK_AVIS` — l'URL du webhook Discord.

Le dépôt est **public** : cette URL ne doit jamais y figurer. Quiconque la
possède peut poster dans le salon.

Création du webhook : Discord → salon privé → Modifier le salon →
Intégrations → Webhooks → Nouveau webhook → Copier l'URL.

Enregistrement du secret :

    npx wrangler pages secret put DISCORD_WEBHOOK_AVIS --project-name femzlab-shop

En local, `wrangler pages dev` lit un fichier `.dev.vars` à la racine —
déjà couvert par `.gitignore`.

## Test local

    npx wrangler pages dev dist

Puis dans un autre terminal :

    curl -s -X POST http://localhost:8788/api/avis \
      -H 'content-type: application/json' \
      -d '{"produit":"Ghost FX","email":"test@example.com","pseudo":"Test",
           "texte":"Un avis de test assez long pour passer la validation serveur.",
           "note":5,"consent":true,"site":""}'
```

- [ ] **Step 3: Protéger le fichier de secrets local**

Ajouter à `.gitignore` :

```
# secrets locaux de wrangler (webhook Discord)
.dev.vars
```

- [ ] **Step 4: Tester la validation sans webhook**

Créer un `.dev.vars` local contenant une URL bidon, puis lancer :

```bash
npx wrangler pages dev dist --port 8788
```

Dans un autre terminal, vérifier les rejets :

```bash
# consentement absent → 400 avec l'erreur sur le champ consent
curl -s -X POST http://localhost:8788/api/avis -H 'content-type: application/json' \
  -d '{"produit":"Ghost FX","email":"a@b.co","pseudo":"Test","texte":"'"$(printf 'x%.0s' {1..50})"'","consent":false,"site":""}'

# texte trop court → 400 avec l'erreur sur le champ texte
curl -s -X POST http://localhost:8788/api/avis -H 'content-type: application/json' \
  -d '{"produit":"Ghost FX","email":"a@b.co","pseudo":"Test","texte":"court","consent":true,"site":""}'

# produit inconnu → 400 avec l'erreur sur le champ produit
curl -s -X POST http://localhost:8788/api/avis -H 'content-type: application/json' \
  -d '{"produit":"Inexistant","email":"a@b.co","pseudo":"Test","texte":"'"$(printf 'x%.0s' {1..50})"'","consent":true,"site":""}'

# champ piège rempli → 200 sans notification
curl -s -X POST http://localhost:8788/api/avis -H 'content-type: application/json' \
  -d '{"produit":"Ghost FX","email":"a@b.co","pseudo":"Bot","texte":"'"$(printf 'x%.0s' {1..50})"'","consent":true,"site":"http://spam"}'

# GET → 405
curl -s http://localhost:8788/api/avis
```

Expected : les trois premiers renvoient `{"erreurs":{...}}` avec le bon nom de champ, le quatrième `{"ok":true}`, le dernier `{"erreurs":{"_":"Méthode non autorisée."}}`.

- [ ] **Step 5: Commit**

```bash
git add functions/ .gitignore
git commit -m "Ajoute l'endpoint de collecte des avis

Pages Function servie par le même déploiement que le site : pas de Worker
séparé, pas de sous-domaine, pas de CORS. Valide la soumission puis la
poste sur un webhook Discord — pas de base de données pour ~15 avis.

Le champ piège renvoie 200 : signaler le rejet à un robot lui apprend à
contourner le piège."
```

---

## Task 4: Page `/avis`

**Files:**
- Create: `src/avis.html`
- Modify: `build.py` (ajouter `avis.html` à `PAGES`), `TRACKING.md`, `README.md`

**Interfaces:**
- Consumes: `POST /api/avis` (Tâche 3) et son contrat d'erreurs par champ.
- Produces: la page publique `femzlab.shop/avis`.

- [ ] **Step 1: Créer la coque de la page**

Partir de `src/portfolio.html`, qui est la plus légère des deux pages existantes (492 lignes). Copier :

- lignes 1 à 20 — head GTM, `<style id="i18n-css">` (identiques)
- lignes 21 à 23 — meta et titre, en changeant le titre pour `<title>FemzLab — Donner mon avis</title>`
- le bloc `<style>` ligne 24 : reprendre uniquement les `@font-face`, le `:root`, le reset, puis les blocs `.fixed-logo`, `nav.dock`, `.langsw`, le footer et le `@media (prefers-reduced-motion:reduce)`. **Ne pas** reprendre les styles propres au portfolio (`.reel-grid`, `.rcard`, `.work-grid`, `.rframe`, lightbox).
- lignes 240 à 259 — les couches de fond, le logo fixe, le dock. Adapter le dock : le lien actif n'est plus « Portfolio ».
- lignes 369 à 384 — le footer, à l'identique.
- lignes 386 à 460 — le script des dots et du dock au scroll, à l'identique.
- lignes 461 à 478 — le traducteur i18n, avec son propre dictionnaire (Step 3).
- lignes 479 à 492 — le suivi des CTA, à l'identique.

- [ ] **Step 2: Écrire le formulaire**

Dans le `<main>` de `src/avis.html` :

```html
<main id="top">
  <section class="avis-wrap">
    <div class="sec-head rv">
      <span class="eyebrow">Ton retour</span>
      <h2>Raconte ce que le pack t'a apporté</h2>
    </div>

    <p class="avis-intro rv">
      Deux minutes suffisent. Ton avis apparaîtra sur la page d'accueil avec ton
      prénom ou ton pseudo — jamais ton email, qui sert uniquement à vérifier
      ton achat.
    </p>

    <form class="avis-form card rv" id="avis-form" novalidate>
      <label class="f">
        <span class="f-lbl">Le produit</span>
        <select name="produit" required>
          <option value="">Choisis…</option>
          <option>METAVISION - Formation VFX</option>
          <option>Ultimate iOS Pack</option>
          <option>Ghost FX</option>
          <option>Presets Pack</option>
          <option>Vortex Sound Pack</option>
          <option>Whoosh Sound Pack</option>
          <option>3D Text Pack</option>
          <option>3D Text Pack Pro</option>
          <option>Fade Pack</option>
          <option>META VISION - Comment vivre de sa passion ?</option>
          <option>VFX Presets Pack</option>
          <option>SFX Whoosh Pack</option>
        </select>
        <em class="f-err" data-err="produit"></em>
      </label>

      <label class="f">
        <span class="f-lbl">L'email de ton achat</span>
        <input type="email" name="email" required autocomplete="email"
               placeholder="celui utilisé au moment du paiement">
        <em class="f-hint">Jamais publié. Sert à vérifier l'achat.</em>
        <em class="f-err" data-err="email"></em>
      </label>

      <label class="f">
        <span class="f-lbl">Ton prénom ou ton pseudo</span>
        <input type="text" name="pseudo" required maxlength="40"
               placeholder="c'est ce qui s'affichera">
        <em class="f-err" data-err="pseudo"></em>
      </label>

      <label class="f">
        <span class="f-lbl">Ton avis</span>
        <textarea name="texte" required minlength="40" maxlength="400" rows="5"
                  placeholder="Ce que tu en as fait, ce que ça t'a fait gagner…"></textarea>
        <em class="f-hint"><span id="compteur">0</span>/400 — 40 minimum</em>
        <em class="f-err" data-err="texte"></em>
      </label>

      <label class="f">
        <span class="f-lbl">Une note ? <span class="f-opt">facultatif</span></span>
        <select name="note">
          <option value="">Sans note</option>
          <option value="5">5 sur 5</option>
          <option value="4">4 sur 5</option>
          <option value="3">3 sur 5</option>
          <option value="2">2 sur 5</option>
          <option value="1">1 sur 5</option>
        </select>
        <em class="f-err" data-err="note"></em>
      </label>

      <label class="f f-check">
        <input type="checkbox" name="consent" required>
        <span>J'autorise FemzLab à publier cet avis et mon prénom ou pseudo sur
          femzlab.shop.</span>
        <em class="f-err" data-err="consent"></em>
      </label>

      <!-- champ piège anti-robots : masqué et hors du parcours clavier -->
      <div class="f-trap" aria-hidden="true">
        <label>Site web<input type="text" name="site" tabindex="-1" autocomplete="off"></label>
      </div>

      <button type="submit" class="btn solid" data-track="cta_avis_envoyer">
        Envoyer mon avis
      </button>
      <em class="f-err" data-err="_"></em>
    </form>

    <div class="avis-ok card" id="avis-ok" hidden>
      <h3>Merci — c'est bien arrivé.</h3>
      <p>Je vérifie ton achat et je publie ton avis sur la page d'accueil.</p>
      <a class="btn solid" href="/">Retour à la boutique</a>
    </div>

    <p class="avis-legal">
      Les avis sont publiés sans sélection sur la note. Ton email n'est ni
      publié ni conservé ailleurs que dans la notification qui m'est envoyée.
    </p>
  </section>
</main>
```

- [ ] **Step 3: Styles et script de la page**

Ajouter dans le `<style>` de `src/avis.html` :

```css
.avis-wrap{max-width:640px;margin:0 auto;padding:150px 22px 70px}
.avis-intro{color:var(--muted);font-size:15px;margin-bottom:26px}
.avis-form{display:flex;flex-direction:column;gap:20px;padding:30px;
  background:#fff;border-radius:var(--r-lg);box-shadow:var(--shadow)}
.f{display:flex;flex-direction:column;gap:7px}
.f-lbl{font-family:var(--lbl);font-weight:700;font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--dim)}
.f-opt{text-transform:none;letter-spacing:0;font-weight:400}
.avis-form input[type=text],.avis-form input[type=email],
.avis-form select,.avis-form textarea{
  font:inherit;font-size:15px;color:var(--ink);background:#fff;
  border:1px solid var(--line);border-radius:12px;padding:13px 14px;width:100%}
.avis-form textarea{resize:vertical;line-height:1.55}
.avis-form :focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.f-hint{font-size:11.5px;color:var(--dim);font-style:normal}
.f-err{font-size:12px;color:#B3261E;font-style:normal;display:none}
.f-err.on{display:block}
.f-check{flex-direction:row;align-items:flex-start;gap:11px;font-size:14px;
  color:var(--muted);line-height:1.5}
.f-check input{margin-top:3px;flex:none;width:17px;height:17px;accent-color:var(--ink)}
.f-check .f-err{flex-basis:100%}
.f-trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.avis-form .btn.solid{background:var(--ink);color:#fff;border:none;
  border-radius:999px;padding:15px 26px;font-weight:700;cursor:pointer;
  transition:transform .18s,box-shadow .18s}
.avis-form .btn.solid:hover{transform:translateY(-1px);box-shadow:var(--shadow-lg)}
.avis-form .btn.solid[disabled]{opacity:.55;cursor:progress;transform:none}
.avis-ok{padding:34px 30px;text-align:center;background:#fff;
  border-radius:var(--r-lg);box-shadow:var(--shadow)}
.avis-ok h3{font-family:'Montserrat',sans-serif;font-weight:800;font-size:21px;
  margin-bottom:9px}
.avis-ok p{color:var(--muted);margin-bottom:20px}
.avis-ok .btn.solid{display:inline-block;background:var(--ink);color:#fff;
  border-radius:999px;padding:13px 24px;font-weight:700}
.avis-legal{margin-top:22px;font-size:11px;color:var(--dim);text-align:center;
  line-height:1.7}
@media(max-width:640px){.avis-wrap{padding:130px 16px 50px}.avis-form{padding:22px}}
```

Et le script, avant le traducteur i18n :

```html
<script>
(function(){
  const form = document.getElementById('avis-form');
  const ok = document.getElementById('avis-ok');
  const compteur = document.getElementById('compteur');
  const zone = form.querySelector('[name=texte]');

  zone.addEventListener('input', () => { compteur.textContent = zone.value.trim().length; });

  const videErreurs = () =>
    form.querySelectorAll('.f-err').forEach(e => { e.textContent = ''; e.classList.remove('on'); });

  const poseErreurs = (erreurs) => {
    Object.entries(erreurs).forEach(([champ, message]) => {
      const cible = form.querySelector(`[data-err="${champ}"]`);
      if (cible) { cible.textContent = message; cible.classList.add('on'); }
    });
    const premier = form.querySelector('.f-err.on');
    if (premier) premier.scrollIntoView({behavior:'smooth', block:'center'});
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    videErreurs();
    const bouton = form.querySelector('button[type=submit]');
    bouton.disabled = true;

    const d = new FormData(form);
    const charge = {
      produit: d.get('produit') || '',
      email:   d.get('email') || '',
      pseudo:  d.get('pseudo') || '',
      texte:   d.get('texte') || '',
      note:    d.get('note') ? Number(d.get('note')) : null,
      consent: d.get('consent') === 'on',
      site:    d.get('site') || ''
    };

    try {
      const r = await fetch('/api/avis', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify(charge)
      });
      const corps = await r.json().catch(() => ({}));
      if (r.ok && corps.ok) {
        form.hidden = true;
        ok.hidden = false;
        ok.scrollIntoView({behavior:'smooth', block:'center'});
        return;
      }
      poseErreurs(corps.erreurs || {_: "Envoi impossible, réessaie dans un instant."});
    } catch {
      poseErreurs({_: "Pas de connexion — réessaie dans un instant."});
    } finally {
      bouton.disabled = false;
    }
  });
})();
</script>
```

- [ ] **Step 4: Dictionnaire i18n de la page**

Reprendre le motif exact de `portfolio.html:461-478`, avec ce dictionnaire :

```js
const T={"Ton retour":"Your feedback","Raconte ce que le pack t'a apporté":"Tell us what the pack did for you","Deux minutes suffisent. Ton avis apparaîtra sur la page d'accueil avec ton prénom ou ton pseudo — jamais ton email, qui sert uniquement à vérifier ton achat.":"Two minutes is all it takes. Your review will appear on the homepage with your first name or handle — never your email, which is only used to verify your purchase.","Le produit":"The product","Choisis…":"Choose…","L'email de ton achat":"Your purchase email","celui utilisé au moment du paiement":"the one used at checkout","Jamais publié. Sert à vérifier l'achat.":"Never published. Used to verify the purchase.","Ton prénom ou ton pseudo":"Your first name or handle","c'est ce qui s'affichera":"this is what will be displayed","Ton avis":"Your review","Ce que tu en as fait, ce que ça t'a fait gagner…":"What you made with it, what it saved you…","Une note ?":"A rating?","facultatif":"optional","Sans note":"No rating","J'autorise FemzLab à publier cet avis et mon prénom ou pseudo sur femzlab.shop.":"I allow FemzLab to publish this review and my first name or handle on femzlab.shop.","Envoyer mon avis":"Send my review","Merci — c'est bien arrivé.":"Thanks — it came through.","Je vérifie ton achat et je publie ton avis sur la page d'accueil.":"I'll verify your purchase and publish your review on the homepage.","Retour à la boutique":"Back to the shop","Les avis sont publiés sans sélection sur la note. Ton email n'est ni publié ni conservé ailleurs que dans la notification qui m'est envoyée.":"Reviews are published without filtering on rating. Your email is neither published nor stored anywhere other than the notification sent to me.","Boutique":"Shop","À propos":"About"};
```

Les `placeholder` ne sont pas des nœuds texte : le traducteur ne les atteint pas. Ajouter, juste avant l'appel `set(initial)` :

```js
  const PH={"celui utilisé au moment du paiement":"the one used at checkout",
            "c'est ce qui s'affichera":"this is what will be displayed",
            "Ce que tu en as fait, ce que ça t'a fait gagner…":"What you made with it, what it saved you…"};
  const champs=[...document.querySelectorAll('[placeholder]')].map(el=>[el,el.placeholder]);
  const setPH=(lang)=>champs.forEach(([el,fr])=>{el.placeholder = lang==='en' ? (PH[fr]||fr) : fr;});
```

et appeler `setPH(lang)` depuis la fonction `set`.

- [ ] **Step 5: Ajouter la page au build, puis vérifier**

Maintenant que `src/avis.html` existe, ajouter son entrée à `PAGES` dans `build.py` :

```python
PAGES = [("index.html", "index.html"),
         ("portfolio.html", "portfolio/index.html"),
         ("avis.html", "avis/index.html")]
```

Puis :

```bash
python3 build.py && ls -la dist/avis/ && open dist/avis/index.html
```

Expected : `dist/avis/index.html` existe. Dans le navigateur : la page reprend le logo, le dock et le footer du site ; le compteur de caractères réagit à la frappe ; envoyer le formulaire vide affiche les erreurs sous les champs concernés.

Note : le POST échouera en ouvrant le fichier directement (pas de serveur). Pour tester le parcours complet : `npx wrangler pages dev dist` puis `http://localhost:8788/avis`.

- [ ] **Step 6: Mettre à jour la documentation**

Dans `TRACKING.md`, ajouter une section après celle du portfolio :

```markdown
## femzlab.shop/avis  (1 CTA)

- `cta_avis_envoyer` — Envoyer mon avis
```

Dans `README.md`, ajouter la structure du nouveau fichier dans le bloc `src/` et une section :

```markdown
## Publier un avis client

1. Une notification arrive sur Discord quand quelqu'un remplit `/avis`.
2. Vérifier l'email dans Podia (recherche en haut de la liste des factures)
   pour confirmer l'achat.
3. Ajouter une entrée dans `src/reviews.json` — **pseudo uniquement, jamais
   l'email** : le dépôt est public.
4. Mettre à jour le champ `mise_a_jour`, et la clé correspondante dans le
   dictionnaire i18n de `src/index.html` (la phrase de mention contient la date).
5. `python3 build.py` puis déployer.

En dessous de 6 avis, le rendu bascule automatiquement en grille statique :
un marquee qui boucle sur 3 cartes se répète de façon visible.
```

- [ ] **Step 7: Commit**

```bash
git add src/avis.html build.py README.md TRACKING.md
git commit -m "Ajoute la page de collecte des avis

Page dans la DA du site plutôt qu'un formulaire tiers : le visiteur ne
quitte pas l'univers de la marque au moment où on lui demande un service.

Le sélecteur de produits inclut les anciens intitulés du catalogue — un
acheteur de 2023 ne retrouverait pas 'VFX Presets Pack' dans une liste qui
ne contient que les noms actuels."
```

---

## Task 5: Vérification de bout en bout

**Files:** aucun — vérification seule.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: le feu vert pour le déploiement.

- [ ] **Step 1: Vérifier que rien de sensible n'est commité**

```bash
git grep -nE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" -- src/reviews.json functions/ ; echo "code $?"
git grep -nE "discord\.com/api/webhooks/[0-9]" ; echo "code $?"
```

Expected : les deux commandes ne remontent rien (`code 1` — `git grep` renvoie 1 quand il ne trouve rien).

Le second motif exige un identifiant numérique après `/webhooks/`, ce qui est la forme d'une vraie URL de webhook. Un motif plus lâche remonterait le texte de cette commande elle-même, présent dans ce document — un faux positif qui apprend à ignorer l'alerte.

- [ ] **Step 2: Lancer la suite de tests et le build**

```bash
python3 -m unittest discover -s tests -v && python3 build.py
```

Expected : tous les tests passent, et le build produit `dist/index.html`, `dist/portfolio/index.html`, `dist/avis/index.html`.

- [ ] **Step 3: Vérifier les critères d'acceptation du spec**

```bash
grep -c 'class="mqcard"' dist/index.html        # 2 (1 avis × 2)
grep -c 'Ton retour ici' dist/index.html        # 0 — carte Discord supprimée
grep -c '60&nbsp;000 abonnés' dist/index.html   # 0 — carte Femz supprimée
grep -c 'sans sélection sur la note' dist/index.html  # ≥1 — mention présente
```

- [ ] **Step 4: Vérifier le parcours réel**

```bash
npx wrangler pages dev dist --port 8788
```

Dans le navigateur :
1. `http://localhost:8788/` — le marquee s'affiche, les deux cartes de remplissage ont disparu.
2. `http://localhost:8788/avis` — remplir et envoyer ; le message de succès s'affiche et la notification arrive sur Discord.
3. Réduire la fenêtre à 375 px — vérifier qu'aucune carte de la page d'accueil ne perd son flou.
4. Activer « Réduire les animations » dans les réglages système — recharger, le marquee doit être figé en grille.

- [ ] **Step 5: Demander l'accord de Femz avant de déployer**

Ne pas exécuter la commande de déploiement sans son accord explicite. Le secret Discord doit être enregistré **avant** le déploiement, sinon l'endpoint renverra 500 :

```bash
npx wrangler pages secret put DISCORD_WEBHOOK_AVIS --project-name femzlab-shop
npx wrangler pages deploy dist --project-name femzlab-shop --branch main
```

Note : la correction `Portfolio · redesign mockup` dans `src/portfolio.html` est en attente dans l'arbre de travail depuis une session précédente ; elle partira avec ce déploiement. Le signaler à Femz.

---

## Self-Review

**Couverture du spec** — chaque exigence a une tâche :

| Exigence du spec | Tâche |
|---|---|
| Page `/avis` dans la DA, i18n, champs, anciens noms de produits | 4 |
| Champ piège anti-spam | 4 (markup) et 3 (rejet) |
| Endpoint Pages Function, validation, webhook Discord, secret | 3 |
| Marquee, fondu des bords, pause au survol, repli grille | 2 |
| Pas de `backdrop-filter` | 2 (CSS et commentaire) |
| `reviews.json`, marqueurs, injection au build | 1 |
| Mention de collecte sous le marquee | 1 (génération) et 2 (i18n) |
| Suppression des cartes Femz et Discord | 2 |
| Aucune donnée personnelle dans le dépôt | 1 (test), 3 (`.gitignore`), 5 (vérif) |
| Documentation du flux | 4 |
| Critères d'acceptation 1 à 9 | 5 |

**Cohérence des noms** — vérifiée entre tâches : `mq` / `mq-static` / `mqtrack` / `mqcard` / `who` / `who-txt` / `av` / `reviews-note` sont produits par `build.carte` et `build.bloc_avis` (Tâche 1) et stylés à l'identique en Tâche 2. Les noms de champs `produit` / `email` / `pseudo` / `texte` / `note` / `consent` / `site` sont identiques entre le formulaire (Tâche 4), la charge JSON envoyée et `valide()` (Tâche 3). Les clés d'erreur renvoyées par l'endpoint correspondent aux attributs `data-err` du formulaire.

**Point d'entretien connu, assumé** — la clé i18n de la mention de collecte contient la date de `mise_a_jour` et doit être resynchronisée à chaque publication. Documenté à l'étape 4 de la Tâche 4, avec la solution si cela devient pénible. Non résolu maintenant : YAGNI.
