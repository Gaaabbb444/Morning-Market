# Cahier des charges — Morning Dashboard (nom provisoire)

> **À Claude Code :** ce document est le brief complet du projet. Lis-le en entier, puis passe en **mode plan** : propose-moi l'architecture et le découpage en phases avant d'écrire du code. Ne commence aucune phase sans mon accord explicite.

---

## 0. Qui je suis et comment travailler avec moi

- Je m'appelle Gab, étudiant en L3 AES (parcours AEI). Je prépare les concours AST2 d'écoles de commerce et je vise la gestion de patrimoine.
- **Je n'ai jamais codé.** Je délègue toute la réalisation. Je travaille sous **Windows**.
- Règles de collaboration :
  1. Avance **phase par phase**. À la fin de chaque phase : résume en français simple ce qui a été fait, dis-moi exactement comment tester (commandes à copier-coller, quoi regarder), puis **attends mon « OK »** avant la phase suivante.
  2. Ne me demande jamais de modifier du code à la main. Si une action ne peut être faite que par moi (créer un compte, cliquer dans une interface GitHub), donne-moi des étapes numérotées, précises, sans jargon.
  3. Quand tu fais un choix technique, explique-le en une ou deux phrases compréhensibles par un non-développeur.
  4. Code commenté en français, noms de variables explicites.
  5. Un commit Git propre à la fin de chaque phase validée.
  6. **Vérifie toujours la documentation actuelle** (limites gratuites, noms de modèles, URL de flux, identifiants de séries statistiques) au lieu de te fier à ta mémoire. Les valeurs données dans ce document sont des pistes à vérifier, pas des vérités.
  7. Dès le début, crée un `CLAUDE.md` **court** (règles de travail + commandes utiles + structure du projet). Ce cahier des charges reste dans le dépôt comme référence ; ne le recopie pas dans `CLAUDE.md`.

## 1. Objectif du projet

Un tableau de bord web consulté **chaque matin vers 7 h et vers 11 h**, qui me donne **en 5 minutes** l'essentiel de l'actualité économique, et qui construit au fil des jours une **mémoire structurée de l'année économique**.

Usages :
- Nourrir mes copies et mes oraux : épreuve de synthèse, entretien de motivation, culture économique des écoles, cours de TEJM.
- Servir aussi à quelques camarades de classe.
- Être montré aux jurys (lien sur mon CV) comme preuve de proactivité et de sens de l'organisation.

**Priorité absolue de la V1 :** accéder simplement et rapidement aux informations les plus importantes du jour.

**Critère de réussite :** dans deux mois, je l'utilise tous les jours, mes camarades aussi, et je le trouve toujours aussi beau.

## 2. Contraintes non négociables

- **Coût zéro.** Aucun service payant, aucune carte bancaire, aucun essai gratuit limité dans le temps.
- **Aucune IA appelée depuis le navigateur.** Toute l'intelligence tourne en amont (GitHub Actions) ; le site ne lit que des fichiers JSON statiques déjà calculés.
- **Robustesse :** si une source, une donnée ou l'IA tombe en panne, le site continue d'afficher la dernière version valide avec une mention discrète (« données du JJ/MM »). Ne jamais écraser de bonnes données par des données vides.
- **Respect du droit de la presse :** on stocke et affiche uniquement titre original, source, date, lien vers l'article et un court résumé rédigé par l'IA à partir du chapô du flux RSS. Pas de récupération du texte intégral des articles, pas de contournement de paywall. Source toujours visible.
- Site en **français**, **desktop d'abord** (lisible correctement sur mobile, sans plus pour l'instant).
- Ajouter `<meta name="robots" content="noindex">` : le site est accessible par lien mais n'a pas vocation à être référencé.

## 3. Architecture technique retenue

