"""Fabriques d'objets de test partagées (articles, groupes, faux client d'IA)."""

CHAPO = "Le gouvernement a présenté jeudi un projet qui prévoit une hausse des dépenses et une baisse du déficit public."


def article(identifiant, source, titre, chapo="", langue="fr", type_source="presse"):
    return {"id": identifiant, "titre": titre, "source": source, "source_id": source.lower(), "type_source": type_source,
            "langue": langue, "url": f"https://exemple.fr/{identifiant}", "publie_le": "2026-10-19T07:00:00+02:00",
            "chapo": chapo, "categorie_probable": None}


def groupe(*articles):
    sources = sorted({a["source"] for a in articles})
    return {"id": articles[0]["id"], "titre": articles[0]["titre"], "nb_sources": len(sources),
            "sources": sources, "articles": list(articles)}


def groupe_sans_chapo(identifiant, titre="Budget 2027 : les députés adoptent la première partie du budget"):
    """Événement couvert seulement par Les Echos via Google News : titre seul."""
    return groupe(article(identifiant, "Les Echos", titre, type_source="agregateur"))


def groupe_documente(identifiant, titre="La croissance française ralentit au troisième trimestre", source="Le Monde"):
    return groupe(article(identifiant, source, titre, CHAPO))


class FauxClient:
    """Imite ClientIA : renvoie des réponses préparées, en appliquant le validateur comme le vrai client."""

    def __init__(self, reponses=None, disponible=True):
        self.reponses = reponses or {}
        self.disponible = disponible
        self.appels = []

    def demander(self, tache, niveau, donnees, valider=None, max_tokens=4000):
        self.appels.append((tache, donnees))
        reponse = self.reponses.get(tache)
        if callable(reponse):
            reponse = reponse(donnees)
        if reponse is None or (valider and valider(reponse)):
            return None
        return reponse

    def resume_pour_statut(self):
        return {"fournisseurs_configures": [], "requetes": len(self.appels), "requetes_par_modele": {}, "erreurs": []}
