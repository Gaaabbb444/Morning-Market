"""Lecture d'un flux RSS : filtres de date, d'exclusion et nettoyage des titres Google News."""

from datetime import datetime, timedelta

import requests

from collecte import flux
from collecte.outils import PARIS

MAINTENANT = datetime.now(PARIS)


def rss(entrees: str) -> bytes:
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>{entrees}</channel></rss>'.encode()


def entree(titre, lien, heures, resume="", source=""):
    date = (MAINTENANT - timedelta(hours=heures)).strftime("%a, %d %b %Y %H:%M:%S %z")
    balise_source = f"<source url='https://x'>{source}</source>" if source else ""
    return f"<item><title>{titre}</title><link>{lien}</link><pubDate>{date}</pubDate><description>{resume}</description>{balise_source}</item>"


class FausseReponse:
    def __init__(self, contenu):
        self.content = contenu

    def raise_for_status(self):
        pass


def lire(monkeypatch, contenu, **source):
    monkeypatch.setattr(flux.requests, "get", lambda *a, **k: FausseReponse(contenu))
    reglages = {"id": "s", "nom": "Média", "type": "presse", "url": "https://x"} | source
    return flux.lire_une_source(reglages, MAINTENANT - timedelta(hours=30), delai=5, longueur_min_titre=15)


def test_articles_recents_gardes_anciens_ecartes(monkeypatch):
    contenu = rss(entree("Un article récent et informatif", "https://m/1", 2, "<p>Le chapô &amp; son texte.</p>")
                  + entree("Un article bien trop ancien", "https://m/2", 50))
    articles, etat = lire(monkeypatch, contenu)
    assert [a["url"] for a in articles] == ["https://m/1"]
    assert articles[0]["chapo"] == "Le chapô & son texte."
    assert etat["etat"] == "ok" and etat["articles"] == 1


def test_exclusions_par_lien_et_titres_trop_courts(monkeypatch):
    contenu = rss(entree("Une rediffusion d'émission télé", "https://m/replay-emissions/1", 1)
                  + entree("Tir groupé", "https://m/3", 1))
    articles, etat = lire(monkeypatch, contenu, exclure_si_lien_contient=["/replay-emissions/"])
    assert articles == [] and etat["etat"] == "vide"


def test_titre_google_news_nettoye_sans_chapo(monkeypatch):
    contenu = rss(entree("Budget 2027 : la colère des départements enfle - Les Echos", "https://news.google.com/a",
                         1, "Budget 2027 ... Les Echos", source="Les Echos"))
    articles, _ = lire(monkeypatch, contenu, type="agregateur")
    assert articles[0]["titre"] == "Budget 2027 : la colère des départements enfle"
    assert articles[0]["chapo"] == ""


def test_source_en_panne_signalee_sans_planter(monkeypatch):
    def panne(*a, **k):
        raise requests.ConnectionError("hors ligne")
    monkeypatch.setattr(flux.requests, "get", panne)
    articles, etat = flux.lire_une_source({"id": "s", "nom": "M", "type": "presse", "url": "https://x"},
                                          MAINTENANT, delai=5, longueur_min_titre=15)
    assert articles == [] and etat["etat"] == "erreur"
