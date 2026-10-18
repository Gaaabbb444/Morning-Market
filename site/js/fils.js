// Vues « Fils rouges » : la liste des sujets suivis, puis le détail d'un fil (synthèse et chronologie).
import { html, dateLongue, MOIS_COURTS } from "./outils.js";

/** « 18 oct. 2026 » */
function dateMoyenne(iso) {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${jour} ${MOIS_COURTS[mois - 1]} ${annee}`;
}

/** « Budget 2027 de la France (État et Sécurité sociale) » → titre et précision séparés. */
function decouperTitre(titre) {
  const morceaux = titre.match(/^(.*?)\s*\((.+)\)$/);
  return morceaux ? { titre: morceaux[1], precision: morceaux[2] } : { titre, precision: null };
}

const dernierEvenement = (fil) => fil.evenements.reduce((max, e) => (!max || e.date > max.date ? e : max), null);

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export function modeleListeFils(donnees) {
  const categories = Object.fromEntries((donnees.reglages?.categories || []).map((c) => [c.id, c]));
  const jour = donnees.edition?.date;
  const fils = [...(donnees.filsRouges?.fils || [])].sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === "actif" ? -1 : 1;
    const da = dernierEvenement(a)?.date || "", db = dernierEvenement(b)?.date || "";
    if (da !== db) return da < db ? 1 : -1;
    return b.evenements.length - a.evenements.length;
  });
  const ontEvolue = fils.filter((f) => f.statut === "actif" && f.evenements.some((e) => e.date === jour)).length;
  return {
    sousTitre: `Les sujets que tu suis dans la durée · ${ontEvolue === 0 ? "aucun n'a évolué depuis hier" : ontEvolue === 1 ? "1 a évolué depuis hier" : `${ontEvolue} ont évolué depuis hier`}`,
    lignes: fils.map((f) => {
      const clos = f.statut === "clos";
      const dernier = dernierEvenement(f);
      return {
        id: f.id, titre: f.titre, categorie: categories[f.categories?.[0]]?.libelle_onglet || "",
        nombre: f.evenements.length, derniere: dernier ? dateMoyenne(dernier.date) : "Pas encore",
        couleurTitre: clos ? "var(--ink2)" : "var(--ink)", couleurDate: dernier && !clos ? "var(--ink)" : "var(--ink3)",
        statut: clos ? "Clos" : "Actif", couleurStatut: clos ? "var(--ink2)" : "var(--acc)", fondStatut: clos ? "var(--hov)" : "var(--accbg)",
      };
    }),
  };
}

export function vueListeFils(m) {
  const colonnes = "grid-cols-[minmax(0,1fr)_120px_170px_110px]";
  return html`
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2.5">
      <h1 class="m-0 text-[36px] font-extrabold tracking-[-0.035em] leading-[1.1]">Fils rouges</h1>
      <p class="m-0 text-[16px] font-medium text-encre2">${m.sousTitre}</p>
    </header>
    <section aria-label="Liste des fils rouges" class="tuile pt-4 px-6 pb-4">
      <div class="ligne-tableau entete-fils grid ${colonnes} gap-x-6 pt-2.5 px-5 pb-3 text-[13.5px] font-bold text-encre3" aria-hidden="true">
        <span>Sujet</span><span class="text-right">Événements</span><span>Dernière évolution</span><span>Statut</span>
      </div>
      ${m.lignes.map((f, j) => html`
      <a href="#/fils/${f.id}" class="survol ligne-tableau ligne-fil w-full grid ${colonnes} gap-x-6 items-center py-[15px] px-5 border-t rounded-[20px] text-left" style="border-top-color:${j === 0 ? "transparent" : "var(--sep)"}">
        <span class="flex flex-col gap-1 min-w-0">
          <span class="souligne text-[17px] font-bold leading-[1.4]" style="color:${f.couleurTitre}">${f.titre}</span>
          <span class="text-[14px] font-medium text-encre3">${f.categorie}</span>
        </span>
        <span class="text-right text-[17px] font-bold tabular-nums" style="color:${f.couleurTitre}"><span class="sr-only">Événements : </span>${f.nombre}</span>
        <span class="text-[15px] font-semibold tabular-nums" style="color:${f.couleurDate}">${f.derniere}</span>
        <span><span class="inline-flex items-center gap-[7px] h-[30px] px-3 rounded-full text-[13.5px] font-bold" style="color:${f.couleurStatut};background:${f.fondStatut}">
          <span class="w-[7px] h-[7px] rounded-full" style="background:${f.couleurStatut}"></span>${f.statut}</span></span>
      </a>`)}
    </section>
  </div>`;
}

// ---------------------------------------------------------------------------
// Détail
// ---------------------------------------------------------------------------

export function modeleFil(donnees, id) {
  const fil = (donnees.filsRouges?.fils || []).find((f) => f.id === id);
  if (!fil) return null;
  const categories = Object.fromEntries((donnees.reglages?.categories || []).map((c) => [c.id, c]));
  const { titre, precision } = decouperTitre(fil.titre);
  const evenements = [...fil.evenements].sort((a, b) => (a.date < b.date ? 1 : -1));
  const n = evenements.length;
  return {
    titre,
    details: [precision, categories[fil.categories?.[0]]?.libelle_onglet, `${n} événement${n > 1 ? "s" : ""}`].filter(Boolean).join(" · "),
    statut: fil.statut === "clos" ? `Clos le ${fil.clos_le ? dateLongue(fil.clos_le) : ""}`.trim() : "Actif",
    actif: fil.statut !== "clos",
    synthese: fil.ou_en_est_on,
    miseAJour: fil.ou_en_est_on_maj_le ? `Mis à jour le ${dateLongue(fil.ou_en_est_on_maj_le)}` : null,
    evenements: evenements.map((e, i) => {
      const sources = [...new Set(e.liens.map((l) => l.source))];
      return { date: dateMoyenne(e.date), texte: e.resume, sources: sources.join(", "), lien: e.liens[0]?.url, recent: i === 0 };
    }),
  };
}

export function vueFil(m) {
  if (!m) {
    return html`<div class="flex flex-col gap-6 max-w-[880px]">
      <a href="#/fils" class="lien-nav self-start flex items-center gap-2 h-9 text-[15px] font-semibold text-encre2">${retour()}Fils rouges</a>
      <p class="m-0 text-[17px] text-encre2">Ce fil rouge est introuvable : il a peut-être été renommé.</p></div>`;
  }
  return html`
  <div class="max-w-[880px] flex flex-col gap-10">
    <header class="flex flex-col gap-3.5">
      <a href="#/fils" class="lien-nav self-start flex items-center gap-2 h-9 text-[15px] font-semibold text-encre2">${retour()}Fils rouges</a>
      <h1 class="m-0 text-[38px] font-extrabold tracking-[-0.035em] leading-[1.1]">${m.titre}</h1>
      <p class="m-0 text-[16px] font-medium text-encre2">${m.details} · <span class="font-bold" style="color:${m.actif ? "var(--acc)" : "var(--ink2)"}">${m.statut}</span></p>
    </header>
    <section aria-labelledby="ouenest" class="tuile py-[38px] px-[42px] flex flex-col gap-[18px]">
      <h2 id="ouenest" class="m-0 text-[16px] font-bold text-accent">Où en est-on ?</h2>
      ${m.synthese
        ? html`<p class="m-0 text-[21px] font-medium leading-[1.6] text-pretty">${m.synthese}</p>
          ${m.miseAJour ? html`<span class="text-[14px] text-encre3">${m.miseAJour}</span>` : ""}`
        : html`<p class="m-0 text-[17px] text-encre2">La synthèse sera rédigée dès le premier événement rattaché à ce sujet.</p>`}
    </section>
    <section aria-labelledby="chrono" class="flex flex-col gap-6">
      <h2 id="chrono" class="m-0 text-[22px] font-extrabold tracking-[-0.02em]">Chronologie</h2>
      ${m.evenements.length ? html`
      <ol class="m-0 p-0 list-none flex flex-col">
        ${m.evenements.map((e, i) => html`
        <li class="grid grid-cols-[112px_28px_minmax(0,1fr)] gap-x-4">
          <span class="text-[15px] font-bold tabular-nums whitespace-nowrap leading-[26px]" style="color:${e.recent ? "var(--acc)" : "var(--ink2)"}">${e.date}</span>
          <span aria-hidden="true" class="relative flex justify-center">
            <span class="absolute bottom-0 w-0.5 bg-sep" style="top:${i === 0 ? "14px" : "0px"}"></span>
            <span class="relative mt-[7px] w-3 h-3 rounded-full box-border border-2" style="background:${e.recent ? "var(--acc)" : "var(--bg)"};border-color:${e.recent ? "var(--acc)" : "var(--ink3)"}"></span>
          </span>
          <span class="flex flex-col gap-2 pb-8">
            <span class="text-[17px] font-semibold leading-[1.55]">${e.texte}</span>
            <span class="text-[14.5px] font-semibold text-encre2">${e.sources}${e.lien ? html` · <a href="${e.lien}" target="_blank" rel="noopener" class="text-accent font-bold">Lire l'article →</a>` : ""}</span>
          </span>
        </li>`)}
      </ol>` : html`<p class="m-0 text-[16px] text-encre2">Aucun événement pour l'instant.</p>`}
    </section>
  </div>`;
}

const retour = () => html`<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M15 18l-6-6 6-6"></path></svg>`;
