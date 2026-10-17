"""Construction de l'édition du jour : classement, Top 5, catégories, concept et citations.

Chaque étape essaie d'abord l'IA ; si elle est indisponible ou que sa réponse est
invalide, l'étape bascule en mode dégradé (classement par mots-clés, aucun texte rédigé).
Les règles de regles.py sont appliquées après l'IA, quoi qu'elle ait répondu.
"""

import re
from datetime import date, timedelta

from . import regles
from .ia import BudgetEpuise
from .outils import DOSSIER_DATA, horodatage, journal, sans_accents
from .stockage import lire_json

CATEGORIES = ["croissance", "mondialisation", "finance", "desequilibres", "ue", "entreprises", "epargne"]
LONGUEUR_EXTRAIT = 300


# ---------------------------------------------------------------------------
# Préparation des données envoyées à l'IA (jamais plus que titre + extraits)
# ---------------------------------------------------------------------------

def _extraits(groupe: dict, nombre: int = 2) -> list[str]:
    return [a["chapo"][:LONGUEUR_EXTRAIT] for a in groupe["articles"]
            if len(a.get("chapo") or "") >= regles.LONGUEUR_MIN_CHAPO][:nombre]


def _en_anglais(groupe: dict) -> bool:
    return all(a["langue"] == "en" for a in groupe["articles"])


def fiche_evenement(groupe: dict, nombre_extraits: int = 2) -> dict:
    """Ce que l'IA reçoit pour un événement."""
    documente = regles.est_documente(groupe)
    fiche = {"id": groupe["id"], "titres": [a["titre"] for a in groupe["articles"][:3]],
             "sources": groupe["sources"], "nb_sources": groupe["nb_sources"], "documente": documente}
    if documente:
        fiche["extraits"] = _extraits(groupe, nombre_extraits)
    return fiche


# ---------------------------------------------------------------------------
# 1. Classement
# ---------------------------------------------------------------------------

def _mots_cles_compiles(config: dict) -> dict[str, list[re.Pattern]]:
    return {cat: [re.compile(r"\b" + re.escape(sans_accents(m.strip().lower())) + r"\b") for m in mots]
            for cat, mots in config["mots_cles_categories"].items()}


def classer_sans_ia(groupe: dict, motifs: dict[str, list[re.Pattern]]) -> dict:
    """Mode dégradé : la catégorie qui a le plus de mots-clés dans le titre et le chapô."""
    texte = sans_accents(" ".join(f"{a['titre']} {a.get('chapo', '')}" for a in groupe["articles"]).lower())
    scores = {cat: sum(1 for motif in liste if motif.search(texte)) for cat, liste in motifs.items()}
    meilleure = max(scores, key=scores.get)
    probable = next((a["categorie_probable"] for a in groupe["articles"] if a.get("categorie_probable")), None)
    if scores[meilleure] == 0 and not probable:
        return {"pertinent": False, "categorie": None, "importance": 0, "fil_rouge": None, "titre_fr": None, "resume": None}
    categorie = meilleure if scores[meilleure] else probable
    importance = min(7, 2 + scores[meilleure] + 2 * (groupe["nb_sources"] - 1))
    return {"pertinent": True, "categorie": categorie, "importance": importance,
            "fil_rouge": None, "titre_fr": None, "resume": None}


def _nettoyer_classement(brut: dict, groupe: dict, fils_actifs: set[str]) -> dict:
    """Garde uniquement des valeurs autorisées dans la réponse de l'IA."""
    try:
        importance = max(0, min(10, int(brut.get("importance", 0))))
    except (TypeError, ValueError):
        importance = 0
    categorie = brut.get("categorie") if brut.get("categorie") in CATEGORIES else None
    pertinent = bool(brut.get("pertinent")) and categorie is not None
    titre_fr = brut.get("titre_fr") if _en_anglais(groupe) and isinstance(brut.get("titre_fr"), str) else None
    resume = brut.get("resume") if isinstance(brut.get("resume"), str) and brut.get("resume").strip() else None
    classement = {"pertinent": pertinent, "categorie": categorie, "importance": importance if pertinent else 0,
                  "fil_rouge": brut.get("fil_rouge") if brut.get("fil_rouge") in fils_actifs else None,
                  "titre_fr": titre_fr, "resume": resume[:300] if resume else None}
    return regles.appliquer_regle_sans_chapo(groupe, classement)


