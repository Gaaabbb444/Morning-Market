"""Chef d'orchestre d'une exécution : collecte, indicateurs, édition, fils rouges, récaps, bilan.

Lancement (depuis le dossier du projet) :
    .venv\\Scripts\\python -m collecte.principal

Les articles regroupés (avec chapôs) sont écrits dans tmp/, jamais publié. Tout le reste va dans data/.
Les clés d'IA sont lues dans les variables d'environnement (secrets GitHub en ligne)
ou, sur un PC, dans le fichier .env (jamais publié).
"""

import argparse
import os
import sys
from datetime import date

from . import fils_rouges, memoire, reglages_site, stockage
from .dedoublonnage import regrouper
from .edition import construire_edition
from .flux import collecter_articles
from .ia import ClientIA
from .indicateurs import mettre_a_jour_indicateurs
from .outils import (DOSSIER_DATA, DOSSIER_TMP, RACINE, charger_config, configurer_journal, horodatage, journal,
                     maintenant_paris)


def lire_environnement() -> dict:
    """Variables d'environnement, complétées par le fichier .env local s'il existe."""
    environnement = dict(os.environ)
    fichier = RACINE / ".env"
    if fichier.exists():
        for ligne in fichier.read_text(encoding="utf-8-sig").splitlines():
            if "=" in ligne and not ligne.lstrip().startswith("#"):
                nom, valeur = ligne.split("=", 1)
                environnement.setdefault(nom.strip(), valeur.strip().strip('"'))
    return environnement


def doit_reconstruire(type_execution: str, edition_existante: dict | None, refaire: bool) -> bool:
    """Un passage planifié refait l'édition du jour si elle n'a été créée que par des lancements manuels
    (par exemple juste après minuit) : ce sont les passages planifiés qui fixent le vrai Top 5 de la journée.
    Le passage de fin de matinée prend le relais si celui du matin n'a pas pu écrire (trop peu de nouveautés)."""
    if refaire:
        return True
    if edition_existante is None or type_execution not in ("matin", "fin-de-matinee"):
        return False
    return not any(p["type"] in ("matin", "fin-de-matinee") for p in edition_existante.get("passages", []))


