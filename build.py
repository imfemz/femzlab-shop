#!/usr/bin/env python3
"""Reconstruit dist/ à partir de src/ en ré-embarquant les assets en base64.

Cloudflare Pages sert dist/. On garde le mono-fichier au déploiement pour ne
rien changer au comportement du site en ligne, tandis que src/ reste lisible
et modifiable — c'est src/ qui fait foi.

    python3 build.py
    npx wrangler pages deploy dist --project-name femzlab-shop --branch main
"""

import base64
import pathlib
import shutil
import sys

ICI = pathlib.Path(__file__).parent
SRC = ICI / "src"
DIST = ICI / "dist"

# Chaque page source et sa destination dans dist/
PAGES = [("index.html", "index.html"),
         ("portfolio.html", "portfolio/index.html")]

MIME = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "svg": "image/svg+xml", "gif": "image/gif",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
    "woff2": "font/woff2",
}


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

    for source, cible in PAGES:
        texte = (SRC / source).read_text(encoding="utf-8")
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
