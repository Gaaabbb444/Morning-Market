"""Mémoire de long terme : récapitulatifs hebdomadaires et mensuels, index de recherche, liste des éditions.

Les récapitulatifs sont construits à partir des éditions quotidiennes (pas des articles bruts).
Un récapitulatif manquant (exécution ratée) est rattrapé à l'exécution suivante.
"""

from datetime import date, timedelta

from .ia import BudgetEpuise
from .outils import DOSSIER_DATA, horodatage, journal
from .stockage import ecrire_json_securise, lire_json

MINIMUM_EDITIONS = {"semaine": 3, "mois": 7}
NOMBRE_FAITS = {"semaine": 5, "mois": 10}
NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
             "septembre", "octobre", "novembre", "décembre"]


# ---------------------------------------------------------------------------
# Périodes
# ---------------------------------------------------------------------------

def semaine_a_recapituler(aujourd_hui: date) -> tuple[str, date, date]:
    """Le dimanche : la semaine en cours (lundi → dimanche). Les autres jours : la semaine précédente."""
    lundi = aujourd_hui - timedelta(days=aujourd_hui.weekday())
    if aujourd_hui.weekday() != 6:
        lundi -= timedelta(days=7)
    dimanche = lundi + timedelta(days=6)
    annee, numero, _ = lundi.isocalendar()
    return f"{annee}-W{numero:02d}", lundi, dimanche


def mois_a_recapituler(aujourd_hui: date) -> tuple[str, date, date]:
    """Toujours le mois précédent (généré le 1er, ou rattrapé plus tard)."""
    dernier_jour = aujourd_hui.replace(day=1) - timedelta(days=1)
    return dernier_jour.strftime("%Y-%m"), dernier_jour.replace(day=1), dernier_jour


def _editions(du: date, au: date) -> list[dict]:
    editions, jour = [], du
    while jour <= au:
        contenu = lire_json(DOSSIER_DATA / "jours" / f"{jour.isoformat()}.json")
        if contenu:
            editions.append(contenu)
        jour += timedelta(days=1)
    return editions


# ---------------------------------------------------------------------------
# Récapitulatifs
# ---------------------------------------------------------------------------

def generer_recap(type_recap: str, periode: str, du: date, au: date, client, fils: list[dict]) -> dict | None:
    editions = _editions(du, au)
    if len(editions) < MINIMUM_EDITIONS[type_recap]:
        journal.info("Récap %s %s : seulement %d éditions, pas de récapitulatif", type_recap, periode, len(editions))
        return None
    if not client.disponible:
        return None

    articles = {}  # (date, id) → fiche, pour reconstituer les liens à partir des identifiants
    jours = []
    for edition in editions:
        for t in edition.get("top5", []):
            articles[(edition["date"], t["id"])] = t
        jours.append({"date": edition["date"], "essentiel": edition.get("essentiel"),
                      "top5": [{"id": t["id"], "titre": t.get("titre_fr") or t["titre"], "categorie": t["categorie"],
                                "fil_rouge": t.get("fil_rouge")} for t in edition.get("top5", [])]})
    donnees = {"type": type_recap, "periode": periode, "jours": jours,
               "fils_rouges": [{"id": f["id"], "titre": f["titre"]} for f in fils if f["statut"] == "actif"]}
    if type_recap == "mois":
        hebdos = []
        lundi = du - timedelta(days=du.weekday())
        while lundi <= au:
            annee, numero, _ = lundi.isocalendar()
            recap = lire_json(DOSSIER_DATA / "recaps" / f"semaine-{annee}-W{numero:02d}.json")
            if recap:
                hebdos.append({"periode": recap["periode"], "synthese": recap["synthese"]})
            lundi += timedelta(days=7)
        donnees["recaps_hebdomadaires"] = hebdos

    ids_fils = {f["id"] for f in fils}

    def valider(r):
        if not isinstance(r.get("synthese"), str) or len(r["synthese"]) < 100:
            return "synthèse absente ou trop courte"
        if not isinstance(r.get("faits_marquants"), list):
            return "faits marquants absents"
        return None

    try:
        reponse = client.demander("recap", "high", donnees, valider=valider, max_tokens=5000)
    except BudgetEpuise:
        return None
    if reponse is None:
        return None

    faits = []
    for fait in reponse["faits_marquants"]:
        fiche = articles.get((fait.get("date"), fait.get("article_id"))) if isinstance(fait, dict) else None
        if fiche and len(faits) < NOMBRE_FAITS[type_recap]:
            faits.append({"date": fait["date"], "titre": fiche["titre"], "titre_fr": fiche.get("titre_fr"),
                          "source": fiche["source"], "url": fiche["url"], "categorie": fiche["categorie"],
                          "fil_rouge": fiche.get("fil_rouge")})
    faits.sort(key=lambda f: f["date"])
    evolutions = [{"id": f["id"], "evolution": f["evolution"].strip()} for f in reponse.get("fils_rouges") or []
                  if isinstance(f, dict) and f.get("id") in ids_fils and isinstance(f.get("evolution"), str)]
    if type_recap == "semaine":
        libelle = f"Semaine du {du.day} {NOMS_MOIS[du.month - 1]} au {au.day} {NOMS_MOIS[au.month - 1]} {au.year}"
    else:
        libelle = f"{NOMS_MOIS[du.month - 1].capitalize()} {du.year}"
    return {"version_schema": 1, "type": type_recap, "periode": periode, "libelle": libelle,
            "du": du.isoformat(), "au": au.isoformat(), "genere_le": horodatage(),
            "synthese": reponse["synthese"].strip(), "faits_marquants": faits, "fils_rouges": evolutions}


