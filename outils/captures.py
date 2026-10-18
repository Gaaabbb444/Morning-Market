"""Captures côte à côte maquette / site, pour vérifier la fidélité du design.

    .venv\\Scripts\\python outils\\captures.py            → tous les écrans du lot en cours
    .venv\\Scripts\\python outils\\captures.py accueil     → un seul écran

Pour chaque écran et chaque largeur (1280 et 1440 px), produit dans tmp/captures/ une image :
maquette à gauche, site à droite, mode sombre en haut, mode clair en bas, avec le pourcentage
de pixels qui diffèrent nettement. Le site est affiché avec un jeu de données figé (tests/visuel/),
l'heure étant fixée au 18/10/2026 à 13 h 30 comme dans la maquette.
"""

import base64
import gzip
import json
import re
import sys
import threading
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import apercu  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
MAQUETTE = RACINE / "Maquette" / "Morning Market.html"
DOSSIER_MAQUETTE = RACINE / "tmp" / "maquette"
SORTIE = RACINE / "tmp" / "captures"
PORT = 8765
ECARTS = {}
LARGEURS = [1280, 1440]
HAUTEUR = 900

# Écran → (numéro de l'écran sombre dans la maquette, jeu de données, action à faire avant la capture)
ECRANS = {
    "accueil": (1, "base", None),
    "modale": (3, "base", "ouvrir-premiere-info"),
    "accueil-bas": (1, "base", "defiler-en-bas"),
    "donnees-anciennes": (29, "donnees-anciennes", None),
    "indicateur-indisponible": (31, "indicateur-indisponible", None),
    "sans-ia": (33, "sans-ia", None),
    "marches": (5, "base", "adresse:#/marches"),
    "marches-bas": (5, "base", "adresse:#/marches|defiler-en-bas"),
    "fils-liste": (7, "base", "adresse:#/fils"),
    "fil-detail": (9, "base", "adresse:#/fils/budget-2027"),
    "categories": (11, "base", "adresse:#/categories/mondialisation"),
    "favoris": (19, "base", "adresse:#/favoris|favoris-exemple"),
    "favoris-vide": (21, "base", "adresse:#/favoris"),
    "recherche": (25, "base", "rechercher:inflation"),
    "recherche-vide": (27, "base", "rechercher:cryptomonnaie"),
    "glossaire": (17, "base", "adresse:#/glossaire"),
    "archives": (13, "base", "adresse:#/archives"),
    "retrospective": (15, "retrospective", "adresse:#/archives/retro"),
    "methodologie": (23, "base", "adresse:#/methodologie"),
}


def extraire_maquette() -> list[Path]:
    """Déballe les pages de la maquette (une seule fois) ; renvoie les fichiers dans l'ordre de la planche."""
    ordre_fichier = DOSSIER_MAQUETTE / "ordre.json"
    if ordre_fichier.exists():
        return [DOSSIER_MAQUETTE / n for n in json.loads(ordre_fichier.read_text(encoding="utf-8"))]
    DOSSIER_MAQUETTE.mkdir(parents=True, exist_ok=True)
    texte = MAQUETTE.read_text(encoding="utf-8")
    blocs = dict(re.findall(r'<script type="__bundler/([a-z_]+)">(.*?)</script>', texte, flags=re.S))
    manifeste, ordre = json.loads(blocs["manifest"]), json.loads(blocs["page_order"])
    noms = []
    for rang, uid in enumerate(ordre):
        donnees = base64.b64decode(manifeste[uid]["data"])
        if manifeste[uid].get("compressed"):
            donnees = gzip.decompress(donnees)
        nom = f"{rang:03d}.html"
        (DOSSIER_MAQUETTE / nom).write_bytes(donnees)
        noms.append(nom)
    ordre_fichier.write_text(json.dumps(noms), encoding="utf-8")
    return [DOSSIER_MAQUETTE / n for n in noms]


def page_maquette(fichier: Path, largeur: int) -> str:
    """Les écrans de la maquette ont une largeur fixe de 1440 px : pour une autre largeur, on fabrique une copie
    dont la mise en page est recalculée à cette largeur (au lieu d'être simplement coupée)."""
    if largeur == 1440:
        return fichier.as_uri()
    copie = fichier.with_name(f"{fichier.stem}-{largeur}.html")
    if not copie.exists():
        texte = fichier.read_text(encoding="utf-8")
        for avant, apres in [("width:1440px;height:900px", f"width:{largeur}px;height:900px"),
                             ("1440px,900px", f"{largeur}px,900px"), ("&quot;width&quot;:1440", f"&quot;width&quot;:{largeur}")]:
            texte = texte.replace(avant, apres)
        copie.write_text(texte, encoding="utf-8")
    return copie.as_uri()


def favoris_exemple() -> dict:
    """5 favoris comme dans la maquette : 3 infos du Top 5 du 18/10 et 2 infos du 17/10."""
    base = RACINE / "tests" / "visuel" / "base" / "jours"
    j18 = json.loads((base / "2026-10-18.json").read_text(encoding="utf-8"))
    j17 = json.loads((base / "2026-10-17.json").read_text(encoding="utf-8"))
    choix = [(j18["top5"][i], "2026-10-18") for i in (0, 2, 3)] + [(info, "2026-10-17") for info in j17["top5"][1:3]]
    return {info["id"]: {"id": info["id"], "titre": info["titre"], "titre_fr": None, "source": info["source"], "url": info["url"],
                         "categorie": info["categorie"], "edition": date, "ajoute_le": f"{date}T08:00:0{n}Z"} for n, (info, date) in enumerate(choix)}


