// Vue « Favoris » : infos mises de côté, triées par date d'édition ou par catégorie ; export, import, état vide.
import { html, dateTitre, dateCourte } from "./outils.js";
import { tousLesFavoris } from "./favoris.js";
import { lire } from "./stockage.js";

const ETOILE = "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z";

export function modeleFavoris(donnees) {
  const categories = Object.fromEntries((donnees.reglages?.categories || []).map((c) => [c.id, c]));
  const tri = lire("tri-favoris", "date") === "categorie" ? "categorie" : "date";
  const favoris = Object.values(tousLesFavoris()).sort((a, b) => (a.edition === b.edition ? (a.ajoute_le < b.ajoute_le ? 1 : -1) : a.edition < b.edition ? 1 : -1));
  const libelleCategorie = (f) => categories[f.categorie]?.libelle || "Autre";
  let groupes;
  if (tri === "date") {
    const dates = [...new Set(favoris.map((f) => f.edition))];
    groupes = dates.map((d) => ({ titre: `${dateTitre(d)} ${d.slice(0, 4)}`,
      lignes: favoris.filter((f) => f.edition === d).map((f) => ({ ...f, meta: `${f.source} · ${libelleCategorie(f)}` })) }));
  } else {
    const noms = [...new Set(favoris.map(libelleCategorie))].sort((a, b) => a.localeCompare(b, "fr"));
    groupes = noms.map((nom) => ({ titre: nom,
      lignes: favoris.filter((f) => libelleCategorie(f) === nom).map((f) => ({ ...f, meta: `${f.source} · édition du ${dateCourte(f.edition)}` })) }));
  }
  const n = favoris.length;
  return { tri, groupes, aucun: n === 0, compte: n ? `${n} ${n > 1 ? "infos mises" : "info mise"} de côté pour tes révisions` : "Aucune info enregistrée pour l'instant" };
}

const icone = (chemin) => html`<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round"><path d="${chemin}"></path></svg>`;

export function listeFavoris(m) {
  return html`${m.groupes.map((g) => html`
    <div class="flex flex-col pt-3">
      <h2 class="m-0 pt-1.5 px-3.5 pb-2 text-[15px] font-bold text-accent">${g.titre}</h2>
      ${g.lignes.map((f) => html`
      <div data-f="${f.id}" class="survol grid grid-cols-[minmax(0,1fr)_44px] gap-x-3 items-center py-3 pr-1.5 pl-3.5 rounded-ligne">
        <button type="button" data-action="ouvrir-favori" data-id="${f.id}" class="flex flex-col gap-1.5 min-w-0 p-0 border-0 bg-transparent cursor-pointer text-left">
          <span class="souligne text-[17px] font-bold leading-[1.45] line-clamp-2">${f.titre}</span>
          <span class="text-[14px] font-medium text-encre3">${f.meta}</span>
        </button>
        <button type="button" data-action="retirer-favori" data-id="${f.id}" aria-label="Retirer des favoris" class="w-11 h-11 rounded-nav border-0 bg-transparent flex items-center justify-center cursor-pointer">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="fill:var(--acc);stroke:var(--acc);stroke-width:1.7;stroke-linejoin:round"><path d="${ETOILE}"></path></svg>
        </button>
      </div>`)}
    </div>`)}`;
}

export function vueFavoris(m) {
  return html`
  <div class="flex flex-col gap-7">
    <header class="en-tete flex items-end justify-between gap-6">
      <div class="flex flex-col gap-2.5">
        <h1 class="m-0 text-[36px] font-extrabold tracking-[-0.035em] leading-[1.1]">Favoris</h1>
        <p id="compte-favoris" class="m-0 text-[16px] font-medium text-encre2">${m.compte}</p>
      </div>
      <div class="flex items-center gap-1.5">
        <button type="button" data-action="exporter" ${m.aucun ? html`disabled` : ""} class="survol flex items-center gap-2 h-10 px-3.5 rounded-full border-0 bg-transparent cursor-pointer text-[14.5px] font-semibold text-encre2 disabled:opacity-45 disabled:cursor-default">${icone("M12 4v11M7 10l5 5 5-5M5 20h14")}Exporter</button>
        <button type="button" data-action="importer" class="survol flex items-center gap-2 h-10 px-3.5 rounded-full border-0 bg-transparent cursor-pointer text-[14.5px] font-semibold text-encre2">${icone("M12 15V4M7 9l5-5 5 5M5 20h14")}Importer</button>
        <input type="file" id="fichier-import" accept="application/json,.json" class="hidden">
      </div>
    </header>
    <p id="message-favoris" role="status" class="m-0 text-[15px] font-semibold text-accent empty:hidden"></p>
    ${m.aucun ? html`
    <section aria-labelledby="vide-t" class="self-center mt-10 w-[560px] max-w-full box-border rounded-[40px] py-[52px] px-14 tuile flex flex-col items-center text-center gap-5">
      <span aria-hidden="true" class="w-[84px] h-[84px] rounded-full flex items-center justify-center bg-accent-fond">
        <svg width="36" height="36" viewBox="0 0 24 24" style="fill:none;stroke:var(--acc);stroke-width:1.5;stroke-linejoin:round"><path d="${ETOILE}"></path></svg>
      </span>
      <h2 id="vide-t" class="m-0 text-[26px] font-extrabold tracking-[-0.025em]">Aucun favori pour l'instant</h2>
      <p class="m-0 text-[17px] leading-[1.65] text-encre2 text-pretty">Pour garder une info, ouvre-la depuis le Top 5 ou une catégorie, puis touche l'étoile en haut de la fenêtre. Elle apparaîtra ici avec sa date et sa catégorie, prête pour tes révisions.</p>
      <a href="#/" class="presse mt-1.5 inline-flex items-center h-[46px] px-[22px] rounded-full text-[15px] font-bold text-sur-accent bg-accent">Voir le Top 5 du jour</a>
    </section>` : html`
    <div class="flex items-center gap-3.5">
      <span id="tri" class="text-[14.5px] font-bold text-encre2">Trier par</span>
      <div role="group" aria-labelledby="tri" class="flex gap-1 p-1 rounded-full bg-champ border border-champ-bord">
        ${[["date", "Date"], ["categorie", "Catégorie"]].map(([cle, libelle]) => html`
        <button type="button" data-action="trier" data-tri="${cle}" aria-pressed="${m.tri === cle ? "true" : "false"}"
          class="presse h-[38px] px-[18px] border-0 rounded-full cursor-pointer text-[14.5px] ${m.tri === cle ? "font-bold text-encre bg-accent-fond2" : "font-semibold text-encre2 bg-transparent"}">${libelle}</button>`)}
      </div>
    </div>
    <section id="liste-favoris" aria-label="Liste des favoris" class="tuile pt-3.5 px-7 pb-[18px] flex flex-col">${listeFavoris(m)}</section>`}
    <p class="m-0 text-[14px] text-encre3">Tes favoris sont enregistrés dans ce navigateur. Exporte-les pour les retrouver sur un autre appareil.</p>
  </div>`;
}
