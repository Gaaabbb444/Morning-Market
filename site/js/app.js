// Point d'entrée du site : charge les données, gère la navigation entre les vues, le thème, les filtres et la modale.
import { charger, chargerAccueil } from "./donnees.js";
import {
  categoriesParId, etatEdition, indicateursBandeau, cartesApprofondir,
  vueAccueil, lignesTop5, boutonsPastilles, enteteTop5, vueIndisponible,
} from "./accueil.js";
import { ouvrirModale, fermerModale, modaleOuverte } from "./modale.js";
import { modeleMarches, vueMarches } from "./marches.js";
import { modeleListeFils, vueListeFils, modeleFil, vueFil } from "./fils.js";
import { articlesParCategorie, modeleCategories, vueCategories, panneauCategorie } from "./categories.js";
import { modeleFavoris, vueFavoris, listeFavoris } from "./vue-favoris.js";
import { tousLesFavoris, retirerFavori, fichierExport, importer } from "./favoris.js";
import { ouvrirRecherche, fermerRecherche, rechercheOuverte } from "./recherche.js";
import { filtresGlossaire, modeleGlossaire, vueGlossaire, listeConcepts, ficheConcept, boutonsThemes } from "./glossaire.js";
import { modeleMethodologie, vueMethodologie, sommaire, SECTIONS } from "./methodologie.js";
import { filtreRetro, modeleCalendrier, modeleRetro, vueArchives, panneauArchives, ongletsArchives } from "./archives.js";
import { html, dateTitre, dateChiffres, dateLongue, maintenantParis, animationsReduites, COURBE } from "./outils.js";
import { lire, ecrire } from "./stockage.js";

const contenu = document.getElementById("contenu");
const zonePrincipale = document.getElementById("zone-principale");
let donnees = null;
let categorieActive = "tout";
let animationsEnCours = [];
let vueActuelle = null;
let navigationEnCours = false;
const editions = new Map(); // éditions déjà chargées, par date (favoris, recherche et archives ouvrent des éditions passées)
const recaps = new Map();   // récapitulatifs déjà chargés, par fichier
let editionAffichee = null; // édition montrée par l'accueil : celle du jour, ou une édition archivée