def capturer(page, adresse: str, largeur: int, action: str | None, est_site: bool) -> Image.Image:
    page.set_viewport_size({"width": largeur, "height": HAUTEUR})
    actions = (action or "").split("|")
    if est_site and actions[0].startswith("adresse:"):
        adresse += actions[0].split(":", 1)[1]  # vue du site à ouvrir (ex. #/marches)
    page.goto(adresse)
    if est_site:
        # Mémoire du navigateur : favoris d'exemple pour l'écran Favoris, vide pour tous les autres
        if "favoris-exemple" in actions:
            page.evaluate("(f) => localStorage.setItem('morning-market:favoris', JSON.stringify(f))", favoris_exemple())
            page.reload()
        elif page.evaluate("localStorage.length"):
            page.evaluate("localStorage.clear()")
            page.reload()
    page.wait_for_timeout(2500 if not est_site else 1600)  # décompression de la maquette / animations d'arrivée
    if est_site and actions[0].startswith("rechercher:"):
        page.click('[data-action="rechercher"]')
        page.fill("[data-champ]", actions[0].split(":", 1)[1])
        page.wait_for_timeout(700)
    if "defiler-en-bas" in actions:
        # La zone principale défile seule (la barre latérale reste fixe), sur la maquette comme sur le site
        page.evaluate("""() => { for (const el of document.querySelectorAll('.main, #zone-principale')) el.scrollTop = el.scrollHeight; }""")
        page.wait_for_timeout(300)
    if action == "ouvrir-premiere-info" and est_site:
        page.click('[data-action="ouvrir"]')
        page.wait_for_timeout(700)
    chemin = SORTIE / "_temp.png"
    page.screenshot(path=str(chemin))
    return Image.open(chemin).convert("RGB")


def part_difference(a: Image.Image, b: Image.Image) -> float:
    """Pourcentage de pixels dont la couleur diffère nettement (seuil 40 sur 255)."""
    diff = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 40 else 0)
    return 100 * sum(1 for v in diff.getdata() if v) / (a.width * a.height)


def assembler(nom: str, largeur: int, images: dict) -> Path:
    echelle = 0.5
    l, h = int(largeur * echelle), int(HAUTEUR * echelle)
    marge, entete = 16, 34
    planche = Image.new("RGB", (2 * l + 3 * marge, 2 * (h + entete) + 3 * marge), (40, 40, 46))
    dessin = ImageDraw.Draw(planche)
    try:
        police = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        police = ImageFont.load_default()
    for ligne, theme in enumerate(["dark", "light"]):
        maquette, site = images[theme]
        ecart = part_difference(maquette, site)
        ECARTS[f"{nom} · {largeur} px · {'sombre' if theme == 'dark' else 'clair'}"] = round(ecart, 1)
        y = marge + ligne * (h + entete + marge)
        for colonne, (titre, image) in enumerate([("Maquette", maquette), (f"Site — {ecart:.1f} % de pixels différents", site)]):
            x = marge + colonne * (l + marge)
            libelle = f"{titre} · {'sombre' if theme == 'dark' else 'clair'} · {largeur} px"
            dessin.text((x, y + 6), libelle, fill=(235, 235, 240), font=police)
            planche.paste(image.resize((l, h), Image.LANCZOS), (x, y + entete))
    chemin = SORTIE / f"{nom}-{largeur}.png"
    planche.save(chemin)
    return chemin


def main() -> None:
    choisis = sys.argv[1:] or list(ECRANS)
    SORTIE.mkdir(parents=True, exist_ok=True)
    pages_maquette = extraire_maquette()
    apercu.compiler_css()
    with sync_playwright() as p:
        navigateur = p.chromium.launch()
        page = navigateur.new_page()
        for nom in choisis:
            numero, jeu, action = ECRANS[nom]
            serveur = apercu.servir(jeu, PORT)
            fil = threading.Thread(target=serveur.serve_forever, daemon=True)
            fil.start()
            for largeur in LARGEURS:
                images = {}
                for decalage, theme in enumerate(["dark", "light"]):
                    maquette = capturer(page, page_maquette(pages_maquette[numero + decalage], largeur), largeur, action, False)
                    site = capturer(page, f"http://127.0.0.1:{PORT}/?theme={theme}&maintenant=2026-10-18T13:30", largeur, action, True)
                    images[theme] = (maquette, site)
                print("Capture :", assembler(nom, largeur, images).relative_to(RACINE))
            serveur.shutdown()
            serveur.server_close()
        navigateur.close()
    (SORTIE / "_temp.png").unlink(missing_ok=True)
    (SORTIE / "ecarts.json").write_text(json.dumps(ECARTS, ensure_ascii=False, indent=1), encoding="utf-8")
    for cle, valeur in ECARTS.items():
        print(f"  {cle} : {valeur} % de pixels différents")


if __name__ == "__main__":
    main()
