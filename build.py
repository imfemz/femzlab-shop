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
import re
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
         ("metavision.html", "metavision/index.html"),
         ("xray-effect.html", "xray-effect/index.html"),
         ("grablab.html", "grablab/index.html"),
         # Page 404 : sans elle, Cloudflare Pages sert index.html en 200 sur
         # n'importe quelle URL (« soft 404 » que Google pénalise).
         ("404.html", "404.html")]

# Fichiers SEO servis tels quels à la racine, et le dossier des images de
# partage (og:image doit être une URL absolue, jamais du base64).
FICHIERS_RACINE = ("_headers", "motionlab-version.json", "robots.txt", "sitemap.xml",
                    "1be7764c06fa51a255811def8e8e78b3.txt")
OG = SRC / "og"
ICONS = SRC / "icons"

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
SANS_INLINE = {"mp4-17.mp4", "mp4-24.mp4", "mp4-25.mp4"}

REVIEWS = SRC / "reviews.json"
# Marqueurs d'injection. `produit="…"` sur le marqueur d'ouverture limite le
# bloc aux avis de ce produit — c'est ce qu'utilise chaque page produit
# (MetaVision aujourd'hui, les suivantes sur le même modèle) ; sans attribut,
# tous les avis passent. L'accueil n'affiche plus d'avis (décision Femz,
# 2026-09-06) : les retours vivent sur la page du produit concerné.
MARQUEUR = re.compile(
    r'(<!-- reviews:start(?: produit="([^"]*)")? -->)(.*?)(<!-- reviews:end -->)', re.S)

# Note moyenne en étoiles dans la carte héros d'une page produit (demande
# Femz, 2026-09-08 : « le système de notes étoiles dans le hero card »). Même
# source que les cartes : reviews.json. Seuls les avis qui portent une `note`
# entrent dans la moyenne ; le nombre affiché est celui des avis publiés pour
# le produit (ceux que le lien fait défiler). Sans aucune note : rien n'est
# affiché — on n'invente pas d'étoiles.
MARQUEUR_NOTE = re.compile(
    r'(<!-- rating:start(?: produit="([^"]*)")? -->)(.*?)(<!-- rating:end -->)', re.S)

# En dessous de ce nombre d'avis, pas de défilement. Le moteur repris de Bart
# rend « 1 card = still seamless » en la clonant sur toute la largeur — soit
# la même carte répétée quatre fois, ce qui crie « on n'a qu'un avis ». Un avis
# seul reste donc posé, centré ; à partir de deux, ça défile.
SEUIL_MARQUEE = 2

# Plus de mention de collecte sous les avis (décision Femz, 2026-09-06). La
# phrase « publiés sans sélection sur la note, classés du plus récent au plus
# ancien » (art. L.111-7-2 / D.111-17) ne vit plus que sur la page /avis ; le
# tri chronologique, lui, reste appliqué (trie_avis).


