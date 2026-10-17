"""Lecture des flux RSS : on récupère titre, source, date, lien et chapô de chaque article récent.

Le chapô sert uniquement de matière à l'IA pendant l'exécution : il n'est jamais
écrit dans le dossier data/ (droit de la presse).
"""

from datetime import datetime, timedelta, timezone

import feedparser
import requests

from .outils import PARIS, USER_AGENT, horodatage, identifiant_article, journal, texte_brut

LONGUEUR_MAX_CHAPO = 600  # au-delà, on coupe (certains flux mettent tout le premier paragraphe)


def _date_publication(entree) -> datetime | None:
    """Date de publication d'une entrée RSS, convertie à l'heure de Paris."""
    for champ in ("published_parsed", "updated_parsed"):
        valeur = entree.get(champ)
        if valeur:
            return datetime(*valeur[:6], tzinfo=timezone.utc).astimezone(PARIS)
    return None


def _nettoyer_titre_agregateur(titre: str, entree) -> str:
    """Google News ajoute « - Nom du média » à la fin du titre : on le retire."""
    nom_media = (entree.get("source") or {}).get("title")
    if nom_media and titre.endswith(f" - {nom_media}"):
        return titre[: -len(f" - {nom_media}")].strip()
    return titre


def lire_une_source(source: dict, limite_date: datetime, delai: int, longueur_min_titre: int) -> tuple[list[dict], dict]:
    """Lit un flux. Renvoie (articles récents, état de la source pour statut.json)."""
    etat = {"id": source["id"], "nom": source["nom"], "etat": "ok", "articles": 0, "message": None}
    try:
        reponse = requests.get(source["url"], headers={"User-Agent": USER_AGENT}, timeout=delai)
        reponse.raise_for_status()
    except requests.RequestException as erreur:
        etat.update(etat="erreur", message=str(erreur)[:150])
        return [], etat

    flux = feedparser.parse(reponse.content)
    if not flux.entries:
        etat.update(etat="erreur", message="flux vide ou illisible")
        return [], etat

    morceaux_exclus = source.get("exclure_si_lien_contient", [])
    articles, sans_date = [], 0
    for entree in flux.entries:
        url = (entree.get("link") or "").strip()
        titre = texte_brut(entree.get("title"))
        if not url or not titre or any(morceau in url for morceau in morceaux_exclus):
            continue
        date = _date_publication(entree)
        if date is None:
            sans_date += 1
            continue
        if date < limite_date:
            continue
        if source["type"] == "agregateur":
            titre = _nettoyer_titre_agregateur(titre, entree)
            chapo = ""  # Google News ne fournit que le titre
        else:
            chapo = texte_brut(entree.get("summary"))[:LONGUEUR_MAX_CHAPO]
            if chapo == titre:
                chapo = ""
        if len(titre) < longueur_min_titre:
            continue
        articles.append({
            "id": identifiant_article(url),
            "titre": titre,
            "source": source["nom"],
            "source_id": source["id"],
            "type_source": source["type"],
            "langue": "en" if source["type"] == "international" else "fr",
            "url": url,
            "publie_le": horodatage(date),
            "chapo": chapo,
            "categorie_probable": source.get("categorie_probable"),
        })

    etat["articles"] = len(articles)
    if not articles:
        etat.update(etat="vide", message="aucun article récent")
    elif sans_date:
        etat["message"] = f"{sans_date} entrées sans date ignorées"
    return articles, etat


def collecter_articles(config: dict) -> tuple[list[dict], list[dict]]:
    """Lit toutes les sources de la configuration.

    Renvoie (articles sans doublon de lien, états des sources).
    Une source en panne n'empêche jamais la lecture des autres.
    """
    reglages = config["collecte"]
    limite_date = datetime.now(PARIS) - timedelta(hours=reglages["fenetre_heures"])
    tous_les_articles, etats = [], []
    for source in config["sources"]:
        articles, etat = lire_une_source(source, limite_date, reglages["delai_reseau_secondes"],
                                         reglages["longueur_min_titre"])
        journal.info("%-20s %-7s %3d articles %s", source["id"], etat["etat"], etat["articles"], etat["message"] or "")
        tous_les_articles.extend(articles)
        etats.append(etat)

    # Un même article peut apparaître dans deux flux (ex. Le Monde Économie et Le Monde Argent)
    deja_vus, uniques = set(), []
    for article in tous_les_articles:
        if article["id"] not in deja_vus:
            deja_vus.add(article["id"])
            uniques.append(article)
    return uniques, etats
