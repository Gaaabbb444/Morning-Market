# Morning-Market — consignes pour Claude

Tableau de bord économique quotidien (GitHub Pages + GitHub Actions). Brief complet et faisant foi : `CAHIER_DES_CHARGES.md` (ne pas le recopier ici).

## Règles de travail
- Gab n'a jamais codé : tout expliquer en français simple, ne jamais lui demander d'éditer du code. Actions manuelles = étapes numérotées sans jargon.
- Avancer **phase par phase**. Fin de phase : résumé + commandes de test à copier-coller, puis attendre son « OK ». Un commit propre uniquement après validation.
- Code et commentaires en français, noms de variables explicites.
- Vérifier la doc actuelle (limites gratuites, modèles, URL de flux, identifiants de séries) au lieu de se fier à sa mémoire.
- Coût zéro. Aucune IA dans le navigateur : le site lit seulement des JSON précalculés.
- Ne jamais écraser de bonnes données par des données vides ou invalides.
- Droit de la presse : on stocke uniquement titre, source, date, lien et résumé IA. Les chapôs RSS ne sont **jamais** écrits dans le dépôt (public).
- Aucune citation inventée : citation d'actu vérifiée mot pour mot dans le flux ; citation d'économiste affichée seulement si `verifiee: true`.
- Toute forme de données JSON est décrite dans `contrat/` : la mettre à jour avant de changer un format.

## Structure
```
config/        réglages (catégories, sources, modèles IA) + prompts/ (consignes IA)
collecte/      scripts Python : collecte, dédoublonnage, IA, écriture des JSON
data/          mémoire du site (JSON commités) : jours/, recaps/, indicateurs, fils rouges, statut
contrat/       exemples de référence de chaque fichier JSON + description des champs
site/          HTML + JS natif (modules ES) + Tailwind v4 compilé
tests/         tests automatiques (garde-fous)
.github/workflows/  mises à jour planifiées et publication
```

## Commandes utiles
- Dépôt GitHub : `Gaaabbb444/Morning-Market` (le dossier local s'appelle `Morning-dashboard`).
- Installer : `python -m venv .venv` puis `.venv\Scripts\python -m pip install -r requirements.txt`
- Lancer une mise à jour : `.venv\Scripts\python -m collecte.principal` (option `--type matin|fin-de-matinee|manuel`)
- Tests : `.venv\Scripts\python -m pytest -q`
- `tmp/collecte-AAAA-MM-JJ.json` : articles regroupés du jour, avec chapôs → jamais commité.
- Sous Windows, lancer Python avec `-X utf8` pour les scripts ponctuels (sinon erreurs d'accents dans la console).
