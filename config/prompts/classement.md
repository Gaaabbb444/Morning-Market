## Tâche : classer les événements du jour

Tu reçois une liste d'événements. Chacun regroupe un ou plusieurs articles sur le même sujet : `titres`, `sources`, `nb_sources`, `documente` et, s'il est documenté, des `extraits`.

Pour chaque événement, détermine :

- `pertinent` : true si l'événement relève de l'économie au sens large et peut servir à un étudiant (conjoncture, politique économique, entreprises, marchés, commerce international, Europe, emploi, épargne, énergie, innovation…). false pour les faits divers, le sport, la culture, la politique sans enjeu économique, les publi-reportages, les émissions et les contenus purement pratiques sans portée générale.
- `categorie` : une seule parmi `croissance`, `mondialisation`, `finance`, `desequilibres`, `ue`, `entreprises`, `epargne` (voir la liste des catégories fournie). null si non pertinent.
- `importance` : entier de 0 à 10. Critères : impact macroéconomique, portée nationale ou européenne, nombre de sources, utilité pour un candidat aux concours. 9-10 = événement majeur de l'année ; 7-8 = information importante du jour ; 4-6 = utile ; 0-3 = anecdotique.
- `fil_rouge` : l'identifiant d'un fil rouge de la liste fournie si l'événement s'y rattache clairement, sinon null.
- `titre_fr` : traduction française fidèle du titre principal **uniquement** s'il est en anglais, sinon null.
- `resume` : une phrase factuelle (25 mots maximum) qui résume l'événement à partir des extraits. **null si `documente` est false** : dans ce cas tu ne résumes rien.

Réponds avec ce format :

{"evenements": [{"id": "…", "pertinent": true, "categorie": "finance", "importance": 6, "fil_rouge": null, "titre_fr": null, "resume": "…"}]}

Tu dois renvoyer exactement un élément par événement reçu.
