// Recherche : panneau ouvert depuis l'en-tête de l'accueil. Elle porte sur les infos publiées (index de
// toutes les éditions), les indicateurs, le glossaire et les fils rouges ; résultats groupés, terme surligné.
import { html, MOIS_COURTS, valeurAvecSymbole, periodeCourte, animationsReduites, COURBE } from "./outils.js";

const LOUPE = "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-3.5-3.5";
const CROIX = "M6 6l12 12M18 6L6 18";
const PAR_GROUPE = 4;

let ouverte = null; // { couche, panneau, voile, champ, origine, contexte }

/** Minuscules et sans accents : « Économie » et « economie » se retrouvent. */
const normaliser = (texte) => (texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function dateMoyenne(iso) {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${jour} ${MOIS_COURTS[mois - 1]} ${annee}`;
}

/** Découpe un texte autour du terme trouvé, pour le surligner. */
function decouper(texte, terme) {
  const position = normaliser(texte).indexOf(normaliser(terme));
  if (position < 0) return null;
  return { avant: texte.slice(0, position), trouve: texte.slice(position, position + terme.length), apres: texte.slice(position + terme.length) };
}

export function chercher(terme, sources) {
  const q = terme.trim();
  if (q.length < 2) return { indication: true, groupes: [], total: 0 };
  const groupes = [];

  // Infos publiées (les plus récentes d'abord) : titre, ou à défaut mention dans le résumé
  const infos = [];
  for (const e of sources.index?.entrees || []) {
    if (infos.length >= PAR_GROUPE) break;
    const morceaux = decouper(e.t, q);
    if (morceaux) infos.push({ ...morceaux, sous: `${e.s} · ${dateMoyenne(e.d)}`, action: "info", date: e.d, id: e.i });
    else if (normaliser(e.r).includes(normaliser(q))) infos.push({ avant: e.t, trouve: "", apres: "", sous: `Mentionné dans le résumé · ${e.s}`, action: "info", date: e.d, id: e.i });
  }
  if (infos.length) groupes.push({ titre: "Infos", resultats: infos });

  const valeurs = Object.fromEntries((sources.indicateurs?.indicateurs || []).map((i) => [i.id, i]));
  const indicateurs = (sources.reglages?.indicateurs || []).map((r) => {
    const morceaux = decouper(r.nom, q);
    const d = valeurs[r.id]?.derniere_valeur;
    // Même mention de période que dans Marchés : « Au 16 oct. 2026 », « Période : sept. 2026 », « Moyenne de… »
    const quand = d && (d.periode.length === 10 ? `Au ${periodeCourte(d.periode)}` : `${r.prefixe_periode} ${periodeCourte(d.periode)}`);
    return morceaux && { ...morceaux, sous: d ? `${valeurAvecSymbole(d.valeur, valeurs[r.id].decimales, r.unite)} · ${quand}` : "Donnée indisponible", action: "aller", adresse: "#/marches" };
  }).filter(Boolean).slice(0, PAR_GROUPE);
  if (indicateurs.length) groupes.push({ titre: "Indicateurs", resultats: indicateurs });

  const themes = Object.fromEntries((sources.reglages?.themes_glossaire || []).map((th) => [th.id, th.libelle_court || th.libelle]));
  const concepts = (sources.concepts?.concepts || []).map((c) => {
    const morceaux = decouper(c.terme, q);
    return morceaux && { ...morceaux, sous: themes[c.theme] || "Glossaire", action: "aller", adresse: `#/glossaire/${c.id}` };
  }).filter(Boolean).slice(0, PAR_GROUPE);
  if (concepts.length) groupes.push({ titre: "Glossaire", resultats: concepts });

  const fils = (sources.filsRouges?.fils || []).map((f) => {
    const morceaux = decouper(f.titre, q);
    const dernier = f.evenements.map((e) => e.date).sort().pop();
    return morceaux && { ...morceaux, sous: dernier ? `Dernière évolution : ${dateMoyenne(dernier)}` : "Pas encore d'événement", action: "aller", adresse: `#/fils/${f.id}` };
  }).filter(Boolean).slice(0, PAR_GROUPE);
  if (fils.length) groupes.push({ titre: "Fils rouges", resultats: fils });

  return { indication: false, groupes, total: groupes.reduce((n, g) => n + g.resultats.length, 0) };
}