def classer(groupes: list[dict], client, config: dict, fils: list[dict]) -> tuple[dict[str, dict], str]:
    """Classe tous les groupes. Renvoie ({id: classement}, mode) avec mode = ia, partiel, sans-ia ou inchange."""
    if not groupes:
        return {}, "inchange"
    motifs = _mots_cles_compiles(config)
    fils_actifs = {f["id"] for f in fils}
    resultats, lots_ia, lots_total = {}, 0, 0
    taille = config["ia"]["taille_lot_classement"]
    contexte = {"categories": {c["id"]: c["libelle"] for c in config["categories"]},
                "fils_rouges": [{"id": f["id"], "titre": f["titre"]} for f in fils]}

    for debut in range(0, len(groupes), taille):
        lot = groupes[debut:debut + taille]
        lots_total += 1
        ids_lot = {g["id"] for g in lot}
        reponse = None
        if client.disponible:
            def valider(r):
                evenements = r.get("evenements")
                if not isinstance(evenements, list):
                    return "liste « evenements » absente"
                connus = sum(1 for e in evenements if isinstance(e, dict) and e.get("id") in ids_lot)
                return None if connus >= len(lot) * 0.8 else f"seulement {connus}/{len(lot)} événements classés"
            try:
                reponse = client.demander("classement", "low", dict(contexte, evenements=[fiche_evenement(g) for g in lot]),
                                          valider=valider, max_tokens=6000)
            except BudgetEpuise:
                reponse = None
        par_id = {e["id"]: e for e in (reponse or {}).get("evenements", []) if isinstance(e, dict) and "id" in e}
        if reponse:
            lots_ia += 1
        for groupe in lot:
            if groupe["id"] in par_id:
                resultats[groupe["id"]] = _nettoyer_classement(par_id[groupe["id"]], groupe, fils_actifs)
                resultats[groupe["id"]]["mode"] = "ia"
            else:
                resultats[groupe["id"]] = dict(classer_sans_ia(groupe, motifs), mode="sans-ia")

    mode = "ia" if lots_ia == lots_total else ("partiel" if lots_ia else "sans-ia")
    return resultats, mode


def score(groupe: dict, classement: dict) -> float:
    """Ordre d'importance : jugement de l'IA d'abord, puis nombre de sources, puis présence d'un chapô."""
    return classement["importance"] * 10 + min(groupe["nb_sources"], 4) * 3 + (2 if regles.est_documente(groupe) else 0)


# ---------------------------------------------------------------------------
# 2. Éléments affichés
# ---------------------------------------------------------------------------

def element(groupe: dict, classement: dict) -> dict:
    """Fiche publiée d'un événement : titre original, source, lien… jamais de chapô."""
    principal = groupe["articles"][0]
    return {
        "id": groupe["id"],
        "titre": principal["titre"],
        "titre_fr": classement.get("titre_fr"),
        "source": principal["source"],
        "url": principal["url"],
        "publie_le": principal["publie_le"],
        "categorie": classement["categorie"],
        "nb_sources": groupe["nb_sources"],
        "autres_sources": [{"source": a["source"], "titre": a["titre"], "url": a["url"]} for a in groupe["articles"][1:5]],
        "resume": classement.get("resume") if regles.est_documente(groupe) else None,
        "documente": regles.est_documente(groupe),
        "importance": classement["importance"],
        "fil_rouge": classement.get("fil_rouge"),
    }


def _textes_vides() -> dict:
    return {"faits": None, "analyse": None, "pour_tes_copies": None}


def _texte(valeur, longueur_max: int = 500) -> str | None:
    return valeur.strip()[:longueur_max] if isinstance(valeur, str) and valeur.strip() else None


# ---------------------------------------------------------------------------
# 3. Top 5 et « L'essentiel »
# ---------------------------------------------------------------------------

