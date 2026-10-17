"""Regroupement des articles par événement (exemples tirés de la collecte réelle du 17/10/2026)."""

from collecte.dedoublonnage import regrouper


def article(identifiant, source, titre, chapo=""):
    return {"id": identifiant, "source": source, "titre": titre, "chapo": chapo, "langue": "fr",
            "type_source": "presse", "publie_le": "2026-10-17T10:00:00+02:00"}


ARTICLES = [
    article("a", "Les Echos", "Guerre en Ukraine : Donald Trump exempte la Russie de nouvelles sanctions"),
    article("b", "L'Opinion", "Guerre en Ukraine : Trump exempte la Russie de nouvelles sanctions du Congrès"),
    article("c", "La Tribune", "Donald Trump suspend les sanctions contre Moscou pour sauver les élections",
            "Le président américain exempte la Russie de nouvelles sanctions."),
    article("d", "Le Monde", "L'accord franco-allemand sur l'automobile ménage Stellantis"),
    article("e", "Le Figaro", "Les constructeurs, grands gagnants de l'accord franco-allemand sur l'automobile"),
    article("f", "Capital", "Assurance-vie : pourquoi la tentation de taxer ses avantages revient"),
    article("g", "Le Monde", "Budget 2027 : la colère des départements enfle"),
    article("h", "franceinfo", "Mobilisation du 17 octobre : les colères sont déclarées"),
] + [article(f"z{i}", "Remplissage", titre) for i, titre in enumerate([
    "Le prix du cacao recule fortement", "Netflix annonce des licenciements", "La Chine relance son immobilier",
    "Les ventes de vélos électriques ralentissent", "Le Japon relève ses taux", "Airbus livre moins d'avions",
])]


def test_meme_evenement_regroupe_et_sources_comptees():
    groupes = {g["id"]: g for g in regrouper(ARTICLES)}
    ukraine = next(g for g in groupes.values() if "a" in {a["id"] for a in g["articles"]})
    assert {a["id"] for a in ukraine["articles"]} == {"a", "b", "c"}
    assert ukraine["nb_sources"] == 3


def test_sujets_differents_non_fusionnes():
    groupes = regrouper(ARTICLES)
    groupe_de = {a["id"]: g["id"] for g in groupes for a in g["articles"]}
    assert groupe_de["d"] == groupe_de["e"]          # même accord automobile
    assert groupe_de["g"] != groupe_de["h"]          # « colère » en commun, mais sujets différents
    assert groupe_de["f"] not in (groupe_de["a"], groupe_de["d"])


def test_groupes_tries_par_nombre_de_sources():
    groupes = regrouper(ARTICLES)
    assert groupes[0]["nb_sources"] == 3
    assert regrouper([]) == []