function resultats(r, terme) {
  if (r.indication) {
    return html`<p class="m-0 pt-[22px] px-7 pb-[26px] text-[15px] leading-[1.55] text-encre2">Tape au moins deux lettres : la recherche porte sur les infos publiées, les fils rouges, les indicateurs et le glossaire.</p>`;
  }
  if (!r.total) {
    return html`<div role="status" class="py-10 px-12 flex flex-col items-center text-center gap-3">
      <h2 class="m-0 text-[22px] font-extrabold tracking-[-0.02em]">Aucun résultat pour « ${terme.trim()} »</h2>
      <p class="m-0 max-w-[500px] text-[16px] leading-[1.6] text-encre2">La recherche porte sur les infos publiées, les fils rouges, les indicateurs et le glossaire. Essaie un terme plus général, par exemple « monnaie » ou « marchés ».</p>
      <button type="button" data-resultat="aller" data-adresse="#/glossaire" class="presse mt-2 h-11 px-5 border-0 rounded-full cursor-pointer text-[15px] font-bold text-accent bg-accent-fond">Parcourir le glossaire</button>
    </div>`;
  }
  return html`<div class="pt-3 px-3 pb-4 flex flex-col gap-1">
    ${r.groupes.map((g) => html`
      <span class="pt-2.5 px-3.5 pb-1 text-[14px] font-bold text-encre2">${g.titre}</span>
      ${g.resultats.map((x) => html`
      <button type="button" class="survol flex flex-col gap-1 py-2.5 px-3.5 border-0 rounded-2xl bg-transparent cursor-pointer text-left"
        data-resultat="${x.action}" data-adresse="${x.adresse || ""}" data-date="${x.date || ""}" data-id="${x.id || ""}">
        <span class="text-[16px] font-semibold leading-[1.4]">${x.avant}${x.trouve ? html`<mark>${x.trouve}</mark>` : ""}${x.apres}</span>
        <span class="text-[13.5px] text-encre3">${x.sous}</span>
      </button>`)}`)}
  </div>`;
}

function actualiser() {
  const { champ, panneau, contexte } = ouverte;
  const r = chercher(champ.value, contexte.sources());
  panneau.querySelector("[data-compte]").textContent = r.indication ? "" : `${r.total} résultat${r.total > 1 ? "s" : ""}`;
  panneau.querySelector("[data-resultats]").innerHTML = String(resultats(r, champ.value));
}

/** contexte : { sources(), chargerIndex(), ouvrirInfo(date, id), aller(adresse) } */
export async function ouvrirRecherche(origine, contexte) {
  if (ouverte) return;
  const couche = document.getElementById("couche-recherche");
  couche.innerHTML = String(html`
    <div data-role="voile" aria-hidden="true" class="absolute inset-0 z-30 bg-voile"></div>
    <div data-role="panneau" role="dialog" aria-modal="true" aria-label="Recherche"
      class="panneau-recherche fenetre defilement absolute z-[31] top-7 right-[72px] w-[700px] max-h-[calc(100%-56px)] overflow-y-auto box-border rounded-carte">
      <label class="flex items-center gap-3 h-16 pr-4 pl-6 border-b border-sep">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:var(--acc);stroke-width:2;stroke-linecap:round;flex-shrink:0"><path d="${LOUPE}"></path></svg>
        <span class="sr-only">Rechercher</span>
        <input type="search" data-champ placeholder="Une info, un concept, un indicateur…" autocomplete="off"
          class="flex-1 min-w-0 bg-transparent border-0 outline-none text-encre text-[18px] font-semibold">
        <span data-compte class="text-[14px] font-semibold text-encre2 whitespace-nowrap"></span>
        <button type="button" data-fermer aria-label="Fermer la recherche" class="w-11 h-11 rounded-xl border-0 bg-transparent flex items-center justify-center cursor-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="${CROIX}"></path></svg>
        </button>
      </label>
      <div data-resultats></div>
    </div>`);
  const panneau = couche.querySelector('[data-role="panneau"]');
  const voile = couche.querySelector('[data-role="voile"]');
  const champ = panneau.querySelector("[data-champ]");
  ouverte = { couche, panneau, voile, champ, origine, contexte };
  actualiser();
  champ.focus();

  const reduit = animationsReduites();
  voile.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  panneau.animate([{ opacity: 0, transform: reduit ? "none" : "translateY(-8px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: reduit ? 250 : 220, easing: COURBE });

  voile.addEventListener("click", () => fermerRecherche());
  champ.addEventListener("input", actualiser);
  panneau.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); fermerRecherche(); }
    if (e.key === "Tab") garderLeFocus(e);
  });
  panneau.addEventListener("click", (e) => {
    if (e.target.closest("[data-fermer]")) return fermerRecherche();
    const resultat = e.target.closest("[data-resultat]");
    if (!resultat) return;
    const { resultat: action, adresse, date, id } = resultat.dataset;
    fermerRecherche(true);
    if (action === "info") contexte.ouvrirInfo(date, id);
    else contexte.aller(adresse);
  });

  // L'index de toutes les éditions n'est chargé qu'à la première recherche
  await contexte.chargerIndex();
  if (ouverte?.champ === champ) actualiser();
}

export function fermerRecherche(immediat = false) {
  if (!ouverte) return;
  const { couche, panneau, voile, origine } = ouverte;
  ouverte = null;
  const finir = () => { couche.innerHTML = ""; if (!immediat && origine?.isConnected) origine.focus({ preventScroll: true }); };
  if (immediat) return finir();
  voile.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
  panneau.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease-in", fill: "forwards" }).onfinish = finir;
}

export const rechercheOuverte = () => Boolean(ouverte);

function garderLeFocus(e) {
  const focusables = [...ouverte.panneau.querySelectorAll("input, button")];
  const premier = focusables[0], dernier = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
}
