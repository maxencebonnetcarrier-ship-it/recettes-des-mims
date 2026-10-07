/* Test du plat DEMANDÉ pour un jour (v45) — à exécuter dans la console du navigateur ou via lancer_tests.mjs.
   Choix du 07/10 : « un plat demandé pour un jour précis s'impose tout seul ce jour-là dès que sa recette est
   dans la base, sans retirer le reste du menu ni les courses déjà faites ».
   La recette « arrive » comme le ferait une mise à jour poussée par le guetteur : une copie d'un plat de la base,
   au nom FICTIF, est ajoutée à window.RECIPES (puis retirée à la fin).
   ATTENTION : remplace le menu, les envies, les épingles et les cases cochées de l'appareil, puis les remet. */
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
  const plat = (j) => (st.semaine && st.semaine.plan.find((p) => p.jour === j)) || {};
  const noms = (sauf) => st.semaine.plan.filter((p) => p.jour !== sauf).map((p) => p.jour + ":" + p.nom).join(" | ");
  function ouvrirEnvies() {
    onglet("reglages");
    const b = document.querySelector('#view-reglages button[data-act="reglages-ouvrir"][data-sec="envies"]');
    if (b) b.click();
  }
  function ajouterEnvie(texte, jour) {
    ouvrirEnvies();
    const inp = document.getElementById("new-envie");
    inp.value = texte;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("new-envie-jour").value = jour || "";
    document.getElementById("btn-add-envie").click();
  }
  const ajoutees = [];
  function arrivee(nom, cat) {
    const modele = window.RECIPES.find((r) => r.cat === cat && r.saison === "Toute l'année" && !M.estExclu(r));
    const r = JSON.parse(JSON.stringify(modele));
    r.nom = nom;
    window.RECIPES.push(r);
    ajoutees.push(r);
    return r;
  }
  const CH = ["semaine", "suivante", "envies", "epingles", "historique", "servis", "coursesCochees", "promos", "guetteur"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

  try {
    figer("2026-10-05T12:00:00");                        // lundi, semaine 41
    st.semaine = null; st.suivante = null; st.envies = []; st.epingles = {}; st.historique = []; st.servis = [];
    st.coursesCochees = {}; st.promos = []; st.guetteur = undefined;
    onglet("semaine");
    if (!st.semaine) { ech("précondition : aucun menu généré"); return res; }

    /* 1. Envie de plat pour jeudi, recette PAS encore dans la base : le reste du menu ne bouge pas (avant la v45,
          ajouter l'envie retirait toute la semaine au sort), jeudi garde sa proposition. */
    const menu1 = noms(null);
    onglet("courses");
    const caseLundi = [...document.querySelectorAll('#view-courses input[data-act="course"]')]
      .find((c) => JSON.parse(c.dataset.ids).some((id) => /\|lun$/.test(id)));
    if (!caseLundi) ech("1. aucune case de courses pour lundi");
    else caseLundi.click();
    const cochees = JSON.stringify(st.coursesCochees);
    if (cochees === "{}") ech("1. la case cochée n'est pas enregistrée");
    ajouterEnvie("Plat fictif juliett", "Jeu");
    if (noms(null) !== menu1) ech(`1. ajouter l'envie a changé le menu : « ${menu1} » → « ${noms(null)} »`);
    if (plat("Jeu").epingle) ech("1. jeudi est marqué imposé alors que la recette n'existe pas");

    /* 2. La recette arrive : jeudi la prend tout seul, sans nouveau menu ; les autres jours et la case cochée
          restent. */
    const autres = noms("Jeu");
    arrivee("Plat fictif juliett", "Poisson");
    onglet("semaine");
    res.details.jeudi = plat("Jeu").nom;
    if (plat("Jeu").nom !== "Plat fictif juliett" || !plat("Jeu").epingle) ech(`2. jeudi = « ${plat("Jeu").nom} », pas le plat demandé imposé`);
    if (noms("Jeu") !== autres) ech(`2. les autres jours ont changé : « ${autres} » → « ${noms("Jeu")} »`);
    if (JSON.stringify(st.coursesCochees) !== cochees) ech("2. les cases de courses cochées ont changé");
    const texte = (document.querySelector("#view-semaine") || { textContent: "" }).textContent;
    if (/En attendant qu'il soit ajouté/.test(texte)) ech("2. l'écran dit encore que le plat est en attente");
    // déjà appliqué : un nouveau rendu ne change rien
    const apres2 = JSON.stringify(st.semaine.plan);
    onglet("courses"); onglet("semaine");
    if (JSON.stringify(st.semaine.plan) !== apres2) ech("2. un second rendu change encore le menu");

    /* 3. Même règle si l'onglet ouvert est Courses (la liste suit le plat demandé). */
    M.desepingler("Jeu");
    M.epingler("Ven", "Plat fictif kilo");
    arrivee("Plat fictif kilo", "Rapide (sport)");
    const autres3 = noms("Ven");
    onglet("courses");
    if (plat("Ven").nom !== "Plat fictif kilo") ech(`3. vendredi = « ${plat("Ven").nom} » depuis l'onglet Courses`);
    if (noms("Ven") !== autres3) ech("3. les autres jours ont changé");
    const ligne = [...document.querySelectorAll("#view-courses")].map((x) => x.textContent).join(" ");
    res.details.coursesVendredi = /Plat fictif kilo/.test(ligne);

    /* 4. Jour PASSÉ : rien n'est changé (le plat demandé jamais servi est reporté au changement de semaine). */
    figer("2026-10-07T12:00:00");                        // mercredi, même semaine
    const lundi = plat("Lun").nom;
    M.epingler("Lun", "Plat fictif lima");
    arrivee("Plat fictif lima", "Volaille");
    onglet("semaine");
    if (plat("Lun").nom !== lundi) ech(`4. lundi (passé) a changé : « ${lundi} » → « ${plat("Lun").nom} »`);

    /* 5. Le plat demandé était déjà prévu un autre jour à venir : cet autre jour change, pas les autres. */
    const samedi = plat("Sam").nom, dimanche = plat("Dim").nom;
    M.epingler("Dim", samedi);
    onglet("semaine");
    if (plat("Dim").nom !== samedi || !plat("Dim").epingle) ech(`5. dimanche = « ${plat("Dim").nom} » au lieu de « ${samedi} »`);
    if (plat("Sam").nom === samedi) ech("5. le même plat reste prévu samedi ET dimanche");
    res.details.cas5 = { samedi: plat("Sam").nom, dimanche: plat("Dim").nom, avant: dimanche };
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.Date = Vraie;
    ajoutees.forEach((r) => { const i = window.RECIPES.indexOf(r); if (i >= 0) window.RECIPES.splice(i, 1); });
    CH.forEach((c) => { if (avant[c] === undefined) delete st[c]; else st[c] = JSON.parse(avant[c]); });
    M.sauver();
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