def rediger_top5(candidats: list[dict], classements: dict, client, config: dict,
                 edition_existante: dict | None) -> tuple[list[dict], list[str] | None, bool, str]:
    """Renvoie (top5, essentiel, top5_modifie, mode)."""
    par_id = {g["id"]: g for g in candidats}
    eligibles = sorted((g for g in candidats if regles.eligible_top5(g) and classements[g["id"]]["pertinent"]),
                       key=lambda g: score(g, classements[g["id"]]), reverse=True)
    top5_actuel = (edition_existante or {}).get("top5") or []
    essentiel_actuel = (edition_existante or {}).get("essentiel")

    # Second passage : on ne sollicite l'IA que si un nouvel événement est potentiellement majeur
    if top5_actuel:
        seuil = config["ia"]["importance_min_remplacement"]
        nouveaux_majeurs = [g for g in eligibles if classements[g["id"]]["importance"] >= seuil][:5]
        if not nouveaux_majeurs or not client.disponible:
            return top5_actuel, essentiel_actuel, False, "inchange"
        donnees = {"top5_actuel": [{"id": t["id"], "titre": t["titre"], "faits": t.get("faits")} for t in top5_actuel],
                   "essentiel_actuel": essentiel_actuel,
                   "candidats": [dict(fiche_evenement(g, 3), categorie=classements[g["id"]]["categorie"],
                                      importance=classements[g["id"]]["importance"]) for g in nouveaux_majeurs]}
        autorises = {t["id"] for t in top5_actuel} | {g["id"] for g in nouveaux_majeurs}
    else:
        retenus = eligibles[:config["ia"]["candidats_top5"]]
        donnees = {"candidats": [dict(fiche_evenement(g, 3), categorie=classements[g["id"]]["categorie"],
                                      importance=classements[g["id"]]["importance"]) for g in retenus]}
        autorises = {g["id"] for g in retenus}

    def valider(r):
        top5 = r.get("top5")
        if not isinstance(top5, list) or not top5:
            return "top5 absent"
        if sum(1 for t in top5 if isinstance(t, dict) and t.get("id") in autorises) < min(3, len(autorises)):
            return "top5 avec des identifiants inconnus"
        essentiel = r.get("essentiel")
        if not (isinstance(essentiel, list) and len(essentiel) == 3 and all(isinstance(p, str) and p.strip() for p in essentiel)):
            return "essentiel invalide (3 phrases attendues)"
        return None

    reponse = None
    if client.disponible and donnees.get("candidats"):
        try:
            reponse = client.demander("edition", "high", donnees, valider=valider, max_tokens=6000)
        except BudgetEpuise:
            reponse = None

    if reponse is None:
        if top5_actuel:
            return top5_actuel, essentiel_actuel, False, "inchange"
        # Mode dégradé : les 5 événements éligibles les mieux classés, sans texte rédigé
        top5 = [dict(element(g, classements[g["id"]]), rang=i + 1, **_textes_vides()) for i, g in enumerate(eligibles[:5])]
        return top5, None, False, "sans-ia"

    if top5_actuel and not reponse.get("top5_modifie"):
        return top5_actuel, essentiel_actuel, False, "inchange"

    textes = {t["id"]: t for t in reponse["top5"] if isinstance(t, dict) and t.get("id") in autorises}
    anciens = {t["id"]: t for t in top5_actuel}
    ids = []
    for identifiant in textes:
        # Une info déjà au Top 5 ce matin reste admise ; une nouvelle doit respecter la règle « sans chapô ».
        admise = identifiant in anciens or regles.filtrer_top5([identifiant], par_id)
        if admise and identifiant not in ids:
            ids.append(identifiant)
    ids = ids[:5]
    top5 = []
    for identifiant in ids:
        if identifiant in anciens:  # info conservée : on garde ses textes d'origine
            top5.append(dict(anciens[identifiant], rang=len(top5) + 1))
            continue
        groupe = par_id[identifiant]
        t = textes[identifiant]
        top5.append(dict(element(groupe, classements[identifiant]), rang=len(top5) + 1,
                         faits=_texte(t.get("faits")), analyse=_texte(t.get("analyse")),
                         pour_tes_copies=_texte(t.get("pour_tes_copies"), 300)))
    # Si l'IA en a proposé moins de 5, on complète avec les suivants (sans texte rédigé)
    for groupe in eligibles:
        if len(top5) >= 5:
            break
        if groupe["id"] not in ids:
            top5.append(dict(element(groupe, classements[groupe["id"]]), rang=len(top5) + 1, **_textes_vides()))
    essentiel = [p.strip() for p in reponse["essentiel"]]
    return top5, essentiel, bool(top5_actuel), "ia"


def par_categorie(groupes: list[dict], classements: dict, ids_top5: set[str], maximum: int,
                  existant: dict | None) -> dict[str, list[dict]]:
    """3 à 5 autres articles par catégorie : ceux déjà publiés ce matin + les nouveaux les plus importants."""
    resultat = {cat: list((existant or {}).get(cat, [])) for cat in CATEGORIES}
    tries = sorted((g for g in groupes if classements[g["id"]]["pertinent"] and g["id"] not in ids_top5),
                   key=lambda g: score(g, classements[g["id"]]), reverse=True)
    for groupe in tries:
        liste = resultat[classements[groupe["id"]]["categorie"]]
        if len(liste) < maximum + (1 if existant else 0):
            liste.append(element(groupe, classements[groupe["id"]]))
    for cat in CATEGORIES:
        resultat[cat] = [e for e in resultat[cat] if e["id"] not in ids_top5]
    return resultat


