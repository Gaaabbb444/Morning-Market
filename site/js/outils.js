// Outils partagés : fabrication sûre du HTML, formats français (nombres, dates), heure de Paris.

// ---------------------------------------------------------------------------
// HTML sûr : tout texte inséré est « échappé » (un titre d'article ne peut jamais injecter de code).
// ---------------------------------------------------------------------------
class Brut {
  constructor(texte) { this.texte = texte; }
  toString() { return this.texte; }
}

const ECHAPPEMENTS = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const echapper = (texte) => String(texte).replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]);

function versHtml(valeur) {
  if (valeur === null || valeur === undefined || valeur === false) return "";
  if (valeur instanceof Brut) return valeur.texte;
  if (Array.isArray(valeur)) return valeur.map(versHtml).join("");
  return echapper(valeur);
}

/** Gabarit HTML : html`<p>${titre}</p>` échappe automatiquement les valeurs insérées. */
export function html(morceaux, ...valeurs) {
  let resultat = "";
  morceaux.forEach((morceau, i) => { resultat += morceau + (i < valeurs.length ? versHtml(valeurs[i]) : ""); });
  return new Brut(resultat);
}

// ---------------------------------------------------------------------------
// Nombres : virgule décimale, espace fine insécable (U+202F) pour les milliers et avant %, $ et pt.
// ---------------------------------------------------------------------------
export const ESPACE_FINE = " ";
export const MOINS = "−";

export function nombre(valeur, decimales) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    .format(valeur).replace(/[\s ]/g, ESPACE_FINE).replace("-", MOINS);
}

export function valeurAvecSymbole(valeur, decimales, symbole) {
  return nombre(valeur, decimales) + (symbole ? ESPACE_FINE + symbole : "");
}

/** « +0,28 % », « −1,09 % », « 0,00 pt » */
export function variation(ecart, type) {
  const signe = ecart > 0 ? "+" : ecart < 0 ? MOINS : "";
  return signe + nombre(Math.abs(ecart), 2) + ESPACE_FINE + (type === "pourcent" ? "%" : "pt");
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);

/** Découpe « 2026-10-18 » en nombres, sans fuseau horaire (c'est une date de calendrier). */
function decouper(dateIso) {
  const [annee, mois, jour] = dateIso.slice(0, 10).split("-").map(Number);
  return { annee, mois, jour, jourSemaine: new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() };
}

export const dateTitre = (iso) => { const d = decouper(iso); return `${majuscule(JOURS[d.jourSemaine])} ${d.jour} ${MOIS[d.mois - 1]}`; };
export const dateLongue = (iso) => { const d = decouper(iso); return `${d.jour} ${MOIS[d.mois - 1]} ${d.annee}`; };
export const dateCourte = (iso) => { const d = decouper(iso); return `${d.jour} ${MOIS_COURTS[d.mois - 1]}`; };
export const dateChiffres = (iso) => { const d = decouper(iso); return `${String(d.jour).padStart(2, "0")}/${String(d.mois).padStart(2, "0")}`; };
export const heure = (horodatage) => horodatage.slice(11, 16);

/** Période d'un indicateur : « 16 oct. 2026 », « sept. 2026 », « T2 2026 ». */
export function periodeCourte(periode) {
  if (periode.includes("-T")) return `T${periode.slice(-1)} ${periode.slice(0, 4)}`;
  if (periode.length === 7) return `${MOIS_COURTS[Number(periode.slice(5, 7)) - 1]} ${periode.slice(0, 4)}`;
  const d = decouper(periode);
  return `${d.jour} ${MOIS_COURTS[d.mois - 1]} ${d.annee}`;
}

/** « d'août », « de septembre », « du 16 oct. », « du T2 2026 » (pour « Valeur d'août »). */
export function dePeriode(periode) {
  if (periode.includes("-T")) return `du ${periodeCourte(periode)}`;
  if (periode.length === 10) return `du ${dateCourte(periode)}`;
  const mois = MOIS[Number(periode.slice(5, 7)) - 1];
  return /^[aeiouyéèâ]/i.test(mois) ? `d'${mois}` : `de ${mois}`;
}

/** Date et heure actuelles à Paris : { date: "2026-10-18", minutes: 13 * 60 + 29 }.
 *  Le paramètre d'adresse ?maintenant=2026-10-18T13:30 permet de figer l'heure (captures de test). */
export function maintenantParis() {
  const force = new URLSearchParams(location.search).get("maintenant");
  if (force) return { date: force.slice(0, 10), minutes: Number(force.slice(11, 13) || 12) * 60 + Number(force.slice(14, 16) || 0) };
  const parties = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parties.year}-${parties.month}-${parties.day}`, minutes: Number(parties.hour) * 60 + Number(parties.minute) };
}

/** Le dimanche qui suit strictement la date donnée, au format ISO (un dimanche → le dimanche suivant). */
export function prochainDimanche(iso) {
  const d = decouper(iso);
  const date = new Date(Date.UTC(d.annee, d.mois - 1, d.jour + (7 - d.jourSemaine)));
  return date.toISOString().slice(0, 10);
}

/** Le réglage « Réduire les animations » du système est-il actif ? */
export function animationsReduites() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export const COURBE = "cubic-bezier(.2,.9,.25,1)";
