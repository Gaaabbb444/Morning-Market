"""Client d'IA : bascule entre fournisseurs, erreurs 429, réponses illisibles, budget."""

import pytest

from collecte import ia

CONFIG_IA = {
    "fournisseurs": {
        "premier": {"url": "https://premier.test", "variable_cle": "CLE_1", "pause_secondes": 0},
        "second": {"url": "https://second.test", "variable_cle": "CLE_2", "pause_secondes": 0},
    },
    "niveaux": {"low": [{"fournisseur": "premier", "modele": "m1"}, {"fournisseur": "second", "modele": "m2"}]},
    "attente_max_429_secondes": 60, "delai_reseau_secondes": 5, "budget_requetes": 10,
}


class Reponse:
    def __init__(self, code, contenu="", entetes=None):
        self.status_code, self.headers, self.text = code, entetes or {}, contenu
        self._contenu = contenu

    def json(self):
        return {"choices": [{"message": {"content": self._contenu}}]}


def client(monkeypatch, reponses_par_url, cles=None):
    appels = []

    def faux_post(url, **_):
        appels.append(url)
        return reponses_par_url[url].pop(0)
    monkeypatch.setattr(ia.requests, "post", faux_post)
    monkeypatch.setattr(ia, "lire_prompt", lambda nom: "consigne")
    attentes = []
    c = ia.ClientIA(CONFIG_IA, cles if cles is not None else {"CLE_1": "a", "CLE_2": "b"}, attendre=attentes.append)
    return c, appels, attentes


def test_quota_trop_long_bascule_sur_le_second_fournisseur(monkeypatch):
    c, appels, _ = client(monkeypatch, {
        "https://premier.test": [Reponse(429, entetes={"Retry-After": "3600"})],
        "https://second.test": [Reponse(200, '{"ok": true}')],
    })
    assert c.demander("classement", "low", {}) == {"ok": True}
    assert appels == ["https://premier.test", "https://second.test"]
    assert c.erreurs[0]["nature"] == "quota (429)"


def test_quota_court_attente_puis_nouvel_essai(monkeypatch):
    c, appels, attentes = client(monkeypatch, {
        "https://premier.test": [Reponse(429, entetes={"Retry-After": "20"}), Reponse(200, '{"ok": 1}')],
    })
    assert c.demander("classement", "low", {}) == {"ok": 1}
    assert 20.0 in attentes and len(appels) == 2


def test_reponse_illisible_ou_refusee_passe_au_suivant(monkeypatch):
    c, _, _ = client(monkeypatch, {
        "https://premier.test": [Reponse(200, "Désolé, je ne peux pas.")],
        "https://second.test": [Reponse(200, '```json\n{"valeur": 2}\n```')],
    })
    assert c.demander("classement", "low", {}) == {"valeur": 2}


def test_fournisseur_sans_cle_ignore_et_aucune_cle_mode_degrade(monkeypatch):
    c, appels, _ = client(monkeypatch, {"https://second.test": [Reponse(200, '{"a": 1}')]}, cles={"CLE_2": "b"})
    assert c.demander("classement", "low", {}) == {"a": 1} and appels == ["https://second.test"]
    sans_cle = ia.ClientIA(CONFIG_IA, {})
    assert not sans_cle.disponible


def test_budget_de_requetes_respecte(monkeypatch):
    c, _, _ = client(monkeypatch, {"https://premier.test": [Reponse(200, '{"a": 1}')]})
    c.requetes = CONFIG_IA["budget_requetes"]
    with pytest.raises(ia.BudgetEpuise):
        c.demander("classement", "low", {})


def test_extraction_json():
    assert ia.extraire_json('Voici : {"a": [1, 2]} fin') == {"a": [1, 2]}
    assert ia.extraire_json("pas de json") is None
