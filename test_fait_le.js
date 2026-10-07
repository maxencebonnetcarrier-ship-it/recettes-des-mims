/* Test « Je l'ai fait » de l'onglet Recettes (v46) — à exécuter dans la console du navigateur ou via lancer_tests.mjs.
   Choix du 07/10 : « pouvoir aller dans les recettes et mettre déjà fait avec la date si je l'ai pas fait dans la
   semaine comme le gratin ravioles, puis pouvoir le noter ».
   ATTENTION : remplace l'historique, les notes et le menu de l'appareil, puis les remet. */
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
  const GRATIN = "Gratin de ravioles et courgettes";
  const carte = (nom) => [...document.querySelectorAll("#view-recettes .recipe")].find((c) => c.querySelector(".n").textContent.startsWith(nom));
  function faitLe(nom, iso) {
    onglet("recettes");
    const c = carte(nom);
    if (!c) { ech(`pas de fiche « ${nom} » dans Recettes`); return null; }
    c.querySelector("details").open = true;
    const champ = c.querySelector(".date-fait");
    if (!champ) { ech(`pas de champ de date sur « ${nom} »`); return null; }
    champ.value = iso;
    c.querySelector('button[data-act="fait-le"]').click();
    return (document.getElementById("toast") || { textContent: "" }).textContent;
  }
  const entrees = (nom) => st.historique.filter((h) => h.nom === nom && h.fait);
  const CH = ["semaine", "suivante", "historique", "notes", "epingles", "envies", "servis", "favoris", "promos"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

  try {
    figer("2026-10-07T12:00:00");                        // mercredi, semaine 41
    st.semaine = null; st.suivante = null; st.historique = []; st.notes = {}; st.epingles = {}; st.envies = [];
    st.servis = []; st.favoris = []; st.promos = [];
    if (!window.RECIPES.some((r) => r.nom === GRATIN)) { ech(`précondition : « ${GRATIN} » absent de la base`); return res; }
    onglet("semaine");

    /* 1. Le gratin, pas fait le mardi prévu mais la veille au soir : noté avec SA date. */
    const t1 = faitLe(GRATIN, "2026-10-06");
    const e1 = entrees(GRATIN);
    res.details.entree = e1;
    if (e1.length !== 1 || e1[0].an !== 2026 || e1[0].num !== 41 || e1[0].jour !== "Mar") ech(`1. historique : ${JSON.stringify(e1)}`);
    if (!/noté fait/.test(t1 || "")) ech(`1. message : « ${t1} »`);
    const c1 = carte(GRATIN);
    const txt1 = c1 ? c1.textContent : "";
    if (!/Cuisiné le mardi 6 oct\.(?!\.)/.test(txt1)) ech("1. la fiche ne dit pas « Cuisiné le mardi 6 oct. » (sans double point)");
    if (c1 && !c1.querySelector("details").open) ech("1. la fiche s'est refermée après le clic");

    /* 2. Puis le noter, depuis la même fiche : la note va aussi dans l'historique. */
    const etoile = c1 && c1.querySelector('.fait-le [data-act="note"][data-val="4"]');
    if (!etoile) ech("2. pas d'étoiles sur la fiche après « Je l'ai fait »");
    else {
      etoile.click();
      if (st.notes[GRATIN] !== 4) ech(`2. note enregistrée : ${st.notes[GRATIN]}`);
      if (entrees(GRATIN)[0].note !== 4) ech("2. la note n'est pas reportée dans l'historique");
    }
    onglet("historique");
    const hist = (document.querySelector("#view-historique") || { textContent: "" }).textContent;
    if (!hist.includes(GRATIN) || !/4\/5/.test(hist)) ech("2. l'onglet Historique ne montre pas le gratin noté 4/5");

    /* 3. Deux fois la même date : pas de doublon. Une date à venir : refusée. */
    const t3 = faitLe(GRATIN, "2026-10-06");
    if (entrees(GRATIN).length !== 1) ech("3. doublon dans l'historique");
    if (!/Déjà noté/.test(t3 || "")) ech(`3. message pour un doublon : « ${t3} »`);
    const t3b = faitLe(GRATIN, "2026-10-09");
    if (entrees(GRATIN).length !== 1) ech("3. une date à venir est enregistrée");
    if (!/pas encore passée/.test(t3b || "")) ech(`3. message pour une date à venir : « ${t3b} »`);

    /* 4. Un AUTRE plat noté fait aujourd'hui : le plat prévu ce soir ne paraît pas cuisiné pour autant, et
          « Marquer fait » sur lui ajoute sa propre entrée. */
    const s = M.generer();
    const prevu = s.plan.find((p) => p.jour === "Mer");
    const autre = window.RECIPES.find((r) => r.nom !== prevu.nom && r.nom !== GRATIN);
    faitLe(autre.nom, "2026-10-07");
    onglet("semaine");
    const bouton = document.querySelector('#view-semaine .ce-soir button[data-act="fait"]');
    if (!bouton) ech("4. pas de bouton « Marquer fait » ce soir");
    else {
      if (bouton.classList.contains("done")) ech(`4. « ${prevu.nom} » paraît cuisiné parce que « ${autre.nom} » l'a été`);
      bouton.click();
      const mer = st.historique.filter((h) => h.jour === "Mer" && h.num === 41 && h.fait).map((h) => h.nom).sort();
      if (JSON.stringify(mer) !== JSON.stringify([autre.nom, prevu.nom].sort())) ech(`4. mercredi dans l'historique : ${JSON.stringify(mer)}`);
    }

    /* 4 bis. Noter depuis l'onglet Recettes, même un plat jamais cuisiné (v48 : « faudrait que je puisse noter depuis
             les recettes ») : les étoiles sont sur chaque fiche. */
    {
      onglet("recettes");
      const jamais = window.RECIPES.find((r) => r.nom !== GRATIN && r.nom !== autre.nom && !st.notes[r.nom] && !entrees(r.nom).length);
      const c = carte(jamais.nom);
      const e = c && c.querySelector('.fait-le [data-act="note"][data-val="3.5"]');
      if (!e) ech(`4 bis. pas d'étoiles sur la fiche « ${jamais.nom} », jamais cuisinée`);
      else {
        e.click();
        if (st.notes[jamais.nom] !== 3.5) ech(`4 bis. note depuis Recettes : ${st.notes[jamais.nom]}`);
      }
    }

    /* 5. Noté fait = ne revient pas au menu avant 3 semaines. */
    let revient = 0;
    for (let k = 0; k < 60; k++) if (M.generer().plan.some((p) => p.nom === autre.nom)) revient++;
    if (revient) ech(`5. « ${autre.nom} » revient ${revient} fois sur 60 menus de la même semaine`);
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
