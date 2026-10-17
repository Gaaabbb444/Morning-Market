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


# ---------------------------------------------------------------------------
# Règle 3 : aucun chiffre absent des articles sources
# ---------------------------------------------------------------------------

# Un nombre isolé (« 21,4 », « 1 000 », « 70 % ») ; on ignore ceux collés à des lettres (CO2, G7, A320, 1er).
MOTIF_NOMBRE = re.compile(r"(?<![\w])\d+(?:[   .,]\d+)*(?![\w])")


def _empreintes_nombres(texte: str) -> set[str]:
    """Chiffres d'un texte, réduits à leurs seuls caractères numériques (« 21,4 » et « 21.4 » → « 214 »)."""
    return {re.sub(r"\D", "", n) for n in MOTIF_NOMBRE.findall(texte or "")}


def chiffres_absents(texte: str, texte_source: str) -> set[str]:
    """Nombres présents dans `texte` mais introuvables dans `texte_source`."""
    return _empreintes_nombres(texte) - _empreintes_nombres(texte_source)


# ---------------------------------------------------------------------------
# Règle 4 : « Pour tes copies » rattaché à un thème de TEJM et à une notion du référentiel
# ---------------------------------------------------------------------------

USAGES = {"illustrer", "nuancer", "contredire"}


def verifier_pour_tes_copies(brut, notions: dict[str, dict], themes: dict[str, str],
                             texte_source: str) -> tuple[dict | None, str | None]:
    """Contrôle la proposition de l'IA. Renvoie (objet publiable, None) ou (None, raison du rejet).

    `notions` : {id: concept} autorisés ; `themes` : {id: libellé} des thèmes de TEJM.
    """
    if not isinstance(brut, dict):
        return None, "format inattendu"
    if brut.get("theme") not in themes:
        return None, f"thème inconnu : {brut.get('theme')}"
    if brut.get("notion_id") not in notions:
        return None, f"notion absente du référentiel : {brut.get('notion_id')}"
    if brut.get("usage") not in USAGES:
        return None, f"usage invalide : {brut.get('usage')}"
    texte = brut.get("texte")
    if not isinstance(texte, str) or not texte.strip():
        return None, "texte vide"
    if re.search(r"[«»“”\"]", texte):
        return None, "texte entre guillemets (risque d'intitulé de sujet inventé)"
    if chiffres_absents(texte, texte_source):
        return None, f"chiffres absents de l'article : {sorted(chiffres_absents(texte, texte_source))}"
    notion = notions[brut["notion_id"]]
    return {"theme": brut["theme"], "theme_libelle": themes[brut["theme"]], "notion_id": notion["id"],
            "notion_terme": notion["terme"], "usage": brut["usage"], "texte": texte.strip()[:400]}, None