// ---------------------------------------------------------------------------
// Vues disponibles (les autres s'ajouteront au fil des lots) et navigation par l'adresse (#/marches…)
// ---------------------------------------------------------------------------
const VUES = [
  { cle: "accueil", libelle: "Aujourd'hui", adresse: "#/", titre: "Morning Market",
    icone: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" },
  { cle: "marches", libelle: "Marchés", adresse: "#/marches", titre: "Marchés · Morning Market", icone: "M3 17l5-5 4 4 8-8M14 8h6v6" },
  { cle: "fils", libelle: "Fils rouges", adresse: "#/fils", titre: "Fils rouges · Morning Market",
    icone: "M12 3v2.5M12 10.5v3M12 18.5V21M12 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM12 13.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z" },
  { cle: "categories", libelle: "Catégories", adresse: "#/categories", titre: "Catégories · Morning Market", secondaire: true,
    icone: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z" },
  { cle: "glossaire", libelle: "Glossaire", adresse: "#/glossaire", titre: "Glossaire · Morning Market",
    icone: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" },
  { cle: "archives", libelle: "Archives", adresse: "#/archives", titre: "Archives · Morning Market", secondaire: true,
    icone: "M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v2A1.5 1.5 0 0 1 19.5 9h-15A1.5 1.5 0 0 1 3 7.5zM5 9v10h14V9M10 13h4" },
  { cle: "favoris", libelle: "Favoris", adresse: "#/favoris", titre: "Favoris · Morning Market", secondaire: true,
    icone: "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" },
  { cle: "methodologie", libelle: "Méthodologie", adresse: "#/methodologie", titre: "Méthodologie · Morning Market", secondaire: true, pied: true,
    icone: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5v.5" },
];

/** « #/fils/budget-2027 » → { vue: "fils", parametre: "budget-2027" } */
function lireAdresse() {
  const [, vue = "", parametre = null] = location.hash.split("/");
  if (vue === "edition" && /^\d{4}-\d{2}-\d{2}$/.test(parametre || "")) return { vue, parametre };
  return VUES.some((v) => v.cle === vue) ? { vue, parametre } : { vue: "accueil", parametre: null };
}

const lienNavigation = (v) => `
    <a href="${v.adresse}" data-vue="${v.cle}" ${v.secondaire ? "data-secondaire" : ""} class="lien-nav relative flex items-center gap-3.5 h-[46px] px-3.5 rounded-nav text-[15px] whitespace-nowrap">
      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><path d="${v.icone}"></path></svg>${v.libelle}</a>`;

function construireNavigation() {
  document.getElementById("navigation").insertAdjacentHTML("beforeend", VUES.filter((v) => !v.pied).map(lienNavigation).join(""));
  document.getElementById("bouton-theme").insertAdjacentHTML("beforebegin", VUES.filter((v) => v.pied).map(lienNavigation).join(""));
  // Menu « Plus » du téléphone : les rubriques secondaires et le thème
  document.getElementById("menu-plus").innerHTML = `<nav aria-label="Autres rubriques" class="flex flex-col gap-0.5">${VUES.filter((v) => v.secondaire).map(lienNavigation).join("")}</nav>
    <button type="button" data-bouton-theme class="lien-nav presse flex items-center gap-3.5 h-[46px] px-3.5 border-0 rounded-nav bg-transparent cursor-pointer text-[15px] font-semibold text-left text-encre2">
      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;flex-shrink:0"><path d=""></path></svg><span data-libelle></span></button>`;
  appliquerTheme(themeActuel());
}

/** Menu « Plus » (téléphone) : ouverture, fermeture par Échap ou clic à l'extérieur. */
function basculerMenuPlus(ouvrir = document.getElementById("menu-plus").hidden, rendreFocus = false) {
  const menu = document.getElementById("menu-plus");
  const bouton = document.getElementById("bouton-plus");
  menu.hidden = !ouvrir;
  bouton.setAttribute("aria-expanded", String(ouvrir));
  if (ouvrir) menu.querySelector("a, button").focus();
  else if (rendreFocus) bouton.focus();
}
const menuPlusOuvert = () => !document.getElementById("menu-plus").hidden;

/** Élément actif de la barre latérale : graisse, couleur, et repère qui glisse (50 px par élément). */
function marquerNavigation(vue) {
  const cle = vue === "edition" ? "archives" : vue; // une édition archivée se consulte depuis les Archives
  const index = VUES.filter((v) => !v.pied).findIndex((v) => v.cle === cle);
  for (const lien of document.querySelectorAll(".barre-laterale [data-vue], #menu-plus [data-vue]")) {
    const actif = lien.dataset.vue === cle;
    lien.toggleAttribute("aria-current", actif);
    if (actif) lien.setAttribute("aria-current", "page");
    lien.classList.toggle("font-bold", actif); lien.classList.toggle("text-encre", actif);
    lien.classList.toggle("font-semibold", !actif); lien.classList.toggle("text-encre2", !actif);
    // Hors de la liste principale (Méthodologie, menu « Plus »), pas de repère qui glisse : fond direct
    if (!lien.closest("#navigation")) lien.classList.toggle("bg-accent-fond", actif);
    lien.querySelector("svg").style.stroke = actif ? "var(--acc)" : "currentColor";
  }
  document.getElementById("bouton-plus").classList.toggle("actif", Boolean(VUES.find((v) => v.cle === cle)?.secondaire));
  const repere = document.querySelector("#navigation .repere-nav");
  repere.style.transform = `translateY(${Math.max(0, index) * 50}px)`;
  repere.style.opacity = index < 0 ? "0" : "1";
}

// ---------------------------------------------------------------------------
// Thème clair / sombre (sombre par défaut, choix mémorisé)
// ---------------------------------------------------------------------------
const SOLEIL = "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4";
const LUNE = "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z";

function appliquerTheme(theme) {
  const racine = document.documentElement;
  racine.classList.toggle("mm-dark", theme === "dark");
  racine.classList.toggle("mm-light", theme === "light");
  for (const bouton of document.querySelectorAll("[data-bouton-theme]")) {
    bouton.querySelector("[data-libelle]").textContent = theme === "dark" ? "Mode clair" : "Mode sombre";
    bouton.setAttribute("aria-label", theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre");
    bouton.querySelector("path").setAttribute("d", theme === "dark" ? SOLEIL : LUNE);
  }
}

function themeActuel() {
  return document.documentElement.classList.contains("mm-light") ? "light" : "dark";
}

function basculerTheme() {
  const suivant = themeActuel() === "dark" ? "light" : "dark";
  ecrire("theme", suivant);
  if (document.startViewTransition && !animationsReduites()) {
    try { document.startViewTransition(() => appliquerTheme(suivant)); return; } catch { /* navigateur ancien */ }
  }
  appliquerTheme(suivant);
}

// ---------------------------------------------------------------------------
// Préparation de l'accueil
// ---------------------------------------------------------------------------
function modeleAccueil(edition, archive = false, recap = null) {
  const maintenant = maintenantParis();
  const etat = etatEdition({ ...donnees, edition }, maintenant);
  const categories = categoriesParId(donnees.reglages);
  const top5 = edition?.top5 || [];
  const libellePastille = (id) => categories[id]?.libelle_pastille || "";
  // Filtres : « Tout » + les seules catégories présentes dans le Top 5 du jour (dans l'ordre de config.yaml)
  const presentes = (donnees.reglages?.categories || []).filter((c) => top5.some((t) => t.categorie === c.id));
  if (categorieActive !== "tout" && !presentes.some((c) => c.id === categorieActive)) categorieActive = "tout";
  const top5Visibles = categorieActive === "tout" ? top5 : top5.filter((t) => t.categorie === categorieActive);
  const titreJour = etat.editionDuJour && !archive ? "Top 5 du jour" : `Top 5 du ${dateLongue(etat.dateEdition).replace(/ \d{4}$/, "")}`;
  return {
    archive,
    dateLongueEdition: dateLongue(etat.dateEdition),
    titreDate: dateTitre(etat.dateEdition),
    mention: archive ? "· édition archivée" : etat.mention,
    ancienne: !archive && etat.ancienne,
    dateChiffres: dateChiffres(etat.dateEdition),
    sansIA: etat.sansIA,
    essentiel: edition.essentiel || [],
    pastilles: [{ id: "tout", libelle: "Tout", actif: categorieActive === "tout" },
      ...presentes.map((c) => ({ id: c.id, libelle: c.libelle_pastille, actif: c.id === categorieActive }))],
    filtreActif: categorieActive !== "tout",
    compteFiltre: `${top5Visibles.length} ${top5Visibles.length > 1 ? "infos" : "info"} sur ${top5.length}`,
    titreTop5: titreJour + (categorieActive === "tout" ? "" : ` · ${libellePastille(categorieActive)}`),
    top5Visibles,
    libellePastille,
    indicateurs: indicateursBandeau(donnees.reglages, donnees.indicateurs, archive ? etat.dateEdition : null),
    nombreIndicateurs: (donnees.reglages?.indicateurs || []).length,
    cartes: cartesApprofondir(donnees, edition, recap),
  };
}

/** Récap hebdomadaire le plus récent qui s'achève au plus tard à la date donnée. */
async function recapPour(date) {
  const entree = (donnees.indexRecaps || []).find((r) => r.type === "semaine" && date && r.au <= date);
  if (!entree) return null;
  if (!recaps.has(entree.fichier)) recaps.set(entree.fichier, await charger(`data/${entree.fichier}`));
  return recaps.get(entree.fichier);
}

/** Charge ce dont une vue a besoin (une seule fois), pendant l'animation de sortie de la vue précédente. */
async function preparerVue({ vue, parametre }) {
  if (vue === "glossaire") {
    donnees.concepts ||= await charger("data/concepts.json");
    donnees.usagesGlossaire ||= await charger("data/glossaire-usages.json");
  }
  if (vue === "archives") {
    donnees.dates ||= (await charger("data/jours/index.json"))?.dates || [];
    if (!donnees.recapsSemaine) {
      const liste = (donnees.indexRecaps || []).filter((r) => r.type === "semaine");
      donnees.recapsSemaine = (await Promise.all(liste.map((r) => charger(`data/${r.fichier}`)))).filter(Boolean);
    }
  }
  if (vue === "edition") {
    const edition = await chargerEdition(parametre);
    return { edition, recap: await recapPour(parametre) };
  }
  if (vue === "accueil") return { edition: donnees.edition, recap: await recapPour(donnees.edition?.date) };
  return {};
}

function modeleArchives(parametre) {
  const maintenant = maintenantParis();
  return {
    onglet: parametre === "retro" ? "retro" : "calendrier",
    calendrier: modeleCalendrier(donnees.dates || [], maintenant.date, /^\d{4}-\d{2}$/.test(parametre || "") ? parametre : null),
    retro: modeleRetro(donnees.recapsSemaine || [], donnees.reglages, donnees.filsRouges, donnees.edition?.date || maintenant.date),
  };
}

function rendreVue({ vue, parametre }, prepare = {}) {
  if (vue === "methodologie") return String(vueMethodologie(modeleMethodologie(donnees.reglages, maintenantParis().date), parametre || SECTIONS[0].id));
  if (vue === "glossaire") return String(vueGlossaire(modeleGlossaire(donnees, parametre)));
  if (vue === "archives") return String(vueArchives(modeleArchives(parametre)));
  if (vue === "edition") {
    editionAffichee = prepare.edition;
    if (!prepare.edition) return String(html`<div class="flex flex-col gap-6"><a href="#/archives" class="text-[15px] font-semibold text-encre2">← Archives</a>
      <p class="m-0 text-[17px] text-encre2">L'édition du ${dateLongue(parametre)} est introuvable.</p></div>`);
    categorieActive = "tout";
    return String(vueAccueil(modeleAccueil(prepare.edition, prepare.edition.date !== donnees.edition?.date, prepare.recap)));
  }
  if (!donnees?.edition && vue === "accueil") return String(vueIndisponible());
  if (vue === "marches") return String(vueMarches(modeleMarches(donnees)));
  if (vue === "fils") return String(parametre ? vueFil(modeleFil(donnees, decodeURIComponent(parametre))) : vueListeFils(modeleListeFils(donnees)));
  if (vue === "categories") return String(vueCategories(modeleCategories(donnees, parametre)));
  if (vue === "favoris") return String(vueFavoris(modeleFavoris(donnees)));
  categorieActive = "tout";
  editionAffichee = donnees.edition;
  return String(vueAccueil(modeleAccueil(donnees.edition, false, prepare.recap)));
}

/** Change de vue : sortie (140 ms) puis entrée (320 ms) du contenu, en haut de page. */
function afficher(adresse, animer = true) {
  const cle = `${adresse.vue}/${adresse.parametre || ""}`;
  if (cle === vueActuelle || navigationEnCours) return;
  if (modaleOuverte()) fermerModale(true);
  if (rechercheOuverte()) fermerRecherche(true);
  // Changement d'onglet dans Catégories : seul le panneau change, en fondu (pas toute la vue)
  if (adresse.vue === "categories" && vueActuelle?.startsWith("categories/")) return changerOnglet(adresse.parametre, cle);
  if (adresse.vue === "glossaire" && vueActuelle?.startsWith("glossaire/")) return changerConcept(adresse.parametre, cle);
  if (adresse.vue === "archives" && vueActuelle?.startsWith("archives/")) return changerPanneauArchives(adresse.parametre, cle);
  if (adresse.vue === "methodologie" && vueActuelle?.startsWith("methodologie/")) { vueActuelle = cle; return allerALaPartie(adresse.parametre, true); }
  if (menuPlusOuvert()) basculerMenuPlus(false);
  const reduit = animationsReduites();
  const preparation = preparerVue(adresse);
  const appliquer = async () => {
    const prepare = await preparation;
    contenu.innerHTML = rendreVue(adresse, prepare);
    vueActuelle = cle;
    marquerNavigation(adresse.vue);
    document.title = adresse.vue === "edition" ? `Édition du ${dateLongue(adresse.parametre)} · Morning Market` : VUES.find((v) => v.cle === adresse.vue).titre;
    zonePrincipale.scrollTop = 0;
    suiviSommaire?.disconnect();
    if (adresse.vue === "glossaire") montrerConceptActif();
    if (adresse.vue === "methodologie") { allerALaPartie(adresse.parametre, false); suivreLaLecture(); }
    if (animer) contenu.focus({ preventScroll: true }); // les lecteurs d'écran annoncent la nouvelle page
    navigationEnCours = false;
    if (animer) contenu.animate([{ opacity: 0, transform: reduit ? "none" : "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: reduit ? 250 : 320, easing: COURBE });
    contenu.classList.add("sans-apparition"); // l'arrivée animée de l'accueil ne se rejoue pas
  };
  if (!animer) return appliquer();
  navigationEnCours = true;
  const sortie = contenu.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduit ? "none" : "translateY(-6px)" }],
    { duration: 140, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
  let termine = false;
  const terminer = async () => {
    if (termine) return;
    termine = true;
    try { await appliquer(); } finally { navigationEnCours = false; sortie.cancel(); }
  };
  sortie.onfinish = terminer;
  // Filet de sécurité : si l'onglet est en arrière-plan, le navigateur suspend les animations
  // et la fin de la sortie n'arriverait jamais ; la page change quand même.
  setTimeout(terminer, 400);
}

function changerOnglet(categorie, cle) {
  const modele = modeleCategories(donnees, categorie);
  for (const onglet of contenu.querySelectorAll("[data-onglet]")) {
    const o = modele.onglets.find((x) => x.id === onglet.dataset.onglet);
    onglet.setAttribute("aria-selected", o.actif ? "true" : "false");
    for (const [classe, actif] of [["font-bold", o.actif], ["text-encre", o.actif], ["bg-accent-fond2", o.actif], ["font-semibold", !o.actif], ["text-encre2", !o.actif]]) onglet.classList.toggle(classe, actif);
    onglet.querySelector("span").style.color = o.actif ? "var(--acc)" : "var(--ink3)";
  }
  const panneau = document.getElementById("panneau-categorie");
  panneau.setAttribute("aria-label", modele.titre);
  panneau.innerHTML = String(panneauCategorie(modele));
  fondu(panneau);
  vueActuelle = cle;
}

function changerConcept(id, cle) {
  const modele = modeleGlossaire(donnees, id);
  document.getElementById("liste-concepts").innerHTML = String(listeConcepts(modele));
  const fiche = document.getElementById("fiche-concept");
  fiche.innerHTML = String(ficheConcept(modele.fiche));
  fondu(fiche);
  // Sur téléphone, la fiche est sous la liste : on l'amène à l'écran
  if (matchMedia("(max-width: 900px)").matches) fiche.scrollIntoView({ behavior: animationsReduites() ? "auto" : "smooth", block: "start" });
  vueActuelle = cle;
}

/** Méthodologie : fait défiler jusqu'à une partie (lien du sommaire ou adresse partagée). */
function allerALaPartie(id, doucement) {
  const titre = id && document.getElementById(id);
  if (!titre) return;
  titre.scrollIntoView({ behavior: doucement && !animationsReduites() ? "smooth" : "auto", block: "start" });
  marquerPartie(id);
}

function marquerPartie(id) {
  const conteneur = document.getElementById("sommaire-methodo");
  if (conteneur) conteneur.innerHTML = String(sommaire(id));
}

/** Le sommaire met en avant la partie en cours de lecture (sans changer l'adresse). */
let suiviSommaire = null;
function suivreLaLecture() {
  const titres = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
  if (!titres.length || !("IntersectionObserver" in window)) return;
  suiviSommaire = new IntersectionObserver(() => {
    const haut = zonePrincipale.getBoundingClientRect().top;
    const passes = titres.filter((t) => t.getBoundingClientRect().top - haut < zonePrincipale.clientHeight * 0.35);
    marquerPartie((passes[passes.length - 1] || titres[0]).id);
  }, { root: zonePrincipale, rootMargin: "0px 0px -60% 0px", threshold: [0, 1] });
  titres.forEach((t) => suiviSommaire.observe(t));
}

/** La liste des concepts défile (elle seule) jusqu'au concept affiché dans la fiche. */
function montrerConceptActif() {
  const liste = document.getElementById("liste-concepts");
  const actif = liste?.querySelector("[aria-current]");
  if (!actif || liste.scrollHeight <= liste.clientHeight) return;
  const decalage = actif.getBoundingClientRect().top - liste.getBoundingClientRect().top + liste.scrollTop;
  liste.scrollTop = Math.max(0, decalage - liste.clientHeight / 2 + actif.offsetHeight / 2);
}

function rafraichirListeConcepts() {
  const modele = modeleGlossaire(donnees, vueActuelle?.split("/")[1] || null);
  document.getElementById("themes-glossaire").innerHTML = String(boutonsThemes(modele));
  document.getElementById("liste-concepts").innerHTML = String(listeConcepts(modele));
  document.getElementById("compte-concepts").textContent = modele.compteListe;
}

function changerPanneauArchives(parametre, cle) {
  const modele = modeleArchives(parametre);
  document.getElementById("onglets-archives").innerHTML = String(ongletsArchives(modele.onglet));
  const panneau = document.getElementById("panneau-archives");
  panneau.innerHTML = String(panneauArchives(modele));
  fondu(panneau);
  vueActuelle = cle;
}

/** Changement d'onglet ou de liste : opacité 0,25 → 1 et léger glissement (220 ms). */
function fondu(element) {
  element.animate([{ opacity: 0.25, transform: animationsReduites() ? "none" : "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: COURBE });
}

// ---------------------------------------------------------------------------
// Ouverture d'une info (Top 5, catégories, favoris, recherche)
// ---------------------------------------------------------------------------
async function chargerEdition(date) {
  if (date === donnees.edition?.date) return donnees.edition;
  if (!editions.has(date)) editions.set(date, await charger(`data/jours/${date}.json`));
  return editions.get(date);
}

/** Cherche une info dans une édition ; à défaut (édition introuvable), utilise la copie gardée dans les favoris. */
async function ouvrirInfo(date, id, origine = null) {
  const edition = await chargerEdition(date);
  const toutes = edition ? Object.values(articlesParCategorie(edition)).flat() : [];
  const copie = tousLesFavoris()[id];
  const info = toutes.find((x) => x.id === id) || (copie && { nb_sources: 1, ...copie });
  if (!info) return;
  ouvrirModale(info, origine, { categories: categoriesParId(donnees.reglages), filsRouges: donnees.filsRouges, dateEdition: date },
    () => { if (vueActuelle === "favoris/") rafraichirFavoris(); });
}

// ---------------------------------------------------------------------------
// Favoris : retrait animé, tri, export et import
// ---------------------------------------------------------------------------
function rafraichirFavoris() {
  const modele = modeleFavoris(donnees);
  const liste = document.getElementById("liste-favoris");
  if (modele.aucun || !liste) { contenu.innerHTML = String(vueFavoris(modele)); return; }
  document.getElementById("compte-favoris").textContent = modele.compte;
  liste.innerHTML = String(listeFavoris(modele));
}

function retirer(bouton) {
  const ligne = bouton.closest("[data-f]");
  const reduit = animationsReduites();
  const fin = () => { retirerFavori(bouton.dataset.id); rafraichirFavoris(); };
  ligne.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduit ? "none" : "translateX(12px)" }],
    { duration: 180, easing: "ease-in", fill: "forwards" }).onfinish = fin;
}

function trierFavoris(tri) {
  ecrire("tri-favoris", tri);
  contenu.innerHTML = String(vueFavoris(modeleFavoris(donnees)));
  fondu(document.getElementById("liste-favoris"));
}

function exporterFavoris() {
  const { nom, blob } = fichierExport(maintenantParis().date);
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(blob);
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

async function importerFavoris(fichier) {
  const resultat = importer(await fichier.text());
  contenu.innerHTML = String(vueFavoris(modeleFavoris(donnees)));
  const message = document.getElementById("message-favoris");
  message.textContent = resultat.message;
  message.style.color = resultat.ok ? "" : "var(--down)";
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------
function lancerRecherche(origine) {
  ouvrirRecherche(origine, {
    sources: () => ({ index: donnees.index, indicateurs: donnees.indicateurs, reglages: donnees.reglages, filsRouges: donnees.filsRouges, concepts: donnees.concepts }),
    chargerIndex: async () => {
      donnees.index ||= await charger("data/index-recherche.json");
      donnees.concepts ||= await charger("data/concepts.json");
    },
    ouvrirInfo: (date, id) => ouvrirInfo(date, id),
    aller: (adresse) => { location.hash = adresse; },
  });
}

// ---------------------------------------------------------------------------
// Filtres du Top 5 : sortantes en fondu, restantes glissent vers leur place (FLIP), entrantes apparaissent
// ---------------------------------------------------------------------------
function filtrer(categorie) {
  if (categorie === categorieActive) return;
  const liste = document.getElementById("liste-top5");
  const reduit = animationsReduites();
  const top5 = editionAffichee.top5;
  const gardees = new Set((categorie === "tout" ? top5 : top5.filter((t) => t.categorie === categorie)).map((t) => t.id));
  const lignes = liste ? [...liste.querySelectorAll("[data-k]")] : [];
  const avant = Object.fromEntries(lignes.map((el) => [el.dataset.k, el.getBoundingClientRect()]));
  const sortantes = lignes.filter((el) => !gardees.has(el.dataset.k));

  const appliquer = () => {
    animationsEnCours.forEach((a) => a.cancel());
    animationsEnCours = [];
    categorieActive = categorie;
    const modele = modeleAccueil(editionAffichee, editionAffichee.date !== donnees.edition?.date);
    // On ne refait que les pastilles, l'en-tête du Top 5 et ses lignes (pas toute la page)
    document.getElementById("pastilles").innerHTML = String(boutonsPastilles(modele));
    document.getElementById("entete-top5").innerHTML = String(enteteTop5(modele));
    const nouvelleListe = document.getElementById("liste-top5");
    nouvelleListe.innerHTML = String(lignesTop5(modele, false));
    for (const el of nouvelleListe.querySelectorAll("[data-k]")) {
      const debut = avant[el.dataset.k];
      const fin = el.getBoundingClientRect();
      if (debut && !reduit) {
        const dy = debut.top - fin.top;
        if (Math.abs(dy) > 0.5) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 320, easing: COURBE });
      } else if (!debut) {
        el.animate([{ opacity: 0, transform: reduit ? "none" : "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: COURBE });
      }
    }
  };

  if (!sortantes.length) return appliquer();
  let restantes = sortantes.length;
  for (const el of sortantes) {
    const a = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduit ? "none" : "scale(.98)" }],
      { duration: 160, easing: "ease-in", fill: "forwards" });
    animationsEnCours.push(a);
    a.onfinish = () => { restantes -= 1; if (restantes === 0) appliquer(); };
  }
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
contenu.addEventListener("click", (e) => {
  const cible = e.target.closest("[data-action]");
  if (!cible) return;
  const { action, id } = cible.dataset;
  if (action === "filtrer") filtrer(cible.dataset.categorie);
  if (action === "ouvrir") ouvrirInfo(editionAffichee.date, id, cible);
  if (action === "ouvrir-article") ouvrirInfo(donnees.edition.date, id, cible);
  if (action === "ouvrir-usage") ouvrirInfo(cible.dataset.date, id, cible);
  if (action === "filtrer-theme") { filtresGlossaire.theme = cible.dataset.theme; rafraichirListeConcepts(); }
  if (action === "filtrer-retro") {
    filtreRetro.categorie = cible.dataset.categorie;
    const panneau = document.getElementById("panneau-archives");
    panneau.innerHTML = String(panneauArchives(modeleArchives("retro")));
    fondu(panneau.querySelector('[aria-label="Frise de l\'année"]') || panneau);
  }
  if (action === "ouvrir-favori") ouvrirInfo(tousLesFavoris()[id]?.edition, id, cible);
  if (action === "retirer-favori") retirer(cible);
  if (action === "trier") trierFavoris(cible.dataset.tri);
  if (action === "exporter") exporterFavoris();
  if (action === "importer") document.getElementById("fichier-import").click();
  if (action === "rechercher") lancerRecherche(cible);
});

contenu.addEventListener("input", (e) => {
  if (e.target.id === "recherche-concept") { filtresGlossaire.texte = e.target.value; rafraichirListeConcepts(); }
});

contenu.addEventListener("change", (e) => {
  if (e.target.id === "fichier-import" && e.target.files[0]) importerFavoris(e.target.files[0]);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modaleOuverte()) fermerModale();
  else if (e.key === "Escape" && rechercheOuverte()) fermerRecherche();
  else if (e.key === "Escape" && menuPlusOuvert()) basculerMenuPlus(false, true);
});
window.addEventListener("hashchange", () => { if (donnees) afficher(lireAdresse()); }); // rien avant le chargement des données
document.addEventListener("click", (e) => {
  // Lien d'évitement : donne le focus au contenu sans toucher à l'adresse (qui sert à la navigation)
  if (e.target.closest("#lien-evitement")) { e.preventDefault(); contenu.focus(); return; }
  if (e.target.closest("[data-bouton-theme]")) basculerTheme();
  if (e.target.closest("#bouton-plus")) basculerMenuPlus();
  else if (menuPlusOuvert() && !e.target.closest("#menu-plus")) basculerMenuPlus(false);
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function demarrer() {
  appliquerTheme(new URLSearchParams(location.search).get("theme") || lire("theme", "dark"));
  construireNavigation();
  const chargees = await chargerAccueil();
  chargees.indexRecaps = (await charger("data/recaps/index.json"))?.recaps || [];
  donnees = chargees; // seulement maintenant : un changement d'adresse plus tôt attend ce premier affichage
  afficher(lireAdresse(), false);
  contenu.classList.remove("sans-apparition"); // premier affichage : l'accueil arrive avec son animation
}

demarrer();
