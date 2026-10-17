# Contrat de données

Ce dossier décrit la **forme exacte** de chaque fichier JSON produit par la collecte et lu par le site. Les scripts Python (qui écrivent) et le site (qui lit) s'y conforment tous les deux, ce qui permet de les faire évoluer séparément. Les exemples sont fictifs.

Règles communes :
- Chaque fichier contient `version_schema` : on l'augmente si le format change.
- Dates au format `AAAA-MM-JJ`, horodatages au format ISO avec fuseau de Paris (`2026-10-19T06:12:00+02:00`).
- Les catégories sont désignées par leur code court défini dans `config/config.yaml` (`croissance`, `mondialisation`, `finance`, `desequilibres`, `ue`, `entreprises`, `epargne`).
- L'`id` d'un article est une empreinte courte de son lien (le même article a donc toujours le même identifiant).
- Les chapôs RSS ne figurent dans **aucun** de ces fichiers (droit de la presse).

| Exemple | Fichier réel | Rôle |
|---|---|---|
| `jour.exemple.json` | `data/jours/AAAA-MM-JJ.json` | L'édition d'un jour : l'essentiel, le Top 5, les articles par catégorie, le concept et les citations du jour. Le passage de fin de matinée complète le fichier du matin (liste `passages`). `mode_ia` : `ia`, `partiel` ou `sans-ia` (mode dégradé : `essentiel`, `faits`, `analyse`, `pour_tes_copies`, `resume` valent `null`). `documente: false` = source sans chapô : seuls `titre` (et `titre_fr` si l'original est en anglais) et le lien sont affichés, jamais de résumé, et l'article ne peut pas être au Top 5. `ids_traites` sert au second passage à repérer les nouveautés. |
| — | `data/jours/index.json` | Liste des dates qui ont une édition (`{"dates": [...]}`, la plus récente d'abord), pour le calendrier des archives. |
| `indicateurs.exemple.json` | `data/indicateurs.json` | Les indicateurs chiffrés avec tout leur historique (pour les mini-courbes). `periode` vaut `AAAA-MM-JJ` (quotidien), `AAAA-MM` (mensuel) ou `AAAA-T3` (trimestriel). `etat` : `ok`, `perimee` (donnée anormalement ancienne), `derniere-valeur` (source en panne : on affiche la dernière valeur connue) ou `indisponible` (jamais récupéré). `variation.type` : `pourcent` (marchés, change) ou `points` (taux). `points_courbe` : nombre de points à afficher dans la mini-courbe (30 pour le quotidien, 12 sinon). |
| `fils-rouges.exemple.json` | `data/fils-rouges.json` | Les grands sujets suivis dans la durée, avec leur chronologie et un paragraphe « Où en est-on ? ». `statut` : `actif` ou `clos`. |
| `statut.exemple.json` | `data/statut.json` | Le bilan de la dernière exécution : état de chaque source (`ok`, `vide` = rien de récent, `erreur`), de chaque indicateur, de l'IA (fournisseurs configurés, nombre de requêtes, erreurs, mode de chaque étape : `ia`, `partiel`, `sans-ia`, `inchange`), et liste des fichiers écrits ou conservés. Le site y lit l'heure de mise à jour et la date de la dernière édition. |
| `concepts.exemple.json` | `data/concepts.json` | Le référentiel des concepts économiques, rédigé à l'avance. `relu` passe à `true` une fois relu par Gab. L'historique des concepts déjà utilisés se déduit des éditions quotidiennes. |
| `citations.exemple.json` | `data/citations.json` | Les citations d'économistes. Seules celles avec `verifiee: true` sont affichées. `traduction` vaut `libre` quand le texte français est une traduction libre de `texte_original`. `ou_verifier` indique où retrouver la phrase exacte. |
| `recap.exemple.json` | `data/recaps/semaine-AAAA-Wnn.json` et `data/recaps/mois-AAAA-MM.json` | Les récapitulatifs hebdomadaires (dimanche) et mensuels (le 1er), construits à partir des éditions quotidiennes. `libelle` est le titre affiché (« Semaine du 19 au 25 octobre 2026 »). |
| `index-recherche.exemple.json` | `data/index-recherche.json` | Index léger de tous les articles retenus, pour la recherche plein texte dans le navigateur. Clés d'une lettre pour garder le fichier petit. |
