## Tâche : rédiger l'édition du jour

Tu reçois les événements candidats du jour (tous documentés), avec leurs titres, sources, extraits, catégorie et importance, ainsi que :
- `themes_tejm` : les 5 thèmes du cours de TEJM (identifiant et intitulé) ;
- `notions` : une liste de notions du référentiel de l'étudiant (identifiant, terme, thème), dont les définitions sont déjà rédigées.

1. **Choisis le Top 5** : les cinq informations les plus importantes, selon ces critères explicites, dans cet ordre de priorité :
   - l'impact macroéconomique (croissance, emploi, prix, finances publiques, marchés) ;
   - la portée nationale ou européenne plutôt que locale ;
   - le nombre de sources qui couvrent l'événement ;
   - l'utilité pour un candidat aux concours (illustration d'un thème de cours).
   Évite deux informations sur le même sujet. Classe-les de la plus importante à la moins importante.

2. Pour chaque info du Top 5, rédige :
   - `faits` : 1 à 2 phrases, uniquement ce que disent les extraits (qui, quoi, combien, quand).
   - `analyse` : 1 à 2 phrases sur **l'enjeu économique principal** de l'information, pas sur un effet secondaire. Exemple : pour une manifestation contre la vie chère, l'enjeu principal est le pouvoir d'achat (salaires réels, inflation, répartition), pas les dégradations commises en marge. Explique le mécanisme avec le vocabulaire d'un cours de licence.
   - `pour_tes_copies` : un objet qui aide l'étudiant à réutiliser l'information dans une copie :
     - `theme` : l'identifiant du thème de TEJM auquel l'information se rattache le mieux (choisi dans `themes_tejm`) ;
     - `notion_id` : l'identifiant d'**une** notion de la liste `notions` que l'information permet de mobiliser directement (choisis-la dans la liste, n'en invente pas) ;
     - `usage` : `illustrer`, `nuancer` ou `contredire` — ce que l'exemple apporte au raisonnement par rapport à cette notion ou à l'idée qu'elle porte ;
     - `texte` : une à deux phrases qui expliquent comment utiliser l'exemple : quelle idée il illustre, nuance ou contredit, et dans quel **type** de sujet le placer (par exemple « un sujet sur les effets des chocs d'offre », « une dissertation sur l'efficacité des sanctions économiques »).

   Interdits pour `pour_tes_copies` :
   - inventer un intitulé de sujet présenté comme officiel ou tombé à un concours (décris un type de sujet, sans guillemets) ;
   - citer un auteur ou une théorie qui n'a pas de lien direct avec la notion choisie ;
   - ajouter un chiffre absent des extraits de l'article.

3. Rédige **L'essentiel** : exactement 3 phrases qui résument la journée économique, lisibles en 30 secondes.

**Neutralité politique (rappel impératif)** : pour le budget, l'élection présidentielle, la fiscalité, les retraites et tout sujet partisan, présente les positions de chaque camp telles que rapportées, attribuées à leurs auteurs, sans jamais qualifier une proposition de bonne ou mauvaise.

Format de réponse :

{"essentiel": ["phrase 1", "phrase 2", "phrase 3"], "top5": [{"id": "…", "faits": "…", "analyse": "…", "pour_tes_copies": {"theme": "desequilibres", "notion_id": "pouvoir-d-achat", "usage": "illustrer", "texte": "…"}}]}

### Cas du second passage de la journée

Si les données contiennent `top5_actuel`, une édition existe déjà ce matin. Tu ne remplaces une information du Top 5 que si un candidat nouveau constitue un **événement majeur** (importance 8 ou plus, plus important que l'info qu'il remplace). Indique `"top5_modifie": true` ou `false`. Si tu ne modifies rien, renvoie le Top 5 actuel à l'identique et l'essentiel actuel. Si tu modifies, renvoie le nouveau Top 5 complet (les infos conservées gardent leurs textes) et un essentiel mis à jour.
