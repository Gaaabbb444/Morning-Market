// Lecture des fichiers JSON produits par la collecte (voir le dossier contrat/).
// Un fichier absent ou illisible renvoie null : chaque écran prévoit alors un état de repli.

export async function charger(chemin) {
  try {
    const reponse = await fetch(chemin, { cache: "no-cache" });
    return reponse.ok ? await reponse.json() : null;
  } catch {
    return null;
  }
}

/** Charge tout ce dont l'accueil a besoin. */
export async function chargerAccueil() {
  const [statut, reglages, indicateurs, filsRouges, citations] = await Promise.all([
    charger("data/statut.json"),
    charger("data/reglages-site.json"),
    charger("data/indicateurs.json"),
    charger("data/fils-rouges.json"),
    charger("data/citations.json"),
  ]);
  const edition = statut?.derniere_edition ? await charger(`data/jours/${statut.derniere_edition}.json`) : null;
  return { statut, reglages, indicateurs, filsRouges, citations, edition };
}
