"""Audit d'accessibilité automatique de toutes les pages du site (axe-core, normes WCAG 2.2 niveaux A et AA).

    .venv\\Scripts\\python outils\\verifier_accessibilite.py

Chaque page est contrôlée en mode sombre et en mode clair, sur ordinateur (1440 px) et sur téléphone (390 px),
avec le jeu de données figé du 18/10 (tests/visuel/base). Contrôles : contrastes, noms des boutons et des liens,
structure des titres, rôles ARIA, langue de la page… Un contrôle automatique ne remplace pas un essai au clavier
(voir verifier_interactions.py), mais il repère les oublis courants.
"""

import sys
import threading
from collections import defaultdict

import apercu
from axe_playwright_python.sync_playwright import Axe
from playwright.sync_api import sync_playwright

PORT = 8773
ADRESSE = f"http://127.0.0.1:{PORT}/?maintenant=2026-10-18T13:30"
NORMES = {"runOnly": {"type": "tag", "values": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]}}

# Page → action avant l'audit
PAGES = {
    "Accueil": ("#/", None),
    "Modale d'une info": ("#/", "modale"),
    "Recherche": ("#/", "recherche"),
    "Marchés": ("#/marches", None),
    "Fils rouges": ("#/fils", None),
    "Détail d'un fil": ("#/fils/budget-2027", None),
    "Catégories": ("#/categories/mondialisation", None),
    "Glossaire": ("#/glossaire", None),
    "Archives": ("#/archives", None),
    "Édition archivée": ("#/edition/2026-10-17", None),
    "Favoris (vide)": ("#/favoris", None),
    "Méthodologie": ("#/methodologie", None),
}
ECRANS = {"ordinateur": {"viewport": {"width": 1440, "height": 900}},
          "téléphone": {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True}}


def main() -> int:
    apercu.compiler_css()
    serveur = apercu.servir("base", PORT)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    axe = Axe()
    problemes = defaultdict(set)  # règle → pages concernées
    details = {}
    with sync_playwright() as p:
        navigateur = p.chromium.launch(args=["--force-prefers-reduced-motion"])  # pas d'animation en cours pendant l'audit
        for ecran, options in ECRANS.items():
            for theme in ("dark", "light"):
                contexte = navigateur.new_context(**options, reduced_motion="reduce")
                page = contexte.new_page()
                for nom, (adresse, action) in PAGES.items():
                    page.goto("about:blank")  # vrai rechargement à chaque page (sinon seule l'ancre de l'adresse change)
                    page.goto(f"{ADRESSE}&theme={theme}{adresse}")
                    page.wait_for_timeout(900)
                    if action == "modale":
                        page.locator("#liste-top5 [data-k]").first.click(); page.wait_for_timeout(500)
                    if action == "recherche":
                        page.click('[data-action="rechercher"]'); page.fill("[data-champ]", "inflation"); page.wait_for_timeout(500)
                    resultats = axe.run(page, options=NORMES)
                    for regle in resultats.response["violations"]:
                        problemes[regle["id"]].add(f"{nom} ({ecran}, {'sombre' if theme == 'dark' else 'clair'})")
                        details.setdefault(regle["id"], (regle["help"], regle["nodes"][0]["target"], regle["nodes"][0].get("failureSummary", "")))
                contexte.close()
        navigateur.close()
    serveur.shutdown()
    if not problemes:
        print(f"Aucun problème d'accessibilité détecté ({len(PAGES)} pages × 2 thèmes × 2 écrans).")
        return 0
    for regle, pages in problemes.items():
        aide, cible, resume = details[regle]
        print(f"\n✗ {regle} : {aide}\n  exemple : {cible}\n  {resume.splitlines()[-1] if resume else ''}")
        for page_concernee in sorted(pages):
            print(f"    · {page_concernee}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
