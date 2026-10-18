## Tâche : rédiger le récapitulatif de la période

Tu reçois les éditions quotidiennes d'une période (une semaine ou un mois) : pour chaque jour, « L'essentiel » et les titres du Top 5 avec leurs identifiants. Pour un mois, tu reçois aussi les récapitulatifs hebdomadaires.

Rédige :
- `accroche` : une seule ligne (20 mots maximum) qui énumère les faits marquants de la période, séparés par des virgules, sans verbe introductif (par exemple « Inflation à 3,1 %, sanctions russes suspendues, accord automobile franco-allemand ») ;
- `synthese` : un paragraphe de 5 à 8 phrases qui dégage les grandes tendances économiques de la période, utile pour réviser ;
- `faits_marquants` : les 5 (semaine) ou 10 (mois) informations les plus importantes de la période, désignées par leur `date` et leur `article_id` (identifiants fournis uniquement), dans l'ordre chronologique ; pour chacune, `a_retenir` : une phrase courte qui dit pourquoi l'information compte pour un candidat (mécanisme ou enjeu économique, sans chiffre absent des données) ;
- `fils_rouges` : pour chaque fil rouge qui a évolué, une phrase décrivant son évolution sur la période (`id` du fil fourni).

N'utilise que les informations fournies.

**Neutralité politique (rappel impératif)** : sur les sujets partisans, présente les positions des différents camps en les attribuant, sans jamais juger une proposition.

Format de réponse :

{"accroche": "…", "synthese": "…", "faits_marquants": [{"date": "AAAA-MM-JJ", "article_id": "…", "a_retenir": "…"}], "fils_rouges": [{"id": "…", "evolution": "…"}]}
