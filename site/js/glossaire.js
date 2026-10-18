// Vue « Glossaire » : les concepts du référentiel, filtrables par thème, avec leur fiche et les infos qui les mobilisent.
import { html, MOIS_COURTS } from "./outils.js";

const LOUPE = "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-3.5-3.5";
const normaliser = (texte) => (texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function dateMoyenne(iso) {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${jour} ${MOIS_COURTS[mois - 1]} ${annee}`;
}

/** État de la vue : thème filtré et texte cherché (gardés le temps de la visite). */
export const filtresGlossaire = { theme: "tous", texte: "" };

export function modeleGlossaire(donnees, idChoisi) {
  const concepts = [...(donnees.concepts?.concepts || [])].sort((a, b) => a.terme.localeCompare(b.terme, "fr"));
  const themes = donnees.reglages?.themes_glossaire || [];
  const libelleTheme = Object.fromEntries(themes.map((t) => [t.id, t.libelle_court || t.libelle]));
  const visibles = concepts.filter((c) => (filtresGlossaire.theme === "tous" || c.theme === filtresGlossaire.theme)
    && (!filtresGlossaire.texte || normaliser(c.terme).includes(normaliser(filtresGlossaire.texte))));
  const conceptDuJour = donnees.edition?.concept;
  const choisi = concepts.find((c) => c.id === idChoisi) || concepts.find((c) => c.id === conceptDuJour?.id) || visibles[0] || concepts[0];
  const usages = (donnees.usagesGlossaire?.notions || {})[choisi?.id] || [];
  return {
    nombre: concepts.length,
    themes: [{ id: "tous", libelle: "Tous les thèmes" }, ...themes.map((t) => ({ id: t.id, libelle: t.libelle_court }))]
      .map((t) => ({ ...t, actif: t.id === filtresGlossaire.theme })),
    texte: filtresGlossaire.texte,
    liste: visibles.map((c) => ({ id: c.id, terme: c.terme, actif: c.id === choisi?.id })),
    compteListe: `${visibles.length} concept${visibles.length > 1 ? "s" : ""}`,
    fiche: choisi && {
      id: choisi.id, terme: choisi.terme, theme: libelleTheme[choisi.theme] || "", definition: choisi.definition,
      copie: choisi.dans_une_copie,
      // Si c'est le concept du jour : le lien avec l'actualité rédigé ce matin
      actualite: conceptDuJour?.id === choisi.id && conceptDuJour.lien_actu ? conceptDuJour.lien_actu : null,
      usages: usages.map((u) => ({ ...u, dateAffichee: dateMoyenne(u.date) })),
    },
  };
}

export function listeConcepts(m) {
  if (!m.liste.length) return html`<span class="p-3.5 text-[15px] leading-[1.5] text-encre2">Aucun concept ne correspond à ta recherche.</span>`;
  return html`${m.liste.map((c) => html`
    <a href="#/glossaire/${c.id}" ${c.actif ? html`aria-current="true"` : ""} class="survol text-left min-h-11 py-2.5 px-3.5 rounded-nav text-[15px] leading-[1.35] ${c.actif ? "font-bold text-encre bg-accent-fond" : "font-medium text-encre2"}">${c.terme}</a>`)}`;
}

export function ficheConcept(f) {
  if (!f) return html`<p class="m-0 text-[16px] text-encre2">Le glossaire est momentanément indisponible.</p>`;
  return html`
    <div class="flex flex-col gap-2">
      <span class="text-[14.5px] font-bold text-accent">${f.theme}</span>
      <h2 id="titre-concept" class="m-0 text-[30px] font-extrabold tracking-[-0.03em] leading-[1.2]">${f.terme}</h2>
    </div>
    <div class="flex flex-col gap-2">
      <h3 class="m-0 text-[15px] font-bold text-encre2">Définition</h3>
      <p class="m-0 text-[18px] font-medium leading-[1.65] text-pretty">${f.definition}</p>
    </div>
    ${f.copie ? html`<div class="flex flex-col gap-2 py-[18px] px-[22px] rounded-copies bg-teinte">
      <h3 class="m-0 text-[15px] font-bold text-accent">Dans une copie</h3>
      <p class="m-0 text-[16px] leading-[1.6] text-pretty">${f.copie}</p>
    </div>` : ""}
    ${f.actualite ? html`<div class="flex flex-col gap-2">
      <h3 class="m-0 text-[15px] font-bold text-encre2">Concept du jour : le lien avec l'actualité</h3>
      <p class="m-0 text-[16px] leading-[1.6] text-pretty">${f.actualite}</p>
    </div>` : ""}
    <div class="flex flex-col gap-1.5">
      <h3 class="m-0 text-[15px] font-bold text-encre2">Mobilisé dans le dashboard</h3>
      ${f.usages.length ? f.usages.map((u) => html`
      <button type="button" data-action="ouvrir-usage" data-date="${u.date}" data-id="${u.id}" class="survol grid grid-cols-[104px_minmax(0,1fr)_auto] gap-x-4 items-baseline py-3 px-2 border-0 border-t border-sep bg-transparent cursor-pointer text-left rounded-xl">
        <span class="text-[14.5px] font-bold text-accent tabular-nums whitespace-nowrap">${u.dateAffichee}</span>
        <span class="flex flex-col gap-[3px] min-w-0">
          <span class="souligne text-[15.5px] font-semibold leading-[1.45]">${u.titre}</span>
          <span class="text-[13.5px] text-encre3">${u.source} · ${u.contexte}</span>
        </span>
        <span class="text-[14.5px] font-bold text-accent whitespace-nowrap">Ouvrir →</span>
      </button>`) : html`<span class="text-[15px] leading-[1.55] text-encre2">Ce concept n'a pas encore été mobilisé par une info du dashboard.</span>`}
    </div>`;
}

export function boutonsThemes(m) {
  return html`${m.themes.map((t) => html`
    <button type="button" data-action="filtrer-theme" data-theme="${t.id}" aria-pressed="${t.actif ? "true" : "false"}"
      class="survol presse h-10 px-[15px] rounded-full border-0 cursor-pointer text-[14.5px] ${t.actif ? "font-bold text-encre bg-accent-fond2" : "font-semibold text-encre2 bg-transparent"}">${t.libelle}</button>`)}`;
}

export function vueGlossaire(m) {
  return html`
  <div class="flex flex-col gap-6">
    <header class="en-tete flex items-end justify-between gap-6">
      <div class="flex flex-col gap-2.5">
        <h1 class="m-0 text-[36px] font-extrabold tracking-[-0.035em] leading-[1.1]">Glossaire</h1>
        <p class="m-0 text-[16px] font-medium text-encre2">${m.nombre} concepts économiques, reliés à l'actualité qui les illustre</p>
      </div>
      <label class="flex items-center gap-2.5 h-12 w-[360px] max-w-full box-border px-[18px] rounded-full bg-champ border border-champ-bord">
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:var(--ink2);stroke-width:2;stroke-linecap:round"><path d="${LOUPE}"></path></svg>
        <span class="sr-only">Rechercher un concept</span>
        <input type="search" id="recherche-concept" value="${m.texte}" placeholder="Rechercher un concept" autocomplete="off"
          class="flex-1 min-w-0 bg-transparent border-0 outline-none text-encre text-[15px]">
      </label>
    </header>
    <div id="themes-glossaire" role="group" aria-label="Filtrer par thème" class="flex gap-1 flex-wrap">${boutonsThemes(m)}</div>
    <div class="grille-glossaire grid grid-cols-[320px_minmax(0,1fr)] gap-x-9 items-start">
      <nav aria-label="Liste des concepts" class="flex flex-col gap-2.5">
        <span id="compte-concepts" class="px-3.5 text-[13.5px] font-bold text-encre3">${m.compteListe}</span>
        <div id="liste-concepts" class="defilement max-h-[560px] overflow-y-auto flex flex-col gap-0.5 pr-1.5">${listeConcepts(m)}</div>
      </nav>
      <article id="fiche-concept" aria-labelledby="titre-concept" class="panneau-onglet tuile py-[38px] px-[42px] flex flex-col gap-6">${ficheConcept(m.fiche)}</article>
    </div>
  </div>`;
}