def echappe(texte):
    """Neutralise le HTML — reviews.json contient du texte saisi par des tiers."""
    return (str(texte).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def trie_avis(liste):
    """Trie les avis du plus récent au plus ancien (champ `date`, ISO AAAA-MM-JJ).

    Rend vraie par construction la mention « classés du plus récent au plus
    ancien » : l'ordre affiché ne dépend plus de l'ordre dans lequel les
    entrées sont collées dans reviews.json.
    """
    return sorted(liste, key=lambda a: a["date"], reverse=True)


def carte(avis):
    """Une carte d'avis — copie de la carte de retour client d'editingshift.com
    (Bart), relevée sur son DOM : avatar + nom sur une ligne, texte brut en
    dessous. Rien d'autre : ni produit, ni date, ni guillemets, ni séparateur
    (décision Femz du 2026-09-06 ; l'information de collecte et de classement
    reste dans la mention sous le défilement).

    `instagram` (le pseudo, sans @) est facultatif : présent, il remplace
    l'avatar par sa vraie photo de profil (fichier `avatar` dans src/assets/,
    téléchargé une fois et hébergé chez nous — jamais un lien direct vers le
    CDN Instagram, ses URLs sont signées et expirent) et le nom affiché devient
    son @pseudo, comme chez Bart (une seule ligne d'identité, jamais nom ET
    @pseudo empilés). Sans ces deux champs, repli sur l'initiale et le pseudo
    saisi — un avis n'a pas toujours d'Instagram derrière.
    """
    # `instagram` ou `tiktok` : le pseudo sans @ ; la carte affiche @pseudo dans
    # les deux cas, seule la source de la photo diffère.
    handle = avis.get("instagram") or avis.get("tiktok")
    fichier = avis.get("avatar")
    if fichier:
        # Photo fournie : on l'affiche (téléchargée une fois, hébergée chez nous —
        # jamais un lien direct vers un CDN dont les URLs signées expirent). Le nom
        # devient @pseudo s'il y a un handle social, sinon le pseudo saisi tel quel
        # (une photo de profil sans lien reste une photo — décision Femz 2026-09-06).
        av = f'<img class="av" src="assets/{echappe(fichier)}" alt="" loading="lazy">'
        nom = f'@{echappe(handle)}' if handle else echappe(avis["pseudo"])
    else:
        av = f'<span class="av" aria-hidden="true">{echappe(avis["pseudo"][:1].upper())}</span>'
        nom = echappe(avis["pseudo"])
    # `texte_en` facultatif : la carte porte la traduction en attribut `data-en`
    # et bascule seule quand le site passe en anglais (moteur JS_AVIS_I18N, qui
    # observe `html[lang]`). Sans traduction, l'avis reste dans sa langue d'origine.
    en = avis.get("texte_en")
    bq_en = f' data-en="{echappe(en)}"' if en else ""
    return (
        f'<figure class="mqcard">'
        f'<figcaption class="who">{av}<b>{nom}</b></figcaption>'
        f'<blockquote{bq_en}>{echappe(avis["texte"])}</blockquote>'
        f'</figure>'
    )


# Style et moteur du défilement, injectés avec le bloc pour que chaque page
# qui affiche des avis ait EXACTEMENT le même composant — une seule source.
# Valeurs relevées sur le DOM d'editingshift.com le 2026-09-06 (carte 420px,
# padding 24, rayon 28, fond #e9e9e9 bordé de blanc, ombre 0 12 53 / 15 %,
# avatar 48, nom 18/600 #2f2f2f, texte 22/400 #212121, écart 52 ; survol :
# scale 1.04 + fond #c8e9ff en 350 ms ; masque 20 %/80 % ; sous 750 px :
# carte 320, padding 20, avatar 42, nom 16, texte 18, écart 16). Bart masque
# toute la section sous 750 px — ici on garde ses tailles mobiles à la place.
CSS_AVIS = """
.mqwrap{--mq-w:420px;--mq-pad:24px;--mq-gap:52px;--mq-av:48px;--mq-name:18px;--mq-text:22px}
@media (max-width:749px){.mqwrap{--mq-w:320px;--mq-pad:20px;--mq-gap:16px;--mq-av:42px;--mq-name:16px;--mq-text:18px}}
/* Le padding vertical donne de la place à l'ombre et au scale du survol sous
   l'overflow:hidden ; la marge négative l'annule dans le flux pour ne pas
   toucher à la respiration des sections. */
.mq{position:relative;overflow:hidden;padding:56px 0;margin:-56px 0;
  -webkit-mask-image:linear-gradient(to right,transparent 0%,#000 20%,#000 80%,transparent 100%);
          mask-image:linear-gradient(to right,transparent 0%,#000 20%,#000 80%,transparent 100%)}
.mqtrack{display:flex;align-items:flex-start;width:max-content;gap:var(--mq-gap);
  transform:translate3d(0,0,0);will-change:transform}
.mqgroup{display:flex;align-items:flex-start;flex-shrink:0;gap:var(--mq-gap)}
.mqcard{position:relative;flex:0 0 auto;margin:0;box-sizing:border-box;
  width:min(var(--mq-w),calc(100vw - 48px));padding:var(--mq-pad);
  border:1px solid #fff;border-radius:28px;background:#e9e9e9;
  box-shadow:0 12px 53px rgba(0,0,0,.15);
  transform:scale(1);transform-origin:center center;cursor:default;will-change:transform;
  transition:transform .35s cubic-bezier(.22,1,.36,1),background-color .35s ease,
    border-color .35s ease,box-shadow .35s ease}
.mqcard:hover{transform:scale(1.04);background:#c8e9ff;border-color:#d4f6ff}
.mqcard .who{display:flex;align-items:center;gap:12px;min-width:0}
.mqcard .av{width:var(--mq-av);height:var(--mq-av);flex:0 0 var(--mq-av);border-radius:50%;
  object-fit:cover;object-position:center center;
  background:#161616;color:#fff;display:flex;align-items:center;justify-content:center;
  font-family:'Montserrat',sans-serif;font-weight:800;font-size:calc(var(--mq-av)*.38)}
.mqcard .who b{min-width:0;color:#2f2f2f;font-size:var(--mq-name);font-weight:600;
  line-height:1.15;overflow-wrap:anywhere}
.mqcard blockquote{margin:14px 0 0;color:#212121;font-size:var(--mq-text);font-weight:400;
  line-height:1.4;overflow-wrap:anywhere;white-space:pre-line}
/* Un seul avis : posé, centré, sans masque ni défilement. */
.mq-static .mq{-webkit-mask-image:none;mask-image:none}
.mq-static .mqtrack{width:auto;justify-content:center}
@media (prefers-reduced-motion:reduce){
  .mq{-webkit-mask-image:none;mask-image:none}
  .mqtrack{transform:none!important;width:auto;flex-wrap:wrap;justify-content:center}
}
"""

# Moteur repris du script inline de Bart (rAF, vitesse en px/s, clones
# construits pour couvrir la largeur, saut invisible d'un groupe à l'autre,
# décélération exponentielle au survol). Adapté : idempotent (un seul init
# par bloc), sans les hooks de l'éditeur Shopify, et `data-hover-speed="0"`
# est lu comme 0 — chez Bart `Number("0") || 20` retombe sur 20, ce qui fait
# que son site RALENTIT à 20 % au survol au lieu de s'arrêter ; c'est ce
# comportement observé qu'on reproduit, avec la valeur écrite explicitement.
JS_AVIS = """
(function(){
  var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.mq:not([data-ready])').forEach(function(vp){
    vp.setAttribute('data-ready','1');
    var track=vp.querySelector('.mqtrack'),orig=vp.querySelector('.mqgroup');
    if(!track||!orig||reduced||vp.closest('.mq-static'))return;
    var base=Math.max(0,Number(vp.getAttribute('data-speed'))||60);
    var hv=vp.getAttribute('data-hover-speed');
    var hoverMul=Math.max(0,Math.min(100,(hv===null||hv==='')?20:Number(hv)))/100;
    var cur=base,target=base,pos=0,prev=performance.now(),reset=0,timer=null,hovered=null;
    function build(){
      track.querySelectorAll('.mqgroup[aria-hidden]').forEach(function(c){c.remove()});
      var gap=parseFloat(getComputedStyle(track).columnGap)||0;
      var w=orig.getBoundingClientRect().width;
      if(w<=0){reset=0;return}
      reset=w+gap;
      var n=Math.max(2,Math.ceil(vp.getBoundingClientRect().width/reset)+2);
      for(var i=0;i<n;i++){
        var c=orig.cloneNode(true);c.setAttribute('aria-hidden','true');
        c.querySelectorAll('img').forEach(function(im){im.alt=''});
        track.appendChild(c);
      }
      pos=pos%reset;
    }
    track.addEventListener('pointerover',function(e){
      var card=e.target.closest('.mqcard');if(!card||!track.contains(card))return;
      if(e.relatedTarget&&card.contains(e.relatedTarget))return;
      hovered=card;target=base*hoverMul;
    });
    track.addEventListener('pointerout',function(e){
      var card=e.target.closest('.mqcard');if(!card||!track.contains(card))return;
      if(e.relatedTarget&&card.contains(e.relatedTarget))return;
      if(hovered===card){hovered=null;target=base}
    });
    function animate(t){
      if(!document.documentElement.contains(vp))return;
      var delta=Math.min((t-prev)/1000,.05);prev=t;
      var k=1-Math.pow(.0005,delta);
      cur+=(target-cur)*k;
      pos+=cur*delta;
      if(reset>0&&pos>=reset)pos-=reset;
      track.style.transform='translate3d('+(-pos)+'px,0,0)';
      requestAnimationFrame(animate);
    }
    function schedule(){clearTimeout(timer);timer=setTimeout(build,100)}
    addEventListener('resize',schedule);
    orig.querySelectorAll('img').forEach(function(im){
      if(!im.complete)im.addEventListener('load',schedule,{once:true});
    });
    if('ResizeObserver' in window){var ro=new ResizeObserver(schedule);ro.observe(orig);ro.observe(vp)}
    build();requestAnimationFrame(animate);
  });
})();
"""


# Traduction des avis : chaque carte porte le texte FR (contenu) et, si dispo,
# le texte EN (`data-en`). On bascule en observant `html[lang]` (mis à jour par
# le sélecteur de langue de la page) — self-contained, aucune entrée à ajouter
# au dictionnaire i18n de chaque page, et les clones du défilement sont couverts.
JS_AVIS_I18N = """
(function(){
  function apply(){
    var en=document.documentElement.lang==='en';
    document.querySelectorAll('.mqcard blockquote[data-en], .rating [data-en]').forEach(function(q){
      if(q.dataset.fr===undefined) q.dataset.fr=q.textContent;
      q.textContent = en ? q.getAttribute('data-en') : q.dataset.fr;
    });
  }
  apply();
  try{new MutationObserver(apply).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});}catch(e){}
})();
"""


def bloc_avis(donnees, produit=None):
    """Le contenu généré : style, défilement, mention de collecte, moteur."""
    liste = trie_avis(donnees["avis"])
    if produit:
        liste = [a for a in liste if a.get("produit") == produit]
    if not liste:
        # Page produit sans avis : on masque la section qui nous contient
        # plutôt que de laisser un titre au-dessus du vide.
        return ('<script>(function(s){var x=s&&s.closest("section");'
                'if(x)x.hidden=true})(document.currentScript)</script>')
    statique = "" if len(liste) >= SEUIL_MARQUEE else " mq-static"
    cartes = "".join(carte(a) for a in liste)
    return (
        f'<style>{CSS_AVIS}</style>'
        f'<div class="mqwrap{statique}">'
        f'<div class="mq" data-speed="70" data-hover-speed="20">'
        f'<div class="mqtrack"><div class="mqgroup">{cartes}</div></div></div>'
        f'</div>'
        f'<script>{JS_AVIS}</script>'
        f'<script>{JS_AVIS_I18N}</script>'
    )


def injecte_avis(texte, donnees):
    """Remplace ce qui se trouve entre les marqueurs. Les marqueurs restent."""
    return MARQUEUR.sub(
        lambda m: m.group(1) + bloc_avis(donnees, m.group(2)) + m.group(4), texte)


ETOILE = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.9'
          '-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z"/></svg>')


