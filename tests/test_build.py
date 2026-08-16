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
