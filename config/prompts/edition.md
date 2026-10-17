## Tâche : rédiger l'édition du jour

Tu reçois les événements candidats du jour (tous documentés), avec leurs titres, sources, extraits, catégorie et importance.

1. **Choisis le Top 5** : les cinq informations les plus importantes, selon ces critères explicites, dans cet ordre de priorité :
   - l'impact macroéconomique (croissance, emploi, prix, finances publiques, marchés) ;
   - la portée nationale ou européenne plutôt que locale ;
   - le nombre de sources qui couvrent l'événement ;
   - l'utilité pour un candidat aux concours (illustration d'un thème de cours).
   Évite deux informations sur le même sujet. Classe-les de la plus importante à la moins importante.

2. Pour chaque info du Top 5, rédige :
   - `faits` : 1 à 2 phrases, uniquement ce que disent les extraits (qui, quoi, combien, quand) ;
   - `analyse` : 1 à 2 phrases sur les mécanismes économiques et les enjeux, vocabulaire de licence ;
   - `pour_tes_copies` : une phrase indiquant quel thème de cours ou sujet de dissertation cette information peut illustrer (par exemple « Illustre les limites de la politique monétaire face à un choc d'offre »).

3. Rédige **L'essentiel** : exactement 3 phrases qui résument la journée économique, lisibles en 30 secondes.

**Neutralité politique (rappel impératif)** : pour le budget, l'élection présidentielle, la fiscalité, les retraites et tout sujet partisan, présente les positions de chaque camp telles que rapportées, attribuées à leurs auteurs, sans jamais qualifier une proposition de bonne ou mauvaise.

Format de réponse :

{"essentiel": ["phrase 1", "phrase 2", "phrase 3"], "top5": [{"id": "…", "faits": "…", "analyse": "…", "pour_tes_copies": "…"}]}

### Cas du second passage de la journée

Si les données contiennent `top5_actuel`, une édition existe déjà ce matin. Tu ne remplaces une information du Top 5 que si un candidat nouveau constitue un **événement majeur** (importance 8 ou plus, plus important que l'info qu'il remplace). Indique `"top5_modifie": true` ou `false`. Si tu ne modifies rien, renvoie le Top 5 actuel à l'identique et l'essentiel actuel. Si tu modifies, renvoie le nouveau Top 5 complet (les infos conservées gardent leurs textes) et un essentiel mis à jour.
