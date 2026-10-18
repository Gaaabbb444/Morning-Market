// Vue « Catégories » : les articles du jour (Top 5 compris) classés par thème, un onglet par catégorie.
import { html } from "./outils.js";

/** Tous les articles de l'édition, rangés par catégorie (Top 5 en premier, puis les autres). */
export function articlesParCategorie(edition) {
  const parCategorie = {};
  for (const info of edition?.top5 || []) (parCategorie[info.categorie] ||= []).push(info);
  for (const [categorie, liste] of Object.entries(edition?.par_categorie || {})) {
    for (const info of liste) {
      if (!(parCategorie[categorie] ||= []).some((x) => x.id === info.id)) parCategorie[categorie].push(info);
    }
  }
  return parCategorie;
}

export function modeleCategories(donnees, choisie) {
  const articles = articlesParCategorie(donnees.edition);
  const categories = donnees.reglages?.categories || [];
  const active = categories.find((c) => c.id === choisie) || categories.find((c) => articles[c.id]?.length) || categories[0];
  const liste = articles[active?.id] || [];
  return {
    onglets: categories.map((c) => ({ id: c.id, libelle: c.libelle_onglet, nombre: (articles[c.id] || []).length, actif: c.id === active?.id })),
    titre: active?.libelle || "",
    compte: liste.length === 0 ? "Aucun article aujourd'hui" : `${liste.length} article${liste.length > 1 ? "s" : ""} aujourd'hui`,
    articles: liste,
  };
}

export function panneauCategorie(m) {
  return html`
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 class="m-0 text-[26px] font-extrabold tracking-[-0.025em]">${m.titre}</h2>
      <span class="text-[15px] font-semibold text-encre2 whitespace-nowrap">${m.compte}</span>
    </div>
    <div class="flex flex-col">
      ${m.articles.length ? m.articles.map((a, j) => html`
      <button type="button" data-action="ouvrir-article" data-id="${a.id}" class="survol flex flex-col gap-2 py-[18px] px-5 -mx-5 border-0 border-t rounded-[20px] bg-transparent cursor-pointer text-left" style="border-top-color:${j === 0 ? "transparent" : "var(--sep)"}">
        <span class="souligne text-[18px] font-bold leading-[1.45]">${a.titre}</span>
        <span class="text-[14.5px] font-medium text-encre3"><span class="font-bold text-encre2">${a.source}</span> · ${a.nb_sources} source${a.nb_sources > 1 ? "s" : ""}</span>
      </button>`) : html`<p class="m-0 py-4 text-[16px] text-encre2">Aucun article de cette catégorie dans l'édition du jour.</p>`}
    </div>`;
}

export function vueCategories(m) {
  return html`
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2.5">
      <h1 class="m-0 text-[36px] font-extrabold tracking-[-0.035em] leading-[1.1]">Catégories</h1>
      <p class="m-0 text-[16px] font-medium text-encre2">Les articles du jour, classés par thème de cours</p>
    </header>
    <div role="tablist" aria-label="Catégories" class="flex flex-wrap gap-1">
      ${m.onglets.map((o) => html`
      <a href="#/categories/${o.id}" role="tab" aria-selected="${o.actif ? "true" : "false"}" data-onglet="${o.id}"
        class="survol presse flex items-center gap-2 h-[42px] px-4 rounded-full text-[15px] ${o.actif ? "font-bold text-encre bg-accent-fond2" : "font-semibold text-encre2"}">${o.libelle}<span class="text-[13px] font-bold tabular-nums" style="color:${o.actif ? "var(--acc)" : "var(--ink3)"}">${o.nombre}</span></a>`)}
    </div>
    <section id="panneau-categorie" role="tabpanel" aria-label="${m.titre}" class="panneau-onglet tuile pt-9 px-10 pb-7 flex flex-col gap-[18px]">${panneauCategorie(m)}</section>
  </div>`;
}
