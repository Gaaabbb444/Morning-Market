"""Règles éditoriales vérifiées par le code (et non laissées à la bonne volonté de l'IA).

1. Sources sans chapô (Les Echos via Google News, BCE…) : un événement couvert
   uniquement par ce type de sources n'a ni résumé, ni faits, ni analyse — seulement
   son titre (traduit s'il est en anglais) et son lien. Il ne peut pas entrer dans le
   Top 5, sauf s'il est confirmé par au moins une source qui fournit un chapô.
2. Citations de l'actu : la citation doit figurer mot pour mot dans le texte source,
   et son auteur doit y être nommé. Sinon elle est rejetée.
"""

import re
import unicodedata

LONGUEUR_MIN_CHAPO = 40  # en dessous, le « chapô » n'apporte rien de plus que le titre


# ---------------------------------------------------------------------------
# Règle 1 : sources sans chapô
# ---------------------------------------------------------------------------

def est_documente(groupe: dict) -> bool:
    """Vrai si au moins un article du groupe fournit un vrai chapô."""
    return any(len(a.get("chapo") or "") >= LONGUEUR_MIN_CHAPO for a in groupe["articles"])


def eligible_top5(groupe: dict) -> bool:
    """Seuls les événements documentés par au moins une source avec chapô peuvent entrer au Top 5."""
    return est_documente(groupe)


def appliquer_regle_sans_chapo(groupe: dict, classement: dict) -> dict:
    """Retire tout texte rédigé par l'IA pour un événement non documenté (seule la traduction du titre reste)."""
    if not est_documente(groupe):
        classement = dict(classement, resume=None)
    return classement


def filtrer_top5(ids_proposes: list[str], groupes_par_id: dict[str, dict]) -> list[str]:
    """Écarte du Top 5 proposé tout identifiant inconnu ou non éligible."""
    retenus = []
    for identifiant in ids_proposes:
        groupe = groupes_par_id.get(identifiant)
        if groupe and eligible_top5(groupe) and identifiant not in retenus:
            retenus.append(identifiant)
    return retenus[:5]


# ---------------------------------------------------------------------------
# Règle 2 : citations vérifiées mot pour mot
# ---------------------------------------------------------------------------

GUILLEMETS = {"«": '"', "»": '"', "“": '"', "”": '"', "„": '"', "‘": "'", "’": "'", " ": " ", " ": " "}


def normaliser(texte: str) -> str:
    """Uniformise guillemets, apostrophes et espaces (mais garde les mots exacts)."""
    for ancien, nouveau in GUILLEMETS.items():
        texte = texte.replace(ancien, nouveau)
    return re.sub(r"\s+", " ", texte).strip()


def _sans_accents_minuscules(texte: str) -> str:
    decompose = unicodedata.normalize("NFKD", texte.lower())
    return "".join(c for c in decompose if not unicodedata.combining(c))


def extraire_citations(texte: str, longueur_min: int = 30, longueur_max: int = 300) -> list[str]:
    """Passages entre guillemets d'une longueur raisonnable (« … », “ … ” ou " … ")."""
    candidats = re.findall(r"«\s*([^«»]+?)\s*»|“([^“”]+?)”|\"([^\"]+?)\"", texte)
    citations = []
    for groupes in candidats:
        passage = next(p for p in groupes if p).strip()
        if longueur_min <= len(passage) <= longueur_max:
            citations.append(passage)
    return citations


def verifier_citation(citation: str, auteur: str, texte_source: str) -> str | None:
    """Renvoie None si la citation est acceptable, sinon la raison du rejet."""
    if not citation or not auteur:
        return "citation ou auteur manquant"
    if normaliser(citation) not in normaliser(texte_source):
        return "la citation ne figure pas mot pour mot dans le texte source"
    # L'auteur doit être nommé dans la source : on exige que son nom de famille y apparaisse.
    nom_complet = auteur.split(",")[0].strip()
    nom_de_famille = nom_complet.split()[-1] if nom_complet else ""
    if len(nom_de_famille) < 2 or _sans_accents_minuscules(nom_de_famille) not in _sans_accents_minuscules(texte_source):
        return "l'auteur n'est pas nommé dans le texte source"
    return None