def bloc_note(donnees, produit=None):
    """La ligne « ★★★★★ 5/5 · 2 avis » de la carte héros (style dans la page).

    Deux rangées d'étoiles superposées : la grise dessous, la pleine dessus
    découpée à `--fill` (moyenne / 5) — une moyenne de 4,5 se lit donc à la
    demi-étoile près, sans image. Le lien mène à la section des avis. Le mot
    « avis » porte sa traduction en `data-en` (même bascule que les cartes).
    """
    liste = donnees["avis"]
    if produit:
        liste = [a for a in liste if a.get("produit") == produit]
    notes = [a["note"] for a in liste if isinstance(a.get("note"), (int, float))]
    if not notes:
        return ""
    moyenne = sum(notes) / len(notes)
    # 5 → « 5/5 », 4.5 → « 4,5/5 » : un chiffre après la virgule au plus
    txt = f"{moyenne:.1f}".rstrip("0").rstrip(".").replace(".", ",")
    pct = f"{moyenne / 5 * 100:.0f}%"
    etoiles = ETOILE * 5
    n = len(liste)
    mot_en = "review" if n == 1 else "reviews"
    return (
        f'<a class="rating" href="#avis" aria-label="Noté {txt} sur 5 — lire les avis clients">'
        f'<span class="stars" style="--fill:{pct}" aria-hidden="true">'
        f'<span class="s-bg">{etoiles}</span><span class="s-fg">{etoiles}</span></span>'
        f'<b>{txt}/5</b>'
        f'<span class="rcount">{n} <span data-en="{mot_en}">avis</span></span>'
        f'</a>'
    )


