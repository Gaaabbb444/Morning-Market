// Page « Méthodologie » : d'où viennent les informations, comment elles sont traitées, ce que l'outil ne fait pas.
// Les faits susceptibles de changer (médias suivis, modèles d'IA, horaires, sources des indicateurs)
// sont lus dans reglages-site.json, publié à partir de config.yaml : la page reste exacte si la configuration change.

import { html, dateLongue } from "./outils.js";

const AUTEUR = "Gabriel Tillet";
const DATE_REDACTION = "2026-10-18"; // date de la dernière révision de ce texte
const MOTS_PAR_MINUTE = 230;

export const SECTIONS = [
  { id: "pourquoi", titre: "Pourquoi cet outil" },
  { id: "sources", titre: "Les sources" },
  { id: "mise-a-jour", titre: "La mise à jour automatique" },
  { id: "ia", titre: "Le rôle de l'IA" },
  { id: "garde-fous", titre: "Les garde-fous contre les erreurs" },
  { id: "limites", titre: "Les limites" },
];

/** « A, B et C » */
function enumerer(elements) {
  if (elements.length <= 1) return elements.join("");
  return `${elements.slice(0, -1).join(", ")} et ${elements[elements.length - 1]}`;
}

/** « 04:07 » (UTC) → « 6 h 07 » à l'heure de Paris, pour la date donnée (heure d'été ou d'hiver). */
function heureParis(utc, date) {
  const [h, m] = utc.split(":").map(Number);
  const [a, mo, j] = date.split("-").map(Number);
  const parties = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.UTC(a, mo - 1, j, h, m))).map((p) => [p.type, p.value]));
  return `${Number(parties.hour)} h ${parties.minute}`;
}

/** Sources des indicateurs regroupées : « Eurostat : inflation France, … » ; les cotations passent par Yahoo Finance. */
function sourcesIndicateurs(indicateurs) {
  const groupes = new Map();
  for (const i of indicateurs) {
    const [producteur, relais] = i.source.split(", via ");
    const cle = relais ? `via ${relais}` : producteur.split(",")[0];
    if (!groupes.has(cle)) groupes.set(cle, { producteurs: [], noms: [] });
    const g = groupes.get(cle);
    if (relais && !g.producteurs.includes(producteur)) g.producteurs.push(producteur);
    g.noms.push(i.nom);
  }
  return [...groupes].map(([cle, g]) => ({
    source: cle.startsWith("via ") ? `Places de marché (${enumerer(g.producteurs)}), ${cle}` : cle,
    noms: enumerer(g.noms),
  }));
}

export function modeleMethodologie(reglages, dateDuJour) {
  const m = reglages?.methodologie || {};
  const sources = m.sources || [];
  const parType = (type) => sources.filter((s) => s.type === type).map((s) => s.nom);
  const passages = (m.passages_utc || []).map((h) => heureParis(h, dateDuJour));
  return {
    auteur: AUTEUR,
    dateRedaction: dateLongue(DATE_REDACTION),
    presse: enumerer(parType("presse")),
    international: enumerer(parType("international")),
    institutions: enumerer(parType("institution")),
    sansChapo: enumerer(parType("agregateur")),
    nombreMedias: sources.length,
    indicateurs: sourcesIndicateurs(reglages?.indicateurs || []),
    passages: enumerer(passages),
    nombrePassages: passages.length,
    fenetre: m.fenetre_heures,
    redaction: m.modeles_redaction || [],
    classement: m.modeles_classement || [],
  };
}