# ---------------------------------------------------------------------------
# 4. Concept du jour
# ---------------------------------------------------------------------------

def editions_recentes(nombre_jours: int, avant: str) -> list[dict]:
    """Éditions des derniers jours (pour éviter de répéter concepts et citations)."""
    jour = date.fromisoformat(avant)
    editions = []
    for decalage in range(1, nombre_jours + 1):
        contenu = lire_json(DOSSIER_DATA / "jours" / f"{(jour - timedelta(days=decalage)).isoformat()}.json")
        if contenu:
            editions.append(contenu)
    return editions


def _mots(texte: str) -> set[str]:
    return {m for m in re.findall(r"[a-z0-9]+", sans_accents((texte or "").lower())) if len(m) > 3}


def choisir_concept(top5: list[dict], concepts: list[dict], deja_vus: set[str], client) -> dict | None:
    disponibles = [c for c in concepts if c["id"] not in deja_vus] or concepts
    texte_du_jour = _mots(" ".join(f"{t['titre']} {t.get('titre_fr') or ''} {t.get('faits') or ''} {t.get('resume') or ''}"
                                   for t in top5))

    def proximite(concept):
        mots_concept = _mots(" ".join(concept["mots_cles"]) + " " + concept["terme"])
        return len(mots_concept & texte_du_jour)

    candidats = sorted(disponibles, key=proximite, reverse=True)[:12]
    if not candidats:
        return None
    ids_candidats, ids_top5 = {c["id"] for c in candidats}, {t["id"] for t in top5}

    reponse = None
    if client.disponible and top5:
        def valider(r):
            if r.get("concept_id") not in ids_candidats:
                return "concept inconnu"
            if r.get("article_id") not in ids_top5:
                return "article inconnu"
            return None
        donnees = {"top5": [{"id": t["id"], "titre": t.get("titre_fr") or t["titre"], "faits": t.get("faits"),
                             "analyse": t.get("analyse")} for t in top5],
                   "concepts": [{"id": c["id"], "terme": c["terme"], "definition": c["definition"]} for c in candidats]}
        try:
            reponse = client.demander("concept", "low", donnees, valider=valider, max_tokens=1500)
        except BudgetEpuise:
            reponse = None

    if reponse:
        concept = next(c for c in candidats if c["id"] == reponse["concept_id"])
        return {"id": concept["id"], "terme": concept["terme"], "lien_actu": _texte(reponse.get("lien_actu")),
                "usage_copie": _texte(reponse.get("usage_copie"), 300), "article_id": reponse["article_id"]}
    # Mode dégradé : le concept le plus proche par mots-clés, sans texte rédigé
    concept = candidats[0]
    return {"id": concept["id"], "terme": concept["terme"], "lien_actu": None, "usage_copie": None, "article_id": None}


# ---------------------------------------------------------------------------
# 5. Citations
# ---------------------------------------------------------------------------

def choisir_citation_actu(groupes: list[dict], classements: dict, client) -> dict | None:
    """Propose des passages entre guillemets à l'IA, puis vérifie mot pour mot celui qu'elle choisit."""
    if not client.disponible:
        return None
    candidats = []
    for groupe in sorted((g for g in groupes if classements[g["id"]]["pertinent"] and regles.est_documente(g)),
                         key=lambda g: score(g, classements[g["id"]]), reverse=True):
        for article in groupe["articles"]:
            source = f"{article['titre']} {article.get('chapo') or ''}"
            for passage in regles.extraire_citations(source):
                candidats.append({"numero": len(candidats) + 1, "citation": passage, "titre": article["titre"],
                                  "extrait": article.get("chapo") or "", "_article": article, "_groupe": groupe["id"]})
        if len(candidats) >= 15:
            break
    if not candidats:
        return None

    numeros = {c["numero"] for c in candidats}

    def valider(r):
        if r.get("numero") is None:
            return None
        if r.get("numero") not in numeros or not isinstance(r.get("auteur"), str):
            return "numéro ou auteur invalide"
        return None

    donnees = {"citations": [{k: v for k, v in c.items() if not k.startswith("_")} for c in candidats[:15]]}
    try:
        reponse = client.demander("citation", "low", donnees, valider=valider, max_tokens=1000)
    except BudgetEpuise:
        return None
    if not reponse or reponse.get("numero") is None:
        return None
    choisi = next(c for c in candidats if c["numero"] == reponse["numero"])
    article = choisi["_article"]
    probleme = regles.verifier_citation(choisi["citation"], reponse["auteur"], f"{article['titre']} {article.get('chapo') or ''}")
    if probleme:
        journal.warning("Citation rejetée : %s", probleme)
        return None
    return {"texte": choisi["citation"], "auteur": reponse["auteur"].strip(), "source": article["source"],
            "url": article["url"], "article_id": choisi["_groupe"]}


