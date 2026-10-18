// Accueil : préparation des données puis affichage (dimensions reprises du prototype de la maquette).
import {
  html, valeurAvecSymbole, variation, dateTitre, dateLongue, dateChiffres, heure, dePeriode,
  periodeCourte, prochainDimanche, MOIS,
} from "./outils.js";

const HEURE_LIMITE_MISE_A_JOUR = 7 * 60 + 30; // après 7 h 30, l'édition du jour devrait exister

// ---------------------------------------------------------------------------
// Préparation (aucun HTML ici)
// ---------------------------------------------------------------------------

export function categoriesParId(reglages) {
  return Object.fromEntries((reglages?.categories || []).map((c) => [c.id, c]));
}

/** État général de l'édition affichée : à jour, ancienne, sans IA. */
export function etatEdition(donnees, maintenant) {
  const { statut, edition } = donnees;
  const dateEdition = edition?.date;
  const editionDuJour = dateEdition === maintenant.date;
  const fin = statut?.derniere_execution?.fin;
  let mention = "";
  if (fin) mention = fin.slice(0, 10) === maintenant.date ? `· mis à jour à ${heure(fin)}` : `· mis à jour le ${dateChiffres(fin)} à ${heure(fin)}`;
  return {
    dateEdition,
    editionDuJour,
    // L'édition n'est jugée « ancienne » qu'après l'heure où celle du jour aurait dû paraître
    ancienne: Boolean(dateEdition) && !editionDuJour && maintenant.minutes >= HEURE_LIMITE_MISE_A_JOUR,
    sansIA: Boolean(edition) && (edition.mode_ia === "sans-ia" || !Array.isArray(edition.essentiel)),
    mention,
  };
}

/** Fin d'une période sous forme « AAAA-MM » ou date complète, pour la comparer à une date d'édition. */
function finDePeriode(periode) {
  if (periode.includes("-T")) return `${periode.slice(0, 4)}-${String(Number(periode.slice(-1)) * 3).padStart(2, "0")}`;
  return periode;
}

/** Valeur d'un indicateur telle qu'elle était connue à une date passée (édition archivée) : une donnée
 *  quotidienne jusqu'à ce jour inclus, une donnée mensuelle ou trimestrielle dont la période était achevée. */
function valeurALaDate(donnee, date) {
  const connu = ([periode]) => (periode.length === 10 ? periode <= date : finDePeriode(periode) < date.slice(0, 7));
  const points = (donnee.historique || []).filter(connu);
  if (!points.length) return null;
  const [periode, valeur] = points[points.length - 1];
  const precedent = points[points.length - 2];
  const type = donnee.variation?.type || "points";
  const ecart = precedent ? (type === "pourcent" ? (valeur / precedent[1] - 1) * 100 : valeur - precedent[1]) : null;
  return { periode, valeur, ecart, type };
}

/** Les 5 indicateurs du bandeau, avec leurs états (normal ou indisponible).
 *  dateArchive : pour une édition passée, on affiche les valeurs connues ce jour-là. */
