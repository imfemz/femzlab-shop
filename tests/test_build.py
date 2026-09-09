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
        rendu = build.carte(
            {"pseudo": 'A"B', "produit": "R&D", "texte": "x", "date": "2026-08-16"}
        )
        self.assertIn("&quot;", rendu)
        self.assertIn("&amp;", rendu)

    def test_initiale_en_majuscule(self):
        rendu = build.carte(
            {"pseudo": "théo", "produit": "Presets Pack", "texte": "x",
             "date": "2026-08-16"}
        )
        self.assertIn('<span class="av" aria-hidden="true">T</span>', rendu)

    def test_copie_marquee_masquee_aux_lecteurs_d_ecran(self):
        avis = {"pseudo": "Théo", "produit": "Presets Pack", "texte": "x",
                "date": "2026-08-16"}
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

    def test_affiche_la_date_au_format_francais(self):
        """La date vient de reviews.json en ISO ; l'affichage est pour un lectorat FR."""
        avis = {"pseudo": "Théo", "produit": "Presets Pack", "texte": "x",
                "date": "2026-07-28"}
        rendu = build.carte(avis)
        self.assertIn('<span class="rv-date">28/07/2026</span>', rendu)
        self.assertNotIn("2026-07-28", rendu)


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

        rendu = build.injecte_avis(f"{build.DEBUT}{build.FIN}", source)
        self.assertLess(rendu.index(">Recent<"), rendu.index(">Milieu<"))
        self.assertLess(rendu.index(">Milieu<"), rendu.index(">Ancien<"))


class TestMention(unittest.TestCase):
    def test_texte_exact_de_la_mention_legale(self):
        """Zone à haut risque : toute reformulation doit être délibérée, pas accidentelle."""
        attendu = (
            "Avis de clients ayant acheté le produit, recueillis par formulaire "
            "ou transmis directement. Publiés sans sélection sur la note, "
            "classés du plus récent au plus ancien. Aucune contrepartie n'est "
            "fournie en échange d'un avis."
        )
        self.assertEqual(build.MENTION, attendu)


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


if __name__ == "__main__":
    unittest.main()


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
