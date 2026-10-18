"""Vérifie automatiquement les interactions et la robustesse du site (jeu de test figé du 18/10).

    .venv\\Scripts\\python outils\\verifier_interactions.py

Chaque vérification affiche « OK » ou « ÉCHEC » ; le script s'arrête en erreur si l'une échoue.
"""

import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import apercu  # noqa: E402

PORT = 8767
ADRESSE = f"http://127.0.0.1:{PORT}/?maintenant=2026-10-18T13:30"
resultats = []


def verifier(nom, condition, detail=""):
    resultats.append(bool(condition))
    print(f"{'OK    ' if condition else 'ÉCHEC '} {nom}{' — ' + str(detail) if detail else ''}")


def nouvelle_page(navigateur, **options):
    contexte = navigateur.new_context(viewport=options.pop("viewport", {"width": 1440, "height": 900}), **options)
    page = contexte.new_page()
    erreurs = []
    page.on("pageerror", lambda e: erreurs.append(str(e)))
    page.on("console", lambda m: erreurs.append(m.text) if m.type == "error" else None)
    return contexte, page, erreurs


def images_par_seconde(page, action):
    """Mesure grossière de la fluidité pendant une animation (images affichées par seconde)."""
    page.evaluate("""() => { window.__images = []; const boucle = (t) => { window.__images.push(t); if (window.__images.length < 400) requestAnimationFrame(boucle); }; requestAnimationFrame(boucle); }""")
    action()
    page.wait_for_timeout(600)
    temps = page.evaluate("window.__images")
    ecarts = [b - a for a, b in zip(temps, temps[1:])]
    return round(1000 / (sum(ecarts) / len(ecarts))) if ecarts else 0, round(max(ecarts)) if ecarts else 0


