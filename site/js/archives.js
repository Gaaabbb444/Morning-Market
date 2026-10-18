// Vue « Archives » : calendrier des éditions et rétrospective de l'année (faits marquants des récaps hebdomadaires).
import { html, MOIS, MOIS_COURTS, dateLongue, prochainDimanche } from "./outils.js";

const JOURS_SEMAINE = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const pad = (n) => String(n).padStart(2, "0");

/** Filtre de catégorie de la rétrospective (gardé le temps de la visite). */
export const filtreRetro = { categorie: "toutes" };

// ---------------------------------------------------------------------------
// Calendrier
// ---------------------------------------------------------------------------

export function modeleCalendrier(dates, aujourdHui, moisDemande) {
  const avecEdition = new Set(dates);
  const premiere = [...dates].sort()[0] || aujourdHui;
  const moisDisponibles = [...new Set([...dates.map((d) => d.slice(0, 7)), aujourdHui.slice(0, 7)])].sort();
  const mois = moisDisponibles.includes(moisDemande) ? moisDemande : moisDisponibles[moisDisponibles.length - 1];
  const [annee, numero] = mois.split("-").map(Number);
  const nbJours = new Date(Date.UTC(annee, numero, 0)).getUTCDate();
  const decalage = (new Date(Date.UTC(annee, numero - 1, 1)).getUTCDay() + 6) % 7; // lundi = 0
  const cases = Array.from({ length: decalage }, () => null);
  for (let jour = 1; jour <= nbJours; jour++) {
    const iso = `${mois}-${pad(jour)}`;
    const edition = avecEdition.has(iso), aujourd = iso === aujourdHui, futur = iso > aujourdHui;
    cases.push({
      jour, iso, edition, aujourd, futur,
      etiquette: aujourd ? "Aujourd'hui" : edition ? "Édition" : !futur && iso > premiere ? "Pas d'édition" : "",
      adresse: edition ? (aujourd ? "#/" : `#/edition/${iso}`) : null,
      libelle: edition ? `Ouvrir l'édition du ${dateLongue(iso)}` : `${dateLongue(iso)}${futur ? "" : ", pas d'édition"}`,
    });
  }
  while (cases.length % 7) cases.push(null);
  const index = moisDisponibles.indexOf(mois);
  const n = dates.filter((d) => d.startsWith(mois)).length;
  return {
    titre: `${majuscule(MOIS[numero - 1])} ${annee}`, cases,
    compte: n === 0 ? "Aucune édition ce mois-ci" : `${n} édition${n > 1 ? "s" : ""} ce mois-ci`,
    precedent: index > 0 ? moisDisponibles[index - 1] : null,
    suivant: index < moisDisponibles.length - 1 ? moisDisponibles[index + 1] : null,
  };
}

const fleche = (chemin) => html`<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="${chemin}"></path></svg>`;

