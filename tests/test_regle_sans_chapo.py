"""Règle demandée par Gab : une source sans chapô (Les Echos via Google News, BCE) ne donne lieu
à aucun texte rédigé, et ne peut entrer au Top 5 que si une source avec chapô la confirme."""

from collecte import edition, regles
from collecte.outils import charger_config
from outils_tests import CHAPO, FauxClient, article, groupe, groupe_documente, groupe_sans_chapo

CONFIG = charger_config()


def test_documente_seulement_avec_un_vrai_chapo():
    assert not regles.est_documente(groupe_sans_chapo("e1"))
    assert regles.est_documente(groupe_documente("m1"))
    # Une source sans chapô confirmée par une source avec chapô devient éligible
    confirme = groupe(article("e2", "Les Echos", "Budget 2027 : vote", type_source="agregateur"),
                      article("m2", "Le Monde", "Budget 2027 : vote à l'Assemblée", CHAPO))
    assert regles.eligible_top5(confirme)


def test_resume_de_l_ia_supprime_pour_un_evenement_sans_chapo():
    classement = {"pertinent": True, "categorie": "desequilibres", "importance": 9, "fil_rouge": None,
                  "titre_fr": None, "resume": "Résumé que l'IA n'avait pas le droit d'écrire."}
    assert regles.appliquer_regle_sans_chapo(groupe_sans_chapo("e1"), classement)["resume"] is None


def _client_desobeissant(groupes):
    """Une IA qui enfreint la règle : elle résume l'événement sans chapô et le place en tête du Top 5."""
    ids = [g["id"] for g in groupes]
    return FauxClient({
        "classement": {"evenements": [{"id": i, "pertinent": True, "categorie": "desequilibres", "importance": 9,
                                       "fil_rouge": None, "titre_fr": None, "resume": "Un résumé inventé."} for i in ids]},
        "edition": {"essentiel": ["Phrase 1.", "Phrase 2.", "Phrase 3."],
                    "top5": [{"id": i, "faits": "Faits inventés.", "analyse": "Analyse.", "pour_tes_copies": "Copie."}
                             for i in ids]},
    })


def test_evenement_sans_chapo_exclu_du_top5_et_sans_texte_meme_si_l_ia_desobeit():
    groupes = [groupe_sans_chapo("echos1"), groupe_sans_chapo("echos2", "La BCE relève ses taux directeurs")] + \
              [groupe_documente(f"doc{i}", f"Information documentée numéro {i} sur l'économie") for i in range(6)]
    client = _client_desobeissant(groupes)

    resultat, _, _ = edition.construire_edition(groupes, client, CONFIG, [], [], [], None, "2026-10-19", "matin")

    ids_top5 = {t["id"] for t in resultat["top5"]}
    assert "echos1" not in ids_top5 and "echos2" not in ids_top5
    # L'IA n'a reçu aucun événement sans chapô parmi les candidats au Top 5
    candidats_envoyes = next(d for t, d in client.appels if t == "edition")["candidats"]
    assert all(c["documente"] for c in candidats_envoyes)
    # Partout où ils apparaissent, les événements sans chapô n'ont que titre et lien
    for liste in resultat["par_categorie"].values():
        for element in liste:
            if element["id"].startswith("echos"):
                assert element["resume"] is None and not element["documente"]
                assert element["titre"] and element["url"]


def test_sans_chapo_n_envoie_aucun_extrait_a_l_ia():
    fiche = edition.fiche_evenement(groupe_sans_chapo("e1"))
    assert fiche["documente"] is False and "extraits" not in fiche


def test_traduction_du_titre_autorisee_pour_la_bce():
    bce = groupe(article("bce1", "BCE", "Monetary policy decisions", langue="en", type_source="institution"))
    brut = {"pertinent": True, "categorie": "finance", "importance": 6, "titre_fr": "Décisions de politique monétaire",
            "resume": "Résumé interdit."}
    classement = edition._nettoyer_classement(brut, bce, set())
    assert classement["titre_fr"] == "Décisions de politique monétaire"
    assert classement["resume"] is None
