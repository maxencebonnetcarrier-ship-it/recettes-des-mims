/* Test de la semaine suivante (S+1, v36) et des cases de courses datées par semaine — à
   exécuter dans la console du navigateur ou via le harnais Playwright/CDP. Retourne un objet
   résultat, n'affiche rien.
   ATTENTION : remet à zéro le menu, la semaine suivante, l'historique, les menus servis et les
   courses cochées de l'appareil qui l'exécute. */
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
  const noms = (s) => (s && s.plan ? s.plan.map((p) => p.nom) : []);
  const vue = (v) => document.querySelector(`#view-semaine button[data-act="vue-semaine"][data-val="${v}"]`);
  const puce = (j) => document.querySelector(`#view-courses button[data-act="filtre-jour"][data-jour="${j}"]`);
  const lignes = () => [...document.querySelectorAll("#view-courses .shop-row:not(.optionnel)")];
  const sansAcc = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe");
  const R = (nom) => window.RECIPES.find((r) => r.nom === nom);

  try {
    try { localStorage.removeItem("mims_courses_jours"); } catch (e) { /* stockage indisponible */ }
    st.historique = []; st.servis = []; st.coursesCochees = {}; st.semaine = null; st.suivante = null; st.epingles = {};

    /* 1. « Semaine prochaine » prépare le menu de la semaine suivante, sans les plats de celle-ci. */
    figer("2026-10-08T12:00:00");                       // jeudi, semaine 41
    onglet("semaine");
    if (!vue("1")) { ech("1. pas de bouton « Semaine prochaine » dans l'onglet Semaine"); return res; }
    const courant = noms(st.semaine);
    vue("1").click();
    const s1 = st.suivante;
    if (!s1 || s1.num !== 42 || s1.an !== 2026) ech(`1. la semaine prochaine préparée est ${JSON.stringify(s1 && { an: s1.an, num: s1.num })} au lieu de 2026/42`);
    else {
      res.details.s1 = noms(s1);
      if (s1.plan.length !== M.getCadre().length) ech(`1. S+1 n'a que ${s1.plan.length} plats`);
      const communs = noms(s1).filter((n) => courant.includes(n));
      if (communs.length) ech(`1. S+1 reprend des plats de cette semaine : ${communs.join(", ")}`);
      if (!/Semaine 42/.test(document.querySelector("#view-semaine").textContent)) ech("1. l'écran ne montre pas « Semaine 42 »");
      if (document.querySelector("#view-semaine .ce-soir")) ech("1. la semaine prochaine affiche un bloc « Ce soir »");
      if (document.querySelector('#view-semaine button[data-act="fait"]')) ech("1. « Marquer fait » proposé pour un plat pas encore cuisiné");
      if (JSON.stringify(noms(st.semaine)) !== JSON.stringify(courant)) ech("1. préparer S+1 a changé le menu de cette semaine");
    }

    /* 2. « Changer » et l'accompagnement agissent sur S+1, pas sur cette semaine. */
    if (s1) {
      const avant = noms(st.semaine), lunAvant = s1.plan.find((p) => p.jour === "Lun").nom;
      document.querySelector('#view-semaine details[data-cle="s1-jour-Lun"] button[data-act="regen-day"]').click();
      const lunApres = st.suivante.plan.find((p) => p.jour === "Lun").nom;
      if (lunApres === lunAvant) ech("2. « Changer » sur lundi S+1 n'a pas changé le plat");
      if (JSON.stringify(noms(st.semaine)) !== JSON.stringify(avant)) ech("2. « Changer » sur S+1 a modifié cette semaine");
      if (avant.includes(lunApres)) ech(`2. le nouveau plat de S+1 (${lunApres}) est déjà au menu cette semaine`);
      const pAvecSide = st.suivante.plan.find((p) => p.side);
      if (pAvecSide) {
        document.querySelector(`#view-semaine details[data-cle="s1-jour-${pAvecSide.jour}"] button[data-act="choisir-side"]`).click();
        if (!st.suivante.plan.find((p) => p.jour === pAvecSide.jour).sideChoisi) ech("2. « Ajouter aux courses » sur S+1 n'est pas retenu");
        if ((st.semaine.plan.find((p) => p.jour === pAvecSide.jour) || {}).sideChoisi) ech("2. l'accompagnement pris sur S+1 l'a aussi été cette semaine");
      }
    }

    /* 3. « Générer un nouveau menu » cette semaine n'écrase pas S+1 et n'en reprend aucun plat. */
    vue("0").click();
    const s1Noms = noms(st.suivante);
    for (let k = 0; k < 10; k++) {
      document.getElementById("btn-gen").click();
      const dup = noms(st.semaine).filter((n) => s1Noms.includes(n));
      if (dup.length) { ech(`3. le menu régénéré reprend des plats de S+1 : ${dup.join(", ")}`); break; }
    }
    if (JSON.stringify(noms(st.suivante)) !== JSON.stringify(s1Noms)) ech("3. régénérer cette semaine a modifié S+1");

    /* 4. Courses : une rangée « S+1 » ; ses jours se combinent avec ceux de cette semaine. */
    onglet("courses");
    if (!puce("Lun+1") || !puce("s1")) ech("4. pas de jours « S+1 » dans la liste de courses");
    else {
      const lunS1 = R(st.suivante.plan.find((p) => p.jour === "Lun").nom);
      puce("Lun+1").click();
      const vus = lignes().map((r) => sansAcc(r.querySelector(".sn").textContent));
      res.details.lignesLundiS1 = vus.length;
      if (!vus.length) ech("4. le filtre « Lun S+1 » ne montre rien");
      const manque = lunS1.ingredients.map((i) => sansAcc(i.nom)).filter((n) => !vus.some((v) => n.includes(v.split(" ")[0])));
      if (manque.length > Math.floor(lunS1.ingredients.length / 2)) ech(`4. ingrédients de « ${lunS1.nom} » absents du filtre Lun S+1 : ${manque.slice(0, 3).join(", ")}`);
      puce("Sam").click();
      const deux = lignes().length;
      if (!(deux >= vus.length)) ech("4. ajouter samedi à lundi S+1 a réduit la liste");
      if (!/S\+1/.test(document.querySelector("#view-courses .week-head").textContent)) ech("4. l'en-tête ne dit pas que S+1 est inclus");
      puce("tous").click();
    }

    /* 5. Lundi venu, le menu S+1 DEVIENT le menu de la semaine (pas de nouveau tirage), et ce qui
          a été coché pour lui reste coché. */
    onglet("courses");
    puce("Lun+1") && puce("Lun+1").click();
    const coche = lignes()[0];
    const nomCoche = coche ? coche.querySelector(".sn").textContent : null;
    if (coche) coche.querySelector("input").click();
    puce("tous").click();
    const attendu = noms(st.suivante);
    const ancien = noms(st.semaine);
    figer("2026-10-12T12:00:00");                       // lundi, semaine 42
    onglet("semaine");
    if (JSON.stringify(noms(st.semaine)) !== JSON.stringify(attendu)) ech(`5. au changement de semaine, le menu n'est pas celui préparé : ${noms(st.semaine).join(", ")}`);
    if (st.suivante) ech("5. S+1 n'a pas été vidée après être devenue la semaine courante");
    const servi = (st.servis || []).find((s) => s.num === 41);
    if (!servi || JSON.stringify(servi.noms) !== JSON.stringify(ancien)) ech("5. le menu de la semaine 41 n'a pas été noté comme servi");
    if (nomCoche) {
      onglet("courses"); puce("Lun").click();
      const l = lignes().find((r) => r.querySelector(".sn").textContent === nomCoche);
      res.details.cocheGarde = nomCoche;
      if (!l || !l.querySelector("input").checked) ech(`5. « ${nomCoche} » coché pour lundi S+1 n'est plus coché ce lundi`);
      puce("tous").click();
    }

    /* 6. Une case cochée une semaine ne l'est plus la semaine suivante (avant v36, si). */
    st.coursesCochees = {}; st.suivante = null;
    onglet("courses");
    lignes().forEach((r) => { const i = r.querySelector("input"); if (!i.checked) i.click(); });
    const cochees = lignes().map((r) => r.querySelector(".sn").textContent);
    figer("2026-10-19T12:00:00");                       // semaine 43, sans S+1 préparée
    onglet("semaine"); onglet("courses");
    const encore = lignes().filter((r) => r.querySelector("input").checked && cochees.includes(r.querySelector(".sn").textContent));
    res.details.repris = `${lignes().filter((r) => cochees.includes(r.querySelector(".sn").textContent)).length} articles en commun`;
    if (encore.length) ech(`6. ${encore.length} article(s) cochés la semaine dernière paraissent déjà achetés : ${encore.slice(0, 3).map((r) => r.querySelector(".sn").textContent).join(", ")}`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.Date = Vraie;
    try { localStorage.removeItem("mims_courses_jours"); } catch (e) { /* stockage indisponible */ }
    st.coursesCochees = {}; st.suivante = null; st.semaine = null;
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