function texte(m) {
  const modelePrincipal = m.redaction[0];
  const secours = m.redaction.slice(1);
  return html`
    <h2 id="pourquoi">Pourquoi cet outil</h2>
    <p>Préparer un concours d'école de commerce demande de suivre l'actualité économique avec régularité. Les épreuves écrites attendent des exemples précis et récents ; les entretiens supposent de pouvoir commenter un sujet du moment avec recul. Le problème n'est pas l'accès à l'information, abondante et souvent gratuite, mais le temps et le tri : chaque matin, des dizaines d'articles traitent les mêmes sujets sous des angles différents, et il est difficile de savoir ce qui comptera encore dans six mois.</p>
    <p>Morning Market répond à un besoin précis : en cinq minutes, savoir ce qui s'est passé, pourquoi c'est important et comment l'utiliser dans une copie ou un entretien. Il ne cherche pas l'exhaustivité : il sélectionne, hiérarchise et relie l'actualité aux notions du cours. Au fil des jours, il garde aussi la mémoire de l'année : archives des éditions, fils rouges qui suivent un sujet dans la durée, récapitulatifs hebdomadaires et glossaire.</p>
    <p>Il poursuit enfin un objectif d'apprentissage. Construire l'outil a obligé à se poser les questions qu'un analyste se pose au quotidien : quelles sources sont fiables, comment distinguer un fait d'une interprétation, comment présenter une variation sans la déformer. Ces choix sont détaillés dans les parties qui suivent.</p>

    <h2 id="sources">Les sources</h2>
    <p>Les informations proviennent de ${m.nombreMedias} médias et institutions, retenus pour le sérieux et la régularité de leur couverture économique : ${m.presse} pour la presse française${m.international ? `, ${m.international} pour un regard international` : ""}${m.institutions ? `, et les publications officielles (${m.institutions})` : ""}.${m.sansChapo ? ` Pour ${m.sansChapo}, dont les flux ne sont pas accessibles, seuls les titres sont repris, par l'intermédiaire de Google Actualités.` : ""}</p>
    <p>Le programme lit les flux publics (RSS) que les éditeurs mettent à disposition : un titre, une date, un lien et, le plus souvent, un court chapeau de présentation. Ce chapeau sert à rédiger le résumé, puis il est écarté : le site ne conserve que le titre, la source, la date, le lien vers l'article et le résumé rédigé. Les articles complets restent sur le site de leur média, vers lequel chaque info renvoie.</p>
    <p>Les indicateurs chiffrés sont lus directement chez leurs producteurs, sans passer par l'IA :</p>
    <ul>
      ${m.indicateurs.map((g) => html`<li><strong>${g.source}.</strong> ${g.noms}.</li>`)}
    </ul>
    <p>Chaque chiffre est affiché avec sa date et sa source. Les données n'ont pas toutes la même fréquence : un indice boursier est une valeur de clôture quotidienne, alors que l'inflation ou le chômage portent sur un mois, et le PIB sur un trimestre. L'interface le signale à chaque fois, par exemple avec la mention « Période » ou « Moyenne de », pour éviter de comparer des données qui ne sont pas comparables. L'inflation affichée est l'indice des prix harmonisé publié par Eurostat ; l'Insee publie aussi son propre indice des prix à la consommation, qui peut différer de quelques dixièmes. Un article peut donc citer un chiffre légèrement différent de celui du tableau de bord, sans que l'un des deux soit faux.</p>

    <h2 id="mise-a-jour">La mise à jour automatique</h2>
    <p>L'édition est préparée automatiquement ${m.nombrePassages === 2 ? "deux fois par jour" : "chaque jour"} par un programme qui tourne sur les serveurs de GitHub${m.passages ? `. Il démarre à ${m.passages} (heure de Paris) et travaille quelques minutes ; le lancement peut prendre un peu de retard quand ces serveurs sont chargés` : ""}. Le programme collecte les articles publiés ${m.fenetre ? `depuis moins de ${m.fenetre} heures` : "depuis la veille"}, écarte ceux déjà parus dans l'édition précédente, les regroupe lorsqu'ils traitent du même événement, puis récupère les dernières valeurs des indicateurs.</p>
    <p>Ce regroupement est important. Quand plusieurs médias couvrent le même sujet, il s'agit d'un seul événement, et le nombre de sources affiché sur chaque info indique combien de médias l'ont traité. Une info couverte par une seule source n'est pas fausse pour autant, mais elle appelle davantage de prudence.</p>
    <p>La sélection du Top 5 repose sur des critères explicites : l'importance économique de l'événement, notée par l'IA, puis le nombre de sources qui l'ont couvert. Au second passage de la matinée, une info du Top 5 n'est remplacée que par un événement nettement plus important. Une fois la journée passée, l'édition est archivée telle quelle, ce qui permet de retrouver ce que l'outil affichait un jour donné, sans réécriture après coup.</p>
    <p>L'heure de la dernière mise à jour figure en haut de l'accueil. Si une collecte échoue, l'édition précédente reste affichée, avec un bandeau qui le signale, et les données déjà publiées ne sont jamais remplacées par des données vides ou incomplètes : l'outil préfère l'absence d'information à une information incomplète.</p>

    <h2 id="ia">Le rôle de l'IA</h2>
    <p>Un modèle de langage intervient à plusieurs étapes.${modelePrincipal ? ` Le programme s'adresse d'abord à ${modelePrincipal}${secours.length ? ` ; s'il ne répond pas, il se tourne vers ${enumerer(secours)}` : ""}.` : ""} Le modèle classe chaque événement dans une catégorie et estime son importance. Il rédige « L'essentiel » en trois phrases. Il résume chaque info du Top 5 en distinguant « Les faits » et « L'analyse ». Dans la rubrique « Pour tes copies », il rattache l'info à un thème du cours, choisit une notion du glossaire et indique si l'exemple sert à illustrer, nuancer ou contredire une idée. Il choisit aussi le concept du jour, la citation du jour, et rédige les récapitulatifs de la semaine.</p>
    <p>L'IA est utilisée pour ce qu'elle fait bien : condenser un texte, reformuler clairement, rapprocher un fait d'une notion connue. Elle n'est pas utilisée pour ce qu'elle fait mal : produire des chiffres, établir des faits nouveaux ou trancher un débat. Les indicateurs ne passent jamais par le modèle ; ils sont lus directement dans les données sources et affichés tels quels. Le modèle travaille côté serveur, au moment de la mise à jour : le site lui-même n'appelle aucune IA, il affiche des textes déjà rédigés et contrôlés.</p>
    <p>La séparation entre faits et analyse est volontaire. Les faits reprennent ce que rapportent les articles ; l'analyse propose une lecture économique, qui reste une interprétation et peut être discutée. C'est la démarche attendue dans une copie : décrire d'abord, interpréter ensuite. Sur les sujets politiques, comme le budget ou une élection, la consigne est de présenter les positions de chaque camp sans jamais qualifier une proposition de bonne ou de mauvaise.</p>
    <p>Si l'IA est indisponible, le site fonctionne en mode simplifié : les infos sont classées par mots-clés et affichées avec leur titre et leur lien, sans résumé, et un bandeau le signale.</p>

    <h2 id="garde-fous">Les garde-fous contre les erreurs</h2>
    <p>Un outil qui résume l'actualité peut se tromper. Plusieurs règles limitent ce risque, et la plupart sont vérifiées automatiquement par le programme avant toute publication.</p>
    <ul>
      <li><strong>Traçabilité.</strong> Chaque info renvoie à l'article d'origine, avec le nom du média et la date de publication. Tout peut être vérifié.</li>
      <li><strong>Chiffres hors de l'IA.</strong> Les valeurs des indicateurs sont lues dans les sources officielles ; elles ne sont jamais générées ni recalculées par le modèle.</li>
      <li><strong>Aucun chiffre ajouté.</strong> Un résumé, une analyse ou une piste « Pour tes copies » qui contient un nombre absent de l'article d'origine est rejeté automatiquement.</li>
      <li><strong>Citations vérifiées.</strong> La citation du jour n'est affichée que si elle figure mot pour mot dans l'article. Une citation d'économiste n'est affichée que si elle a été vérifiée à la main.</li>
      <li><strong>Pas de texte sans matière.</strong> Quand un article n'est connu que par son titre, sans chapeau de présentation, l'IA n'écrit rien de plus que ce titre, et l'info n'entre dans le Top 5 que si un autre média la confirme.</li>
      <li><strong>Notions encadrées.</strong> La notion proposée dans « Pour tes copies » est choisie dans le glossaire du site ; le modèle n'a pas le droit d'inventer un intitulé de sujet officiel ni de citer un auteur sans lien avec la notion.</li>
      <li><strong>Données datées.</strong> Chaque chiffre affiche la période à laquelle il se rapporte, ce qui évite de présenter une donnée ancienne comme récente.</li>
      <li><strong>Tests automatiques.</strong> Ces règles sont couvertes par des tests qui s'exécutent à chaque modification du programme.</li>
    </ul>
    <p>Ces garde-fous réduisent les erreurs sans les supprimer. C'est pourquoi l'outil est conçu comme un point de départ vers les sources, et non comme une source en lui-même : tout contenu repris dans une copie ou un oral doit être relu à partir de l'article original.</p>

    <h2 id="limites">Les limites</h2>
    <p>Morning Market reflète d'abord les choix de ses sources. Majoritairement françaises, elles donnent une vision de l'actualité centrée sur la France et l'Europe. Les grands événements internationaux sont couverts, mais à travers ce prisme.</p>
    <p>Les résumés simplifient nécessairement. Trois phrases ne remplacent pas un article, et une analyse rédigée automatiquement ne remplace pas la lecture d'économistes ou de rapports institutionnels. Les notions proposées dans « Pour tes copies » sont des pistes de travail, à vérifier dans le cours.</p>
    <p>Les données macroéconomiques arrivent avec un décalage : l'inflation d'un mois est connue le mois suivant, le PIB d'un trimestre plusieurs semaines après la fin de celui-ci, et ces chiffres peuvent être révisés. Les cours de bourse sont repris d'un service gratuit (Yahoo Finance), qui peut parfois être indisponible ; l'indicateur concerné est alors signalé comme tel. Les courbes montrent des évolutions passées, pas des prévisions.</p>
    <p>Enfin, Morning Market est un outil pédagogique personnel. Il ne constitue ni un conseil en investissement ni une recommandation financière.</p>
    <p>Ces limites sont assumées et affichées : savoir ce qu'un outil ne fait pas fait partie de ce qui permet de lui faire confiance.</p>`;
}

/** Temps de lecture, calculé sur le texte réellement affiché. */
function minutesDeLecture(contenu) {
  const mots = String(contenu).replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(mots / MOTS_PAR_MINUTE));
}

