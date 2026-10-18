// Point d'entrée du site : charge les données, gère la navigation entre les vues, le thème, les filtres et la modale.
import { charger, chargerAccueil } from "./donnees.js";
import {
  categoriesParId, etatEdition, indicateursBandeau, cartesApprofondir,
  vueAccueil, lignesTop5, boutonsPastilles, enteteTop5, vueIndisponible,
} from "./accueil.js";
import { ouvrirModale, fermerModale, modaleOuverte } from "./modale.js";
import { modeleMarches, vueMarches } from "./marches.js";
import { modeleListeFils, vueListeFils, modeleFil, vueFil } from "./fils.js";
import { dateTitre, dateChiffres, dateLongue, maintenantParis, animationsReduites, COURBE } from "./outils.js";
import { lire, ecrire } from "./stockage.js";

const contenu = document.getElementById("contenu");
const zonePrincipale = document.getElementById("zone-principale");
let donnees = null;
let categorieActive = "tout";
let animationsEnCours = [];
let vueActuelle = null;
let navigationEnCours = false;

// ---------------------------------------------------------------------------
// Vues disponibles (les autres s'ajouteront au fil des lots) et navigation par l'adresse (#/marches…)
// ---------------------------------------------------------------------------
const VUES = [
  { cle: "accueil", libelle: "Aujourd'hui", adresse: "#/", titre: "Morning Market",
    icone: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" },
  { cle: "marches", libelle: "Marchés", adresse: "#/marches", titre: "Marchés · Morning Market", icone: "M3 17l5-5 4 4 8-8M14 8h6v6" },
  { cle: "fils", libelle: "Fils rouges", adresse: "#/fils", titre: "Fils rouges · Morning Market",
    icone: "M12 3v2.5M12 10.5v3M12 18.5V21M12 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM12 13.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z" },
];

/** « #/fils/budget-2027 » → { vue: "fils", parametre: "budget-2027" } */
function lireAdresse() {
  const [, vue = "", parametre = null] = location.hash.split("/");
  return VUES.some((v) => v.cle === vue) ? { vue, parametre } : { vue: "accueil", parametre: null };
}

function construireNavigation() {
  const nav = document.getElementById("navigation");
  nav.insertAdjacentHTML("beforeend", VUES.map((v) => `
    <a href="${v.adresse}" data-vue="${v.cle}" class="lien-nav relative flex items-center gap-3.5 h-[46px] px-3.5 rounded-nav text-[15px] whitespace-nowrap">
      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><path d="${v.icone}"></path></svg>${v.libelle}</a>`).join(""));
}

/** Élément actif de la barre latérale : graisse, couleur, et repère qui glisse (50 px par élément). */
function marquerNavigation(cle) {
  const index = VUES.findIndex((v) => v.cle === cle);
  for (const lien of document.querySelectorAll("#navigation [data-vue]")) {
    const actif = lien.dataset.vue === cle;
    lien.toggleAttribute("aria-current", actif);
    if (actif) lien.setAttribute("aria-current", "page");
    lien.classList.toggle("font-bold", actif); lien.classList.toggle("text-encre", actif);
    lien.classList.toggle("font-semibold", !actif); lien.classList.toggle("text-encre2", !actif);
    lien.querySelector("svg").style.stroke = actif ? "var(--acc)" : "currentColor";
  }
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
  const bouton = document.getElementById("bouton-theme");
  bouton.querySelector("[data-libelle]").textContent = theme === "dark" ? "Mode clair" : "Mode sombre";
  bouton.setAttribute("aria-label", theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre");
  bouton.querySelector("path").setAttribute("d", theme === "dark" ? SOLEIL : LUNE);
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
function modeleAccueil() {
  const maintenant = maintenantParis();
  const etat = etatEdition(donnees, maintenant);
  const categories = categoriesParId(donnees.reglages);
  const top5 = donnees.edition?.top5 || [];
  const libellePastille = (id) => categories[id]?.libelle_pastille || "";
  // Filtres : « Tout » + les seules catégories présentes dans le Top 5 du jour (dans l'ordre de config.yaml)
  const presentes = (donnees.reglages?.categories || []).filter((c) => top5.some((t) => t.categorie === c.id));
  if (categorieActive !== "tout" && !presentes.some((c) => c.id === categorieActive)) categorieActive = "tout";
  const top5Visibles = categorieActive === "tout" ? top5 : top5.filter((t) => t.categorie === categorieActive);
  const titreJour = etat.editionDuJour ? "Top 5 du jour" : `Top 5 du ${dateLongue(etat.dateEdition).replace(/ \d{4}$/, "")}`;
  return {
    titreDate: dateTitre(etat.dateEdition),
    mention: etat.mention,
    ancienne: etat.ancienne,
    dateChiffres: dateChiffres(etat.dateEdition),
    sansIA: etat.sansIA,
    essentiel: donnees.edition.essentiel || [],
    pastilles: [{ id: "tout", libelle: "Tout", actif: categorieActive === "tout" },
      ...presentes.map((c) => ({ id: c.id, libelle: c.libelle_pastille, actif: c.id === categorieActive }))],
    filtreActif: categorieActive !== "tout",
    compteFiltre: `${top5Visibles.length} ${top5Visibles.length > 1 ? "infos" : "info"} sur ${top5.length}`,
    titreTop5: titreJour + (categorieActive === "tout" ? "" : ` · ${libellePastille(categorieActive)}`),
    top5Visibles,
    libellePastille,
    indicateurs: indicateursBandeau(donnees.reglages, donnees.indicateurs),
    nombreIndicateurs: (donnees.reglages?.indicateurs || []).length,
    cartes: cartesApprofondir(donnees),
  };
}

function rendreVue({ vue, parametre }) {
  if (!donnees?.edition && vue === "accueil") return String(vueIndisponible());
  if (vue === "marches") return String(vueMarches(modeleMarches(donnees)));
  if (vue === "fils") return String(parametre ? vueFil(modeleFil(donnees, decodeURIComponent(parametre))) : vueListeFils(modeleListeFils(donnees)));
  categorieActive = "tout";
  return String(vueAccueil(modeleAccueil()));
}

/** Change de vue : sortie (140 ms) puis entrée (320 ms) du contenu, en haut de page. */
function afficher(adresse, animer = true) {
  const cle = `${adresse.vue}/${adresse.parametre || ""}`;
  if (cle === vueActuelle || navigationEnCours) return;
  if (modaleOuverte()) fermerModale(true);
  const reduit = animationsReduites();
  const appliquer = () => {
    contenu.innerHTML = rendreVue(adresse);
    vueActuelle = cle;
    marquerNavigation(adresse.vue);
    document.title = VUES.find((v) => v.cle === adresse.vue).titre;
    zonePrincipale.scrollTop = 0;
    navigationEnCours = false;
    if (animer) contenu.animate([{ opacity: 0, transform: reduit ? "none" : "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: reduit ? 250 : 320, easing: COURBE });
    contenu.classList.add("sans-apparition"); // l'arrivée animée de l'accueil ne se rejoue pas
  };
  if (!animer) return appliquer();
  navigationEnCours = true;
  const sortie = contenu.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduit ? "none" : "translateY(-6px)" }],
    { duration: 140, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
  sortie.onfinish = () => { appliquer(); sortie.cancel(); };
}

// ---------------------------------------------------------------------------
// Filtres du Top 5 : sortantes en fondu, restantes glissent vers leur place (FLIP), entrantes apparaissent
// ---------------------------------------------------------------------------
function filtrer(categorie) {
  if (categorie === categorieActive) return;
  const liste = document.getElementById("liste-top5");
  const reduit = animationsReduites();
  const top5 = donnees.edition.top5;
  const gardees = new Set((categorie === "tout" ? top5 : top5.filter((t) => t.categorie === categorie)).map((t) => t.id));
  const lignes = liste ? [...liste.querySelectorAll("[data-k]")] : [];
  const avant = Object.fromEntries(lignes.map((el) => [el.dataset.k, el.getBoundingClientRect()]));
  const sortantes = lignes.filter((el) => !gardees.has(el.dataset.k));

  const appliquer = () => {
    animationsEnCours.forEach((a) => a.cancel());
    animationsEnCours = [];
    categorieActive = categorie;
    const modele = modeleAccueil();
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
  if (cible.dataset.action === "filtrer") filtrer(cible.dataset.categorie);
  if (cible.dataset.action === "ouvrir") {
    const info = donnees.edition.top5.find((t) => t.id === cible.dataset.id);
    if (info) ouvrirModale(info, cible, { categories: categoriesParId(donnees.reglages), filsRouges: donnees.filsRouges, dateEdition: donnees.edition.date });
  }
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modaleOuverte()) fermerModale(); });
window.addEventListener("hashchange", () => afficher(lireAdresse()));
document.getElementById("bouton-theme").addEventListener("click", basculerTheme);

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function demarrer() {
  appliquerTheme(new URLSearchParams(location.search).get("theme") || lire("theme", "dark"));
  donnees = await chargerAccueil();
  // Récap de la semaine : le plus récent qui s'achève au plus tard le jour de l'édition
  const recaps = (await charger("data/recaps/index.json"))?.recaps || [];
  const recent = recaps.find((r) => r.type === "semaine" && donnees.edition?.date && r.au <= donnees.edition.date);
  donnees.recap = recent ? await charger(`data/${recent.fichier}`) : null;
  construireNavigation();
  afficher(lireAdresse(), false);
  contenu.classList.remove("sans-apparition"); // premier affichage : l'accueil arrive avec son animation
}

demarrer();