def injecte_note(texte, donnees):
    return MARQUEUR_NOTE.sub(
        lambda m: m.group(1) + bloc_note(donnees, m.group(2)) + m.group(4), texte)


# Note moyenne dans les données structurées (JSON-LD) d'une page produit :
# le jeton `"aggregateRating":"@@RATING:<produit>@@"` — du JSON valide dans
# src/ — devient l'objet AggregateRating calculé depuis reviews.json, ou
# disparaît s'il n'y a aucune note (Google refuse une note inventée, et une
# clé vide invaliderait le bloc). ratingCount = avis notés, reviewCount = avis
# publiés : les deux chiffres restent vrais séparément.
MARQUEUR_RATING_LD = re.compile(r',\s*"aggregateRating"\s*:\s*"@@RATING:([^"@]+)@@"')


def note_jsonld(donnees, produit):
    liste = [a for a in donnees["avis"] if a.get("produit") == produit]
    notes = [a["note"] for a in liste if isinstance(a.get("note"), (int, float))]
    if not notes:
        return ""
    moyenne = round(sum(notes) / len(notes), 1)
    obj = {"@type": "AggregateRating", "ratingValue": moyenne, "bestRating": 5,
           "worstRating": 1, "ratingCount": len(notes), "reviewCount": len(liste)}
    return ',"aggregateRating":' + json.dumps(obj, ensure_ascii=False)


