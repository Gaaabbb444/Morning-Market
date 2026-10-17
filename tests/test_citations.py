"""Règle d'or : aucune citation inventée ni mal attribuée."""

from collecte import regles

SOURCE = ("Sébastien Lecornu : « Nous ne nous laisserons pas intimider » "
          "Le Premier ministre a déclaré : “Le budget sera présenté dans les délais prévus par la loi.”")


def test_citation_exacte_et_auteur_nomme_acceptee():
    assert regles.verifier_citation("Nous ne nous laisserons pas intimider", "Sébastien Lecornu, Premier ministre", SOURCE) is None


def test_guillemets_et_espaces_differents_toleres():
    assert regles.verifier_citation("Le budget sera présenté  dans les délais prévus par la loi.",
                                    "Sébastien Lecornu", SOURCE) is None


def test_citation_reformulee_rejetee():
    raison = regles.verifier_citation("Nous ne céderons pas à l'intimidation", "Sébastien Lecornu", SOURCE)
    assert raison and "mot pour mot" in raison


def test_auteur_absent_de_la_source_rejete():
    raison = regles.verifier_citation("Nous ne nous laisserons pas intimider", "Bruno Le Maire", SOURCE)
    assert raison and "auteur" in raison


def test_extraction_des_passages_entre_guillemets():
    passages = regles.extraire_citations(SOURCE)
    assert "Nous ne nous laisserons pas intimider" in passages
    assert "Le budget sera présenté dans les délais prévus par la loi." in passages
    assert regles.extraire_citations("Il a dit « oui ».") == []  # trop court pour être une citation utile