def choisir_citation_economiste(citations: list[dict], deja_vues: set[str], categories_du_jour: list[str],
                                aujourd_hui: str) -> str | None:
    """Une citation vérifiée par Gab, non affichée récemment, si possible liée aux thèmes du jour."""
    verifiees = [c for c in citations if c.get("verifiee") is True]
    disponibles = [c for c in verifiees if c["id"] not in deja_vues] or verifiees
    if not disponibles:
        return None
    en_lien = [c for c in disponibles if set(c.get("themes", [])) & set(categories_du_jour)]
    choix = en_lien or disponibles
    return choix[date.fromisoformat(aujourd_hui).toordinal() % len(choix)]["id"]


# ---------------------------------------------------------------------------
# Assemblage
# ---------------------------------------------------------------------------

def construire_edition(groupes: list[dict], client, config: dict, fils: list[dict], concepts: list[dict],
                       citations: list[dict], edition_existante: dict | None, aujourd_hui: str,
                       type_execution: str) -> tuple[dict, dict[str, dict], dict]:
    """Construit (ou complète) l'édition du jour.

    Renvoie (édition, classements des nouveaux groupes, modes par étape).
    """
    deja_traites = set((edition_existante or {}).get("ids_traites", []))
    nouveaux = [g for g in groupes if not any(a["id"] in deja_traites for a in g["articles"])]
    journal.info("%d événements à traiter (%d déjà traités ce matin)", len(nouveaux), len(groupes) - len(nouveaux))

    classements, mode_classement = classer(nouveaux, client, config, fils)
    top5, essentiel, top5_modifie, mode_top5 = rediger_top5(nouveaux, classements, client, config, edition_existante)
    ids_top5 = {t["id"] for t in top5}
    categories = par_categorie(nouveaux, classements, ids_top5, config["ia"]["articles_par_categorie"],
                               (edition_existante or {}).get("par_categorie"))

    recentes = editions_recentes(max(config["ia"]["jours_sans_repetition_concept"],
                                     config["ia"]["jours_sans_repetition_citation"]), aujourd_hui)
    concept = (edition_existante or {}).get("concept")
    if top5_modifie or not concept or (concept.get("lien_actu") is None and client.disponible):
        concepts_vus = {e["concept"]["id"] for e in recentes[:config["ia"]["jours_sans_repetition_concept"]] if e.get("concept")}
        concept = choisir_concept(top5, concepts, concepts_vus, client)

    citation_actu = (edition_existante or {}).get("citation_actu") or choisir_citation_actu(nouveaux, classements, client)
    citations_vues = {e.get("citation_economiste_id") for e in recentes[:config["ia"]["jours_sans_repetition_citation"]]}
    citation_economiste = (edition_existante or {}).get("citation_economiste_id") or choisir_citation_economiste(
        citations, citations_vues, [t["categorie"] for t in top5], aujourd_hui)

    modes = {"classement": mode_classement, "top5": mode_top5,
             "concept": "ia" if concept and concept.get("lien_actu") else "sans-ia",
             "citation_actu": "ia" if citation_actu else "aucune"}
    etapes = [m for m in (mode_classement, mode_top5) if m != "inchange"]
    if not etapes:  # rien de nouveau : on garde le mode de l'édition existante
        mode_ia = (edition_existante or {}).get("mode_ia", "sans-ia")
    elif all(m == "ia" for m in etapes):
        mode_ia = "ia"
    elif all(m == "sans-ia" for m in etapes):
        mode_ia = "sans-ia"
    else:
        mode_ia = "partiel"

    passages = list((edition_existante or {}).get("passages", []))
    passages.append({"heure": horodatage(), "type": type_execution, "mode_ia": mode_ia,
                     "articles_collectes": sum(len(g["articles"]) for g in groupes),
                     "nouvelles_infos": len(nouveaux), "top5_modifie": top5_modifie})
    edition = {
        "version_schema": 1,
        "date": aujourd_hui,
        "genere_le": horodatage(),
        "mode_ia": mode_ia,
        "passages": passages,
        "essentiel": essentiel,
        "top5": top5,
        "par_categorie": categories,
        "concept": concept,
        "citation_actu": citation_actu,
        "citation_economiste_id": citation_economiste,
        "ids_traites": sorted(deja_traites | {a["id"] for g in groupes for a in g["articles"]}),
    }
    return edition, classements, modes
