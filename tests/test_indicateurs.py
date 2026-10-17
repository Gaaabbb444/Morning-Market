"""Historique des indicateurs, variations, et comportement en cas de panne d'une source."""

from datetime import date

from collecte import indicateurs


def test_fusion_garde_l_historique_et_corrige_la_derniere_seance():
    ancien = [["2026-10-14", 100.0], ["2026-10-15", 101.0]]
    nouveaux = [("2026-10-15", 102.0), ("2026-10-16", 103.0)]
    resultat = indicateurs.fusionner_historique(ancien, nouveaux, decimales=0)
    assert resultat == [["2026-10-14", 100.0], ["2026-10-15", 102.0], ["2026-10-16", 103.0]]


def test_variation_en_pourcent_et_en_points():
    historique = [["2026-08", 2.0], ["2026-09", 2.5]]
    assert indicateurs.calculer_variation(historique, "points")["valeur"] == 0.5
    assert indicateurs.calculer_variation(historique, "pourcent")["valeur"] == 25.0
    assert indicateurs.calculer_variation(historique[:1], "points") is None


def test_donnee_perimee():
    aujourd_hui = date(2026, 10, 17)
    assert not indicateurs.est_perimee("2026-08", "mensuelle", aujourd_hui)   # chômage d'août en octobre : normal
    assert indicateurs.est_perimee("2026-03", "mensuelle", aujourd_hui)
    assert not indicateurs.est_perimee("2026-T2", "trimestrielle", aujourd_hui)
    assert indicateurs.est_perimee("2026-10-01", "quotidienne", aujourd_hui)


def test_source_en_panne_garde_la_derniere_valeur(monkeypatch):
    def panne(_):
        raise ConnectionError("API indisponible")
    monkeypatch.setattr(indicateurs, "depuis_bce", panne)

    config = {"indicateurs": [{"id": "eur-usd", "libelle": "EUR/USD", "unite": "$", "decimales": 4,
                               "frequence": "quotidienne", "variation": "pourcent", "fournisseur": "bce",
                               "serie": "X", "source": "BCE", "source_url": "https://exemple.fr"}]}
    fichier_actuel = {"indicateurs": [{"id": "eur-usd", "historique": [["2026-10-15", 1.12], ["2026-10-16", 1.1253]],
                                       "dernier_succes": "2026-10-16T06:00:00+02:00"}]}

    contenu, etats = indicateurs.mettre_a_jour_indicateurs(config, fichier_actuel)

    eur_usd = contenu["indicateurs"][0]
    assert eur_usd["derniere_valeur"] == {"periode": "2026-10-16", "valeur": 1.1253}
    assert eur_usd["etat"] == "derniere-valeur"
    assert eur_usd["dernier_succes"] == "2026-10-16T06:00:00+02:00"
    assert etats[0]["source_utilisee"] == "aucune"
