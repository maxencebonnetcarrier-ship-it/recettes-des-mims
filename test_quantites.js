/* Test des quantités arrondies (v48) — console du navigateur ou lancer_tests.mjs.
   Choix du 07/10 : « 0.7 poivron etc ça veut rien dire, autant arrondir à 1 ». Ramenées à 4 parts, les quantités
   tombaient sur des fractions illisibles (0,7 poivron, 133,3 g, 1,3 cuillère).
   Ne change rien sur l'appareil. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims;
  const ech = (m) => res.echecs.push(m);
  const onglet = (v) => document.querySelector(`.tab[data-view="${v}"]`).click();

  try {
    /* 1. La règle. */
    const cas = [[0.67, "", 1], [0.67, "pièce", 1], [2.4, "", 2], [2.6, "unités", 3], [0.3, "gousse", 1],
      [1.33, "cuillères à soupe", 1.5], [0.2, "cuillère à café", 0.5], [0.7, "c à s", 0.5], [2.7, "verres", 2.5],
      [133.3, "g", 135], [33.3, "g", 33], [12.5, "cl", 13], [1.333, "kg", 1.3], [0.5, "bouteille", 0.5]];
    if (typeof M.arrondirQte !== "function" || typeof M.qteTexte !== "function") ech("1. règle d'arrondi absente");
    else {
      cas.forEach(([q, u, attendu]) => {
        const lu = M.arrondirQte(q, u);
        if (lu !== attendu) ech(`1. ${q} ${u || "(sans unité)"} → ${lu}, attendu ${attendu}`);
      });
      const kg = M.qteTexte({ qte: 1500, unite: "g" }, 5).trim();     // 1500 g pour 5 parts → 1200 g pour 4
      if (kg !== "1,2 kg") ech(`1. 1200 g s'affiche « ${kg} », attendu « 1,2 kg »`);
    }

    /* 2. Sur TOUTES les fiches de l'onglet Recettes : à la pièce, un entier d'au moins 1 ; jamais de point décimal ;
          au-delà de 50 g, un multiple de 5. */
    onglet("recettes");
    const MESURE = /(^|\s)(g|gr|grammes?|kg|kilos?|mg|ml|cl|dl|l|litres?|cuill|c à|cs|cc|verres?|tasses?|bols?|bouteilles?)/i;
    let lus = 0;
    const fautes = [];
    document.querySelectorAll("#view-recettes .ing-list .iq").forEach((el) => {
      const t = el.textContent.trim();
      if (!t) return;
      lus++;
      const m = /^([\d.,]+)\s*(.*)$/.exec(t);
      if (!m) return;
      const nb = parseFloat(m[1].replace(",", ".")), unite = m[2];
      if (m[1].includes(".")) fautes.push(`point décimal : « ${t} »`);
      else if (!MESURE.test(unite) && (nb < 1 || !Number.isInteger(nb))) fautes.push(`à la pièce : « ${t} »`);
      else if (/^(g|gr|grammes?)$/i.test(unite) && nb > 50 && nb % 5) fautes.push(`grammes : « ${t} »`);
    });
    res.details.quantitesLues = lus;
    if (lus < 500) ech(`2. seulement ${lus} quantités lues dans l'onglet Recettes`);
    if (fautes.length) ech(`2. ${fautes.length} quantités mal arrondies, dont ${fautes.slice(0, 4).join(" ; ")}`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
