// Favoris : enregistrés dans ce navigateur (une copie des informations utiles, pour pouvoir
// les afficher plus tard même quand l'édition d'origine n'est plus celle du jour).
// Export / import en fichier JSON pour les retrouver sur un autre appareil.
import { lire, ecrire } from "./stockage.js";

const CLE = "favoris";
const FORMAT_EXPORT = "morning-market-favoris";

export function tousLesFavoris() {
  const favoris = lire(CLE, {});
  return favoris && typeof favoris === "object" && !Array.isArray(favoris) ? favoris : {};
}

export const estFavori = (id) => Boolean(tousLesFavoris()[id]);

function enregistrer(favoris) {
  ecrire(CLE, favoris);
  window.dispatchEvent(new CustomEvent("favoris-modifies"));
}

/** Ajoute ou retire une info. Renvoie le nouvel état (true = en favori). */
export function basculerFavori(info, dateEdition) {
  const favoris = tousLesFavoris();
  if (favoris[info.id]) {
    delete favoris[info.id];
  } else {
    favoris[info.id] = {
      id: info.id, titre: info.titre, titre_fr: info.titre_fr || null, source: info.source, url: info.url,
      categorie: info.categorie, edition: dateEdition, ajoute_le: new Date().toISOString(),
    };
  }
  enregistrer(favoris);
  return Boolean(favoris[info.id]);
}

export function retirerFavori(id) {
  const favoris = tousLesFavoris();
  delete favoris[id];
  enregistrer(favoris);
}

/** Fichier téléchargé par « Exporter ». */
export function fichierExport(aujourdHui) {
  const contenu = JSON.stringify({ format: FORMAT_EXPORT, version: 1, exporte_le: new Date().toISOString(), favoris: tousLesFavoris() }, null, 2);
  return { nom: `morning-market-favoris-${aujourdHui}.json`, blob: new Blob([contenu], { type: "application/json" }) };
}

/** Un favori importé doit avoir au moins un identifiant, un titre, une adresse web et une date d'édition. */
function favoriValide(id, f) {
  return f && typeof f === "object" && typeof f.titre === "string" && typeof f.url === "string" && /^https?:\/\//.test(f.url)
    && typeof f.edition === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.edition) && (f.id === undefined || f.id === id);
}

/** Importe un fichier exporté : ajoute les favoris absents, sans toucher aux autres. Renvoie un message. */
export function importer(texte) {
  let donnees;
  try { donnees = JSON.parse(texte); } catch { return { ok: false, message: "Ce fichier n'est pas lisible : choisis un export de favoris Morning Market." }; }
  if (donnees?.format !== FORMAT_EXPORT || typeof donnees.favoris !== "object" || donnees.favoris === null) {
    return { ok: false, message: "Ce fichier n'est pas un export de favoris Morning Market." };
  }
  const favoris = tousLesFavoris();
  let ajoutes = 0, ignores = 0;
  for (const [id, f] of Object.entries(donnees.favoris)) {
    if (!favoriValide(id, f)) { ignores += 1; continue; }
    if (!favoris[id]) {
      favoris[id] = { id, titre: f.titre, titre_fr: typeof f.titre_fr === "string" ? f.titre_fr : null, source: String(f.source || ""),
        url: f.url, categorie: String(f.categorie || ""), edition: f.edition, ajoute_le: String(f.ajoute_le || new Date().toISOString()) };
      ajoutes += 1;
    }
  }
  enregistrer(favoris);
  const partie = ajoutes === 0 ? "Aucun nouveau favori : ils étaient déjà tous enregistrés." : `${ajoutes} favori${ajoutes > 1 ? "s" : ""} importé${ajoutes > 1 ? "s" : ""}.`;
  return { ok: true, message: ignores ? `${partie} ${ignores} élément${ignores > 1 ? "s" : ""} illisible${ignores > 1 ? "s" : ""} ignoré${ignores > 1 ? "s" : ""}.` : partie };
}
