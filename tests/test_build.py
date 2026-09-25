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
            "date": "2026-08-16",
        }
        rendu = build.carte(avis)
        self.assertNotIn("<script>", rendu)
        self.assertIn("&lt;script&gt;", rendu)

    def test_neutralise_les_guillemets_et_esperluettes(self):
        # Le produit n'est plus rendu sur la carte (refonte 2026-09-06) : mettre
        # les caractères à risque dans les champs RÉELLEMENT affichés, sinon le
        # test passait à côté de l'échappement au lieu de le vérifier.
        rendu = build.carte(
            {"pseudo": 'A"B', "produit": "R&D", "texte": "R&D & co", "date": "2026-08-16"}
        )
        self.assertIn("&quot;", rendu)
        self.assertIn("&amp;", rendu)
        self.assertNotIn("R&D &", rendu)

    def test_initiale_en_majuscule(self):
        rendu = build.carte(
            {"pseudo": "théo", "produit": "Presets Pack", "texte": "x",
             "date": "2026-08-16"}
        )
        self.assertIn('<span class="av" aria-hidden="true">T</span>', rendu)

    def test_copie_marquee_masquee_aux_lecteurs_d_ecran(self):
        """Le défilement duplique les cartes ; les copies ne doivent pas être
        relues par un lecteur d'écran. La duplication est passée du Python au
        moteur JS (refonte 2026-09-06) — l'exigence, elle, n'a pas bougé."""
        avis = {"pseudo": "Théo", "produit": "Presets Pack", "texte": "x",
                "date": "2026-08-16"}
        self.assertTrue(build.carte(avis).startswith('<figure class="mqcard">'))
        # le clone posé par le moteur porte aria-hidden, et lui seul
        self.assertIn("setAttribute('aria-hidden','true')", build.JS_AVIS)
        self.assertIn("cloneNode(true)", build.JS_AVIS)

    def test_ni_date_ni_produit_sur_la_carte(self):
        """Décision Femz du 2026-09-06 : la carte porte l'identité et le texte,
        rien d'autre. Gravé ici pour qu'un retour en arrière soit délibéré."""
        rendu = build.carte({"pseudo": "Théo", "produit": "Presets Pack",
                             "texte": "x", "date": "2026-07-28"})
        self.assertNotIn("2026-07-28", rendu)
        self.assertNotIn("28/07/2026", rendu)
        self.assertNotIn("Presets Pack", rendu)


# Les anciennes constantes build.DEBUT / build.FIN ont laissé la place à une
# regex (MARQUEUR) qui accepte un `produit="…"` facultatif. Les marqueurs
# eux-mêmes n'ont pas changé : ce sont eux que les pages portent.
DEBUT = "<!-- reviews:start -->"
FIN = "<!-- reviews:end -->"


class TestInjection(unittest.TestCase):
    def test_remplace_uniquement_entre_les_marqueurs(self):
        source = f"AVANT{DEBUT}vieux contenu{FIN}APRES"
        rendu = build.injecte_avis(source, donnees(1))
        self.assertTrue(rendu.startswith("AVANT"))
        self.assertTrue(rendu.endswith("APRES"))
        self.assertNotIn("vieux contenu", rendu)

    def test_marqueurs_conserves_pour_les_builds_suivants(self):
        rendu = build.injecte_avis(f"{DEBUT}x{FIN}", donnees(1))
        self.assertIn(DEBUT, rendu)
        self.assertIn(FIN, rendu)

    def test_une_carte_par_avis(self):
        """Le HTML ne porte plus qu'un exemplaire de chaque avis : c'est le
        moteur JS qui clone le groupe autant de fois que le défilement l'exige
        (avant, la duplication était écrite en dur dans le HTML)."""
        rendu = build.injecte_avis(f"{DEBUT}{FIN}", donnees(7))
        self.assertEqual(rendu.count('class="mqcard"'), 7)

    def test_filtre_par_produit(self):
        source = '<!-- reviews:start produit="Ghost FX" --><!-- reviews:end -->'
        d = donnees(2)
        d["avis"][0]["produit"] = "Ghost FX"
        rendu = build.injecte_avis(source, d)
        self.assertEqual(rendu.count('class="mqcard"'), 1)

    # On vise la classe RÉELLEMENT posée sur le conteneur : « mq-static » tout
    # court se trouve aussi dans la feuille de style injectée, où sa présence ne
    # prouve rien.
    def test_grille_statique_sous_le_seuil(self):
        rendu = build.injecte_avis(f"{DEBUT}{FIN}", donnees(build.SEUIL_MARQUEE - 1))
        self.assertIn('<div class="mqwrap mq-static">', rendu)

    def test_defilement_a_partir_du_seuil(self):
        rendu = build.injecte_avis(f"{DEBUT}{FIN}", donnees(build.SEUIL_MARQUEE))
        self.assertIn('<div class="mqwrap">', rendu)
        self.assertNotIn("mqwrap mq-static", rendu)

    def test_plus_de_mention_sous_les_avis(self):
        """Décision Femz du 2026-09-06 : la mention de collecte ne vit plus sous
        le défilement, mais sur la page /avis (vérifiée par TestMention)."""
        rendu = build.injecte_avis(f"{DEBUT}{FIN}", donnees(6))
        self.assertNotIn("sans sélection sur la note", rendu)


