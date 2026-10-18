// Vue « Marchés » : les 12 indicateurs en 4 blocs, avec mini-courbes SVG tirées de l'historique réel.
import { html, valeurAvecSymbole, variation, dateCourte, dateChiffres, heure, periodeCourte, MOIS_COURTS } from "./outils.js";

const LARGEUR = 300;
const HAUTEUR = 60;
const FENETRE_JOURS = 30;

// ---------------------------------------------------------------------------
// Préparation
// ---------------------------------------------------------------------------

/** Points de la courbe : 30 derniers jours (quotidien), 12 mois ou 8 trimestres. */
function pointsCourbe(donnee) {
  const historique = donnee.historique || [];
  if (!historique.length) return { points: [], etendue: "" };
  if (donnee.frequence === "quotidienne") {
    const fin = new Date(historique[historique.length - 1][0]);
    const debut = new Date(fin.getTime() - FENETRE_JOURS * 86400000);
    return { points: historique.filter(([p]) => new Date(p) >= debut), etendue: `${FENETRE_JOURS} jours` };
  }
  if (donnee.frequence === "mensuelle") return { points: historique.slice(-12), etendue: "12 mois" };
  return { points: historique.slice(-8), etendue: "8 trimestres" };
}

/** Libellé court d'une période sur l'axe : « 16 sept. », « oct. 2025 », « T3 2024 ». */
function reperePeriode(periode) {
  if (periode.length === 10) return dateCourte(periode);
  if (periode.includes("-T")) return periodeCourte(periode);
  return `${MOIS_COURTS[Number(periode.slice(5, 7)) - 1]} ${periode.slice(0, 4)}`;
}

/** Tracé de la courbe (reprend la géométrie du prototype : marge de 15 % au-dessus et en dessous). */
function geometrieLigne(valeurs) {
  const mini = Math.min(...valeurs), maxi = Math.max(...valeurs);
  const marge = (maxi - mini) * 0.15 || 1;
  const bas = mini - marge, haut = maxi + marge;
  const ligne = valeurs.map((v, i) => `${((i / Math.max(1, valeurs.length - 1)) * LARGEUR).toFixed(1)},${(HAUTEUR - ((v - bas) / (haut - bas)) * HAUTEUR).toFixed(1)}`).join(" ");
  return { ligne, aire: `${ligne} ${LARGEUR},${HAUTEUR} 0,${HAUTEUR}`, axe: HAUTEUR, pointilles: "none", barres: "" };
}

/** Barres autour de zéro (croissance trimestrielle du PIB). */
function geometrieBarres(valeurs) {
  const mini = Math.min(0, ...valeurs), maxi = Math.max(0, ...valeurs);
  const marge = (maxi - mini) * 0.2 || 0.5;
  const bas = mini - marge, haut = maxi + marge;
  const y = (v) => HAUTEUR - ((v - bas) / (haut - bas)) * HAUTEUR;
  const zero = y(0), pas = LARGEUR / valeurs.length, largeurBarre = pas * 0.56;
  const barres = valeurs.map((v, i) => {
    const x = i * pas + (pas - largeurBarre) / 2;
    let sommet = y(v);
    if (Math.abs(sommet - zero) < 1.5) sommet = zero - 1.5; // une valeur nulle reste visible
    return `M${x.toFixed(1)} ${zero.toFixed(1)}V${sommet.toFixed(1)}H${(x + largeurBarre).toFixed(1)}V${zero.toFixed(1)}Z`;
  }).join(" ");
  return { ligne: "", aire: "", axe: zero, pointilles: "3 3", barres };
}

