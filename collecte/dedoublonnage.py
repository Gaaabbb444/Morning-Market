"""Regroupe les articles qui parlent du même événement et compte les sources qui le couvrent.

Méthode (réglée sur de vrais articles le 17/10/2026) : chaque article est résumé par
ses mots « significatifs » (titre compté double + début du chapô). Les mots rares pèsent
plus lourd que les mots fréquents du jour (« octobre », « France »…). Deux articles
très proches (similarité ≥ SEUIL_PAIRE) sont regroupés, à condition que l'ensemble
du groupe reste cohérent (SEUIL_GROUPE), pour éviter les chaînes du type A≈B, B≈C mais A≠C.
On préfère rater un doublon que fusionner deux sujets différents : l'IA affinera en phase 3.
"""

import math
import re
from collections import Counter

from .outils import sans_accents

SEUIL_PAIRE = 0.25
SEUIL_GROUPE = 0.18
LONGUEUR_CHAPO_COMPAREE = 200

MOTS_VIDES = set("""
le la les un une des du de d l au aux et ou en a dans sur pour par avec sans ce cet cette ces son sa ses
leur leurs qui que quoi dont est sont ont pas plus moins se ne il elle ils elles on nous vous y comment
pourquoi quand apres avant entre fait faire etre avoir tout tous toute toutes tres aussi mais donc car
comme selon contre vers chez direct video
the of to in and for on at is are with from by as an be its his her this that after over will has have
was it into about new says watch
""".split())


def mots_significatifs(texte: str) -> list[str]:
    """Minuscules, sans accents ni ponctuation, sans mots vides, avec un pluriel simplifié."""
    texte = re.sub(r"[^a-z0-9 ]", " ", sans_accents(texte.lower()))
    mots = []
    for mot in texte.split():
        if mot in MOTS_VIDES or len(mot) < 3 or mot.isdigit():
            continue
        if len(mot) > 4 and mot[-1] in "sx":  # « sanctions » et « sanction » deviennent identiques
            mot = mot[:-1]
        mots.append(mot)
    return mots


def _vecteurs(articles: list[dict]) -> list[dict[str, float]]:
    """Transforme chaque article en « empreinte » pondérée (méthode TF-IDF) de longueur 1."""
    comptes = []
    for article in articles:
        compte = Counter()
        for mot in mots_significatifs(article["titre"]):
            compte[mot] += 2
        for mot in mots_significatifs(article.get("chapo", "")[:LONGUEUR_CHAPO_COMPAREE]):
            compte[mot] += 1
        comptes.append(compte)

    nb_documents_par_mot = Counter(mot for compte in comptes for mot in compte)
    total = len(articles)
    vecteurs = []
    for compte in comptes:
        poids = {mot: n * math.log(total / nb_documents_par_mot[mot]) for mot, n in compte.items()}
        norme = math.sqrt(sum(p * p for p in poids.values())) or 1.0
        vecteurs.append({mot: p / norme for mot, p in poids.items()})
    return vecteurs


def _similarite(v1: dict[str, float], v2: dict[str, float]) -> float:
    if len(v1) > len(v2):
        v1, v2 = v2, v1
    return sum(p * v2.get(mot, 0.0) for mot, p in v1.items())


def _article_representatif(articles: list[dict]) -> dict:
    """L'article mis en avant : de préférence en français, d'un vrai média, avec un chapô."""
    def priorite(article):
        return (article["langue"] == "fr", article["type_source"] != "agregateur", len(article.get("chapo", "")))
    return max(articles, key=priorite)


def regrouper(articles: list[dict]) -> list[dict]:
    """Regroupe les articles par événement.

    Renvoie une liste de groupes triés par importance (nombre de sources, puis fraîcheur) :
    {"id", "titre", "nb_sources", "sources", "articles"}.
    """
    if not articles:
        return []
    vecteurs = _vecteurs(articles)
    n = len(articles)

    similarites = {}
    paires = []
    for i in range(n):
        for j in range(i + 1, n):
            s = _similarite(vecteurs[i], vecteurs[j])
            similarites[(i, j)] = s
            if s >= SEUIL_PAIRE:
                paires.append((s, i, j))

    def sim(i, j):
        return similarites[(i, j) if i < j else (j, i)]

    # Chaque article commence seul dans son groupe ; on fusionne les paires les plus proches d'abord.
    groupe_de = list(range(n))
    membres = {i: [i] for i in range(n)}
    for _, i, j in sorted(paires, reverse=True):
        gi, gj = groupe_de[i], groupe_de[j]
        if gi == gj:
            continue
        liens = [sim(a, b) for a in membres[gi] for b in membres[gj]]
        if sum(liens) / len(liens) < SEUIL_GROUPE:
            continue  # la fusion rendrait le groupe incohérent
        for k in membres[gj]:
            groupe_de[k] = gi
        membres[gi].extend(membres.pop(gj))

    groupes = []
    for indices in membres.values():
        contenu = sorted((articles[k] for k in indices), key=lambda a: a["publie_le"])
        representant = _article_representatif(contenu)
        sources = sorted({a["source"] for a in contenu})
        groupes.append({
            "id": representant["id"],
            "titre": representant["titre"],
            "nb_sources": len(sources),
            "sources": sources,
            "articles": [representant] + [a for a in contenu if a is not representant],
        })
    groupes.sort(key=lambda g: (g["nb_sources"], max(a["publie_le"] for a in g["articles"])), reverse=True)
    return groupes
