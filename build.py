#!/usr/bin/env python3
"""Reconstruit dist/ à partir de src/ en ré-embarquant les assets en base64.

Cloudflare Pages sert dist/. On garde le mono-fichier au déploiement pour ne
rien changer au comportement du site en ligne, tandis que src/ reste lisible
et modifiable — c'est src/ qui fait foi.

    python3 build.py
    npx wrangler pages deploy dist --project-name femzlab-shop --branch main
"""

import base64
import datetime
import json
import pathlib
import shutil
import sys

ICI = pathlib.Path(__file__).parent
SRC = ICI / "src"
DIST = ICI / "dist"

# Chaque page source et sa destination dans dist/
PAGES = [("index.html", "index.html"),
         ("portfolio.html", "portfolio/index.html"),
         ("avis.html", "avis/index.html"),
         ("motionlab.html", "motionlab/index.html"),
         ("metavision.html", "metavision/index.html")]

MIME = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "svg": "image/svg+xml", "gif": "image/gif",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
    "woff2": "font/woff2",
}

# Assets trop lourds pour être inlinés en base64 : servis en fichier et
# chargés à la demande (ex. la vidéo de présentation MetaVision ~5 Mo, qui
# sinon partait à CHAQUE visite même sans clic sur play). Le chemin
# `assets/<nom>` reste littéral dans le HTML ; le fichier est copié à côté de
# la page qui le référence (voir la boucle des PAGES).
SANS_INLINE = {"mp4-17.mp4"}

REVIEWS = SRC / "reviews.json"
DEBUT = "<!-- reviews:start -->"
FIN = "<!-- reviews:end -->"

# En dessous de ce nombre d'avis, le marquee se répète de façon visible :
# on bascule sur la grille statique jusqu'à ce qu'il y ait de quoi défiler.
SEUIL_MARQUEE = 6

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
    """Une carte d'avis. `dup` marque la copie qui sert à boucler le défilement.

    `instagram` (le pseudo, sans @) est facultatif : quand il est présent,
    l'avatar devient sa vraie photo de profil (fichier `avatar` dans
    src/assets/, téléchargé une fois et hébergé chez nous — jamais un lien
    direct vers le CDN Instagram, ses URLs sont signées et expirent) et son
    @pseudo s'affiche sous le nom, cliquable vers son profil. Sans ces deux
    champs, on retombe sur l'initiale colorée — un avis n'a pas toujours
    d'Instagram derrière.
    """
    cache = ' aria-hidden="true"' if dup else ""
    handle = avis.get("instagram")
    fichier = avis.get("avatar")
    if handle and fichier:
        av = f'<img class="av" src="assets/{echappe(fichier)}" alt="" loading="lazy">'
        lien = (f'<a class="rv-handle" href="https://www.instagram.com/{echappe(handle)}/" '
                f'target="_blank" rel="noopener">@{echappe(handle)}</a>')
    else:
        av = f'<span class="av" aria-hidden="true">{echappe(avis["pseudo"][:1].upper())}</span>'
        lien = ""
    return (
        f'<figure class="mqcard"{cache}>'
        f'<blockquote>{echappe(avis["texte"])}</blockquote>'
        f'<figcaption class="who">'
        f'{av}'
        f'<span class="who-txt"><b>{echappe(avis["pseudo"])}</b>{lien}'
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


def injecte_avis(texte, donnees):
    """Remplace ce qui se trouve entre les marqueurs. Les marqueurs restent."""
    debut = texte.index(DEBUT) + len(DEBUT)
    fin = texte.index(FIN)
    return texte[:debut] + bloc_avis(donnees) + texte[fin:]


def data_uri(fichier):
    ext = fichier.suffix.lstrip(".").lower()
    if ext not in MIME:
        sys.exit(f"Extension inconnue : {fichier.name} — complète le dict MIME.")
    b64 = base64.b64encode(fichier.read_bytes()).decode()
    return f"data:{MIME[ext]};base64,{b64}"


def main():
    assets = sorted((SRC / "assets").iterdir())
    if not assets:
        sys.exit("src/assets/ est vide.")

    # Du plus long au plus court : évite qu'un nom soit préfixe d'un autre
    # (assets/png-1.png ne doit pas manger assets/png-10.png).
    remplacements = sorted(
        ((f"assets/{f.name}", data_uri(f))
         for f in assets if f.is_file() and f.name not in SANS_INLINE),
        key=lambda p: -len(p[0]),
    )

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

        # Copie des assets lourds référencés en chemin (non inlinés), à côté
        # de la page — le HTML les charge via l'URL relative `assets/<nom>`.
        for nom in SANS_INLINE:
            if f"assets/{nom}" in texte:
                dst = destination.parent / "assets" / nom
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(SRC / "assets" / nom, dst)
                print(f"  + {cible.rsplit('/',1)[0]}/assets/{nom} "
                      f"({dst.stat().st_size / 1e6:.1f} Mo, fichier)")

    shutil.copyfile(SRC / "_redirects", DIST / "_redirects")
    print("dist/_redirects")
    # fichiers annexes servis tels quels (version du plugin + en-têtes CORS)
    for extra in ("_headers", "motionlab-version.json"):
        if (SRC / extra).exists():
            shutil.copyfile(SRC / extra, DIST / extra)
            print(f"dist/{extra}")


if __name__ == "__main__":
    main()