function calendrier(c) {
  const navigation = (cible, libelle, chemin) => cible ? html`<a href="#/archives/${cible}" aria-label="${libelle}" class="survol w-10 h-10 rounded-full flex items-center justify-center text-encre2">${fleche(chemin)}</a>` : "";
  return html`
  <section aria-label="Calendrier ${c.titre}" class="tuile pt-7 px-8 pb-[30px] flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-1">
        ${navigation(c.precedent, "Mois précédent", "M15 18l-6-6 6-6")}
        <h2 class="m-0 text-[22px] font-extrabold tracking-[-0.02em]">${c.titre}</h2>
        ${navigation(c.suivant, "Mois suivant", "M9 18l6-6-6-6")}
      </div>
      <span class="text-[15px] font-semibold text-encre2">${c.compte}</span>
    </div>
    <div class="calendrier-entete grid grid-cols-7 gap-2 text-[13.5px] font-bold text-encre3 px-1">${JOURS_SEMAINE.map((j) => html`<span>${j}</span>`)}</div>
    <div class="grid grid-cols-7 gap-2">
      ${c.cases.map((x) => {
        if (!x) return html`<span class="case-calendrier h-[84px]" aria-hidden="true"></span>`;
        const style = `background:${x.edition ? "var(--calm)" : "transparent"};border:1px solid ${x.aujourd ? "var(--acc)" : "var(--calmb)"}`;
        const contenu = html`
          <span class="text-[18px] font-bold tabular-nums" style="color:${x.futur ? "var(--ink3)" : "var(--ink)"}">${x.jour}</span>
          <span class="flex items-center gap-2 text-[12.5px] font-bold" style="color:${x.edition ? "var(--acc)" : "var(--ink3)"}">
            <span class="w-[7px] h-[7px] rounded-full" style="background:${x.edition ? "var(--acc)" : "transparent"}"></span>${x.etiquette}</span>`;
        const classes = "case-calendrier h-[84px] box-border py-3 px-3.5 rounded-ligne flex flex-col justify-between items-start text-left";
        return x.adresse
          ? html`<a href="${x.adresse}" aria-label="${x.libelle}" class="survol presse ${classes}" style="${style}">${contenu}</a>`
          : html`<div aria-label="${x.libelle}" class="${classes}" style="${style}">${contenu}</div>`;
      })}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Rétrospective
// ---------------------------------------------------------------------------

export function modeleRetro(recaps, reglages, filsRouges, dateReference) {
  const categories = Object.fromEntries((reglages?.categories || []).map((c) => [c.id, c]));
  const fils = Object.fromEntries((filsRouges?.fils || []).map((f) => [f.id, f.titre]));
  const vus = new Set();
  const evenements = recaps.filter((r) => r?.type === "semaine").flatMap((r) => r.faits_marquants || [])
    .filter((e) => { const cle = `${e.date}/${e.url}`; if (vus.has(cle)) return false; vus.add(cle); return true; })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const filtres = evenements.filter((e) => filtreRetro.categorie === "toutes" || e.categorie === filtreRetro.categorie);
  const annee = (dateReference || "").slice(0, 4);
  const moisPresents = [...new Set(filtres.map((e) => e.date.slice(0, 7)))].sort();
  return {
    vide: evenements.length === 0,
    prochainRecap: dateReference ? dateLongue(prochainDimanche(dateReference)) : "",
    titre: `L'année ${annee} en ${filtres.length} événement${filtres.length > 1 ? "s" : ""}`,
    duree: `Environ ${Math.max(1, Math.round(filtres.length * 0.6))} minute${filtres.length > 1 ? "s" : ""} de révision`,
    filtres: [{ id: "toutes", libelle: "Toutes" }, ...(reglages?.categories || []).map((c) => ({ id: c.id, libelle: c.libelle_onglet }))]
      .map((f) => ({ ...f, actif: f.id === filtreRetro.categorie })),
    mois: moisPresents.map((m) => ({
      nom: majuscule(MOIS[Number(m.slice(5, 7)) - 1]),
      evenements: filtres.filter((e) => e.date.startsWith(m)).map((e) => ({
        date: `${Number(e.date.slice(8, 10))} ${MOIS_COURTS[Number(e.date.slice(5, 7)) - 1]}`, titre: e.titre, url: e.url,
        aRetenir: e.a_retenir, meta: [fils[e.fil_rouge], categories[e.categorie]?.libelle_onglet].filter(Boolean).join(" · "),
      })),
    })),
  };
}

