"""Faits publiés pour la page Méthodologie (reglages-site.json) : ils doivent suivre la configuration réelle."""

from collecte import reglages_site
from collecte.outils import charger_config


def test_horaires_lus_dans_le_workflow(tmp_path):
    workflow = tmp_path / "mise-a-jour.yml"
    workflow.write_text('on:\n  schedule:\n    - cron: "23 8 * * *"\n    - cron: "7 4 * * *"\n', encoding="utf-8")
    assert reglages_site.passages_utc(workflow) == ["04:07", "08:23"]
    assert reglages_site.passages_utc(tmp_path / "absent.yml") == []


def test_methodologie_suit_la_configuration():
    config = charger_config()
    faits = reglages_site.produire(config)["methodologie"]
    noms = [s["nom"] for s in faits["sources"]]
    assert len(noms) == len(set(noms)) == len({s["nom"] for s in config["sources"]})  # chaque média une seule fois
    assert faits["passages_utc"], "les horaires du workflow doivent être trouvés"
    premier = config["ia"]["niveaux"]["high"][0]["modele"]
    assert faits["modeles_redaction"][0] == config["ia"]["noms_affiches"].get(premier, premier)
