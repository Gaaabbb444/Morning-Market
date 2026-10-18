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
- Sources sans chapô (Les Echos via Google News, BCE) : aucun texte IA au-delà du titre (traduit si anglais), jamais au Top 5 sans confirmation par une source avec chapô. Appliqué par `collecte/regles.py`, couvert par `tests/test_regle_sans_chapo.py`.
- Neutralité politique dans tous les prompts (`config/prompts/regles-communes.md`) : positions de chaque camp, jamais de jugement.
- IA : GitHub Models est fermé depuis le 30/07/2026. Fournisseurs compatibles OpenAI configurés dans `config.yaml` (Gemini, Groq) ; clés dans les secrets GitHub et, en local, dans `.env` (jamais commité). Sans clé : mode dégradé.

## Plan des phases
1–4 terminées (fondations, collecte, IA et mémoire, mise en ligne automatique).
**Phase 5 (en cours) — site final d'après la maquette validée**, qui absorbe les anciennes phases 6 (interactions) et 7 (pages mémoire). Livraison par lots (1 à 4 en ligne) ; chaque lot : captures Playwright côte à côte maquette/site (1280 et 1440 px, sombre et clair), validation de Gab, puis mise en ligne.
- Lot 1 : fondations (jetons Tailwind, Manrope auto-hébergée, composants) + accueil + modale + états (données anciennes, indicateur indisponible, sans IA) + thème.
- Lot 2 : Marchés (courbes) + Fils rouges (liste, détail).
- Lot 3 : Catégories + Recherche + Favoris (export/import, état vide).
- Lot 4 : Glossaire (+ « Dans une copie » pour 122 concepts, `glossaire-usages.json`) + Archives (calendrier, édition passée, rétrospective) + accroche des récaps.
- Lot 5 : Méthodologie (auteur « Gabriel Tillet », aucun e-mail ; lien LinkedIn seulement si Gab le fournit) + passe mobile et accessibilité.
Phase 8 : README pédagogique et relecture générale.

Référence visuelle : `Maquette/Morning Market.html` (pages emboîtées : prototype, « Spécifications », 34 écrans à 1440 px). Les Spécifications priment ; aucune valeur d'exemple écrite en dur ; animations sur transform et opacity uniquement, pas de flou d'arrière-plan, respect de prefers-reduced-motion.
Décisions validées (phase 5) : filtres de l'accueil = Tout + catégories ayant au moins une info ce jour-là (masquer les vides, une seule ligne à 1280 px) ; glossaire filtré par thèmes de TEJM + « Marchés et épargne » ; rétrospective alimentée par les faits marquants des récaps (aucun événement inventé) ; citation d'économiste sous la citation de l'actu si vérifiée ; modale d'un article hors Top 5 = résumé + autres sources ; mobile = barre de navigation en bas. Relecture des concepts : d'abord ceux déjà utilisés dans « Pour tes copies », par lots de 10.

## Structure
```
config/        réglages (catégories, sources, modèles IA) + prompts/ (consignes IA)
collecte/      scripts Python : flux, indicateurs, dédoublonnage, ia (client), regles (garde-fous éditoriaux),
               edition (Top 5, catégories, concept, citations), fils_rouges, memoire (récaps, index), principal
data/          mémoire du site (JSON commités) : jours/, recaps/, indicateurs, fils rouges, statut
contrat/       exemples de référence de chaque fichier JSON + description des champs
site/          HTML + JS natif (modules ES) + Tailwind v4 compilé
tests/         tests automatiques (garde-fous)
.github/workflows/  mises à jour planifiées et publication
```

## Commandes utiles
- Dépôt GitHub : `Gaaabbb444/Morning-Market` (le dossier local s'appelle `Morning-dashboard`).
- Installer : `python -m venv .venv` puis `.venv\Scripts\python -m pip install -r requirements.txt`
- Lancer une mise à jour : `.venv\Scripts\python -m collecte.principal` (options `--type matin|fin-de-matinee|manuel`, `--refaire` pour reconstruire l'édition du jour au lieu de la compléter)
- Tests : `.venv\Scripts\python -m pytest -q`
- Site (phase 5) : sources dans `site/` (HTML, `js/` modules ES, `src/style.css` = Tailwind v4, jetons définis une seule fois). Outils de développement : `.venv\Scripts\python -m pip install -r requirements-dev.txt` puis `.venv\Scripts\python -m playwright install chromium`, et l'exécutable Tailwind dans `outils/` (téléchargé, non commité).
- Aperçu local : `.venv\Scripts\python outils\apercu.py` (vraies données) ou `--jeu base|donnees-anciennes|indicateur-indisponible|sans-ia|filtres-pire-cas|retrospective` (jeux figés du 18/10 dans `tests/visuel/`, URL avec `?maintenant=2026-10-18T13:30`).
- Vérification visuelle : `outils\captures.py` (maquette / site côte à côte dans `tmp/captures/`) ; interactions et robustesse : `outils\verifier_interactions.py` ; accessibilité (axe-core, WCAG 2.2 AA, toutes les pages, 2 thèmes, ordinateur et téléphone) : `outils\verifier_accessibilite.py`.
- Site : https://gaaabbb444.github.io/Morning-Market/ (GitHub Pages, source « GitHub Actions »).
- Workflow `.github/workflows/mise-a-jour.yml` : 4:07 et 8:23 UTC + manuel ; commit des données par le bot, puis publication. Lancer : `gh workflow run mise-a-jour.yml` ; suivre : `gh run list --limit 3`. Toujours `git pull` avant de travailler (le bot commite `data/`).
- Runner figé **temporairement** sur `ubuntu-24.04` (migration ubuntu-latest → Ubuntu 26 le 19/10/2026) : à mettre à jour avant le retrait annoncé de 24.04 (surveiller github.com/actions/runner-images et les avertissements des exécutions). Noté aussi dans le README.
- Passage « matin » : reconstruit l'édition du jour si elle n'a été créée que par un lancement manuel ; les articles de l'édition précédente ne sont jamais republiés.
- Les serveurs GitHub sont aux USA : vérifier toute nouvelle source depuis une exécution en ligne (ex. le Guardian redirigeait vers l'édition US).
- `tmp/collecte-AAAA-MM-JJ.json` : articles regroupés du jour, avec chapôs → jamais commité.
- Sous Windows, lancer Python avec `-X utf8` pour les scripts ponctuels (sinon erreurs d'accents dans la console).
