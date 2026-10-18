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
        contexte.close()

        navigateur.close()
    serveur.shutdown()
    echecs = resultats.count(False)
    print(f"\n{len(resultats) - echecs}/{len(resultats)} vérifications réussies")
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
