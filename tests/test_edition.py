"""Édition du jour : mode dégradé, second passage, garde-fous."""

from collecte import edition, stockage
from collecte.outils import charger_config
from outils_tests import FauxClient, groupe_documente, groupe_sans_chapo

CONFIG = charger_config()
FILS = [{"id": "budget-2027", "titre": "Budget 2027", "statut": "actif"}]


def groupes_du_jour():
    titres = ["Budget 2027 : le déficit public dépasse les prévisions", "La BCE maintient ses taux directeurs",
              "Les exportations chinoises vers l'Europe bondissent", "Le chômage augmente en France",
              "Assurance-vie : la fiscalité de l'épargne en débat", "Stellantis annonce une nouvelle usine",
              "Le prix du pétrole Brent recule fortement"]
    return [groupe_documente(f"doc{i}", t) for i, t in enumerate(titres)] + [groupe_sans_chapo("echos1")]


def test_mode_degrade_produit_une_edition_valide_sans_texte_redige():
    resultat, _, modes = edition.construire_edition(groupes_du_jour(), FauxClient(disponible=False), CONFIG, FILS,
                                                    [], [], None, "2026-10-19", "matin")
    assert resultat["mode_ia"] == "sans-ia" and resultat["essentiel"] is None
    assert len(resultat["top5"]) == 5
    assert all(t["faits"] is None and t["analyse"] is None for t in resultat["top5"])
    assert stockage.valider_edition(resultat) is None
    assert modes["classement"] == "sans-ia"


def test_second_passage_garde_le_top5_sans_evenement_majeur():
    client = FauxClient(disponible=False)
    matin, _, _ = edition.construire_edition(groupes_du_jour(), client, CONFIG, FILS, [], [], None, "2026-10-19", "matin")
    nouveau = groupe_documente("nouveau", "Le Japon publie ses chiffres du commerce extérieur")

    midi, _, _ = edition.construire_edition(groupes_du_jour() + [nouveau], client, CONFIG, FILS, [], [], matin,
                                            "2026-10-19", "fin-de-matinee")

    assert [t["id"] for t in midi["top5"]] == [t["id"] for t in matin["top5"]]
    assert midi["passages"][-1]["nouvelles_infos"] == 1  # seul le nouvel événement a été traité
    assert len(midi["passages"]) == 2


def test_reponse_ia_invalide_bascule_en_mode_degrade():
    client = FauxClient({"classement": {"pas_la_bonne_cle": []}, "edition": {"top5": "n'importe quoi"}})
    resultat, _, modes = edition.construire_edition(groupes_du_jour(), client, CONFIG, FILS, [], [], None,
                                                    "2026-10-19", "matin")
    assert modes["classement"] == "sans-ia" and modes["top5"] == "sans-ia"
    assert stockage.valider_edition(resultat) is None


def test_edition_trop_maigre_refusee():
    assert "articles publiables" in stockage.valider_edition({"date": "2026-10-19", "top5": [], "par_categorie": {}})


def test_articles_de_l_edition_precedente_jamais_republies():
    client = FauxClient(disponible=False)
    veille, _, _ = edition.construire_edition(groupes_du_jour(), client, CONFIG, FILS, [], [], None, "2026-10-17", "matin")
    nouveaux = [groupe_documente(f"neuf{i}", t) for i, t in enumerate([
        "Le Japon publie ses chiffres du commerce extérieur", "La production industrielle allemande recule",
        "Le prix du gaz européen repart à la hausse", "Les défaillances d'entreprises atteignent un record",
        "La Fed laisse ses taux inchangés", "Le chômage recule en Espagne"])]

    jour, _, _ = edition.construire_edition(groupes_du_jour() + nouveaux, client, CONFIG, FILS, [], [], None,
                                            "2026-10-18", "matin", set(veille["ids_traites"]))

    publies = {t["id"] for t in jour["top5"]} | {e["id"] for l in jour["par_categorie"].values() for e in l}
    assert publies and publies <= {g["id"] for g in nouveaux}


def test_passages_planifies_reconstruisent_une_edition_seulement_manuelle():
    from collecte.principal import doit_reconstruire
    manuelle = {"passages": [{"type": "manuel"}]}
    deja_planifiee = {"passages": [{"type": "manuel"}, {"type": "matin"}]}
    assert doit_reconstruire("matin", manuelle, False)
    assert doit_reconstruire("fin-de-matinee", manuelle, False)  # relais si le matin n'a pas pu écrire
    assert not doit_reconstruire("fin-de-matinee", deja_planifiee, False)
    assert not doit_reconstruire("manuel", manuelle, False)
    assert not doit_reconstruire("matin", None, False)
    assert doit_reconstruire("manuel", deja_planifiee, True)