export function sommaire(actif) {
  return html`${SECTIONS.map((s) => html`
    <a href="#/methodologie/${s.id}" data-section="${s.id}" ${s.id === actif ? html`aria-current="location"` : ""}
      class="py-2 pl-3.5 border-l-2 text-[15px] leading-[1.4] ${s.id === actif ? "font-bold text-encre border-accent" : "font-medium text-encre2 border-sep"}">${s.titre}</a>`)}`;
}

export function vueMethodologie(m, sectionActive) {
  const contenu = texte(m);
  return html`
  <div class="grille-methodo flex gap-[72px] items-start pt-6">
    <article class="article-methodo w-[680px] shrink-0">
      <header class="flex flex-col gap-[18px] mb-10">
        <span class="text-[15px] font-bold text-accent">Méthodologie</span>
        <h1 class="m-0 text-[44px] font-extrabold tracking-[-0.04em] leading-[1.1] text-balance">Comment Morning Market est construit</h1>
        <p class="m-0 text-[21px] font-medium leading-[1.6] text-encre/90 text-pretty">Morning Market est un tableau de bord de veille économique conçu par un étudiant pour préparer les concours d'écoles de commerce. Cette page explique d'où viennent les informations, comment elles sont traitées, et ce que l'outil ne fait pas.</p>
        <p class="m-0 text-[15px] font-medium text-encre3">Rédigé par ${m.auteur} · Dernière mise à jour : ${m.dateRedaction} · Lecture : ${minutesDeLecture(contenu)} minutes</p>
      </header>
      <section aria-label="En bref" class="tuile rounded-[30px] mb-2 py-[30px] px-[34px] flex flex-col gap-3.5">
        <h2 class="m-0 text-[16px] font-bold text-accent">En bref</h2>
        <ul class="m-0 pl-5 list-disc flex flex-col gap-2.5 text-[17px] leading-[1.6]">
          <li>Chaque info renvoie à son article d'origine et affiche sa source.</li>
          <li>Les chiffres viennent directement des organismes officiels et des places de marché ; l'IA n'en produit aucun.</li>
          <li>L'IA résume l'actualité et la relie aux notions de cours ; elle ne remplace ni la lecture des articles ni le jugement.</li>
        </ul>
      </section>
      <div class="prose-methodo">${contenu}</div>
    </article>
    <nav aria-label="Sommaire" class="sommaire-methodo sticky top-0 w-[220px] shrink-0 flex flex-col gap-1 pt-3">
      <span class="pb-2.5 text-[13.5px] font-bold text-encre3">Sommaire</span>
      <div id="sommaire-methodo" class="flex flex-col gap-1">${sommaire(sectionActive)}</div>
    </nav>
  </div>`;
}

