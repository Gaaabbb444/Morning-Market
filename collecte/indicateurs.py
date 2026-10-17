"""Récupération des indicateurs chiffrés et mise à jour de leur historique.

Sources (vérifiées le 17/10/2026) :
- API de la BCE (sans clé) : change, taux de dépôt, taux à 10 ans ;
- API d'Eurostat (sans clé) : inflation, chômage, PIB ;
- Yahoo Finance pour les marchés : d'abord la bibliothèque yfinance, puis, si elle
  échoue, un accès direct au même service. En dernier recours, la dernière valeur connue.

L'historique est conservé indéfiniment : chaque exécution ajoute ou corrige des points,
elle n'en supprime jamais.
"""

import csv
import io
import time
from datetime import date, timedelta

import requests

from .outils import USER_AGENT, horodatage, journal

DELAI = 60
URL_BCE = "https://data-api.ecb.europa.eu/service/data/{serie}"
URL_EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{jeu}"
URL_YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{symbole}"

# Âge maximal (en jours) de la dernière donnée avant qu'on la signale comme « périmée »
AGE_MAXIMAL_JOURS = {"quotidienne": 7, "mensuelle": 100, "trimestrielle": 200}
# Nombre de points affichés dans les mini-courbes (le site s'en sert, l'historique complet reste stocké)
POINTS_COURBE = {"quotidienne": 30, "mensuelle": 12, "trimestrielle": 12}


# ---------------------------------------------------------------------------
# Les trois fournisseurs : chacun renvoie une liste de (période, valeur)
# ---------------------------------------------------------------------------

def _telecharger(url: str, parametres: dict) -> requests.Response:
    """Téléchargement avec un second essai : les API publiques ralentissent parfois quelques secondes."""
    for tentative in (1, 2):
        try:
            reponse = requests.get(url, params=parametres, headers={"User-Agent": USER_AGENT}, timeout=DELAI)
            reponse.raise_for_status()
            return reponse
        except requests.RequestException:
            if tentative == 2:
                raise
            time.sleep(10)


def depuis_bce(indicateur: dict) -> list[tuple[str, float]]:
    nombre = 90 if indicateur["frequence"] == "quotidienne" else 36
    reponse = _telecharger(URL_BCE.format(serie=indicateur["serie"]),
                           {"format": "csvdata", "lastNObservations": nombre})
    lignes = csv.DictReader(io.StringIO(reponse.text))
    return [(l["TIME_PERIOD"], float(l["OBS_VALUE"])) for l in lignes if l.get("OBS_VALUE")]


def _periode_eurostat(periode: str) -> str:
    """Eurostat écrit les trimestres « 2026-Q2 » ; on les note « 2026-T2 » en français."""
    return periode.replace("-Q", "-T")


def depuis_eurostat(indicateur: dict) -> list[tuple[str, float]]:
    annees = 3 if indicateur["frequence"] == "mensuelle" else 5
    debut = date.today().year - annees
    parametres = dict(indicateur["filtres"])
    parametres["sinceTimePeriod"] = f"{debut}-01" if indicateur["frequence"] == "mensuelle" else f"{debut}-Q1"
    donnees = _telecharger(URL_EUROSTAT.format(jeu=indicateur["jeu_de_donnees"]), parametres).json()
    # Format JSON-stat : les valeurs sont indexées par position ; on retrouve la période correspondante.
    position_vers_periode = {pos: per for per, pos in donnees["dimension"]["time"]["category"]["index"].items()}
    return sorted((_periode_eurostat(position_vers_periode[int(pos)]), float(val))
                  for pos, val in donnees["value"].items() if val is not None)


def _marche_via_yfinance(symbole: str) -> list[tuple[str, float]]:
    import yfinance  # importé ici : si la bibliothèque est cassée, seul le marché est touché

    historique = yfinance.Ticker(symbole).history(period="3mo", interval="1d", auto_adjust=False)
    return [(jour.strftime("%Y-%m-%d"), float(valeur))
            for jour, valeur in historique["Close"].dropna().items()]


def _marche_via_yahoo_direct(symbole: str) -> list[tuple[str, float]]:
    reponse = requests.get(
        URL_YAHOO.format(symbole=symbole), params={"range": "3mo", "interval": "1d"},
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36"},
        timeout=DELAI,
    )
    reponse.raise_for_status()
    resultat = reponse.json()["chart"]["result"][0]
    decalage = resultat["meta"].get("gmtoffset", 0)  # pour dater chaque séance à l'heure de la Bourse
    clotures = resultat["indicators"]["quote"][0]["close"]
    points = []
    for instant, valeur in zip(resultat["timestamp"], clotures):
        if valeur is not None:
            jour = date(1970, 1, 1) + timedelta(seconds=instant + decalage)
            points.append((jour.isoformat(), float(valeur)))
    return points