def executer(type_execution: str, refaire: bool = False) -> int:
    debut = horodatage()
    config = charger_config()
    aujourd_hui = maintenant_paris().date().isoformat()
    ancien_statut = stockage.lire_json(DOSSIER_DATA / "statut.json", {}) or {}
    ecritures = []

    def ecrire(nom_affiche, chemin, donnees, validateur):
        ecrit, raison = stockage.ecrire_json_securise(chemin, donnees, validateur)
        ecritures.append({"fichier": nom_affiche, "ecrit": ecrit, "raison": raison})
        if not ecrit:
            journal.warning("Non écrit (ancienne version conservée) : %s — %s", nom_affiche, raison)
        return ecrit

    # 1. Articles : collecte puis regroupement par événement
    journal.info("— Collecte des flux RSS —")
    articles, etats_sources = collecter_articles(config)
    groupes = regrouper(articles)
    journal.info("%d articles, %d événements distincts, dont %d couverts par plusieurs sources",
                 len(articles), len(groupes), sum(1 for g in groupes if g["nb_sources"] > 1))
    collecte = {"date": aujourd_hui, "genere_le": horodatage(), "type": type_execution,
                "nb_articles": len(articles), "groupes": groupes}
    collecte_valide = ecrire(f"tmp/collecte-{aujourd_hui}.json", DOSSIER_TMP / f"collecte-{aujourd_hui}.json", collecte,
                             lambda d: stockage.valider_collecte(d, config["collecte"]["minimum_articles"]))

    anciens_succes = {s["id"]: s.get("dernier_succes") for s in ancien_statut.get("sources", [])}
    for etat in etats_sources:
        etat["dernier_succes"] = horodatage() if etat["etat"] != "erreur" else anciens_succes.get(etat["id"])

    # Libellés pour le site (catégories, thèmes, présentation des indicateurs)
    ecrire("reglages-site.json", DOSSIER_DATA / "reglages-site.json", reglages_site.produire(config),
           reglages_site.valider)

    # 2. Indicateurs chiffrés
    journal.info("— Indicateurs —")
    fichier_indicateurs = DOSSIER_DATA / "indicateurs.json"
    indicateurs, etats_indicateurs = mettre_a_jour_indicateurs(config, stockage.lire_json(fichier_indicateurs))
    ecrire("indicateurs.json", fichier_indicateurs, indicateurs, stockage.valider_indicateurs)

    # 3. Édition du jour, fils rouges et récapitulatifs
    client = ClientIA(config["ia"], lire_environnement())
    journal.info("— Édition (IA : %s) —", ", ".join(client.resume_pour_statut()["fournisseurs_configures"]) or "aucune clé, mode dégradé")
    derniere_edition = ancien_statut.get("derniere_edition")
    modes = {}
    if collecte_valide:
        fichier_jour = DOSSIER_DATA / "jours" / f"{aujourd_hui}.json"
        edition_existante = stockage.lire_json(fichier_jour)
        reconstruire = doit_reconstruire(type_execution, edition_existante, refaire)
        if reconstruire:
            journal.info("Reconstruction complète de l'édition du jour")
            edition_existante = None

        # Les articles déjà traités dans l'édition précédente ne sont jamais republiés.
        dates_precedentes = [d for d in (stockage.lire_json(DOSSIER_DATA / "jours" / "index.json") or {}).get("dates", [])
                             if d < aujourd_hui]
        precedente = stockage.lire_json(DOSSIER_DATA / "jours" / f"{max(dates_precedentes)}.json") if dates_precedentes else None
        ids_precedents = set((precedente or {}).get("ids_traites", []))

        fichier_fils = stockage.lire_json(DOSSIER_DATA / "fils-rouges.json")
        fils_actifs = [f for f in fichier_fils["fils"] if f["statut"] == "actif"]
        concepts = stockage.lire_json(DOSSIER_DATA / "concepts.json", {"concepts": []})["concepts"]
        citations = stockage.lire_json(DOSSIER_DATA / "citations.json", {"citations": []})["citations"]

        edition, classements, modes = construire_edition(groupes, client, config, fils_actifs, concepts, citations,
                                                         edition_existante, aujourd_hui, type_execution, ids_precedents)
        edition_ecrite = ecrire(f"jours/{aujourd_hui}.json", fichier_jour, edition, stockage.valider_edition)
        if edition_ecrite:
            derniere_edition = aujourd_hui
            index = stockage.lire_json(DOSSIER_DATA / "index-recherche.json")
            ecrire("index-recherche.json", DOSSIER_DATA / "index-recherche.json",
                   memoire.mettre_a_jour_index(index, edition), memoire.valider_index(index, aujourd_hui))
            ecrire("jours/index.json", DOSSIER_DATA / "jours" / "index.json",
                   memoire.mettre_a_jour_liste_editions(stockage.lire_json(DOSSIER_DATA / "jours" / "index.json"), aujourd_hui),
                   lambda d: None if d.get("dates") else "liste vide")

        journal.info("— Fils rouges —")
        nouveaux_fils, modes["fils_rouges"] = fils_rouges.mettre_a_jour(fichier_fils, groupes, classements, client,
                                                                        config, aujourd_hui, reconstruire and edition_ecrite)
        if nouveaux_fils is not fichier_fils:
            ecrire("fils-rouges.json", DOSSIER_DATA / "fils-rouges.json", nouveaux_fils,
                   fils_rouges.valider_sans_perte(fichier_fils, aujourd_hui))

        journal.info("— Récapitulatifs —")
        ecritures.extend(memoire.rattraper_recaps(date.fromisoformat(aujourd_hui), client,
                                                  stockage.lire_json(DOSSIER_DATA / "fils-rouges.json")["fils"]))

    # 4. Bilan de l'exécution
    essentiels = [e for e in ecritures if e["fichier"] in ("indicateurs.json", f"jours/{aujourd_hui}.json")]
    tout_refuse = not any(e["ecrit"] for e in essentiels)
    incident = (any(not e["ecrit"] for e in ecritures)
                or any(s["etat"] == "erreur" for s in etats_sources)
                or any(i["etat"] != "ok" for i in etats_indicateurs)
                or any(m in ("sans-ia", "partiel") for m in modes.values()))
    resultat = "echec" if tout_refuse else ("partiel" if incident else "ok")
    statut = {
        "version_schema": 1,
        "derniere_execution": {"debut": debut, "fin": horodatage(), "type": type_execution, "resultat": resultat},
        "derniere_edition": derniere_edition,
        "sources": etats_sources,
        "indicateurs": etats_indicateurs,
        "ia": dict(client.resume_pour_statut(), etapes=modes),
        "ecritures": ecritures,
    }
    stockage.ecrire_json_securise(DOSSIER_DATA / "statut.json", statut, stockage.valider_statut)
    journal.info("Résultat : %s (IA : %d requêtes, étapes : %s)", resultat.upper(), client.requetes, modes)
    return 1 if resultat == "echec" else 0


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # accents corrects dans la console Windows
    sys.stderr.reconfigure(encoding="utf-8")
    configurer_journal()
    analyseur = argparse.ArgumentParser(description="Mise à jour des données de Morning-Market")
    analyseur.add_argument("--type", default="manuel", choices=["matin", "fin-de-matinee", "manuel"],
                           help="passage planifié du matin, de fin de matinée, ou lancement manuel")
    analyseur.add_argument("--refaire", action="store_true",
                           help="reconstruit l'édition du jour depuis zéro au lieu de la compléter")
    arguments = analyseur.parse_args()
    sys.exit(executer(arguments.type, arguments.refaire))


if __name__ == "__main__":
    main()
