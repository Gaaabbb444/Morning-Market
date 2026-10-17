"""Client d'IA indépendant du fournisseur.

Tous les fournisseurs configurés (Gemini, Groq…) acceptent le même format de requête
(compatible OpenAI). Pour chaque demande, on essaie les modèles dans l'ordre défini par
config.yaml ; en cas d'échec (quota atteint, panne, réponse illisible), on passe au suivant.
Si tout échoue, la demande renvoie None et l'étape concernée bascule en mode dégradé.
"""

import json
import os
import re
import time

import requests

from .outils import RACINE, journal

DOSSIER_PROMPTS = RACINE / "config" / "prompts"


class BudgetEpuise(Exception):
    """Le nombre maximal de requêtes pour cette exécution est atteint."""


def lire_prompt(nom: str) -> str:
    """Consigne complète d'une tâche : règles communes + consigne propre à la tâche."""
    communes = (DOSSIER_PROMPTS / "regles-communes.md").read_text(encoding="utf-8")
    tache = (DOSSIER_PROMPTS / f"{nom}.md").read_text(encoding="utf-8")
    return f"{communes}\n\n{tache}"


def extraire_json(texte: str) -> dict | None:
    """Récupère l'objet JSON d'une réponse, même entouré de balises ``` ou de texte."""
    if not texte:
        return None
    texte = re.sub(r"^```(?:json)?|```$", "", texte.strip(), flags=re.MULTILINE).strip()
    debut, fin = texte.find("{"), texte.rfind("}")
    if debut == -1 or fin <= debut:
        return None
    try:
        resultat = json.loads(texte[debut:fin + 1])
    except json.JSONDecodeError:
        return None
    return resultat if isinstance(resultat, dict) else None


class ClientIA:
    def __init__(self, config_ia: dict, environnement: dict | None = None, attendre=time.sleep):
        env = os.environ if environnement is None else environnement
        self.reglages = config_ia
        self.attendre = attendre  # remplaçable dans les tests pour ne pas attendre réellement
        self.cles = {nom: env.get(f["variable_cle"]) for nom, f in config_ia["fournisseurs"].items()}
        self.requetes = 0
        self.requetes_par_modele: dict[str, int] = {}
        self.erreurs: list[dict] = []
        self.dernier_appel: dict[str, float] = {}

    @property
    def disponible(self) -> bool:
        """Au moins un fournisseur a une clé."""
        return any(self.cles.values())

    def resume_pour_statut(self) -> dict:
        return {
            "fournisseurs_configures": [nom for nom, cle in self.cles.items() if cle],
            "requetes": self.requetes,
            "requetes_par_modele": self.requetes_par_modele,
            "erreurs": self.erreurs[-20:],
        }

    # ------------------------------------------------------------------

    def demander(self, tache: str, niveau: str, donnees: dict, valider=None, max_tokens: int = 4000) -> dict | None:
        """Envoie une tâche à l'IA et renvoie sa réponse JSON validée, ou None si tout a échoué.

        `valider(reponse)` renvoie None si la réponse est acceptable, sinon un message d'erreur.
        """
        consigne = lire_prompt(tache)
        message = json.dumps(donnees, ensure_ascii=False)
        for choix in self.reglages["niveaux"][niveau]:
            nom = choix["fournisseur"]
            if not self.cles.get(nom):
                continue
            reponse = self._appeler(nom, choix["modele"], consigne, message, max_tokens, tache)
            if reponse is None:
                continue
            probleme = valider(reponse) if valider else None
            if probleme:
                self._noter(tache, nom, choix["modele"], "réponse refusée", probleme)
                continue
            return reponse
        journal.warning("IA indisponible pour « %s » : passage en mode dégradé pour cette étape", tache)
        return None

    def _noter(self, tache, fournisseur, modele, nature, detail):
        self.erreurs.append({"tache": tache, "fournisseur": fournisseur, "modele": modele,
                             "nature": nature, "detail": str(detail)[:200]})
        journal.warning("IA %s/%s (%s) : %s — %s", fournisseur, modele, tache, nature, str(detail)[:150])

    def _appeler(self, nom, modele, consigne, message, max_tokens, tache) -> dict | None:
        fournisseur = self.reglages["fournisseurs"][nom]
        corps = {"model": modele, "temperature": 0.2, "max_tokens": max_tokens,
                 "messages": [{"role": "system", "content": consigne}, {"role": "user", "content": message}]}
        corps.update(fournisseur.get("parametres") or {})
        entetes = {"Authorization": f"Bearer {self.cles[nom]}", "Content-Type": "application/json"}

        for tentative in (1, 2):
            if self.requetes >= self.reglages["budget_requetes"]:
                raise BudgetEpuise()
            # Respect du rythme autorisé par le palier gratuit
            ecoule = time.monotonic() - self.dernier_appel.get(nom, -1e9)
            if ecoule < fournisseur["pause_secondes"]:
                self.attendre(fournisseur["pause_secondes"] - ecoule)
            self.dernier_appel[nom] = time.monotonic()
            self.requetes += 1
            cle_modele = f"{nom}/{modele}"
            self.requetes_par_modele[cle_modele] = self.requetes_par_modele.get(cle_modele, 0) + 1

            try:
                reponse = requests.post(fournisseur["url"], headers=entetes, json=corps,
                                        timeout=self.reglages["delai_reseau_secondes"])
            except requests.RequestException as erreur:
                self._noter(tache, nom, modele, "erreur réseau", erreur)
                if tentative == 1:
                    self.attendre(5)
                    continue
                return None

            if reponse.status_code == 429:
                attente = _secondes_avant_nouvel_essai(reponse)
                if tentative == 1 and attente <= self.reglages["attente_max_429_secondes"]:
                    self._noter(tache, nom, modele, "quota (429)", f"nouvel essai dans {attente:.0f} s")
                    self.attendre(attente)
                    continue
                self._noter(tache, nom, modele, "quota (429)", "fournisseur suivant")
                return None
            if reponse.status_code >= 500 and tentative == 1:
                self._noter(tache, nom, modele, f"erreur serveur ({reponse.status_code})", "nouvel essai")
                self.attendre(5)
                continue
            if reponse.status_code != 200:
                self._noter(tache, nom, modele, f"erreur {reponse.status_code}", reponse.text)
                return None

            try:
                contenu = reponse.json()["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError):
                contenu = None
            resultat = extraire_json(contenu)
            if resultat is None:
                self._noter(tache, nom, modele, "réponse illisible", (contenu or "")[:200])
                return None
            return resultat
        return None


def _secondes_avant_nouvel_essai(reponse) -> float:
    """Délai demandé par le fournisseur avant de réessayer (en-tête Retry-After), 30 s par défaut."""
    try:
        return float(reponse.headers.get("Retry-After", 30))
    except (TypeError, ValueError):
        return 30.0