| Brique | Choix | Raison |
|---|---|---|
| Hébergement | **GitHub Pages**, dépôt **public** | Gratuit ; le dépôt public est la condition de la gratuité des Pages. Il ne contient que des titres, liens et résumés, rien de personnel. |
| Automatisation | **GitHub Actions** (planifié + déclenchement manuel `workflow_dispatch`) | Gratuit sur dépôt public. |
| Collecte | Script **Python** (feedparser, requests, rapidfuzz pour le dédoublonnage) | Simple et éprouvé. |
| IA de synthèse | **GitHub Models** en priorité (API compatible OpenAI, authentification par le `GITHUB_TOKEN` du workflow avec `permissions: models: read`, donc aucune clé à créer) ; **Gemini (palier gratuit, modèles Flash)** en secours optionnel via un secret `GEMINI_API_KEY` ; **mode dégradé sans IA** en dernier recours (classement par mots-clés) | Gratuit. Code indépendant du fournisseur : modèle et fournisseur configurables dans un fichier `config`. |
| Front-end | **HTML + Tailwind CSS v4 compilé** via le CLI officiel dans le workflow (pas le CDN, réservé au prototypage) + **JavaScript natif** (modules ES), aucun framework | Léger, rapide, durable. |
| Graphiques | Mini-courbes (sparklines) en **SVG généré en JS**, sans bibliothèque | Léger. |
| Favoris | `localStorage` (propre à chaque navigateur) + boutons **exporter / importer** en JSON | Chaque camarade a ses favoris ; l'export évite de les perdre. |

**Points d'attention à intégrer :**
- Limites gratuites de GitHub Models (à revérifier dans la doc) : de l'ordre de 50 requêtes/jour pour les modèles « High » et 150/jour pour les « Low », avec environ 8 000 jetons en entrée par requête. Il faut donc **traiter les articles par lots**, réserver le modèle « High » aux synthèses et utiliser un modèle « Low » pour le classement. Gérer les erreurs 429 (attente puis nouvel essai, puis bascule sur le secours).
- Les horaires `cron` de GitHub Actions sont en **UTC** et peuvent être retardés en période de charge. Planifier à des minutes « non rondes » : `7 4 * * *` (≈ 5 h 07 l'hiver, 6 h 07 l'été à Paris) et `23 8 * * *` (≈ 9 h 23 l'hiver, 10 h 23 l'été).
- Sur un dépôt public, les workflows planifiés se désactivent après 60 jours sans activité. Les commits quotidiens de données devraient suffire à l'éviter ; vérifie-le et prévois un garde-fou si nécessaire.
- Utiliser un `concurrency group` pour éviter que deux exécutions écrivent en même temps.
- Un fichier `data/statut.json` enregistre à chaque exécution l'état de chaque source, des indicateurs et de l'IA. Le site affiche l'heure de dernière mise à jour.

## 4. Les sources

### 4.1 Flux RSS (candidats à tester)

Au début de la phase 1, **teste chaque flux** (répond-il ? contient-il des articles récents avec un chapô ?) et donne-moi un tableau de résultats. Remplace les flux morts par des équivalents. URL indicatives :

- Le Monde Économie : `https://www.lemonde.fr/economie/rss_full.xml`
- Le Figaro Économie : `https://www.lefigaro.fr/rss/figaro_economie.xml`
- franceinfo Économie : `https://www.francetvinfo.fr/economie.rss`
- Les Echos : flux natif incertain. Chercher l'URL actuelle ; à défaut, utiliser une recherche Google News RSS limitée au site (`news.google.com/rss/search?q=site:lesechos.fr+when:1d&hl=fr&gl=FR&ceid=FR:fr`).
- Autres titres à évaluer : La Tribune, BFM Business, Capital, Alternatives Économiques, L'Opinion.
- Institutionnels : communiqués de la BCE, INSEE, Banque de France, economie.gouv.fr.
- International (résumés produits en français) : BBC Business, The Guardian Business.