export function modeleMarches(donnees) {
  const valeurs = Object.fromEntries((donnees.indicateurs?.indicateurs || []).map((i) => [i.id, i]));
  const reglages = donnees.reglages?.indicateurs || [];
  const maj = donnees.indicateurs?.mis_a_jour_le;
  let rang = 0;
  const blocs = (donnees.reglages?.groupes_indicateurs || []).map((groupe) => ({
    titre: groupe,
    lignes: reglages.filter((r) => r.groupe === groupe).map((r) => {
      const donnee = valeurs[r.id];
      const i = rang++;
      if (!donnee?.derniere_valeur) {
        return { nom: r.nom, note: r.note, valeur: "—", couleurValeur: "var(--muted)", ecart: "", couleurEcart: "var(--ink3)",
          quand: "Donnée indisponible", couleurQuand: "var(--ink3)", source: r.source, courbe: null };
      }
      const { valeur, periode } = donnee.derniere_valeur;
      const ecart = donnee.variation?.valeur ?? 0;
      const sens = r.prix_de_marche ? Math.sign(ecart) : 0;
      const trait = r.prix_de_marche ? (sens > 0 ? "var(--up)" : sens < 0 ? "var(--down)" : "var(--ink2)") : "var(--acc)";
      const remplissage = r.prix_de_marche ? (sens > 0 ? "var(--fup)" : sens < 0 ? "var(--fdown)" : "var(--facc)") : "var(--facc)";
      const { points, etendue } = pointsCourbe(donnee);
      const enBarres = donnee.frequence === "trimestrielle";
      const disponible = donnee.etat === "ok";
      let quand;
      if (!disponible) quand = `Dernière valeur connue : ${periodeCourte(periode)}`;
      else if (donnee.frequence === "quotidienne") quand = `Au ${periodeCourte(periode)}`;
      else quand = `${r.prefixe_periode} ${periodeCourte(periode)}`;
      return {
        nom: r.nom, note: r.note,
        valeur: valeurAvecSymbole(valeur, donnee.decimales, r.unite),
        couleurValeur: disponible ? "var(--ink)" : "var(--muted)",
        ecart: donnee.variation ? variation(ecart, donnee.variation.type) : "",
        couleurEcart: disponible && sens !== 0 ? trait : disponible ? "var(--ink2)" : "var(--ink3)",
        quand,
        couleurQuand: !disponible ? "var(--ink3)" : donnee.frequence === "quotidienne" ? "var(--ink)" : "var(--acc)",
        source: r.source,
        courbe: points.length > 1 ? {
          ...(enBarres ? geometrieBarres(points.map((p) => p[1])) : geometrieLigne(points.map((p) => p[1]))),
          trait, remplissage, etendue, debut: reperePeriode(points[0][0]), fin: reperePeriode(points[points.length - 1][0]),
          libelle: `${r.nom}, évolution sur ${etendue}`, delai: i * 40,
        } : null,
      };
    }),
  }));
  return { blocs, mention: maj ? `mis à jour le ${dateChiffres(maj)} à ${heure(maj)}` : "", nombre: reglages.length };
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function courbe(c) {
  if (!c) return html`<div></div>`;
  return html`<div class="flex flex-col gap-1.5 min-w-0">
    <svg width="100%" height="56" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" preserveAspectRatio="none" role="img" aria-label="${c.libelle}">
      <line x1="0" y1="${c.axe}" x2="${LARGEUR}" y2="${c.axe}" style="stroke:var(--base);stroke-width:1;stroke-dasharray:${c.pointilles}"></line>
      ${c.aire ? html`<polygon class="aire" points="${c.aire}" style="fill:${c.remplissage};animation-delay:${c.delai + 300}ms"></polygon>` : ""}
      ${c.ligne ? html`<polyline class="trace" pathLength="1" points="${c.ligne}" style="fill:none;stroke:${c.trait};stroke-width:2;stroke-linecap:round;stroke-linejoin:round;animation-delay:${c.delai}ms"></polyline>` : ""}
      ${c.barres ? html`<path class="barres" d="${c.barres}" style="fill:${c.trait};transform-origin:0px ${c.axe}px;animation-delay:${c.delai}ms"></path>` : ""}
    </svg>
    <span class="flex justify-between text-[12.5px] font-semibold text-encre3"><span>${c.debut}</span><span>${c.etendue}</span><span>${c.fin}</span></span>
  </div>`;
}

export function vueMarches(m) {
  return html`
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2.5 mb-2">
      <h1 class="m-0 text-[36px] font-extrabold tracking-[-0.035em] leading-[1.1]">Marchés</h1>
      <p class="m-0 text-[16px] font-medium text-encre2">Les ${m.nombre} indicateurs suivis${m.mention ? ` · ${m.mention}` : ""}</p>
    </header>
    ${m.blocs.map((bloc) => html`
    <section aria-label="${bloc.titre}" class="calme rounded-bloc pt-7 px-9 pb-3 flex flex-col">
      <h2 class="m-0 mb-1.5 text-[19px] font-extrabold tracking-[-0.02em]">${bloc.titre}</h2>
      ${bloc.lignes.map((l, j) => html`
      <div class="ligne-marche grid grid-cols-[230px_128px_96px_minmax(0,1fr)_176px] items-center gap-x-6 py-4 border-t" style="border-top-color:${j === 0 ? "transparent" : "var(--sep)"}">
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-[16px] font-bold leading-[1.35]">${l.nom}</span>
          <span class="text-[14px] font-medium text-encre3">${l.note}</span>
        </div>
        <span class="text-[23px] font-bold tracking-[-0.02em] tabular-nums whitespace-nowrap" style="color:${l.couleurValeur}">${l.valeur}</span>
        <span class="text-[15px] font-bold tabular-nums whitespace-nowrap" style="color:${l.couleurEcart}">${l.ecart}</span>
        ${courbe(l.courbe)}
        <div class="flex flex-col gap-1 text-right">
          <span class="text-[14.5px] font-bold whitespace-nowrap" style="color:${l.couleurQuand}">${l.quand}</span>
          <span class="text-[13.5px] font-medium text-encre3">${l.source}</span>
        </div>
      </div>`)}
    </section>`)}
  </div>`;
}