def valider_recap(donnees) -> str | None:
    if not isinstance(donnees, dict) or not donnees.get("synthese") or not donnees.get("faits_marquants"):
        return "récapitulatif incomplet"
    return None


def rattraper_recaps(aujourd_hui: date, client, fils: list[dict]) -> list[dict]:
    """Génère les récapitulatifs dus et absents. Renvoie la liste des écritures pour statut.json."""
    ecritures = []
    for type_recap, (periode, du, au) in (("semaine", semaine_a_recapituler(aujourd_hui)),
                                          ("mois", mois_a_recapituler(aujourd_hui))):
        chemin = DOSSIER_DATA / "recaps" / f"{type_recap}-{periode}.json"
        if chemin.exists():
            continue
        recap = generer_recap(type_recap, periode, du, au, client, fils)
        if recap is None:
            continue
        ecrit, raison = ecrire_json_securise(chemin, recap, valider_recap)
        ecritures.append({"fichier": f"recaps/{chemin.name}", "ecrit": ecrit, "raison": raison})
        if ecrit:
            journal.info("Récapitulatif écrit : %s", chemin.name)
    return ecritures


# ---------------------------------------------------------------------------
# Index de recherche et liste des éditions
# ---------------------------------------------------------------------------

def entrees_index(edition: dict) -> list[dict]:
    """Une entrée courte par article publié dans l'édition (clés d'une lettre, voir contrat/)."""
    elements = list(edition.get("top5", [])) + [e for liste in edition.get("par_categorie", {}).values() for e in liste]
    return [{"d": edition["date"], "i": e["id"], "t": e.get("titre_fr") or e["titre"],
             "r": e.get("faits") or e.get("resume") or "", "c": e["categorie"], "s": e["source"],
             "f": e.get("fil_rouge")} for e in elements]


def mettre_a_jour_index(index_actuel: dict | None, edition: dict) -> dict:
    """Remplace les entrées du jour par celles de l'édition, sans toucher aux autres jours."""
    entrees = [e for e in (index_actuel or {}).get("entrees", []) if e["d"] != edition["date"]]
    entrees.extend(entrees_index(edition))
    entrees.sort(key=lambda e: e["d"], reverse=True)
    return {"version_schema": 1, "mis_a_jour_le": horodatage(), "entrees": entrees}


def valider_index(ancien: dict | None, jour: str | None = None):
    """Refuse un index qui perdrait des entrées des jours passés (celles du jour reconstruit peuvent changer)."""
    def valider(nouveau):
        if not isinstance(nouveau, dict) or not isinstance(nouveau.get("entrees"), list):
            return "structure inattendue"
        passes_avant = sum(1 for e in (ancien or {}).get("entrees", []) if e["d"] != jour)
        passes_apres = sum(1 for e in nouveau["entrees"] if e["d"] != jour)
        if passes_apres < passes_avant:
            return "l'index perdrait des entrées des jours passés"
        return None
    return valider


def mettre_a_jour_liste_editions(liste_actuelle: dict | None, jour: str) -> dict:
    dates = sorted(set((liste_actuelle or {}).get("dates", [])) | {jour}, reverse=True)
    return {"version_schema": 1, "dates": dates}
