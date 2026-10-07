/* Test « ↻ Changer » et « Nouveau menu » variés (v48) — console du navigateur ou lancer_tests.mjs.
   Choix du 07/10 : « il faut que l'aléatoire quand je mets changer de recette soit plus varié, je tombe quasi toujours
   sur la même chose même quand je mets n'importe quoi ». Deux causes : « Changer » alternait entre deux plats (l'ancien,
   sorti du menu, redevenait le mieux classé), et le tirage prenait presque toujours le mieux classé (aléa de 0 à 1
   contre +10 de saison).
   ATTENTION : remplace le menu et les réglages de jours de l'appareil, puis les remet. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims, st = M.getState();
  const ech = (m) => res.echecs.push(m);
  const Vraie = window.Date;
  function figer(iso) {
    const fixe = new Vraie(iso).getTime();
    window.Date = class extends Vraie {
      constructor(...a) { super(...(a.length ? a : [fixe])); }
      static now() { return fixe; }
    };
  }
  const onglet = (v) => document.querySelector(`.tab[data-view="${v}"]`).click();
  const plat = (j) => (st.semaine.plan.find((p) => p.jour === j) || {}).nom;
  function changer(jour, fois) {
    const vus = [plat(jour)];
    for (let k = 0; k < fois; k++) {
      const b = document.querySelector(`#view-semaine button[data-act="regen-day"][data-jour="${jour}"]`);
      if (!b) { ech(`pas de bouton « Changer » pour ${jour}`); break; }
      b.click();
      vus.push(plat(jour));
    }
    return vus;
  }
  const CH = ["semaine", "suivante", "epingles", "envies", "historique", "servis", "favoris", "notes", "promos", "cadreJours", "saisonOff"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

  try {
    figer("2026-10-05T12:00:00");                        // lundi : toute la semaine est à venir
    st.semaine = null; st.suivante = null; st.epingles = {}; st.envies = []; st.historique = []; st.servis = [];
    st.favoris = []; st.notes = {}; st.promos = []; st.saisonOff = false;
    st.cadreJours = ["volaille", "legumineuses", "porc", "poisson", "sport", "mijote", "libre"];   // dimanche « Peu importe »
    M.generer();
    onglet("semaine");

    /* 1. « Peu importe » (dimanche) : 8 fois « Changer » = 9 plats tous différents. Avant : deux plats en alternance. */
    const dim = changer("Dim", 8);
    res.details.dimanche = dim;
    if (new Set(dim).size !== dim.length) ech(`1. dimanche « Peu importe » revient sur un plat déjà proposé : ${dim.join(" → ")}`);

    /* 2. Volaille (lundi) : 6 fois « Changer », 7 plats différents. */
    const lun = changer("Lun", 6);
    if (new Set(lun).size !== lun.length) ech(`2. lundi revient sur un plat déjà proposé : ${lun.join(" → ")}`);

    /* 3. « Générer un nouveau menu » 30 fois : le lundi varie (au moins 10 plats différents), et jamais deux fois de
          suite le même. */
    const lundis = [];
    for (let k = 0; k < 30; k++) { document.getElementById("btn-gen").click(); lundis.push(plat("Lun")); }
    const differents = new Set(lundis).size;
    res.details.lundisDifferents = differents;
    if (differents < 10) ech(`3. seulement ${differents} plats différents le lundi sur 30 nouveaux menus`);
    const suite = lundis.findIndex((n, k) => k > 0 && n === lundis[k - 1]);
    if (suite > 0) ech(`3. le même lundi deux menus de suite : « ${lundis[suite]} » (menus ${suite} et ${suite + 1})`);

    /* 4. Les préférences pèsent toujours : sur 600 menus, un favori noté 5/5 sort le lundi au moins 1,5 fois plus
          que la moyenne des autres plats du lundi (attendu : environ 3 fois ; le seuil laisse la place au hasard). */
    const fav = window.RECIPES.find((r) => r.cat === "Volaille" && r.total_min && r.total_min <= 30 && r.saison === "Toute l'année" && !M.estExclu(r));
    st.favoris = [fav.nom]; st.notes = { [fav.nom]: 5 };
    const compte = {};
    for (let k = 0; k < 600; k++) { const n = (M.generer().plan.find((p) => p.jour === "Lun") || {}).nom; compte[n] = (compte[n] || 0) + 1; }
    const autres = Object.entries(compte).filter(([n]) => n !== fav.nom).map(([, c]) => c);
    const moyenne = autres.reduce((a, b) => a + b, 0) / (autres.length || 1);
    res.details.favori = `${fav.nom} : ${compte[fav.nom] || 0} lundis sur 600, autres plats ${moyenne.toFixed(1)} en moyenne (${autres.length} plats)`;
    if ((compte[fav.nom] || 0) < 1.5 * moyenne) ech(`4. le favori ne sort pas plus que les autres : ${res.details.favori}`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.Date = Vraie;
    CH.forEach((c) => { if (avant[c] === undefined) delete st[c]; else st[c] = JSON.parse(avant[c]); });
    M.sauver();
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