def depuis_marche(indicateur: dict) -> tuple[list[tuple[str, float]], str]:
    """Renvoie (points, source utilisée). Essaie yfinance, puis l'accès direct."""
    try:
        points = _marche_via_yfinance(indicateur["symbole"])
        if points:
            return points, "principale"
    except Exception as erreur:
        journal.warning("yfinance indisponible pour %s : %s", indicateur["id"], erreur)
    return _marche_via_yahoo_direct(indicateur["symbole"]), "secours"


# ---------------------------------------------------------------------------
# Calculs
# ---------------------------------------------------------------------------

def fusionner_historique(ancien: list, nouveaux: list[tuple[str, float]], decimales: int) -> list[list]:
    """Ajoute les nouveaux points à l'historique. Pour une même période, la valeur récente gagne
    (utile quand une séance de Bourse est encore en cours ou qu'un chiffre est révisé)."""
    par_periode = {periode: valeur for periode, valeur in ancien}
    for periode, valeur in nouveaux:
        par_periode[periode] = round(valeur, decimales + 2)
    return [[periode, par_periode[periode]] for periode in sorted(par_periode)]


def calculer_variation(historique: list[list], type_variation: str) -> dict | None:
    """Écart entre les deux derniers points : en % (marchés, change) ou en points (taux)."""
    if len(historique) < 2:
        return None
    (periode_avant, avant), (_, apres) = historique[-2], historique[-1]
    if type_variation == "pourcent":
        if avant == 0:
            return None
        ecart = (apres / avant - 1) * 100
    else:
        ecart = apres - avant
    return {"valeur": round(ecart, 2), "type": type_variation, "periode_reference": periode_avant}


def _debut_periode_suivante(periode: str) -> date:
    """Premier jour après la période (« 2026-09 » → 1er octobre 2026), pour mesurer l'âge d'une donnée."""
    if len(periode) == 10:
        return date.fromisoformat(periode) + timedelta(days=1)
    annee = int(periode[:4])
    if "-T" in periode:
        mois_suivant = int(periode[-1]) * 3 + 1
    else:
        mois_suivant = int(periode[5:7]) + 1
    if mois_suivant > 12:
        return date(annee + 1, mois_suivant - 12, 1)
    return date(annee, mois_suivant, 1)


def est_perimee(periode: str, frequence: str, aujourd_hui: date) -> bool:
    return (aujourd_hui - _debut_periode_suivante(periode)).days > AGE_MAXIMAL_JOURS[frequence]


# ---------------------------------------------------------------------------
# Mise à jour complète
# ---------------------------------------------------------------------------

def mettre_a_jour_indicateurs(config: dict, fichier_actuel: dict | None) -> tuple[dict, list[dict]]:
    """Met à jour tous les indicateurs. Renvoie (nouveau contenu de indicateurs.json, états pour statut.json).

    Un indicateur en panne garde sa dernière valeur et son historique ; il est marqué « derniere-valeur ».
    """
    anciens = {i["id"]: i for i in (fichier_actuel or {}).get("indicateurs", [])}
    aujourd_hui = date.today()
    resultat, etats = [], []

    for reglage in config["indicateurs"]:
        ancien = anciens.get(reglage["id"], {})
        etat = {"id": reglage["id"], "etat": "ok", "source_utilisee": "principale",
                "dernier_succes": ancien.get("dernier_succes"), "message": None}
        try:
            if reglage["fournisseur"] == "bce":
                points = depuis_bce(reglage)
            elif reglage["fournisseur"] == "eurostat":
                points = depuis_eurostat(reglage)
            else:
                points, etat["source_utilisee"] = depuis_marche(reglage)
            if not points:
                raise ValueError("aucune donnée reçue")
            etat["dernier_succes"] = horodatage()
        except Exception as erreur:
            points = []
            etat.update(etat="derniere-valeur", source_utilisee="aucune", message=str(erreur)[:150])

        historique = fusionner_historique(ancien.get("historique", []), points, reglage["decimales"])
        if historique:
            periode, valeur = historique[-1]
            derniere_valeur = {"periode": periode, "valeur": valeur}
            if etat["etat"] == "ok" and est_perimee(periode, reglage["frequence"], aujourd_hui):
                etat["etat"] = "perimee"
        else:
            derniere_valeur = None
            etat["etat"] = "indisponible"

        resultat.append({
            "id": reglage["id"],
            "libelle": reglage["libelle"],
            "unite": reglage["unite"],
            "decimales": reglage["decimales"],
            "frequence": reglage["frequence"],
            "points_courbe": POINTS_COURBE[reglage["frequence"]],
            "source": reglage["source"],
            "source_url": reglage["source_url"],
            "derniere_valeur": derniere_valeur,
            "variation": calculer_variation(historique, reglage["variation"]),
            "historique": historique,
            "etat": etat["etat"],
            "dernier_succes": etat["dernier_succes"],
        })
        etats.append(etat)
        journal.info("%-20s %-15s %s", reglage["id"], etat["etat"],
                     f"{derniere_valeur['valeur']} ({derniere_valeur['periode']})" if derniere_valeur else etat["message"])

    return {"version_schema": 1, "mis_a_jour_le": horodatage(), "indicateurs": resultat}, etats
