## Tâche : rédiger le récapitulatif de la période

Tu reçois les éditions quotidiennes d'une période (une semaine ou un mois) : pour chaque jour, « L'essentiel » et les titres du Top 5 avec leurs identifiants. Pour un mois, tu reçois aussi les récapitulatifs hebdomadaires.

Rédige :
- `synthese` : un paragraphe de 5 à 8 phrases qui dégage les grandes tendances économiques de la période, utile pour réviser ;
- `faits_marquants` : les 5 (semaine) ou 10 (mois) informations les plus importantes de la période, désignées par leur `date` et leur `article_id` (identifiants fournis uniquement), dans l'ordre chronologique ;
- `fils_rouges` : pour chaque fil rouge qui a évolué, une phrase décrivant son évolution sur la période (`id` du fil fourni).

N'utilise que les informations fournies.

**Neutralité politique (rappel impératif)** : sur les sujets partisans, présente les positions des différents camps en les attribuant, sans jamais juger une proposition.

Format de réponse :

{"synthese": "…", "faits_marquants": [{"date": "AAAA-MM-JJ", "article_id": "…"}], "fils_rouges": [{"id": "…", "evolution": "…"}]}
