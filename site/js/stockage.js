// Mémoire du navigateur (localStorage), protégée : en navigation privée ou si le stockage est
// bloqué, la lecture renvoie la valeur par défaut et l'écriture échoue sans casser le site.

const PREFIXE = "morning-market:";

export function lire(cle, valeurParDefaut) {
  try {
    const brut = window.localStorage.getItem(PREFIXE + cle);
    return brut === null ? valeurParDefaut : JSON.parse(brut);
  } catch {
    return valeurParDefaut;
  }
}

export function ecrire(cle, valeur) {
  try {
    window.localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
    return true;
  } catch {
    return false;
  }
}
