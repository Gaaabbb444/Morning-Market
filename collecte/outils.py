"""Petits outils partagés : chemins, heure de Paris, configuration, nettoyage de texte."""

import hashlib
import html
import logging
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

# Dossiers du projet (calculés à partir de l'emplacement de ce fichier)
RACINE = Path(__file__).resolve().parent.parent
DOSSIER_DATA = RACINE / "data"
DOSSIER_TMP = RACINE / "tmp"          # fichiers de travail non publiés (contiennent les chapôs)
FICHIER_CONFIG = RACINE / "config" / "config.yaml"

PARIS = ZoneInfo("Europe/Paris")

# Identité envoyée aux sites interrogés : on se présente honnêtement.
USER_AGENT = "Mozilla/5.0 (compatible; Morning-Market/1.0; +https://github.com/Gaaabbb444/Morning-Market)"

journal = logging.getLogger("morning-market")


def maintenant_paris() -> datetime:
    """Date et heure actuelles à Paris."""
    return datetime.now(PARIS)


def horodatage(moment: datetime | None = None) -> str:
    """Horodatage ISO à l'heure de Paris, à la seconde près (ex. 2026-10-19T06:12:00+02:00)."""
    return (moment or maintenant_paris()).astimezone(PARIS).replace(microsecond=0).isoformat()


def charger_config() -> dict:
    """Lit config/config.yaml."""
    with open(FICHIER_CONFIG, encoding="utf-8") as fichier:
        return yaml.safe_load(fichier)


def identifiant_article(url: str) -> str:
    """Empreinte courte et stable d'un lien : le même article garde toujours le même identifiant."""
    return hashlib.sha1(url.strip().encode("utf-8")).hexdigest()[:12]


def texte_brut(contenu_html: str | None) -> str:
    """Retire les balises HTML, décode les entités (&nbsp;…) et normalise les espaces."""
    sans_balises = re.sub(r"<[^>]+>", " ", contenu_html or "")
    return re.sub(r"\s+", " ", html.unescape(sans_balises)).strip()


def sans_accents(texte: str) -> str:
    """« Économie » devient « Economie » (utile pour comparer des titres)."""
    decompose = unicodedata.normalize("NFKD", texte)
    return "".join(c for c in decompose if not unicodedata.combining(c))


def configurer_journal() -> None:
    """Affiche les messages de suivi dans la console, en français et en UTF-8."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s", datefmt="%H:%M:%S")