export function indicateursBandeau(reglages, indicateurs, dateArchive = null) {
  const valeurs = Object.fromEntries((indicateurs?.indicateurs || []).map((i) => [i.id, i]));
  return (reglages?.indicateurs || [])
    .filter((r) => r.ordre_bandeau)
    .sort((a, b) => a.ordre_bandeau - b.ordre_bandeau)
    .map((r) => {
      const donnee = valeurs[r.id];
      const symbole = r.groupe === "Change" ? "" : r.unite; // le taux de change s'affiche sans symbole dans le bandeau
      if (!donnee?.derniere_valeur) {
        return { nom: r.nom_court, info: `${r.libelle} : donnée indisponible pour le moment.`, valeur: "—",
          couleurValeur: "var(--muted)", ecart: "Indisponible", couleurEcart: "var(--ink3)", graisseEcart: 600 };
      }
      if (dateArchive) {
        const passe = valeurALaDate(donnee, dateArchive);
        if (!passe) return { nom: r.nom_court, info: `${r.libelle} : pas de donnée à cette date.`, valeur: "—",
          couleurValeur: "var(--muted)", ecart: "Indisponible", couleurEcart: "var(--ink3)", graisseEcart: 600 };
        const couleurPasse = r.prix_de_marche && passe.ecart > 0 ? "var(--up)" : r.prix_de_marche && passe.ecart < 0 ? "var(--down)" : "var(--ink2)";
        return { nom: r.nom_court, info: `${r.libelle} : valeur connue le ${dateLongue(dateArchive)} (${periodeCourte(passe.periode)})`,
          valeur: valeurAvecSymbole(passe.valeur, donnee.decimales, symbole), couleurValeur: "var(--ink)",
          ecart: passe.ecart === null ? "—" : variation(Math.round(passe.ecart * 100) / 100, passe.type), couleurEcart: couleurPasse, graisseEcart: 700 };
      }
      const { valeur, periode } = donnee.derniere_valeur;
      const texteValeur = valeurAvecSymbole(valeur, donnee.decimales, symbole);
      if (donnee.etat !== "ok") {
        const raison = donnee.etat === "perimee" ? "aucune donnée plus récente n'est encore publiée" : "la dernière mise à jour n'a pas abouti";
        return { nom: r.nom_court, info: `${r.libelle} : ${raison}. Dernière valeur connue : ${periodeCourte(periode)}.`,
          valeur: texteValeur, couleurValeur: "var(--muted)", ecart: `Valeur ${dePeriode(periode)}`,
          couleurEcart: "var(--ink3)", graisseEcart: 600 };
      }
      const ecart = donnee.variation?.valeur ?? 0;
      const couleur = r.prix_de_marche && ecart > 0 ? "var(--up)" : r.prix_de_marche && ecart < 0 ? "var(--down)" : "var(--ink2)";
      return { nom: r.nom_court, info: r.libelle, valeur: texteValeur, couleurValeur: "var(--ink)",
        ecart: donnee.variation ? variation(ecart, donnee.variation.type) : "—", couleurEcart: couleur, graisseEcart: 700 };
    });
}

/** Contenu des trois cartes « Approfondir ». */
export function cartesApprofondir(donnees, edition, recap) {
  const { filsRouges, citations } = donnees;
  const jour = edition?.date;

  // Fils rouges : sujets qui ont reçu un événement daté du jour de l'édition
  const fils = (filsRouges?.fils || []).filter((f) => f.statut === "actif");
  const duJour = fils.map((f) => ({ fil: f, evenement: f.evenements.find((e) => e.date === jour) })).filter((x) => x.evenement);
  const ordreTop5 = (edition?.top5 || []).map((t) => t.fil_rouge);
  duJour.sort((a, b) => rangOuFin(ordreTop5, a.fil.id) - rangOuFin(ordreTop5, b.fil.id));
  const n = duJour.length;
  const carteFils = {
    titre: n === 0 ? "Aucun sujet n'a bougé depuis hier" : n === 1 ? "1 sujet a bougé depuis hier" : `${n} sujets ont bougé depuis hier`,
    texte: n ? `Dernier en date : ${duJour[0].evenement.resume}` : `${fils.length} sujets suivis dans la durée, mis à jour à chaque édition.`,
  };

  // Concept et citation du jour (la citation d'économiste n'apparaît que si elle est vérifiée)
  const lignes = [];
  const actu = edition?.citation_actu;
  if (actu) lignes.push(`« ${actu.texte} » — ${actu.auteur}`);
  const economiste = (citations?.citations || []).find((c) => c.id === edition?.citation_economiste_id && c.verifiee === true);
  if (economiste) lignes.push(`« ${economiste.texte} » — ${economiste.auteur}, ${economiste.oeuvre} (${economiste.annee})`);
  if (!lignes.length && edition?.concept?.lien_actu) lignes.push(edition.concept.lien_actu);
  const carteConcept = { titre: edition?.concept?.terme || "Concept du jour à venir", lignes, id: edition?.concept?.id || null };

  // Récap de la semaine (rédigé chaque dimanche)
  let carteRecap;
  if (recap) {
    carteRecap = { titre: titrePeriode(recap.du, recap.au), texte: recap.accroche || premierePhrase(recap.synthese), lien: true };
  } else {
    // Pas de récap pour la semaine en cours : le prochain sera rédigé le dimanche suivant
    const dimanche = jour ? prochainDimanche(jour) : null;
    carteRecap = {
      titre: dimanche ? `Dimanche ${dateLongue(dimanche).replace(/ \d{4}$/, "")}` : "Chaque dimanche",
      texte: "Le récapitulatif de la semaine sera rédigé ce jour-là, à partir des éditions quotidiennes.",
    };
  }
  return { fils: carteFils, concept: carteConcept, recap: carteRecap };
}

