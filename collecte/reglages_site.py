"""Publie pour le site les libellés définis dans config.yaml (data/reglages-site.json).

Le site n'a pas accès à config.yaml : ce petit fichier lui donne les noms des catégories,
des thèmes de TEJM et la présentation des indicateurs, pour qu'aucun libellé ne soit
écrit en dur dans le code du site.
"""

import re
from pathlib import Path

GROUPES_INDICATEURS = ["Marchés", "Change", "Taux", "Économie"]
WORKFLOW = Path(__file__).resolve().parent.parent / ".github" / "workflows" / "mise-a-jour.yml"


def passages_utc(chemin: Path = WORKFLOW) -> list[str]:
    """Heures (UTC) des mises à jour planifiées, lues dans le workflow : « 7 4 * * * » → « 04:07 »."""
    try:
        texte = chemin.read_text(encoding="utf-8")
    except OSError:
        return []
    return sorted(f"{int(h):02d}:{int(m):02d}" for m, h in re.findall(r'cron:\s*"(\d+) (\d+) \* \* \*"', texte))


def methodologie(config: dict) -> dict:
    """Faits affichés par la page Méthodologie : médias suivis, modèles d'IA, horaires des passages."""
    sources, vus = [], set()
    for s in config["sources"]:
        if s["nom"] not in vus:
            vus.add(s["nom"])
            sources.append({"nom": s["nom"], "type": s["type"]})
    noms = config["ia"].get("noms_affiches", {})
    modeles = lambda niveau: list(dict.fromkeys(noms.get(m["modele"], m["modele"]) for m in config["ia"]["niveaux"][niveau]))
    return {"sources": sources, "modeles_redaction": modeles("high"), "modeles_classement": modeles("low"),
            "passages_utc": passages_utc(), "fenetre_heures": config["collecte"]["fenetre_heures"]}


def produire(config: dict) -> dict:
    categories = [{"id": c["id"], "libelle": c["libelle"], "libelle_pastille": c["libelle_pastille"],
                   "libelle_onglet": c["libelle_onglet"]} for c in config["categories"]]
    indicateurs = []
    for i in config["indicateurs"]:
        indicateurs.append({
            "id": i["id"], "libelle": i["libelle"], "nom": i["nom"], "nom_court": i.get("nom_court"),
            "note": i["note"], "groupe": i["groupe"], "unite": i["unite_affichee"], "source": i["source"],
            "ordre_bandeau": i.get("ordre_bandeau"),
            "prefixe_periode": i.get("prefixe_periode", "Période :"),
            # Seuls les prix de marché sont colorés en vert ou rouge (les variations en %)
            "prix_de_marche": i["variation"] == "pourcent",
        })
    # Thèmes du glossaire : les 5 thèmes de TEJM + les notions de marchés et d'épargne
    themes_glossaire = [{"id": th["id"], "libelle": th["libelle"], "libelle_court": th["libelle_court"]} for th in config["themes_tejm"]]
    themes_glossaire.append({"id": "marches", "libelle": "Marchés et épargne", "libelle_court": "Marchés et épargne"})
    return {"version_schema": 1, "categories": categories, "themes_tejm": config["themes_tejm"], "themes_glossaire": themes_glossaire,
            "indicateurs": indicateurs, "groupes_indicateurs": GROUPES_INDICATEURS, "methodologie": methodologie(config)}


def valider(donnees) -> str | None:
    if not isinstance(donnees, dict) or len(donnees.get("categories", [])) != 7:
        return "catégories manquantes"
    if sum(1 for i in donnees.get("indicateurs", []) if i.get("ordre_bandeau")) != 5:
        return "le bandeau doit compter 5 indicateurs"
    return None
