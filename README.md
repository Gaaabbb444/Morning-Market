# Morning-Market

Tableau de bord économique quotidien : l'essentiel de l'actualité économique en 5 minutes, et une mémoire structurée de l'année.

👉 Site : https://gaaabbb444.github.io/Morning-Market/

> Ce README sera complété en phase 8 (fonctionnement détaillé, relance manuelle, que faire en cas de panne).

## En bref

- Deux fois par jour, GitHub Actions collecte les flux RSS et les indicateurs, fait rédiger l'édition par l'IA (Gemini, Groq en secours, mode dégradé sans IA en dernier recours), puis publie le site sur GitHub Pages.
- Le site ne fait que lire des fichiers JSON déjà calculés (dossier `data/`).
- Brief complet du projet : [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md).

## Points à surveiller

- **Version d'Ubuntu figée (temporairement).** Le workflow `.github/workflows/mise-a-jour.yml` tourne sur `ubuntu-24.04` et non sur `ubuntu-latest`, pour éviter que le changement de version annoncé par GitHub (Ubuntu 26 à partir du 19 octobre 2026) ne casse la mise à jour le jour du lancement. **Il faudra passer à une version plus récente avant que GitHub ne retire Ubuntu 24.04** : GitHub annonce ces retraits plusieurs mois à l'avance sur https://github.com/actions/runner-images (et par des avertissements dans les exécutions du workflow). Pour changer : remplacer `ubuntu-24.04` par la nouvelle version aux deux endroits du fichier, lancer une exécution manuelle et vérifier qu'elle réussit.
- **Mise en veille après 60 jours.** GitHub peut désactiver les tâches planifiées d'un dépôt public inactif ; le workflow se réactive lui-même à chaque passage. Si les mises à jour s'arrêtent malgré tout : onglet Actions → « Mise à jour et publication » → Enable workflow.
