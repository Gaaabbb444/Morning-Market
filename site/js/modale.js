// Fenêtre modale d'une info : contenu, ouverture depuis la ligne cliquée, fermeture (croix, Échap,
// clic à l'extérieur), focus clavier gardé à l'intérieur, étoile de favori.
import { html, dateLongue, dateCourte, animationsReduites, COURBE } from "./outils.js";
import { estFavori, basculerFavori } from "./favoris.js";

const ETOILE = "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z";
const CROIX = "M6 6l12 12M18 6L6 18";
const LIEN = "M7 17L17 7M9 7h8v8";
const NB_EVENEMENTS_LIES = 3;

let ouverte = null; // { couche, fenetre, voile, origine, info, dateEdition, surFermeture }

function contenu(info, contexte) {
  const { categories, filsRouges, dateEdition } = contexte;
  const categorie = categories[info.categorie]?.libelle || "";
  const aDesTextes = Boolean(info.faits || info.analyse);
  const copies = info.pour_tes_copies;
  const fil = info.fil_rouge ? (filsRouges?.fils || []).find((f) => f.id === info.fil_rouge) : null;
  const evenements = fil ? fil.evenements.slice(-NB_EVENEMENTS_LIES) : [];
  const favori = estFavori(info.id);
  const nbSources = `${info.nb_sources} source${info.nb_sources > 1 ? "s" : ""}`;

  return html`
  <div class="flex items-center justify-between gap-4">
    <span class="text-[14.5px] font-bold text-accent">${categorie}</span>
    <div class="flex gap-1.5">
      <button type="button" data-action="favori" class="survol w-11 h-11 rounded-nav border-0 bg-champ flex items-center justify-center cursor-pointer"
        aria-pressed="${favori ? "true" : "false"}" aria-label="${favori ? "Retirer des favoris" : "Ajouter aux favoris"}">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="fill:${favori ? "var(--acc)" : "none"};stroke:${favori ? "var(--acc)" : "var(--ink2)"};stroke-width:1.7;stroke-linejoin:round;transform-box:fill-box;transform-origin:center"><path d="${ETOILE}"></path></svg>
      </button>
      <button type="button" data-action="fermer" class="survol w-11 h-11 rounded-nav border-0 bg-champ flex items-center justify-center cursor-pointer" aria-label="Fermer">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="${CROIX}"></path></svg>
      </button>
    </div>
  </div>
  <div class="flex flex-col gap-3.5">
    <h2 id="titre-modale" class="m-0 text-[28px] font-extrabold tracking-[-0.03em] leading-[1.25] text-balance">${info.titre}</h2>
    ${info.titre_fr ? html`<p class="m-0 -mt-1.5 text-[16px] font-medium text-encre2">Traduction : ${info.titre_fr}</p>` : ""}
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <span class="text-[15px] font-medium text-encre2"><span class="font-bold text-encre">${info.source}</span> · ${nbSources} · édition du ${dateLongue(dateEdition)}</span>
      <a href="${info.url}" target="_blank" rel="noopener" class="survol flex items-center gap-2 h-10 px-4 rounded-full text-[14.5px] font-bold text-accent bg-accent-fond">Lire l'article<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="${LIEN}"></path></svg></a>
    </div>
  </div>
  ${aDesTextes ? html`
    ${section("Les faits", info.faits)}
    ${section("L'analyse", info.analyse)}
    ${copies ? blocCopies(copies) : ""}` : info.resume ? section("Résumé", info.resume) : html`
    <p class="m-0 text-[15px] italic text-encre3">Le résumé de cette info n'est pas disponible : seuls le titre et le lien vers l'article sont affichés.</p>`}
  ${!aDesTextes && info.autres_sources?.length ? html`
    <section aria-labelledby="autres" class="flex flex-col gap-0.5">
      <h3 id="autres" class="m-0 text-[15px] font-bold text-encre2">Autres sources</h3>
      ${info.autres_sources.map((a) => html`<a href="${a.url}" target="_blank" rel="noopener" class="grid grid-cols-[96px_minmax(0,1fr)] gap-3.5 py-2.5 border-t border-sep">
        <span class="text-[14.5px] font-bold text-accent">${a.source}</span>
        <span class="text-[15px] font-semibold leading-[1.5] whitespace-nowrap overflow-hidden text-ellipsis">${a.titre}</span></a>`)}
    </section>` : ""}
  ${fil && evenements.length ? html`
    <section aria-labelledby="fil" class="flex flex-col gap-0.5">
      <div class="flex items-baseline justify-between gap-4">
        <h3 id="fil" class="m-0 text-[15px] font-bold text-encre2">Dans le même fil rouge : <span class="text-encre">${fil.titre}</span></h3>
        <a href="#/fils/${fil.id}" class="py-1 text-[14.5px] font-bold text-accent whitespace-nowrap">Voir le fil →</a>
      </div>
      ${evenements.map((e) => html`<div class="grid grid-cols-[96px_minmax(0,1fr)] gap-3.5 py-2.5 border-t border-sep">
        <span class="text-[14.5px] font-bold text-accent tabular-nums">${dateCourte(e.date)}</span>
        <span class="text-[15px] font-semibold leading-[1.5] whitespace-nowrap overflow-hidden text-ellipsis">${e.resume}</span>
      </div>`)}
    </section>` : ""}`;
}

const section = (titre, texte) => texte ? html`
  <div class="flex flex-col gap-1.5">
    <h3 class="m-0 text-[15px] font-bold text-encre2">${titre}</h3>
    <p class="m-0 text-[16.5px] leading-[1.62] text-pretty">${texte}</p>
  </div>` : "";

