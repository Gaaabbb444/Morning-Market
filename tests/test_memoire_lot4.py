"""Récapitulatifs (accroche, « À retenir ») et usages des notions du glossaire."""

import json
from datetime import date

from collecte import memoire
from outils_tests import FauxClient


def edition(jour, notion=None, concept=None):
    top5 = [{"id": f"a{jour[-2:]}", "titre": f"Info du {jour}", "source": "Le Monde", "url": "https://exemple.fr",
             "categorie": "finance", "faits": "Le déficit atteint 21,4 milliards.", "fil_rouge": None,
             "pour_tes_copies": {"notion_id": notion, "texte": "…"} if notion else "ancien format"}]
    return {"date": jour, "essentiel": ["Phrase.", "Phrase.", "Phrase."], "top5": top5,
            "concept": {"id": concept, "article_id": top5[0]["id"]} if concept else None}


def preparer(tmp_path, monkeypatch, editions):
    monkeypatch.setattr(memoire, "DOSSIER_DATA", tmp_path)
    (tmp_path / "jours").mkdir()
    for e in editions:
        (tmp_path / "jours" / f"{e['date']}.json").write_text(json.dumps(e), encoding="utf-8")


def test_recap_accroche_et_a_retenir_controle(tmp_path, monkeypatch):
    preparer(tmp_path, monkeypatch, [edition("2026-10-19"), edition("2026-10-20"), edition("2026-10-21")])
    client = FauxClient({"recap": {
        "accroche": "Déficit à 21,4 milliards, tensions budgétaires",
        "synthese": "Une semaine marquée par les finances publiques. " * 4,
        "faits_marquants": [{"date": "2026-10-19", "article_id": "a19", "a_retenir": "Le déficit de 21,4 milliards pèse sur la dette."},
                            {"date": "2026-10-20", "article_id": "a20", "a_retenir": "Un chiffre inventé : 99 milliards."}],
        "fils_rouges": []}})
    recap = memoire.generer_recap("semaine", "2026-W43", date(2026, 10, 19), date(2026, 10, 25), client, [])
    assert recap["accroche"].startswith("Déficit")
    assert recap["faits_marquants"][0]["a_retenir"].startswith("Le déficit")
    assert recap["faits_marquants"][1]["a_retenir"] is None  # « 99 » n'existe dans aucune édition


def test_usages_du_glossaire(tmp_path, monkeypatch):
    preparer(tmp_path, monkeypatch, [edition("2026-10-18", notion="spread", concept="inflation"), edition("2026-10-17")])
    notions = memoire.usages_glossaire()["notions"]
    assert notions["spread"][0]["contexte"] == "Top 5 du jour" and notions["spread"][0]["date"] == "2026-10-18"
    assert notions["inflation"][0]["contexte"] == "Concept du jour"
    assert len(notions) == 2  # l'ancien format de « Pour tes copies » (texte seul) est ignoré
