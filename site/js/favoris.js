// Favoris : enregistrés dans ce navigateur (une copie des informations utiles, pour pouvoir
// les afficher plus tard même quand l'édition d'origine n'est plus celle du jour).
import { lire, ecrire } from "./stockage.js";

const CLE = "favoris";

export function tousLesFavoris() {
  const favoris = lire(CLE, {});
  return favoris && typeof favoris === "object" && !Array.isArray(favoris) ? favoris : {};
}

export const estFavori = (id) => Boolean(tousLesFavoris()[id]);

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
  ecrire(CLE, favoris);
  return Boolean(favoris[info.id]);
}
