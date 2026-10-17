"""Chef d'orchestre d'une exécution : collecte, dédoublonnage, indicateurs, bilan.

Lancement (depuis le dossier du projet) :
    .venv\\Scripts\\python -m collecte.principal

Phase 2 : pas encore d'IA. Les articles regroupés sont écrits dans tmp/ (fichier de
travail jamais publié, car il contient les chapôs) ; les indicateurs et le bilan
d'exécution sont écrits dans data/.
"""

import argparse
import sys

from . import stockage
from .dedoublonnage import regrouper
from .flux import collecter_articles
from .indicateurs import mettre_a_jour_indicateurs
from .outils import DOSSIER_DATA, DOSSIER_TMP, charger_config, configurer_journal, horodatage, journal, maintenant_paris


def executer(type_execution: str) -> int:
    debut = horodatage()
    config = charger_config()
    aujourd_hui = maintenant_paris().date().isoformat()
    ancien_statut = stockage.lire_json(DOSSIER_DATA / "statut.json", {}) or {}
    ecritures = []

    # 1. Articles : collecte puis regroupement par événement
    journal.info("— Collecte des flux RSS —")
    articles, etats_sources = collecter_articles(config)
    groupes = regrouper(articles)
    journal.info("%d articles, %d événements distincts, dont %d couverts par plusieurs sources",
                 len(articles), len(groupes), sum(1 for g in groupes if g["nb_sources"] > 1))
    collecte = {"date": aujourd_hui, "genere_le": horodatage(), "type": type_execution,
                "nb_articles": len(articles), "groupes": groupes}
    ecrit, raison = stockage.ecrire_json_securise(
        DOSSIER_TMP / f"collecte-{aujourd_hui}.json", collecte,
        lambda d: stockage.valider_collecte(d, config["collecte"]["minimum_articles"]))
    ecritures.append({"fichier": f"tmp/collecte-{aujourd_hui}.json", "ecrit": ecrit, "raison": raison})

    # On garde la date du dernier succès de chaque source (utile pour repérer un flux mort)
    anciens_succes = {s["id"]: s.get("dernier_succes") for s in ancien_statut.get("sources", [])}
    for etat in etats_sources:
        etat["dernier_succes"] = horodatage() if etat["etat"] != "erreur" else anciens_succes.get(etat["id"])

    # 2. Indicateurs chiffrés
    journal.info("— Indicateurs —")
    fichier_indicateurs = DOSSIER_DATA / "indicateurs.json"
    indicateurs, etats_indicateurs = mettre_a_jour_indicateurs(config, stockage.lire_json(fichier_indicateurs))
    ecrit, raison = stockage.ecrire_json_securise(fichier_indicateurs, indicateurs, stockage.valider_indicateurs)
    ecritures.append({"fichier": "indicateurs.json", "ecrit": ecrit, "raison": raison})

    # 3. Bilan de l'exécution
    tout_refuse = not any(e["ecrit"] for e in ecritures)
    incident = (any(not e["ecrit"] for e in ecritures)
                or any(s["etat"] == "erreur" for s in etats_sources)
                or any(i["etat"] != "ok" for i in etats_indicateurs))
    resultat = "echec" if tout_refuse else ("partiel" if incident else "ok")
    statut = {
        "version_schema": 1,
        "derniere_execution": {"debut": debut, "fin": horodatage(), "type": type_execution, "resultat": resultat},
        "derniere_edition": ancien_statut.get("derniere_edition"),
        "sources": etats_sources,
        "indicateurs": etats_indicateurs,
        "ia": None,
        "ecritures": ecritures,
    }
    stockage.ecrire_json_securise(DOSSIER_DATA / "statut.json", statut, stockage.valider_statut)

    for e in ecritures:
        if not e["ecrit"]:
            journal.warning("Non écrit (ancienne version conservée) : %s — %s", e["fichier"], e["raison"])
    journal.info("Résultat : %s", resultat.upper())
    return 1 if resultat == "echec" else 0


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # accents corrects dans la console Windows
    sys.stderr.reconfigure(encoding="utf-8")
    configurer_journal()
    analyseur = argparse.ArgumentParser(description="Mise à jour des données de Morning-Market")
    analyseur.add_argument("--type", default="manuel", choices=["matin", "fin-de-matinee", "manuel"],
                           help="passage planifié du matin, de fin de matinée, ou lancement manuel")
    sys.exit(executer(analyseur.parse_args().type))


if __name__ == "__main__":
    main()
