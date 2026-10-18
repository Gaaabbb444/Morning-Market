// Point d'entrée du site : charge les données, affiche l'accueil, gère le thème, les filtres et la modale.
import { charger, chargerAccueil } from "./donnees.js";
import {
  categoriesParId, etatEdition, indicateursBandeau, cartesApprofondir,
  vueAccueil, lignesTop5, boutonsPastilles, enteteTop5, vueIndisponible,
} from "./accueil.js";
import { ouvrirModale, fermerModale, modaleOuverte } from "./modale.js";
import { dateTitre, dateChiffres, dateLongue, maintenantParis, animationsReduites, COURBE } from "./outils.js";
import { lire, ecrire } from "./stockage.js";

const contenu = document.getElementById("contenu");
const zonePrincipale = document.getElementById("zone-principale");
let donnees = null;
let categorieActive = "tout";
let animationsEnCours = [];

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
    cartes: cartesApprofondir(donnees),
  };
}

function afficherAccueil() {
  contenu.innerHTML = donnees?.edition ? String(vueAccueil(modeleAccueil())) : String(vueIndisponible());
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
  afficherAccueil();
  zonePrincipale.scrollTop = 0;
}

demarrer();
