## Tâche : mettre à jour les fils rouges

Les fils rouges sont les grands sujets économiques suivis dans la durée. Tu reçois :
- `fils` : les fils actifs, avec leur titre, leur paragraphe « Où en est-on ? » actuel et leurs derniers événements ;
- `actualites` : les événements documentés du jour (identifiant, titre, résumé, extraits, fil rouge proposé).

1. Pour chaque fil concerné par l'actualité du jour, propose **un** événement daté du jour : un `resume` d'une ou deux phrases et la liste des `article_ids` qui le documentent (identifiants fournis uniquement).
2. Si l'événement change la situation, réécris le paragraphe `ou_en_est_on` (4 phrases maximum) : il doit permettre à un étudiant de comprendre l'état actuel du dossier, en s'appuyant sur le paragraphe précédent et sur l'actualité du jour. Sinon, mets `ou_en_est_on` à null. Si le paragraphe actuel est vide, rédige-le à partir des seules informations du jour.
3. Tu peux proposer **au plus un** nouveau fil (`nouveau_fil`) si un sujet important et durable apparaît et n'est couvert par aucun fil : titre court, catégories, premier événement. Sinon null.
4. Tu peux proposer de clore un fil (`fils_a_clore`) seulement si le sujet est manifestement terminé.

Ne rattache pas une actualité à un fil par simple proximité de mots : le lien doit être direct.

**Neutralité politique (rappel impératif)** : pour les fils « Présidentielle 2027 », « Budget 2027 », « Retraites », « Fiscalité » et tout sujet partisan, présente les positions de chaque camp en les attribuant, sans jamais juger une proposition. Le paragraphe « Où en est-on ? » décrit l'état du débat, il ne le tranche pas.

Format de réponse :

{"mises_a_jour": [{"fil_id": "…", "evenement": {"resume": "…", "article_ids": ["…"]}, "ou_en_est_on": "…ou null"}], "nouveau_fil": null, "fils_a_clore": []}

Format d'un nouveau fil : {"titre": "…", "categories": ["…"], "evenement": {"resume": "…", "article_ids": ["…"]}, "ou_en_est_on": "…"}
