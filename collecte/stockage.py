"""Lecture et écriture sécurisées des fichiers JSON.

Règle d'or : on n'écrase JAMAIS un bon fichier par des données vides ou invalides.
Avant d'écrire, chaque fichier passe par un « validateur » ; s'il est refusé,
l'ancienne version reste en place et la raison est notée dans statut.json.
"""

import json
import math
import os
from pathlib import Path
from typing import Callable


def lire_json(chemin: Path, valeur_par_defaut=None):
    """Lit un fichier JSON. Renvoie valeur_par_defaut si le fichier manque ou est illisible."""
    try:
        with open(chemin, encoding="utf-8") as fichier:
            return json.load(fichier)
    except (FileNotFoundError, json.JSONDecodeError):
        return valeur_par_defaut


def ecrire_json_securise(chemin: Path, donnees, validateur: Callable[[object], str | None]) -> tuple[bool, str | None]:
    """Écrit `donnees` dans `chemin` seulement si le validateur les accepte.

    Le validateur renvoie None si tout va bien, sinon un message expliquant le refus.
    L'écriture passe par un fichier temporaire puis un remplacement en une seule
    opération : une coupure en plein milieu ne peut pas laisser un fichier à moitié écrit.
    Renvoie (ecrit, raison_du_refus).
    """
    try:
        probleme = validateur(donnees)
    except Exception as erreur:  # un validateur qui plante = données refusées
        probleme = f"vérification impossible : {erreur}"
    if probleme:
        return False, probleme

    chemin.parent.mkdir(parents=True, exist_ok=True)
    fichier_temporaire = chemin.with_suffix(chemin.suffix + ".tmp")
    with open(fichier_temporaire, "w", encoding="utf-8", newline="\n") as fichier:
        json.dump(donnees, fichier, ensure_ascii=False, indent=2, allow_nan=False)
        fichier.write("\n")
    os.replace(fichier_temporaire, chemin)
    return True, None


# ---------------------------------------------------------------------------
# Validateurs : un par type de fichier (voir le dossier contrat/)
# ---------------------------------------------------------------------------

def _nombre_valide(valeur) -> bool:
    return isinstance(valeur, (int, float)) and not isinstance(valeur, bool) and math.isfinite(valeur)


def valider_indicateurs(donnees) -> str | None:
    """Refuse un fichier d'indicateurs vide ou contenant des valeurs non numériques."""
    if not isinstance(donnees, dict) or not isinstance(donnees.get("indicateurs"), list):
        return "structure inattendue"
    avec_valeur = [i for i in donnees["indicateurs"] if i.get("derniere_valeur")]
    if not avec_valeur:
        return "aucun indicateur n'a de valeur"
    for indicateur in avec_valeur:
        if not _nombre_valide(indicateur["derniere_valeur"].get("valeur")):
            return f"valeur invalide pour {indicateur.get('id')}"
        for point in indicateur.get("historique", []):
            if len(point) != 2 or not _nombre_valide(point[1]):
                return f"historique invalide pour {indicateur.get('id')}"
    return None


def valider_statut(donnees) -> str | None:
    if not isinstance(donnees, dict) or "derniere_execution" not in donnees:
        return "structure inattendue"
    return None


def valider_edition(donnees) -> str | None:
    """Une édition doit contenir au moins 5 articles publiables et un « essentiel » bien formé (ou absent)."""
    if not isinstance(donnees, dict) or not donnees.get("date"):
        return "structure inattendue"
    top5 = donnees.get("top5")
    if not isinstance(top5, list) or len(top5) > 5:
        return "Top 5 invalide"
    for element in top5 + [e for liste in donnees.get("par_categorie", {}).values() for e in liste]:
        if not all(element.get(champ) for champ in ("id", "titre", "url", "source")):
            return f"article incomplet : {element.get('id')}"
    total = len(top5) + sum(len(liste) for liste in donnees.get("par_categorie", {}).values())
    if total < 5:
        return f"seulement {total} articles publiables"
    essentiel = donnees.get("essentiel")
    if essentiel is not None and not (isinstance(essentiel, list) and len(essentiel) == 3):
        return "« L'essentiel » doit compter 3 phrases"
    return None


def valider_collecte(donnees, minimum_articles: int) -> str | None:
    """Refuse une collecte trop maigre (panne générale probable)."""
    if not isinstance(donnees, dict) or not isinstance(donnees.get("groupes"), list):
        return "structure inattendue"
    nombre = sum(len(g["articles"]) for g in donnees["groupes"])
    if nombre < minimum_articles:
        return f"seulement {nombre} articles collectés (minimum {minimum_articles})"
    return None