Objectif de volume : collecter largement (100 à 200 entrées/jour), **afficher peu**. Dédoublonner les articles qui traitent du même événement et compter le nombre de sources qui le couvrent (signal d'importance).

### 4.2 Indicateurs chiffrés (indispensables)

Chaque indicateur affiche : valeur, variation, **date de la donnée**, source, mini-courbe sur 30 jours (ou 12 mois pour les données mensuelles). Les données mensuelles ou trimestrielles sont clairement étiquetées avec leur période (« sept. 2026 »).

Sources gratuites sans clé, identifiants **à vérifier** :
- **API de la BCE** (`data-api.ecb.europa.eu`, ouverte, sans clé) : EUR/USD (`EXR.D.USD.EUR.SP00.A`), taux de la facilité de dépôt (`FM.D.U2.EUR.4F.KR.DFR.LEV`), inflation IPCH zone euro (`ICP.M.U2.N.000000.4.ANR`) et France (`ICP.M.FR.N.000000.4.ANR`), taux à 10 ans France (`IRS.M.FR.L.L40.CI.0000.EUR.N.Z`, mensuel).
- **Eurostat** (API ouverte) : chômage France, croissance trimestrielle du PIB France.
- **Marchés quotidiens** : CAC 40, Euro Stoxx 50, S&P 500, Brent, or, via `yfinance` (non officiel, donc fragile) avec une source de secours gratuite et, en dernier recours, la dernière valeur connue.

Historiser toutes les valeurs dans `data/indicateurs.json` pour alimenter les courbes.

## 5. Le contenu et le « cerveau »

### 5.1 Catégories (alignées sur mes cours)

1. Croissance, innovation et transition écologique
2. Mondialisation et commerce international
3. Finance, marchés et banques centrales
4. Déséquilibres : emploi, inflation, inégalités, dette et déficits
5. Union européenne
6. Entreprises et secteurs
7. Épargne et patrimoine

### 5.2 Édition du jour

- **L'essentiel en 3 phrases** : la synthèse lisible en 30 secondes.
- **Top 5 du jour**, choisi par l'IA selon des critères explicites : impact macroéconomique, portée nationale ou européenne, nombre de sources, utilité pour un candidat en concours. Pour chaque info :
  - le **titre original de l'article, toujours affiché en premier** (il donne immédiatement la couleur) ;
  - **Les faits** (1 à 2 phrases) ;
  - **L'analyse** (1 à 2 phrases : mécanismes, enjeux) ;
  - **Pour tes copies** (une phrase : quel thème de dissertation ou de cours cette info peut illustrer) ;
  - source, lien, catégorie, nombre de sources.
- **Par catégorie** : 3 à 5 autres articles maximum, titre + une phrase.
- Le second passage de la journée (fin de matinée) **ajoute** les nouvelles informations et ne remplace le Top 5 que si un événement majeur survient.

### 5.3 La mémoire (le cœur du projet)

La mémoire doit commencer à s'accumuler **dès le premier déploiement**, même si les pages qui l'exploitent arrivent plus tard.

- **Fils rouges** (`data/fils-rouges.json`) : les grands sujets suivis dans la durée (exemples : « Budget de la France », « Politique monétaire de la BCE », « Droits de douane américains »). Chaque jour, l'IA reçoit l'état actuel des fils + les infos du jour et : ajoute des événements datés avec liens, met à jour un paragraphe « Où en est-on ? », ouvre de nouveaux fils ou en clôt. Limiter à environ 15 fils actifs.
- **Récapitulatif hebdomadaire** (chaque dimanche) et **mensuel** (le 1er du mois), générés à partir des éditions quotidiennes, pas des articles bruts.
- **Archives** : une édition par jour (`data/jours/AAAA-MM-JJ.json`), conservées indéfiniment. Un index léger permet une recherche plein texte côté navigateur.
- **Rétrospective** : une frise chronologique de l'année filtrable par fil rouge et par catégorie, pensée pour réviser « les grands événements économiques de l'année » avant les oraux.

### 5.4 Concept du jour

- Un concept économique **lié à l'actualité du jour** : définition rigoureuse, lien avec l'info, et une phrase sur la manière de le mobiliser dans une copie.
- Concepts choisis dans un référentiel (`data/concepts.json`, niveau licence éco-gestion), sans répétition récente.
- Les concepts s'accumulent dans un **glossaire** consultable.

### 5.5 Citations (sans jamais remplacer le titre)

Règle d'or : **aucune citation inventée ni mal attribuée.**
- **Citation de l'actu** : une phrase entre guillemets prononcée par un acteur et présente dans le texte d'un flux RSS. L'IA peut proposer la citation, mais le code vérifie qu'elle apparaît **mot pour mot** dans le texte source ; sinon elle est rejetée. Affichage : citation, auteur, lien vers l'article.
- **Citation d'économiste** : fichier `data/citations.json` avec auteur, œuvre, année et un champ `verifiee` (false par défaut). Ne propose que des citations très documentées, avec référence précise. Seules les citations marquées `verifiee: true` s'affichent ; explique-moi comment les vérifier rapidement.

## 6. Design

### 6.1 Direction artistique

- **Mode sombre par défaut**, bascule clair/sombre mémorisée.
- **Bento Grid** : grille asymétrique, coins très arrondis, rendu sobre et premium façon Apple, avec l'esprit des terminaux financiers modernes.
- **Glassmorphism** : fonds semi-transparents, flou d'arrière-plan, bordures fines et lumineuses. Prévoir un arrière-plan avec des dégradés doux et légèrement animés, sinon l'effet de verre ne se voit pas.
- Identité **originale et distincte** de mes projets précédents (pas de style néon). Une seule couleur d'accent ; vert et rouge réservés aux variations de marché.
- Typographie : une sans-serif moderne pour le texte, une police à chiffres tabulaires pour les données.
- Contrastes lisibles dans les deux modes. Respecter `prefers-reduced-motion`.

### 6.2 Structure de la page d'accueil (à affiner)

- En-tête : date, heure de mise à jour, recherche, filtres par catégorie, bascule de thème.
- Grande tuile : L'essentiel en 3 phrases + Top 5.
- Tuile : indicateurs avec mini-courbes.
- Tuile : fils rouges (sujets actifs et dernière évolution).
- Tuiles : concept du jour, citation du jour.
- Tuiles par catégorie.
- Tuiles : récap de la semaine, mes favoris.

Autres pages : Archives (calendrier), Fils rouges, Rétrospective, Glossaire, Favoris, **Méthodologie** (explique au jury comment fonctionne l'outil : sources, automatisation, rôle de l'IA, limites, garde-fous anti-erreurs).

### 6.3 Interactions

- Filtres par catégorie qui affichent ou masquent les tuiles avec une transition fluide.
- Léger zoom au survol des cartes.
- Clic sur une carte : **fenêtre modale** avec le contenu détaillé (faits, analyse, pour tes copies, lien source, infos liées du même fil rouge, bouton favori). Fermeture par Échap, clic à l'extérieur ou bouton.
- Favoris : étoile sur chaque info, page dédiée, export/import.

**Validation visuelle :** avant de brancher les vraies données, produis la page avec un JSON d'exemple réaliste et montre-moi le rendu. Je dois valider le design avant la suite.

## 7. Phases proposées (à confirmer dans ton plan)

1. **Installation et vérifications** : outils nécessaires sur mon PC Windows (Git, Python, Node), compte GitHub, création du dépôt. Me demander le nom définitif du site.
2. **Collecte** : flux RSS testés, indicateurs, dédoublonnage, écriture des JSON. Sans IA.
3. **Couche IA** : classement, Top 5, résumés, concept, citations vérifiées, fils rouges, mode dégradé.
4. **Front-end V1** : page d'accueil Bento + glassmorphism avec données d'exemple, puis réelles. Validation du design.
5. **Mise en ligne** : workflow GitHub Actions planifié + déploiement Pages. **→ V1 en ligne, la mémoire commence à s'accumuler.**
6. **Interactions** : thème, filtres, modales, favoris, recherche.
7. **Mémoire exploitée** : archives, fils rouges, rétrospective, glossaire, récaps hebdo et mensuel.
8. **Finitions** : page Méthodologie, README pédagogique (comment ça marche, comment relancer une mise à jour à la main, quoi faire si quelque chose casse), relecture générale.

Objectif : atteindre l'étape 5 **le plus vite possible**, car chaque jour sans mise en ligne est un jour de mémoire perdu.

## 8. Définition de « terminé » pour la V1

- Le site est en ligne sur une URL GitHub Pages.
- Il se met à jour seul deux fois par jour sans intervention.
- La page d'accueil affiche l'essentiel, le Top 5, les indicateurs et les catégories, dans le design validé.
- Une panne de source ou d'IA ne casse pas le site.
- Les fils rouges et les archives commencent à se remplir.
- Le README m'explique comment tout fonctionne.