class TestTri(unittest.TestCase):
    """« classés du plus récent au plus ancien » doit être vrai par construction."""

    def test_trie_avis_du_plus_recent_au_plus_ancien(self):
        avis = [
            {"pseudo": "Ancien", "date": "2024-01-01"},
            {"pseudo": "Recent", "date": "2026-08-10"},
            {"pseudo": "Milieu", "date": "2025-06-15"},
        ]
        trie = build.trie_avis(avis)
        self.assertEqual([a["pseudo"] for a in trie], ["Recent", "Milieu", "Ancien"])

    def test_le_rendu_respecte_l_ordre_chronologique_meme_si_le_json_ne_l_est_pas(self):
        source = donnees(3)
        # Volontairement dans le désordre dans reviews.json : c'est le tri de
        # build.py, pas la discipline de Femz, qui doit garantir l'ordre affiché.
        source["avis"][0]["pseudo"], source["avis"][0]["date"] = "Ancien", "2024-01-01"
        source["avis"][1]["pseudo"], source["avis"][1]["date"] = "Recent", "2026-08-10"
        source["avis"][2]["pseudo"], source["avis"][2]["date"] = "Milieu", "2025-06-15"

        rendu = build.injecte_avis(f"{DEBUT}{FIN}", source)
        self.assertLess(rendu.index(">Recent<"), rendu.index(">Milieu<"))
        self.assertLess(rendu.index(">Milieu<"), rendu.index(">Ancien<"))


class TestMention(unittest.TestCase):
    """Zone à haut risque : toute reformulation doit être délibérée, pas
    accidentelle. La mention ne vit plus dans build.py (constante MENTION
    supprimée avec la refonte du 2026-09-06) mais dans la page /avis — c'est
    donc elle qu'on surveille désormais.

    ATTENTION : la formulation actuelle est plus courte que l'ancienne. Elle ne
    dit plus « classés du plus récent au plus ancien » ni « aucune contrepartie
    n'est fournie en échange d'un avis » (art. L.111-7-2 / D.111-17). Le tri
    chronologique, lui, reste appliqué (voir TestTri). À faire valider.
    """

    ATTENDU = ("Les avis sont publiés sans sélection sur la note. Ton email n'est "
               "ni publié ni conservé ailleurs que dans la notification qui m'est envoyée.")

    def test_texte_exact_de_la_mention_legale(self):
        page = (build.SRC / "avis.html").read_text(encoding="utf-8")
        self.assertIn(f'<p class="avis-legal">{self.ATTENDU}</p>', page)


class TestFichierReel(unittest.TestCase):
    def test_reviews_json_est_valide(self):
        import json

        chemin = pathlib.Path(build.SRC) / "reviews.json"
        contenu = json.loads(chemin.read_text(encoding="utf-8"))
        self.assertIn("avis", contenu)
        for avis in contenu["avis"]:
            for cle in ("id", "pseudo", "produit", "texte", "date"):
                self.assertIn(cle, avis)

    def test_aucun_email_dans_les_avis_publies(self):
        """Le dépôt est public : reviews.json ne doit contenir que des pseudos."""
        import re

        chemin = pathlib.Path(build.SRC) / "reviews.json"
        brut = chemin.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}", brut))




