"""Mémoire : périodes des récapitulatifs, index de recherche, fils rouges sans perte."""

from datetime import date

from collecte import fils_rouges, memoire


def test_semaine_recapitulee_le_dimanche_et_rattrapage_en_semaine():
    assert memoire.semaine_a_recapituler(date(2026, 10, 25))[0] == "2026-W43"   # dimanche : semaine en cours
    periode, lundi, dimanche = memoire.semaine_a_recapituler(date(2026, 10, 27))  # mardi : semaine précédente
    assert periode == "2026-W43" and lundi == date(2026, 10, 19) and dimanche == date(2026, 10, 25)


def test_mois_recapitule_est_le_mois_precedent():
    assert memoire.mois_a_recapituler(date(2026, 11, 1))[0] == "2026-10"
    assert memoire.mois_a_recapituler(date(2027, 1, 3))[0] == "2026-12"


def test_index_remplace_seulement_les_entrees_du_jour():
    ancien = {"entrees": [{"d": "2026-10-18", "i": "x"}, {"d": "2026-10-19", "i": "ancien"}]}
    edition = {"date": "2026-10-19", "top5": [{"id": "n1", "titre": "T", "categorie": "finance", "source": "S"}],
               "par_categorie": {}}
    nouveau = memoire.mettre_a_jour_index(ancien, edition)
    assert {e["i"] for e in nouveau["entrees"]} == {"x", "n1"}


def test_fils_rouges_ne_peuvent_pas_perdre_d_evenements():
    ancien = {"fils": [{"id": "budget", "titre": "Budget", "statut": "actif", "evenements": [{"date": "2026-10-18"}]}]}
    perte = {"fils": [{"id": "budget", "titre": "Budget", "statut": "actif", "evenements": []}]}
    assert "perdrait" in fils_rouges.valider_sans_perte(ancien)(perte)
    assert fils_rouges.valider_sans_perte(ancien)(ancien) is None