const rangOuFin = (liste, id) => { const i = liste.indexOf(id); return i < 0 ? 99 : i; };
const premierePhrase = (texte) => (texte || "").split(/(?<=[.!?])\s/)[0];

function titrePeriode(du, au) {
  const [, m1, j1] = du.split("-").map(Number);
  const [, m2, j2] = au.split("-").map(Number);
  return m1 === m2 ? `Du ${j1} au ${j2} ${MOIS[m2 - 1]}` : `Du ${j1} ${MOIS[m1 - 1]} au ${j2} ${MOIS[m2 - 1]}`;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

const ICONE_HORLOGE = "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5V12l3 2";
const ICONE_INFO = "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.5";
const ICONE_LIEN = "M7 17L17 7M9 7h8v8";

const icone = (chemin, taille, epaisseur, extra = "") => html`<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:${epaisseur};stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;${extra}"><path d="${chemin}"></path></svg>`;

export function vueAccueil(m) {
  return html`
  <div class="flex flex-col gap-[36px]">
    ${m.archive ? html`
    <div role="status" class="bandeau-archive flex items-center justify-between gap-6 py-2.5 pr-2.5 pl-6 rounded-full bg-accent-fond border border-accent-fond2">
      <span class="text-[16px] font-extrabold">Édition du ${m.dateLongueEdition} <span class="font-medium text-[15px] text-encre2">· tu consultes une archive</span></span>
      <a href="#/" class="presse shrink-0 inline-flex items-center h-10 px-[18px] rounded-full text-[14.5px] font-bold text-sur-accent bg-accent">Revenir à aujourd'hui</a>
    </div>` : ""}
    <header class="en-tete apparition flex items-center justify-between gap-6 min-h-[44px]">
      <span class="min-w-0 text-[15px] font-bold"><span class="whitespace-nowrap">${m.titreDate}</span> <span class="whitespace-nowrap font-medium text-encre2">${m.mention}</span></span>
      <div class="shrink-0 flex items-center gap-5">
        ${m.sansIA ? "" : pastilles(m)}
        <button type="button" data-action="rechercher" aria-label="Rechercher" class="survol presse w-11 h-11 rounded-full border border-champ-bord bg-champ flex items-center justify-center cursor-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-3.5-3.5"></path></svg>
        </button>
      </div>
    </header>
    ${m.ancienne ? html`
    <p role="status" class="-mt-3 self-start flex items-center gap-2.5 py-[9px] px-4 rounded-full bg-survol text-[14.5px] font-semibold text-encre">
      ${icone(ICONE_HORLOGE, 16, 2, "stroke:var(--acc)")}
      Données du ${m.dateChiffres} : la mise à jour de ce matin n'a pas abouti
    </p>` : ""}
    ${m.sansIA ? top5SansIA(m) : html`
    <div class="grille-accueil grid grid-cols-12 gap-x-12 items-start">
      <section aria-labelledby="ess" class="essentiel apparition col-span-7 tuile py-[42px] px-[44px] flex flex-col gap-7">
        <h1 id="ess" class="m-0 text-[16px] font-bold text-accent">L'essentiel</h1>
        <ol class="m-0 p-0 list-none flex flex-col gap-6">
          ${m.essentiel.map((phrase) => html`<li class="text-[22px] font-medium leading-[1.5] tracking-[-0.005em] text-pretty">${phrase}</li>`)}
        </ol>
      </section>
      <section aria-labelledby="top" class="col-span-5 flex flex-col gap-3 pt-1.5">
        <div id="entete-top5" class="flex items-baseline justify-between gap-3 mb-1 ml-3.5 min-h-6">${enteteTop5(m)}</div>
        <div id="liste-top5" class="flex flex-col gap-0.5">${lignesTop5(m)}</div>
      </section>
    </div>`}
    ${bandeau(m)}
    ${approfondir(m)}
  </div>`;
}

function pastilles(m) {
  return html`<nav id="pastilles" aria-label="Filtrer le Top 5 par catégorie" class="flex gap-1">${boutonsPastilles(m)}</nav>`;
}

export function boutonsPastilles(m) {
  return html`${m.pastilles.map((p) => html`<button type="button" data-action="filtrer" data-categorie="${p.id}" aria-pressed="${p.actif ? "true" : "false"}"
      class="survol presse h-[38px] px-[15px] rounded-full border-0 cursor-pointer text-[14px] ${p.actif ? "font-bold text-encre bg-accent-fond2" : "font-semibold text-encre2 bg-transparent"}">${p.libelle}</button>`)}`;
}

export function enteteTop5(m) {
  return html`<h2 id="top" class="m-0 text-[16px] font-bold text-encre2">${m.titreTop5}</h2>
    ${m.filtreActif ? html`<button type="button" data-action="filtrer" data-categorie="tout" class="p-1 border-0 bg-transparent cursor-pointer text-[14px] font-bold text-accent">${m.compteFiltre} · Tout afficher</button>` : ""}`;
}

export function lignesTop5(m, avecApparition = true) {
  return html`${m.top5Visibles.map((info, i) => html`
    <button type="button" data-action="ouvrir" data-id="${info.id}" data-k="${info.id}"
      class="survol ${avecApparition ? "apparition" : ""} grid grid-cols-[26px_minmax(0,1fr)] gap-3 py-3 px-3.5 border-0 rounded-ligne bg-transparent cursor-pointer text-left"
      style="animation-delay:${40 + i * 35}ms">
      <span class="text-[16px] font-extrabold text-accent tabular-nums leading-[1.45]">${info.rang}</span>
      <span class="flex flex-col gap-1.5 min-w-0">
        <span class="souligne text-[16.5px] font-bold leading-[1.45] line-clamp-2">${info.titre}</span>
        <span class="text-[14px] font-medium text-encre3">${info.source} · ${m.libellePastille(info.categorie)}</span>
      </span>
    </button>`)}`;
}

function top5SansIA(m) {
  return html`
  <section aria-labelledby="topna" class="w-[860px] max-w-full box-border tuile pt-[38px] px-10 pb-[30px] flex flex-col gap-2">
    <div class="flex flex-col gap-2 px-3.5 pb-2.5">
      <h1 id="topna" class="m-0 text-[16px] font-bold text-accent">${m.titreTop5}</h1>
      <p role="status" class="m-0 flex items-center gap-2 text-[14.5px] font-medium text-encre2">
        ${icone(ICONE_INFO, 15, 2)}Résumés momentanément indisponibles : seuls les titres et les sources sont affichés.</p>
    </div>
    ${m.top5Visibles.map((info) => html`
    <a href="${info.url}" target="_blank" rel="noopener" class="survol grid grid-cols-[28px_minmax(0,1fr)] gap-3 p-3.5 rounded-ligne">
      <span class="text-[17px] font-extrabold text-accent tabular-nums leading-[1.45]">${info.rang}</span>
      <span class="flex flex-col gap-1.5 min-w-0">
        <span class="souligne text-[18px] font-bold leading-[1.45] line-clamp-2">${info.titre}</span>
        <span class="flex items-center gap-1.5 text-[14px] font-semibold text-encre2">${info.source}<svg width="13" height="13" viewBox="0 0 24 24" role="img" aria-label="ouvre l'article" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="${ICONE_LIEN}"></path></svg></span>
      </span>
    </a>`)}
  </section>`;
}

function bandeau(m) {
  return html`
  <section aria-label="Indicateurs clés" class="bandeau apparition calme grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-9 py-[22px] px-8 rounded-bandeau tabular-nums" style="animation-delay:160ms">
    <div class="bandeau-colonnes grid grid-cols-5 gap-x-6">
      ${m.indicateurs.map((k) => html`
      <div title="${k.info}" class="flex flex-col gap-1 min-w-0">
        <span class="text-[14px] leading-5 font-semibold text-encre2 whitespace-nowrap overflow-hidden text-ellipsis">${k.nom}</span>
        <span class="text-[20px] leading-7 font-bold tracking-[-0.02em] whitespace-nowrap" style="color:${k.couleurValeur}">${k.valeur}</span>
        <span class="text-[14px] leading-5 whitespace-nowrap" style="font-weight:${k.graisseEcart};color:${k.couleurEcart}">${k.ecart}</span>
      </div>`)}
    </div>
    <a href="#/marches" class="py-2.5 text-[15px] font-bold text-accent whitespace-nowrap">Voir les ${m.nombreIndicateurs} indicateurs →</a>
  </section>`;
}

function approfondir(m) {
  const carte = (etiquette, titre, lignes) => html`
    <div class="flex flex-col gap-3.5 p-8 rounded-carte calme text-left">
      <span class="text-[15px] font-bold text-accent">${etiquette}</span>
      <span class="text-[22px] font-extrabold leading-[1.3] tracking-[-0.02em]">${titre}</span>
      ${lignes.map((l) => html`<span class="text-[15px] leading-[1.55] text-encre2 line-clamp-3">${l}</span>`)}
    </div>`;
  const carteLien = (adresse, etiquette, titre, lignes, appel) => html`
    <a href="${adresse}" class="carte flex flex-col gap-3.5 p-8 rounded-carte calme text-left">
      <span class="text-[15px] font-bold text-accent">${etiquette}</span>
      <span class="text-[22px] font-extrabold leading-[1.3] tracking-[-0.02em]">${titre}</span>
      ${lignes.map((l) => html`<span class="text-[15px] leading-[1.55] text-encre2 line-clamp-3">${l}</span>`)}
      <span class="mt-2 text-[15px] font-bold">${appel} <span class="fleche">→</span></span>
    </a>`;
  return html`
  <section aria-labelledby="appro" class="apparition mt-10 flex flex-col gap-6" style="animation-delay:220ms">
    <div class="flex items-baseline gap-[18px] flex-wrap">
      <h2 id="appro" class="m-0 text-[30px] font-extrabold tracking-[-0.03em]">Approfondir</h2>
      <span class="text-[16px] font-medium text-encre2">Le reste de l'édition, à un clic</span>
    </div>
    <div class="cartes3 grid grid-cols-3 gap-7">
      <a href="#/fils" class="carte flex flex-col gap-3.5 p-8 rounded-carte calme text-left">
        <span class="text-[15px] font-bold text-accent">Fils rouges</span>
        <span class="text-[22px] font-extrabold leading-[1.3] tracking-[-0.02em]">${m.cartes.fils.titre}</span>
        <span class="text-[15px] leading-[1.55] text-encre2 line-clamp-3">${m.cartes.fils.texte}</span>
        <span class="mt-2 text-[15px] font-bold">Voir les fils rouges <span class="fleche">→</span></span>
      </a>
      ${m.cartes.concept.id ? carteLien(`#/glossaire/${m.cartes.concept.id}`, "Concept et citation du jour", m.cartes.concept.titre, m.cartes.concept.lignes, "Ouvrir la fiche")
        : carte("Concept et citation du jour", m.cartes.concept.titre, m.cartes.concept.lignes)}
      ${m.cartes.recap.lien ? carteLien("#/archives/retro", "Récap de la semaine", m.cartes.recap.titre, [m.cartes.recap.texte], "Lire le récap")
        : carte("Récap de la semaine", m.cartes.recap.titre, [m.cartes.recap.texte])}
    </div>
  </section>`;
}

/** Message affiché quand les données du site sont introuvables. */
export function vueIndisponible() {
  return html`<section class="tuile p-11 max-w-[860px]"><h1 class="m-0 text-[22px] font-extrabold">Données momentanément indisponibles</h1>
    <p class="mt-3 mb-0 text-[16px] text-encre2">L'édition n'a pas pu être chargée. Réessaie dans quelques instants.</p></section>`;
}

