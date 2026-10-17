"""Mise à jour des fils rouges : événements datés, paragraphe « Où en est-on ? », ouverture et clôture.

Seuls les événements documentés (avec chapô) sont proposés à l'IA, et les liens
ajoutés aux fils proviennent toujours des articles collectés, jamais de l'IA.
"""

import re
from datetime import date

from . import regles
from .edition import fiche_evenement
from .ia import BudgetEpuise
from .outils import horodatage, journal, sans_accents

NOMBRE_ACTUALITES_MAX = 25
LIENS_PAR_EVENEMENT_MAX = 5
JOURS_AVANT_CLOTURE_POSSIBLE = 21  # on ne ferme pas un fil qui a encore bougé récemment


def _identifiant_fil(titre: str, existants: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", sans_accents(titre.lower())).strip("-")[:50] or "fil"
    identifiant, n = base, 2
    while identifiant in existants:
        identifiant, n = f"{base}-{n}", n + 1
    return identifiant


def _liens(article_ids: list[str], groupes_par_id: dict) -> list[dict]:
    liens = []
    for identifiant in article_ids:
        groupe = groupes_par_id.get(identifiant)
        if groupe:
            principal = groupe["articles"][0]
            liens.append({"titre": principal["titre"], "source": principal["source"], "url": principal["url"]})
    return liens


def _ajouter_evenement(fil: dict, jour: str, resume: str, liens: list[dict]) -> None:
    """Un seul événement par fil et par jour : le second passage complète celui du matin."""
    du_jour = next((e for e in fil["evenements"] if e["date"] == jour), None)
    if du_jour:
        du_jour["resume"] = resume
        urls = {l["url"] for l in du_jour["liens"]}
        du_jour["liens"].extend(l for l in liens if l["url"] not in urls)
        del du_jour["liens"][LIENS_PAR_EVENEMENT_MAX:]
    else:
        fil["evenements"].append({"date": jour, "resume": resume, "liens": liens[:LIENS_PAR_EVENEMENT_MAX]})


def mettre_a_jour(fichier_fils: dict, groupes: list[dict], classements: dict, client, config: dict,
                  aujourd_hui: str) -> tuple[dict, str]:
    """Renvoie (nouveau contenu de fils-rouges.json, mode)."""
    if not client.disponible:
        return fichier_fils, "sans-ia"
    fils = [dict(f, evenements=[dict(e, liens=list(e["liens"])) for e in f["evenements"]]) for f in fichier_fils["fils"]]
    actifs = {f["id"]: f for f in fils if f["statut"] == "actif"}

    candidats = sorted(
        (g for g in groupes if g["id"] in classements and classements[g["id"]]["pertinent"] and regles.est_documente(g)
         and (classements[g["id"]]["fil_rouge"] or classements[g["id"]]["importance"] >= 5)),
        key=lambda g: (classements[g["id"]]["fil_rouge"] is not None, classements[g["id"]]["importance"]), reverse=True,
    )[:NOMBRE_ACTUALITES_MAX]
    if not candidats:
        return fichier_fils, "inchange"
    groupes_par_id = {g["id"]: g for g in candidats}

    donnees = {
        "date": aujourd_hui,
        "fils": [{"id": f["id"], "titre": f["titre"], "ou_en_est_on": f["ou_en_est_on"],
                  "derniers_evenements": [{"date": e["date"], "resume": e["resume"]} for e in f["evenements"][-3:]]}
                 for f in actifs.values()],
        "actualites": [dict(fiche_evenement(g, 1), resume=classements[g["id"]]["resume"],
                            fil_rouge_propose=classements[g["id"]]["fil_rouge"]) for g in candidats],
    }

    def valider(r):
        if not isinstance(r.get("mises_a_jour"), list):
            return "liste « mises_a_jour » absente"
        return None

    try:
        reponse = client.demander("fils-rouges", "high", donnees, valider=valider, max_tokens=6000)
    except BudgetEpuise:
        reponse = None
    if reponse is None:
        return fichier_fils, "sans-ia"

    modifies = 0
    for maj in reponse["mises_a_jour"]:
        if not isinstance(maj, dict) or maj.get("fil_id") not in actifs:
            continue
        fil = actifs[maj["fil_id"]]
        evenement = maj.get("evenement") or {}
        liens = _liens([i for i in evenement.get("article_ids", []) if isinstance(i, str)], groupes_par_id)
        if isinstance(evenement.get("resume"), str) and evenement["resume"].strip() and liens:
            _ajouter_evenement(fil, aujourd_hui, evenement["resume"].strip(), liens)
            modifies += 1
        if isinstance(maj.get("ou_en_est_on"), str) and maj["ou_en_est_on"].strip():
            fil["ou_en_est_on"] = maj["ou_en_est_on"].strip()
            fil["ou_en_est_on_maj_le"] = aujourd_hui

    nouveau = reponse.get("nouveau_fil")
    if isinstance(nouveau, dict) and len(actifs) < config["ia"]["fils_actifs_max"] and isinstance(nouveau.get("titre"), str):
        evenement = nouveau.get("evenement") or {}
        liens = _liens(evenement.get("article_ids", []), groupes_par_id)
        if liens and isinstance(evenement.get("resume"), str):
            categories = [c for c in nouveau.get("categories", []) if c in {c["id"] for c in config["categories"]}]
            fil = {"id": _identifiant_fil(nouveau["titre"], {f["id"] for f in fils}), "titre": nouveau["titre"].strip()[:120],
                   "statut": "actif", "ouvert_le": aujourd_hui, "clos_le": None, "categories": categories,
                   "ou_en_est_on": nouveau.get("ou_en_est_on") if isinstance(nouveau.get("ou_en_est_on"), str) else None,
                   "ou_en_est_on_maj_le": aujourd_hui, "evenements": [], "ouvert_par": "ia"}
            _ajouter_evenement(fil, aujourd_hui, evenement["resume"].strip(), liens)
            fils.append(fil)
            journal.info("Nouveau fil rouge ouvert : %s", fil["titre"])

    for identifiant in reponse.get("fils_a_clore") or []:
        fil = actifs.get(identifiant)
        if not fil:
            continue
        dernier = max((e["date"] for e in fil["evenements"]), default=fil["ouvert_le"])
        if (date.fromisoformat(aujourd_hui) - date.fromisoformat(dernier)).days >= JOURS_AVANT_CLOTURE_POSSIBLE:
            fil.update(statut="clos", clos_le=aujourd_hui)
            journal.info("Fil rouge clos : %s", fil["titre"])

    journal.info("Fils rouges : %d mis à jour", modifies)
    return dict(fichier_fils, fils=fils, mis_a_jour_le=horodatage()), "ia"


def valider_fichier(donnees) -> str | None:
    """Garde-fou avant écriture : on ne perd jamais un fil ni un événement existant."""
    if not isinstance(donnees, dict) or not isinstance(donnees.get("fils"), list) or not donnees["fils"]:
        return "aucun fil rouge"
    for fil in donnees["fils"]:
        if not {"id", "titre", "statut", "evenements"} <= set(fil):
            return f"fil incomplet : {fil.get('id')}"
    return None


def valider_sans_perte(ancien: dict):
    """Fabrique un validateur qui refuse toute version ayant perdu des fils ou des événements."""
    def valider(nouveau):
        probleme = valider_fichier(nouveau)
        if probleme:
            return probleme
        anciens = {f["id"]: len(f["evenements"]) for f in ancien.get("fils", [])}
        nouveaux = {f["id"]: len(f["evenements"]) for f in nouveau["fils"]}
        for identifiant, nombre in anciens.items():
            if nouveaux.get(identifiant, -1) < nombre:
                return f"le fil {identifiant} perdrait des événements"
        return None
    return valider
