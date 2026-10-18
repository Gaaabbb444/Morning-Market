"""Aperçu local du site : compile le CSS puis sert le site sur http://localhost:8000.

    .venv\\Scripts\\python outils\\apercu.py                    → avec les vraies données (dossier data/)
    .venv\\Scripts\\python outils\\apercu.py --jeu sans-ia      → avec un jeu de test figé (tests/visuel/)

Les jeux de test reprennent les données réelles du 18/10/2026 (celles qui ont servi à la maquette) ;
une « variante » ne contient que les fichiers qui changent (ex. édition sans IA).
"""

import argparse
import functools
import http.server
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SITE = RACINE / "site"
DONNEES_REELLES = RACINE / "data"
JEUX = RACINE / "tests" / "visuel"


def compiler_css() -> None:
    """Compile site/src/style.css en site/assets/style.css avec l'outil Tailwind téléchargé dans outils/."""
    executable = RACINE / "outils" / ("tailwindcss-windows-x64.exe" if sys.platform == "win32" else "tailwindcss-linux-x64")
    subprocess.run([str(executable), "-i", str(SITE / "src" / "style.css"), "-o", str(SITE / "assets" / "style.css"), "--minify"],
                   check=True, capture_output=True)


class Gestionnaire(http.server.SimpleHTTPRequestHandler):
    """Sert site/ ; les adresses /data/… sont lues dans la variante, puis le jeu de base (ou data/)."""
    dossiers_donnees: list[Path] = []

    def translate_path(self, chemin):
        chemin = chemin.split("?", 1)[0].split("#", 1)[0]
        if chemin.startswith("/data/"):
            relatif = chemin[len("/data/"):]
            for dossier in self.dossiers_donnees:
                candidat = dossier / relatif
                if candidat.exists():
                    return str(candidat)
            return str(self.dossiers_donnees[-1] / relatif)
        return super().translate_path(chemin)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass  # console silencieuse


def dossiers_pour(jeu: str | None) -> list[Path]:
    if not jeu:
        return [DONNEES_REELLES]
    base = JEUX / "base"
    return [base] if jeu == "base" else [JEUX / jeu, base]


def servir(jeu: str | None, port: int):
    Gestionnaire.dossiers_donnees = dossiers_pour(jeu)
    gestionnaire = functools.partial(Gestionnaire, directory=str(SITE))
    serveur = http.server.ThreadingHTTPServer(("127.0.0.1", port), gestionnaire)
    return serveur


def main() -> None:
    analyseur = argparse.ArgumentParser(description="Aperçu local de Morning Market")
    analyseur.add_argument("--jeu", help="jeu de test figé : base, donnees-anciennes, indicateur-indisponible, sans-ia")
    analyseur.add_argument("--port", type=int, default=8000)
    arguments = analyseur.parse_args()
    compiler_css()
    serveur = servir(arguments.jeu, arguments.port)
    print(f"Site disponible sur http://localhost:{arguments.port}/  (Ctrl+C pour arrêter)")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