def injecte_note_jsonld(texte, donnees):
    return MARQUEUR_RATING_LD.sub(lambda m: note_jsonld(donnees, m.group(1)), texte)


# ── Accès « Mon espace », posé sur CHAQUE page ────────────────────────────
# Demande Femz (2026-09-25) : l'accès à l'espace membre doit exister partout,
# sur les pages d'aujourd'hui comme sur celles de demain. C'est donc le build
# qui le pose, et non huit copies à maintenir dans les sources : toute page
# ajoutée à PAGES l'obtient sans rien faire.
ESPACE_URL = '/espace/'

# Icône membre (silhouette), inline : aucune requête, aucun asset à copier.
_ICONE = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
          'stroke-linecap="round" aria-hidden="true">'
          '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>'
          '<circle cx="12" cy="7" r="4"/></svg>')

LIEN_ESPACE = (f'<a data-track="cta_espace" class="btn espace-acces" href="{ESPACE_URL}">'
               f'{_ICONE}<span>Mon espace</span></a>')

# Dans le dock, le CTA de la page (Acheter, Instagram…) reste le bouton plein :
# « Mon espace » est le second niveau. Sous 720px le dock est déjà serré — le
# libellé s'efface, l'icône seule suffit à identifier l'accès.
STYLE_ESPACE = (
    '<style id="espace-acces">'
    '.espace-acces{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}'
    # le dock devient plus serré : ses autres entrées ne doivent pas se couper
    '.dock .nav-links a{white-space:nowrap}'
    '.espace-acces svg{width:15px;height:15px;flex:none}'
    '@media(max-width:720px){.espace-acces span{display:none}.espace-acces{padding:9px;border-radius:999px}}'
    '.femz-espace-flottant{position:fixed;top:16px;right:16px;z-index:9999;display:inline-flex;'
    'align-items:center;gap:8px;padding:10px 16px;border-radius:999px;text-decoration:none;'
    'font:700 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;'
    'background:rgba(15,17,23,.72);border:1px solid rgba(255,255,255,.22);'
    '-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);'
    'box-shadow:0 10px 30px rgba(0,0,0,.35)}'
    '.femz-espace-flottant svg{width:15px;height:15px;flex:none}'
    '.femz-espace-flottant:hover{background:rgba(25,28,36,.86)}'
    '@media(max-width:720px){.femz-espace-flottant span{display:none}.femz-espace-flottant{padding:10px}}'
    '</style>')