export function contenuRetro(r) {
  if (r.vide) {
    return html`<section class="tuile py-10 px-11 flex flex-col gap-3 max-w-[760px]">
      <h2 class="m-0 text-[22px] font-extrabold tracking-[-0.02em]">La rétrospective se construit au fil des semaines</h2>
      <p class="m-0 text-[16px] leading-[1.6] text-encre2">Chaque dimanche, le récapitulatif de la semaine y ajoute ses faits marquants, avec ce qu'il faut en retenir pour tes révisions.${r.prochainRecap ? ` Prochain rendez-vous : le ${r.prochainRecap}.` : ""}</p>
    </section>`;
  }
  return html`
  <div class="flex flex-col gap-5">
    <div class="flex items-baseline gap-4 flex-wrap">
      <h2 class="m-0 text-[26px] font-extrabold tracking-[-0.025em]">${r.titre}</h2>
      <span class="text-[15px] font-semibold text-encre2">${r.duree}</span>
    </div>
    <div role="group" aria-label="Filtrer par catégorie" class="flex gap-1 flex-wrap">
      ${r.filtres.map((f) => html`<button type="button" data-action="filtrer-retro" data-categorie="${f.id}" aria-pressed="${f.actif ? "true" : "false"}"
        class="survol presse h-10 px-[15px] rounded-full border-0 cursor-pointer text-[14px] ${f.actif ? "font-bold text-encre bg-accent-fond2" : "font-semibold text-encre2 bg-transparent"}">${f.libelle}</button>`)}
    </div>
    <section aria-label="Frise de l'année" class="tuile pt-6 px-9 pb-2.5 flex flex-col">
      ${r.mois.length ? r.mois.map((m, j) => html`
      <div class="ligne-tableau ligne-mois grid grid-cols-[132px_minmax(0,1fr)] gap-x-7 py-3.5 border-t" style="border-top-color:${j === 0 ? "transparent" : "var(--sep)"}">
        <h3 class="m-0 pt-3 text-[20px] font-extrabold tracking-[-0.02em]">${m.nom}</h3>
        <ol class="m-0 p-0 list-none flex flex-col gap-0.5">
          ${m.evenements.map((e) => html`
          <li class="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 py-3 px-3.5 rounded-ligne">
            <span class="text-[15px] font-bold text-accent tabular-nums leading-[1.5]">${e.date}</span>
            <span class="flex flex-col gap-[5px] min-w-0">
              <a href="${e.url}" target="_blank" rel="noopener" class="text-[17px] font-bold leading-[1.45]">${e.titre}</a>
              ${e.aRetenir ? html`<span class="text-[15px] leading-[1.5] text-encre2"><span class="font-bold text-accent">À retenir · </span>${e.aRetenir}</span>` : ""}
              ${e.meta ? html`<span class="text-[13.5px] font-medium text-encre3">${e.meta}</span>` : ""}
            </span>
          </li>`)}
        </ol>
      </div>`) : html`<p class="m-0 py-6 text-[16px] text-encre2">Aucun événement de cette catégorie pour l'instant.</p>`}
    </section>
  </div>`;
}

// ---------------------------------------------------------------------------
// Vue
// ---------------------------------------------------------------------------

export function ongletsArchives(onglet) {
  return html`${[["calendrier", "Calendrier", "#/archives"], ["retro", "Rétrospective", "#/archives/retro"]].map(([cle, libelle, adresse]) => html`
    <a href="${adresse}" role="tab" data-onglet-archives="${cle}" aria-selected="${onglet === cle ? "true" : "false"}"
      class="presse flex items-center h-10 px-5 rounded-full text-[15px] ${onglet === cle ? "font-bold text-encre bg-accent-fond2" : "font-semibold text-encre2"}">${libelle}</a>`)}`;
}

export function panneauArchives(m) {
  return m.onglet === "retro" ? contenuRetro(m.retro) : calendrier(m.calendrier);
}

export function vueArchives(m) {
  return html`
  <div class="flex flex-col gap-7">
    <header class="en-tete flex items-end justify-between gap-6">
      <div class="flex flex-col gap-2.5">
        <h1 class="m-0 text-[36px] font-extrabold tracking-[-0.035em] leading-[1.1]">Archives</h1>
        <p class="m-0 text-[16px] font-medium text-encre2">Retrouve une édition passée, ou révise l'année en quelques minutes</p>
      </div>
      <div id="onglets-archives" role="tablist" aria-label="Vues des archives" class="flex gap-1 p-1 rounded-full bg-champ border border-champ-bord">${ongletsArchives(m.onglet)}</div>
    </header>
    <div id="panneau-archives">${panneauArchives(m)}</div>
  </div>`;
}
