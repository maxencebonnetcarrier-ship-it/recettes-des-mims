/* Test « jamais deux fois le même plat dans la semaine » (v47) — console du navigateur ou lancer_tests.mjs.
   Cas réel du 07/10 : « Volaille aux endives et au curry » lundi ET vendredi. Le style du vendredi (sport) accepte
   aussi la volaille, et le tirage d'un jour ne retirait pas les plats déjà posés les autres jours ; le repli (style
   sans plat disponible) reprenait même toute la base.
   ATTENTION : remplace le menu, les réglages de jours, les favoris, l'historique et les épingles de l'appareil,
   puis les remet. */
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
  const DEFAUT = ["volaille", "legumineuses", "porc", "poisson", "sport", "mijote", "roti"];
  // noms posés plus d'une fois, hors jours imposés tous les deux (choix explicite de l'utilisateur)
  function doublons(plan) {
    const vus = {};
    plan.forEach((p) => { if (p && p.nom) (vus[p.nom] = vus[p.nom] || []).push(p); });
    return Object.entries(vus).filter(([, ps]) => ps.length > 1 && !ps.every((p) => p.epingle))
      .map(([nom, ps]) => `${nom} (${ps.map((p) => p.jour).join(" + ")})`);
  }
  function remettre() {
    st.semaine = null; st.suivante = null; st.epingles = {}; st.envies = []; st.historique = []; st.servis = [];
    st.favoris = []; st.notes = {}; st.promos = []; st.cadreJours = DEFAUT.slice(); st.saisonOff = false;
  }
  const CH = ["semaine", "suivante", "epingles", "envies", "historique", "servis", "favoris", "notes", "promos", "cadreJours", "saisonOff", "coursesCochees"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

  try {
    figer("2026-10-05T12:00:00");                        // lundi, semaine 41
    remettre();

    /* 1. Le cas du 07/10 : une volaille rapide en favori sort lundi (volaille) ; le vendredi (sport, volaille
          permise) ne doit pas la reprendre. Avant la v47, il la reprenait à chaque tirage (favori +30). */
    const fav = window.RECIPES.find((r) => r.cat === "Volaille" && r.total_min && r.total_min <= 30
      && r.saison === "Toute l'année" && !M.estExclu(r));
    if (!fav) ech("1. précondition : aucune volaille de 30 min ou moins");
    else {
      // le tirage est au sort depuis la v48 : favori noté 5/5, et des menus jusqu'à 10 lundis avec lui (80 au plus)
      st.favoris = [fav.nom]; st.notes = { [fav.nom]: 5 };
      let lundi = 0, k = 0;
      for (; k < 80 && lundi < 10; k++) {
        const plan = M.generer().plan;
        if (plan.some((p) => p.jour === "Lun" && p.nom === fav.nom)) lundi++;
        const d = doublons(plan);
        if (d.length) { ech(`1. tirage ${k} : ${d.join(", ")}`); break; }
      }
      res.details.favoriLundi = `${fav.nom} : ${lundi} lundis sur ${k} menus`;
      if (!lundi) ech(`1. le favori « ${fav.nom} » n'est jamais sorti lundi : le test ne prouve rien`);
    }

    /* 2. Repli : trois jours « rôti » (lundi, vendredi, dimanche) et un seul rôti qui n'a pas été servi ces 3
          dernières semaines. Le premier jour le prend ; les deux autres prennent des rôtis récents, tous différents,
          plutôt que de le répéter. */
    remettre();
    st.cadreJours = ["roti", "legumineuses", "porc", "poisson", "roti", "mijote", "roti"];
    const rotis = window.RECIPES.filter((r) => r.cat === "Rôti" && !M.estExclu(r));
    const libre = rotis.find((r) => r.saison === "Toute l'année");
    st.historique = rotis.filter((r) => r !== libre).map((r, k) => ({ an: 2026, num: 40, jour: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][k % 7], nom: r.nom, fait: true, note: 0 }));
    for (let k = 0; k < 5; k++) {
      const plan = M.generer().plan;
      const r3 = plan.filter((p) => ["Lun", "Ven", "Dim"].includes(p.jour)).map((p) => p.nom);
      if (k === 0) res.details.rotis = r3;
      if (r3.length !== 3) ech(`2. tirage ${k} : ${r3.length}/3 jours rôti remplis`);
      if (!r3.includes(libre.nom)) ech(`2. tirage ${k} : le seul rôti non servi récemment (« ${libre.nom} ») n'est pas au menu`);
      const d = doublons(plan);
      if (d.length) { ech(`2. tirage ${k} : ${d.join(", ")}`); break; }
    }

    /* 3. « ↻ Changer » un jour, même quand son style n'a plus rien de neuf (repli) : jamais le plat d'un autre jour. */
    onglet("semaine");
    for (let k = 0; k < 8; k++) {
      const b = document.querySelector('#view-semaine button[data-act="regen-day"][data-jour="Dim"]');
      if (!b) { ech("3. pas de bouton « Changer » pour dimanche"); break; }
      b.click();
      const d = doublons(st.semaine.plan);
      if (d.length) { ech(`3. après « Changer » n°${k + 1} : ${d.join(", ")}`); break; }
    }

    /* 4. Tirages ordinaires : aucun doublon sur 40 menus. */
    remettre();
    for (let k = 0; k < 40; k++) {
      const d = doublons(M.generer().plan);
      if (d.length) { ech(`4. tirage ${k} : ${d.join(", ")}`); break; }
    }

    /* 5. Le menu de la semaine prochaine devient celui de la semaine, et un plat demandé jeudi y était déjà prévu
          mardi : mardi change, jeudi le prend, les autres jours (courses faites d'avance) ne bougent pas. */
    remettre();
    const s41 = M.generer();
    const x = s41.plan.find((p) => p.jour === "Mar").nom;
    st.suivante = { an: 2026, num: 42, plan: JSON.parse(JSON.stringify(s41.plan)) };
    const autres = st.suivante.plan.filter((p) => !["Mar", "Jeu"].includes(p.jour)).map((p) => p.jour + ":" + p.nom).join(" | ");
    st.epingles = { Jeu: { nom: x, t: Date.now(), num: 42, an: 2026 } };
    M.sauver();
    figer("2026-10-12T12:00:00");                        // lundi, semaine 42
    onglet("courses"); onglet("semaine");
    const p5 = st.semaine.plan;
    res.details.semaine42 = p5.map((p) => p.jour + ":" + p.nom);
    if ((p5.find((p) => p.jour === "Jeu") || {}).nom !== x) ech(`5. jeudi n'a pas le plat demandé « ${x} »`);
    const d5 = doublons(p5);
    if (d5.length) ech(`5. ${d5.join(", ")}`);
    if (p5.filter((p) => !["Mar", "Jeu"].includes(p.jour)).map((p) => p.jour + ":" + p.nom).join(" | ") !== autres) ech("5. d'autres jours que mardi ont changé");
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