FLOTTANT_ESPACE = (f'<a data-track="cta_espace" class="femz-espace-flottant" href="{ESPACE_URL}">'
                   f'{_ICONE}<span>Mon espace</span></a>')

# La traduction vit dans le dictionnaire de chaque page (const T={…}) : sans
# elle, le bouton resterait en français quand le visiteur passe en EN.
_T_ESPACE = '"Mon espace": "My space", '


def injecte_espace(texte):
    """Garantit un accès « Mon espace » sur la page, sans jamais le doubler.

    Dans le dock quand la page en a un, en pastille flottante sinon (fiches
    produit, 404). Une page qui pointe déjà vers /espace/ est laissée intacte.
    """
    if f'href="{ESPACE_URL}"' in texte:
        return texte

    place = texte.find('<nav class="dock">')
    if place != -1:
        fin_nav = texte.find('</nav>', place)
        # la dernière fermeture de <div> avant </nav> ferme .nav-links : le
        # bouton se pose à l'intérieur, à côté du CTA de la page
        ferme = texte.rfind('</div>', place, fin_nav)
        if ferme != -1:
            texte = texte[:ferme] + LIEN_ESPACE + '\n  ' + texte[ferme:]
    if f'href="{ESPACE_URL}"' not in texte:
        # page sans dock : pastille flottante, posée juste après <body>
        corps = re.search(r'<body[^>]*>', texte)
        if not corps:
            return texte
        texte = texte[:corps.end()] + FLOTTANT_ESPACE + texte[corps.end():]

    tete = texte.find('</head>')
    if tete != -1 and 'id="espace-acces"' not in texte:
        texte = texte[:tete] + STYLE_ESPACE + texte[tete:]
    if _T_ESPACE not in texte:
        texte = texte.replace('const T={', 'const T={' + _T_ESPACE, 1)
    return texte


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
        if MARQUEUR.search(texte):
            texte = injecte_avis(texte, donnees)
        if MARQUEUR_NOTE.search(texte):
            texte = injecte_note(texte, donnees)
        if MARQUEUR_RATING_LD.search(texte):
            texte = injecte_note_jsonld(texte, donnees)
        # sans condition : l'accès à l'espace membre est dû sur toute page
        texte = injecte_espace(texte)
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
    # fichiers annexes servis tels quels (version du plugin, en-têtes CORS,
    # robots.txt, sitemap.xml)
    for extra in FICHIERS_RACINE:
        if (SRC / extra).exists():
            shutil.copyfile(SRC / extra, DIST / extra)
            print(f"dist/{extra}")
    # images de partage (og:image / twitter:image), servies en fichiers
    if OG.is_dir():
        (DIST / "og").mkdir(exist_ok=True)
        for img in sorted(OG.iterdir()):
            if img.is_file():
                shutil.copyfile(img, DIST / "og" / img.name)
        print(f"dist/og/ ({sum(1 for f in OG.iterdir() if f.is_file())} images)")
    # icônes : Google exige un favicon en vrai fichier (pas de data-URI), carré,
    # multiple de 48 px ; favicon.ico à la racine sert de repli universel.
    if ICONS.is_dir():
        (DIST / "icons").mkdir(exist_ok=True)
        for ic in sorted(ICONS.iterdir()):
            if ic.is_file():
                shutil.copyfile(ic, DIST / ("favicon.ico" if ic.name == "favicon.ico" else f"icons/{ic.name}"))
        print("dist/favicon.ico + dist/icons/")


if __name__ == "__main__":
    main()
