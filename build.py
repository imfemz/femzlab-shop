#!/usr/bin/env python3
"""Reconstruit dist/ à partir de src/ en ré-embarquant les assets en base64.

Cloudflare Pages sert dist/. On garde le mono-fichier au déploiement pour ne
rien changer au comportement du site en ligne, tandis que src/ reste lisible
et modifiable — c'est src/ qui fait foi.

    python3 build.py
    npx wrangler pages deploy dist --project-name femzlab-shop --branch main
"""

import base64
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
         ("avis.html", "avis/index.html")]

MIME = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "svg": "image/svg+xml", "gif": "image/gif",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
    "woff2": "font/woff2",
}

REVIEWS = SRC / "reviews.json"
DEBUT = "<!-- reviews:start -->"
FIN = "<!-- reviews:end -->"

# En dessous de ce nombre d'avis, le marquee se répète de façon visible :
# on bascule sur la grille statique jusqu'à ce qu'il y ait de quoi défiler.
SEUIL_MARQUEE = 6

MENTION = ("Avis recueillis par formulaire auprès de clients ayant acheté "
           "le produit. Publiés sans sélection sur la note. "
           "Mise à jour&nbsp;: {date}.")


def echappe(texte):
    """Neutralise le HTML — reviews.json contient du texte saisi par des tiers."""
    return (str(texte).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


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
        f'<span>{echappe(avis["produit"])}</span></span>'
        f'</figcaption></figure>'
    )


def bloc_avis(donnees):
    """Le contenu généré : conteneur, piste dupliquée, mention de collecte."""
    liste = donnees["avis"]
    piste = "".join(carte(a) for a in liste)
    copie = "".join(carte(a, dup=True) for a in liste)
    statique = "" if len(liste) >= SEUIL_MARQUEE else " mq-static"
    mention = MENTION.format(date=echappe(donnees.get("mise_a_jour", "")))
    return (f'<div class="mq{statique}"><div class="mqtrack">{piste}{copie}</div></div>'
            f'<p class="reviews-note rv">{mention}</p>')


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
        ((f"assets/{f.name}", data_uri(f)) for f in assets if f.is_file()),
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

    shutil.copyfile(SRC / "_redirects", DIST / "_redirects")
    print("dist/_redirects")


if __name__ == "__main__":
    main()