class TestNoteJsonLd(unittest.TestCase):
    """Le jeton "@@RATING:<produit>@@" du JSON-LD devient un AggregateRating vrai, ou disparaît."""

    JSON = '{"name":"X","offers":{"price":"39"},"aggregateRating":"@@RATING:MotionLAB@@"}'

    def test_avec_notes(self):
        d = {"avis": [{"produit": "MotionLAB", "note": 5, "date": "2026-09-06", "pseudo": "a", "texte": "t"},
                      {"produit": "MotionLAB", "date": "2026-09-06", "pseudo": "b", "texte": "t"},
                      {"produit": "Autre", "note": 1, "date": "2026-09-06", "pseudo": "c", "texte": "t"}]}
        import json as _json
        obj = _json.loads(build.injecte_note_jsonld(self.JSON, d))
        self.assertEqual(obj["aggregateRating"]["ratingValue"], 5)
        self.assertEqual(obj["aggregateRating"]["ratingCount"], 1)
        self.assertEqual(obj["aggregateRating"]["reviewCount"], 2)

    def test_sans_note(self):
        d = {"avis": [{"produit": "MotionLAB", "date": "2026-09-06", "pseudo": "b", "texte": "t"}]}
        import json as _json
        obj = _json.loads(build.injecte_note_jsonld(self.JSON, d))
        self.assertNotIn("aggregateRating", obj)
        self.assertEqual(obj["offers"]["price"], "39")


class TestAccesEspace(unittest.TestCase):
    """« Mon espace » doit être présent sur CHAQUE page — celles d'aujourd'hui
    comme celles de demain. La règle est donc appliquée au build, pas recopiée
    à la main dans chaque fichier source."""

    DOCK = ('<nav class="dock">\n'
            '  <div class="nav-links">\n'
            '    <div class="nav-links-menu" id="nav-links-menu">\n'
            '      <a href="/portfolio/">Portfolio</a>\n'
            '    </div>\n'
            '    <a class="btn solid" href="https://pay.femzlab.shop/x">Acheter</a>\n'
            '  </div>\n'
            '</nav>\n')

    def page(self, corps, tete=""):
        return f"<html><head>{tete}</head><body>{corps}</body></html>"

    def test_ajoute_l_acces_dans_le_dock(self):
        out = build.injecte_espace(self.page(self.DOCK))
        self.assertIn('href="/espace/"', out)
        # dans le dock, pas ailleurs : avant la fermeture de .nav-links
        dock = out[out.index('<nav class="dock">'):out.index("</nav>")]
        self.assertIn('href="/espace/"', dock)
        # le CTA de la page n'est pas remplacé
        self.assertIn("pay.femzlab.shop/x", out)

    def test_ne_double_pas_un_acces_existant(self):
        deja = self.DOCK.replace('<a class="btn solid" href="https://pay',
                                 '<a class="btn solid" href="/espace/">Mon espace</a>\n    <a class="btn solid" href="https://pay')
        out = build.injecte_espace(self.page(deja))
        self.assertEqual(out.count('href="/espace/"'), 1)

    def test_page_sans_dock_recoit_un_acces_flottant(self):
        out = build.injecte_espace(self.page("<h1>Fiche prompt</h1>"))
        self.assertIn('href="/espace/"', out)
        self.assertIn("femz-espace-flottant", out)

    def test_traduction_ajoutee_au_dictionnaire_de_la_page(self):
        out = build.injecte_espace(self.page(self.DOCK + '<script>const T={"Produits": "Products"};</script>'))
        self.assertIn('"Mon espace": "My space"', out)

    def test_toutes_les_pages_du_site_ont_l_acces(self):
        """Le vrai filet : on passe les sources réelles au build."""
        for source, _ in build.PAGES:
            texte = (build.SRC / source).read_text(encoding="utf-8")
            self.assertIn('href="/espace/"', build.injecte_espace(texte), source)

    def test_le_build_complet_pose_l_acces_sur_chaque_page_produite(self):
        """Tester injecte_espace() ne suffit pas : si l'appel disparaissait de
        la boucle du build, les pages perdraient l'accès sans qu'un test bronche
        (vérifié par mutation). On construit donc le site pour de vrai, dans un
        dossier jetable, avec l'encodage base64 court-circuité pour la vitesse.
        """
        import tempfile
        import contextlib
        import io
        from unittest import mock

        with tempfile.TemporaryDirectory() as dossier:
            cible = pathlib.Path(dossier)
            with mock.patch.object(build, "DIST", cible), \
                 mock.patch.object(build, "data_uri", lambda f: "data:,"), \
                 contextlib.redirect_stdout(io.StringIO()):
                build.main()
            produites = sorted(cible.rglob("*.html"))
            self.assertEqual(len(produites), len(build.PAGES))
            for page in produites:
                contenu = page.read_text(encoding="utf-8")
                self.assertIn('href="/espace/"', contenu, page.name)
                self.assertEqual(contenu.count('href="/espace/"'), 1, page.name)

if __name__ == "__main__":
    unittest.main()