def main() -> int:
    apercu.compiler_css()
    serveur = apercu.servir("base", PORT)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        navigateur = p.chromium.launch()

        # 1. Filtres du Top 5
        contexte, page, erreurs = nouvelle_page(navigateur)
        page.goto(ADRESSE); page.wait_for_timeout(1200)
        verifier("Accueil : 5 infos au Top 5", page.locator("#liste-top5 [data-k]").count() == 5)
        page.click('#pastilles [data-categorie="croissance"]'); page.wait_for_timeout(700)
        n = page.locator("#liste-top5 [data-k]").count()
        verifier("Filtre « Croissance » : seules les infos de la catégorie", n == 1, f"{n} info(s)")
        verifier("Titre et compteur du filtre", "Top 5 du jour · Croissance" in page.inner_text("#entete-top5")
                 and "1 info sur 5 · Tout afficher" in page.inner_text("#entete-top5"))
        page.click('#entete-top5 [data-categorie="tout"]'); page.wait_for_timeout(700)
        verifier("« Tout afficher » rétablit les 5 infos", page.locator("#liste-top5 [data-k]").count() == 5)

        # 2. Modale : ouverture, focus, Échap, clic à l'extérieur, Tab gardé dans la fenêtre
        premiere = page.locator("#liste-top5 [data-k]").first
        fps, pire = images_par_seconde(page, lambda: premiere.click())
        verifier("Modale ouverte", page.locator('[role="dialog"]').is_visible())
        verifier("Fluidité de l'ouverture", fps >= 50, f"{fps} images/s, pire écart {pire} ms")
        verifier("Focus placé sur « Fermer »", page.evaluate("document.activeElement.getAttribute('aria-label')") == "Fermer")
        for _ in range(12):
            page.keyboard.press("Tab")
        verifier("Tab reste dans la modale", page.evaluate("Boolean(document.activeElement.closest('[role=dialog]'))"))
        page.keyboard.press("Escape"); page.wait_for_timeout(500)
        verifier("Échap ferme la modale", page.locator('[role="dialog"]').count() == 0)
        verifier("Le focus revient sur la ligne cliquée", page.evaluate("document.activeElement.dataset.k") == premiere.get_attribute("data-k"))
        premiere.click(); page.wait_for_timeout(600)
        page.mouse.click(1420, 450); page.wait_for_timeout(500)
        verifier("Clic à l'extérieur ferme la modale", page.locator('[role="dialog"]').count() == 0)

        # 3. Favori mémorisé après rechargement
        premiere.click(); page.wait_for_timeout(600)
        page.click('[data-action="favori"]'); page.wait_for_timeout(300)
        verifier("Étoile activée", page.get_attribute('[data-action="favori"]', "aria-pressed") == "true")
        page.reload(); page.wait_for_timeout(1200)
        page.locator("#liste-top5 [data-k]").first.click(); page.wait_for_timeout(600)
        verifier("Favori retrouvé après rechargement", page.get_attribute('[data-action="favori"]', "aria-pressed") == "true")
        page.keyboard.press("Escape"); page.wait_for_timeout(400)

        # 4. Thème mémorisé
        page.click("#bouton-theme"); page.wait_for_timeout(500)
        verifier("Bascule vers le mode clair", "mm-light" in page.get_attribute("html", "class"))
        page.reload(); page.wait_for_timeout(800)
        verifier("Mode clair retrouvé après rechargement", "mm-light" in page.get_attribute("html", "class"))
        verifier("Aucune erreur dans la console", not erreurs, erreurs[:3])
        contexte.close()

        # 4 bis. Navigation entre les vues (lot 2)
        contexte, page, erreurs = nouvelle_page(navigateur)
        page.goto(ADRESSE); page.wait_for_timeout(1200)
        page.click('#navigation [data-vue="marches"]'); page.wait_for_timeout(700)
        verifier("Barre latérale → Marchés", page.title().startswith("Marchés") and page.locator("h1").inner_text() == "Marchés")
        verifier("Marchés : 12 indicateurs et 4 blocs", page.locator(".ligne-marche").count() == 12 and page.locator("section[aria-label]").count() == 4)
        verifier("Repère de navigation déplacé", "translateY(50px)" in page.get_attribute("#navigation .repere-nav", "style"))
        page.go_back(); page.wait_for_timeout(700)
        verifier("Bouton « retour » du navigateur → accueil", page.locator("#liste-top5").count() == 1)
        page.click('a[href="#/marches"]:has-text("indicateurs")'); page.wait_for_timeout(700)
        verifier("Lien « Voir les 12 indicateurs » → Marchés", page.locator(".ligne-marche").count() == 12)
        page.click('#navigation [data-vue="accueil"]'); page.wait_for_timeout(700)
        page.click('a.carte[href="#/fils"]'); page.wait_for_timeout(700)
        verifier("Carte « Fils rouges » → liste des fils", page.locator('section[aria-label="Liste des fils rouges"] a').count() >= 12)
        page.click('a[href="#/fils/budget-2027"]'); page.wait_for_timeout(700)
        verifier("Ligne de la liste → détail du fil", "Budget 2027" in page.locator("h1").inner_text() and page.locator("#chrono").count() == 1)
        page.click('a[href="#/fils"]:has-text("Fils rouges") >> nth=-1'); page.wait_for_timeout(700)
        verifier("Lien de retour → liste des fils", page.locator('section[aria-label="Liste des fils rouges"]').count() == 1)
        page.click('#navigation [data-vue="accueil"]'); page.wait_for_timeout(700)
        page.locator("#liste-top5 [data-k]").first.click(); page.wait_for_timeout(600)
        lien_fil = page.locator('[role="dialog"] a[href^="#/fils/"]')
        if lien_fil.count():
            lien_fil.click(); page.wait_for_timeout(800)
            verifier("Modale « Voir le fil » → détail, modale fermée", page.locator('[role="dialog"]').count() == 0 and page.locator("#chrono").count() == 1)
        page.goto(ADRESSE.replace("/?", "/?") + "#/fils/inexistant"); page.wait_for_timeout(1000)
        verifier("Fil introuvable : message", "introuvable" in page.inner_text("#contenu"))
        verifier("Navigation : aucune erreur dans la console", not erreurs, erreurs[:3])
        contexte.close()

        # 4 ter. Catégories, favoris, recherche (lot 3)
        contexte, page, erreurs = nouvelle_page(navigateur, accept_downloads=True)
        page.goto(ADRESSE + "#/categories/mondialisation"); page.wait_for_timeout(1200)
        verifier("Catégories : 7 onglets", page.locator('[role="tab"]').count() == 7)
        verifier("Onglet demandé sélectionné", page.get_attribute('[data-onglet="mondialisation"]', "aria-selected") == "true")
        avant = page.locator("#panneau-categorie h2").inner_text()
        page.click('[data-onglet="finance"]'); page.wait_for_timeout(500)
        verifier("Changement d'onglet sur place", page.locator("#panneau-categorie h2").inner_text() != avant
                 and page.get_attribute('[data-onglet="finance"]', "aria-selected") == "true" and page.locator("h1").inner_text() == "Catégories")
        page.click('[data-onglet="mondialisation"]'); page.wait_for_timeout(500)
        article = page.locator('#panneau-categorie [data-action="ouvrir-article"]').last
        if article.count():
            article.click(); page.wait_for_timeout(700)
            verifier("Article d'une catégorie : modale ouverte", page.locator('[role="dialog"]').is_visible())
            page.click('[data-action="favori"]'); page.wait_for_timeout(200)
            page.keyboard.press("Escape"); page.wait_for_timeout(400)

        page.goto(ADRESSE + "#/"); page.wait_for_timeout(1000)
        page.locator("#liste-top5 [data-k]").first.click(); page.wait_for_timeout(600)
        page.click('[data-action="favori"]'); page.keyboard.press("Escape"); page.wait_for_timeout(400)
        page.click('#navigation [data-vue="favoris"]'); page.wait_for_timeout(800)
        n = page.locator("[data-f]").count()
        verifier("Favoris : les infos ajoutées apparaissent", n == 2, f"{n} favori(s)")
        page.click('[data-tri="categorie"]'); page.wait_for_timeout(400)
        verifier("Tri par catégorie", page.get_attribute('[data-tri="categorie"]', "aria-pressed") == "true")
        with page.expect_download() as telechargement:
            page.click('[data-action="exporter"]')
        chemin = telechargement.value.path()
        import json as _json
        export = _json.loads(Path(chemin).read_text(encoding="utf-8"))
        verifier("Export : fichier JSON des favoris", export.get("format") == "morning-market-favoris" and len(export["favoris"]) == 2,
                 telechargement.value.suggested_filename)
        page.locator("[data-f] [data-action=\"retirer-favori\"]").first.click(); page.wait_for_timeout(500)
        verifier("Retrait d'un favori", page.locator("[data-f]").count() == 1)
        page.locator("[data-f] [data-action=\"retirer-favori\"]").first.click(); page.wait_for_timeout(500)
        verifier("Dernier favori retiré : état vide", "Aucun favori pour l'instant" in page.inner_text("#contenu")
                 and page.locator('[data-action="exporter"]').is_disabled())
        page.set_input_files("#fichier-import", chemin); page.wait_for_timeout(500)
        verifier("Import : favoris restaurés", page.locator("[data-f]").count() == 2 and "2 favoris importés" in page.inner_text("#message-favoris"))
        page.set_input_files("#fichier-import", files=[{"name": "faux.json", "mimeType": "application/json", "buffer": b'{"bonjour": 1}'}]); page.wait_for_timeout(500)
        verifier("Import d'un mauvais fichier : refusé avec message", "n'est pas un export" in page.inner_text("#message-favoris")
                 and page.locator("[data-f]").count() == 2)

        page.goto(ADRESSE + "#/"); page.wait_for_timeout(1000)
        page.click('[data-action="rechercher"]'); page.wait_for_timeout(400)
        verifier("Recherche : focus dans le champ", page.evaluate("document.activeElement.hasAttribute('data-champ')"))
        verifier("Recherche : aide sous deux lettres", "au moins deux lettres" in page.inner_text('[aria-label="Recherche"]'))
        page.fill("[data-champ]", "inflation"); page.wait_for_timeout(400)
        verifier("Recherche « inflation » : résultats groupés et surlignés",
                 page.locator('[aria-label="Recherche"] mark').count() >= 3 and "Indicateurs" in page.inner_text('[aria-label="Recherche"]'))
        page.fill("[data-champ]", "cryptomonnaie"); page.wait_for_timeout(300)
        verifier("Recherche sans résultat : message", "Aucun résultat pour" in page.inner_text('[aria-label="Recherche"]'))
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        verifier("Échap ferme la recherche, focus sur la loupe",
                 page.locator('[aria-label="Recherche"]').count() == 0 and page.evaluate("document.activeElement.dataset.action") == "rechercher")
        page.click('[data-action="rechercher"]'); page.fill("[data-champ]", "zone euro"); page.wait_for_timeout(300)
        page.click('[data-resultat="aller"]'); page.wait_for_timeout(800)
        verifier("Résultat « indicateur » → Marchés", page.locator(".ligne-marche").count() == 12)
        page.goto(ADRESSE + "#/"); page.wait_for_timeout(1000)
        page.click('[data-action="rechercher"]'); page.fill("[data-champ]", "Montchalin"); page.wait_for_timeout(600)
        page.locator('[data-resultat="info"]').first.click(); page.wait_for_timeout(800)
        verifier("Résultat « info » → modale de l'info", page.locator('[role="dialog"]').is_visible() and "Montchalin" in page.inner_text('[role="dialog"]'))
        verifier("Lot 3 : aucune erreur dans la console", not erreurs, erreurs[:3])
        contexte.close()

        # 5. Mémoire du navigateur bloquée (navigation privée stricte) : le site doit s'afficher quand même
        contexte, page, erreurs = nouvelle_page(navigateur)
        page.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqué'); } });")
        page.goto(ADRESSE); page.wait_for_timeout(1200)
        verifier("Mémoire bloquée : accueil affiché", page.locator("#liste-top5 [data-k]").count() == 5)
        page.locator("#liste-top5 [data-k]").first.click(); page.wait_for_timeout(600)
        page.click('[data-action="favori"]'); page.click("#bouton-theme" if False else '[data-action="fermer"]')
        verifier("Mémoire bloquée : favori et fermeture sans erreur", not [e for e in erreurs if "bloqué" not in e], erreurs[:3])
        contexte.close()

        # 6. Données introuvables : message de repli
        contexte, page, erreurs = nouvelle_page(navigateur)
        page.route("**/data/statut.json", lambda route: route.fulfill(status=404, body=""))
        page.goto(ADRESSE); page.wait_for_timeout(1000)
        verifier("Données absentes : message de repli", "Données momentanément indisponibles" in page.inner_text("#contenu"))
        contexte.close()

        # 7. « Réduire les animations »
        contexte, page, erreurs = nouvelle_page(navigateur, reduced_motion="reduce")
        page.goto(ADRESSE); page.wait_for_timeout(800)
        page.click('#pastilles [data-categorie="desequilibres"]'); page.wait_for_timeout(500)
        page.locator("#liste-top5 [data-k]").first.click(); page.wait_for_timeout(400)
        verifier("Animations réduites : filtre et modale fonctionnent", page.locator('[role="dialog"]').is_visible() and not erreurs, erreurs[:3])
        animation_fond = page.evaluate("getComputedStyle(document.querySelector('.fond-anime')).animationName")
        verifier("Animations réduites : fond immobile", animation_fond == "none", animation_fond)
        contexte.close()

        # 8. Téléphone : pas de débordement horizontal
        contexte, page, erreurs = nouvelle_page(navigateur, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page.goto(ADRESSE); page.wait_for_timeout(1200)
        largeur = page.evaluate("document.getElementById('contenu').scrollWidth")
        verifier("Téléphone : rien ne déborde", largeur <= 390 - 32 + 1, f"largeur du contenu {largeur} px")
        page.screenshot(path=str(apercu.RACINE / "tmp" / "captures" / "telephone.png"), full_page=False)
        page.locator("#liste-top5 [data-k]").first.click(); page.wait_for_timeout(600)
        boite = page.locator('[role="dialog"]').bounding_box()
        verifier("Téléphone : la modale tient dans l'écran", boite and boite["x"] >= 0 and boite["x"] + boite["width"] <= 390, boite)
        page.screenshot(path=str(apercu.RACINE / "tmp" / "captures" / "telephone-modale.png"))
        for vue in ("marches", "fils/budget-2027"):
            page.keyboard.press("Escape"); page.goto(ADRESSE + f"#/{vue}"); page.wait_for_timeout(1200)
            largeur = page.evaluate("document.getElementById('contenu').scrollWidth")
            verifier(f"Téléphone : {vue} sans débordement", largeur <= 390 - 32 + 1, f"{largeur} px")
            page.screenshot(path=str(apercu.RACINE / "tmp" / "captures" / f"telephone-{vue.split('/')[0]}.png"))
        contexte.close()

        navigateur.close()
    serveur.shutdown()
    echecs = resultats.count(False)
    print(f"\n{len(resultats) - echecs}/{len(resultats)} vérifications réussies")
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
