"""Le garde-fou principal : on n'écrase jamais de bonnes données par des données invalides."""

import json

from collecte import stockage

BON_FICHIER = {"indicateurs": [{"id": "cac40", "derniere_valeur": {"periode": "2026-10-16", "valeur": 7956.7},
                                "historique": [["2026-10-16", 7956.7]]}]}


def test_donnees_valides_ecrites(tmp_path):
    chemin = tmp_path / "indicateurs.json"
    ecrit, raison = stockage.ecrire_json_securise(chemin, BON_FICHIER, stockage.valider_indicateurs)
    assert ecrit and raison is None
    assert json.loads(chemin.read_text(encoding="utf-8")) == BON_FICHIER
    assert not list(tmp_path.glob("*.tmp"))  # aucun fichier temporaire oublié


def test_donnees_vides_refusees_et_ancien_fichier_conserve(tmp_path):
    chemin = tmp_path / "indicateurs.json"
    stockage.ecrire_json_securise(chemin, BON_FICHIER, stockage.valider_indicateurs)

    ecrit, raison = stockage.ecrire_json_securise(chemin, {"indicateurs": []}, stockage.valider_indicateurs)

    assert not ecrit and "aucun indicateur" in raison
    assert json.loads(chemin.read_text(encoding="utf-8")) == BON_FICHIER


def test_valeur_non_numerique_refusee(tmp_path):
    mauvais = {"indicateurs": [{"id": "x", "derniere_valeur": {"periode": "2026-10", "valeur": float("nan")}}]}
    ecrit, _ = stockage.ecrire_json_securise(tmp_path / "f.json", mauvais, stockage.valider_indicateurs)
    assert not ecrit


def test_collecte_trop_maigre_refusee():
    collecte = {"groupes": [{"articles": [{}] * 5}]}
    assert "seulement 5 articles" in stockage.valider_collecte(collecte, minimum_articles=30)


def test_lecture_fichier_absent_ou_corrompu(tmp_path):
    assert stockage.lire_json(tmp_path / "absent.json", {"defaut": 1}) == {"defaut": 1}
    corrompu = tmp_path / "corrompu.json"
    corrompu.write_text("{pas du json", encoding="utf-8")
    assert stockage.lire_json(corrompu) is None
