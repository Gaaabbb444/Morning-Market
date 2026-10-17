"""Règles de Gab pour « Pour tes copies » et pour l'absence de chiffres inventés."""

from collecte import edition, regles
from collecte.outils import charger_config
from outils_tests import CHAPO, FauxClient, groupe_documente

CONFIG = charger_config()
THEMES = {t["id"]: t["libelle"] for t in CONFIG["themes_tejm"]}
NOTIONS = {"pouvoir-d-achat": {"id": "pouvoir-d-achat", "terme": "Pouvoir d'achat"}}
SOURCE = "Le déficit public atteint 21,4 milliards d'euros, contre 12,7 milliards prévus."


def proposition(**modifs):
    base = {"theme": "desequilibres", "notion_id": "pouvoir-d-achat", "usage": "illustrer",
            "texte": "Exemple qui illustre la baisse du pouvoir d'achat, à placer dans un sujet sur les effets de l'inflation."}
    return dict(base, **modifs)


def test_proposition_conforme_acceptee_avec_lien_vers_la_notion():
    copies, raison = regles.verifier_pour_tes_copies(proposition(), NOTIONS, THEMES, SOURCE)
    assert raison is None
    assert copies["notion_id"] == "pouvoir-d-achat" and copies["notion_terme"] == "Pouvoir d'achat"
    assert copies["theme_libelle"].startswith("Déséquilibres")


def test_notion_inventee_rejetee():
    _, raison = regles.verifier_pour_tes_copies(proposition(notion_id="theorie-du-ruissellement"), NOTIONS, THEMES, SOURCE)
    assert "référentiel" in raison


def test_theme_hors_tejm_et_usage_invalide_rejetes():
    assert regles.verifier_pour_tes_copies(proposition(theme="marches"), NOTIONS, THEMES, SOURCE)[1]
    assert regles.verifier_pour_tes_copies(proposition(usage="démontrer"), NOTIONS, THEMES, SOURCE)[1]


def test_intitule_de_sujet_entre_guillemets_rejete():
    texte = "À placer dans le sujet « L'inflation est-elle toujours un phénomène monétaire ? » tombé à l'ESSEC."
    assert "guillemets" in regles.verifier_pour_tes_copies(proposition(texte=texte), NOTIONS, THEMES, SOURCE)[1]


def test_chiffre_absent_de_l_article_rejete():
    texte = "Illustre une perte de pouvoir d'achat de 3,5 % dans un sujet sur l'inflation."
    assert "chiffres absents" in regles.verifier_pour_tes_copies(proposition(texte=texte), NOTIONS, THEMES, SOURCE)[1]


def test_chiffres_ecrits_autrement_reconnus():
    assert regles.chiffres_absents("De 12,7 à 21,4 milliards, 1 000 emplois", "12.7 puis 21,4 ; 1.000 emplois") == set()
    assert regles.chiffres_absents("Les émissions de CO2 du G7", "") == set()  # sigles ignorés


def test_faits_avec_chiffre_invente_supprimes_dans_l_edition():
    groupes = [groupe_documente(f"doc{i}", f"Information documentée numéro {i}") for i in range(6)]
    ids = [g["id"] for g in groupes]
    client = FauxClient({
        "classement": {"evenements": [{"id": i, "pertinent": True, "categorie": "desequilibres", "importance": 7,
                                       "fil_rouge": None, "titre_fr": None, "resume": "Résumé."} for i in ids]},
        "edition": {"essentiel": ["Phrase 1.", "Phrase 2.", "Phrase 3."],
                    "top5": [{"id": i, "faits": "Le déficit atteint 99 milliards d'euros.", "analyse": "Mécanisme.",
                              "pour_tes_copies": proposition()} for i in ids[:5]]},
    })
    concepts = [{"id": "pouvoir-d-achat", "terme": "Pouvoir d'achat", "theme": "desequilibres",
                 "mots_cles": ["pouvoir d'achat"], "definition": "…"}]

    resultat, _, _ = edition.construire_edition(groupes, client, CONFIG, [], concepts, [], None, "2026-10-19", "matin")

    premier = resultat["top5"][0]
    assert premier["faits"] is None            # « 99 » n'est pas dans l'article : faits retirés
    assert premier["analyse"] == "Mécanisme."
    assert premier["pour_tes_copies"]["notion_id"] == "pouvoir-d-achat"
    # L'IA a bien reçu les thèmes de TEJM et la liste des notions autorisées
    donnees = next(d for t, d in client.appels if t == "edition")
    assert len(donnees["themes_tejm"]) == 5 and donnees["notions"][0]["id"] == "pouvoir-d-achat"