function blocCopies(copies) {
  // Ancien format (avant le 18/10) : une simple phrase
  if (typeof copies === "string") {
    return html`<section aria-labelledby="copies" class="flex flex-col gap-2.5 py-5 px-6 rounded-copies bg-teinte">
      <h3 id="copies" class="m-0 text-[15px] font-bold text-accent">Pour tes copies</h3>
      <p class="m-0 text-[16px] leading-[1.6] text-pretty">${copies}</p></section>`;
  }
  return html`<section aria-labelledby="copies" class="flex flex-col gap-2.5 py-5 px-6 rounded-copies bg-teinte">
    <h3 id="copies" class="m-0 text-[15px] font-bold text-accent">Pour tes copies</h3>
    <p class="m-0 flex flex-wrap gap-x-[22px] gap-y-1.5 text-[15px] leading-[1.5]">
      <span><span class="text-encre2">Thème :</span> <strong class="font-bold">${copies.theme_libelle}</strong></span>
      <span><span class="text-encre2">Notion :</span> <a href="#/glossaire/${copies.notion_id}" class="font-bold text-accent underline underline-offset-4 decoration-1">${copies.notion_terme}</a></span>
      <span><span class="text-encre2">Usage :</span> <strong class="font-bold">${copies.usage}</strong></span>
    </p>
    <p class="m-0 text-[16px] leading-[1.6] text-pretty">${copies.texte}</p>
  </section>`;
}

// ---------------------------------------------------------------------------
// Ouverture et fermeture animées (transform et opacity uniquement)
// ---------------------------------------------------------------------------

/** Rapport d'échelle éventuel (zoom du navigateur) entre taille affichée et taille réelle. */
const echelle = (el) => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };

function trajet(origine, fenetre) {
  const o = origine.getBoundingClientRect(), f = fenetre.getBoundingClientRect(), k = echelle(fenetre);
  const s = Math.max(0.3, Math.min(1, o.width / f.width));
  const dx = (o.left + o.width / 2 - (f.left + f.width / 2)) / k;
  const dy = (o.top + o.height / 2 - (f.top + f.height / 2)) / k;
  return `translate(${dx}px,${dy}px) scale(${s})`;
}

/** surFermeture : fonction appelée une fois la fenêtre fermée (ex. actualiser la liste des favoris). */
export function ouvrirModale(info, origine, contexte, surFermeture = null) {
  if (ouverte) fermerModale(true);
  const couche = document.getElementById("couche-modale");
  couche.innerHTML = String(html`
    <div data-role="voile" aria-hidden="true" class="absolute inset-0 z-20 bg-voile"></div>
    <div data-role="fenetre" role="dialog" aria-modal="true" aria-labelledby="titre-modale"
      class="fenetre-info fenetre defilement absolute z-[21] top-6 left-1/2 -ml-[430px] w-[860px] max-h-[calc(100%-48px)] overflow-y-auto box-border rounded-modale pt-[30px] px-11 pb-[34px] flex flex-col gap-5">
      ${contenu(info, contexte)}
    </div>`);
  const voile = couche.querySelector('[data-role="voile"]');
  const fenetre = couche.querySelector('[data-role="fenetre"]');
  ouverte = { couche, fenetre, voile, origine, info, dateEdition: contexte.dateEdition, contexte, surFermeture };

  voile.addEventListener("click", () => fermerModale());
  fenetre.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "fermer") fermerModale();
    if (action === "favori") basculer(e.target.closest("[data-action]"));
  });
  fenetre.addEventListener("keydown", garderLeFocus);
  fenetre.querySelector('[data-action="fermer"]').focus({ preventScroll: true });

  const reduit = animationsReduites();
  voile.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  if (origine && !reduit) {
    fenetre.animate([{ transform: trajet(origine, fenetre), opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 400, easing: COURBE });
  } else {
    fenetre.animate([{ opacity: 0, transform: reduit ? "none" : "scale(.97)" }, { opacity: 1, transform: "none" }], { duration: reduit ? 250 : 240, easing: "ease-out" });
  }
}

export function fermerModale(immediat = false) {
  if (!ouverte) return;
  const { couche, fenetre, voile, origine, surFermeture } = ouverte;
  ouverte = null;
  const finir = () => {
    couche.innerHTML = "";
    if (origine?.isConnected) origine.focus({ preventScroll: true });
    surFermeture?.();
  };
  if (immediat) return finir();
  const reduit = animationsReduites();
  const retour = origine?.isConnected && !reduit;
  voile.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: "ease-in", fill: "forwards" });
  const animation = fenetre.animate(
    retour ? [{ transform: "none", opacity: 1 }, { transform: trajet(origine, fenetre), opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }],
    { duration: reduit ? 250 : 280, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
  animation.onfinish = finir;
}

export const modaleOuverte = () => Boolean(ouverte);

function basculer(bouton) {
  const actif = basculerFavori(ouverte.info, ouverte.dateEdition);
  bouton.setAttribute("aria-pressed", actif ? "true" : "false");
  bouton.setAttribute("aria-label", actif ? "Retirer des favoris" : "Ajouter aux favoris");
  const svg = bouton.querySelector("svg");
  svg.style.fill = actif ? "var(--acc)" : "none";
  svg.style.stroke = actif ? "var(--acc)" : "var(--ink2)";
  if (!animationsReduites()) {
    svg.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1)" });
  }
}

/** Échap ferme ; Tab reste dans la fenêtre (accessibilité au clavier). */
function garderLeFocus(e) {
  if (e.key === "Escape") { e.preventDefault(); fermerModale(); return; }
  if (e.key !== "Tab") return;
  const focusables = [...ouverte.fenetre.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!focusables.length) return;
  const premier = focusables[0], dernier = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
}
