/* Test des promos (v45) — à exécuter dans la console du navigateur ou via lancer_tests.mjs.
   Choix du 07/10 : « quand je mets des choses en promo, me les proposer obli dans la semaine même si c'est pour
   accompagnement, en priorité, en mettant que c'est promo dans l'affichage. Actuellement ma promo patate douce
   est nulle part. » Cause : la promo ne comptait que pour les PLATS (aucun ne contient de patate douce, seul
   l'accompagnement « Purée de patate douce » en a), et « patate douce » ne trouvait pas « patates douces ».
   ATTENTION : remplace le menu, les promos et les épingles de l'appareil, puis les remet. */
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
  const sansAcc = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const ACC = window.ACCOMPAGNEMENTS || [];
  const aPD = (nom) => /patates? douces?/.test(sansAcc(nom));
  const accPD = ACC.filter((a) => a.ingredients.some((i) => aPD(i.nom))).map((a) => a.nom);
  const platPD = window.RECIPES.filter((r) => r.ingredients.some((i) => aPD(i.nom))).map((r) => r.nom);
  const avecPD = (s) => s.plan.filter((p) => platPD.includes(p.nom) || (p.side && accPD.includes(p.side.nom)));
  const sansPromo = () => { st.promos = []; };
  function ouvrirPromos() {
    onglet("reglages");
    const b = document.querySelector('#view-reglages button[data-act="reglages-ouvrir"][data-sec="promos"]');
    if (b) b.click();
  }
  function ajouterPromo(texte) {
    ouvrirPromos();
    document.getElementById("new-promo").value = texte;
    document.getElementById("btn-add-promo").click();
  }
  const toastTexte = () => (document.getElementById("toast") || { textContent: "" }).textContent;
  const CH = ["semaine", "suivante", "promos", "epingles", "envies", "historique", "servis", "coursesCochees", "favoris", "notes"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

  try {
    figer("2026-10-05T12:00:00");                        // lundi, semaine 41
    st.semaine = null; st.suivante = null; st.epingles = {}; st.envies = []; st.historique = []; st.servis = [];
    st.favoris = []; st.notes = {};
    if (!accPD.length) ech("précondition : plus d'accompagnement à la patate douce dans la base");
    res.details.platsPatateDouce = platPD.length;

    /* 1. Promo « Patate douce » (sans pluriel) : CHAQUE menu tiré la propose, et l'écran dit « Promo ». */
    st.promos = ["Patate douce"];
    for (let k = 0; k < 12; k++) {
      const s = M.generer();
      if (!avecPD(s).length) { ech(`1. tirage ${k} : aucune patate douce au menu (${s.plan.map((p) => p.nom + (p.side ? " + " + p.side.nom : "")).join(" | ")})`); break; }
    }
    onglet("semaine");
    const tags = [...document.querySelectorAll("#view-semaine .tag-promo")];
    res.details.etiquettes = tags.map((t) => t.textContent + " " + (t.title || ""));
    if (!tags.length) ech("1. aucune étiquette « Promo » dans l'écran Semaine");
    else if (!tags.some((t) => /promo/i.test(t.textContent) && /patate douce/i.test(t.textContent + " " + t.title))) ech(`1. étiquette sans la promo : ${res.details.etiquettes.join(" ; ")}`);

    /* 2. Promo ajoutée dans Réglages sur un menu DÉJÀ tiré (le cas du 07/10) : proposée tout de suite en
          accompagnement, sans retirer le menu au sort ni changer les courses. Écrite au pluriel exprès. */
    sansPromo();
    const s2 = M.generer();
    s2.plan.forEach((p) => { if (p.side && accPD.includes(p.side.nom)) delete p.side; });
    const menu2 = s2.plan.map((p) => p.nom).join(" | ");
    ajouterPromo("patates douces");
    const pd2 = avecPD(st.semaine);
    res.details.ajout = pd2.map((p) => p.jour + " " + (p.side && p.side.nom));
    if (st.semaine.plan.map((p) => p.nom).join(" | ") !== menu2) ech("2. ajouter la promo a changé les plats du menu");
    if (!pd2.length) ech("2. la promo ajoutée n'est proposée nulle part");
    if (pd2.some((p) => p.sideChoisi)) ech("2. l'accompagnement en promo est entré dans les courses sans qu'on le prenne");
    if (!/patates douces/.test(toastTexte()) || !/au menu/.test(toastTexte())) ech(`2. message d'ajout : « ${toastTexte()} »`);
    const liste = (document.querySelector("#view-reglages .promos-semaine") || { textContent: "" }).textContent;
    if (!/accompagnement : Purée de patate douce/.test(liste)) ech(`2. Réglages › Promos ne dit pas où elle est : « ${liste} »`);

    /* 3. Changer l'accompagnement à la main (↻) : la promo ne revient pas de force sur un autre jour. */
    if (pd2.length) {
      onglet("semaine");
      const j = pd2[0].jour;
      const det = document.querySelector(`details[data-cle="jour-${j}"]`);
      if (det) det.open = true;
      const b = document.querySelector(`#view-semaine button[data-act="regen-side"][data-jour="${j}"]`);
      if (!b) ech(`3. pas de bouton ↻ d'accompagnement pour ${j}`);
      else {
        b.click();
        onglet("courses"); onglet("semaine");
        const restes = avecPD(st.semaine);
        if (restes.length) ech(`3. après ↻, la patate douce revient : ${restes.map((p) => p.jour).join(", ")}`);
      }
    }

    /* 4. Promo d'un ingrédient de PLATS (« poireau ») : un plat aux poireaux au menu, marqué « Promo ». */
    st.promos = ["poireau"];
    const s4 = M.generer();
    const pp = s4.plan.find((p) => (window.RECIPES.find((r) => r.nom === p.nom) || { ingredients: [] }).ingredients.some((i) => /poireau/.test(sansAcc(i.nom))));
    if (!pp) ech("4. aucun plat aux poireaux au menu");
    onglet("semaine");
    const txt4 = [...document.querySelectorAll("#view-semaine .tag-promo")].map((t) => t.textContent).join(" ");
    if (!/poireau/i.test(txt4)) ech(`4. pas d'étiquette « Promo poireau » : « ${txt4} »`);

    /* 5. Promo que rien ne contient : dit honnêtement, rien d'inventé. */
    sansPromo();
    M.generer();
    ajouterPromo("zzz fictif");
    if (!/aucun plat ni accompagnement/.test(toastTexte())) ech(`5. message pour une promo introuvable : « ${toastTexte()} »`);

    /* 6. Jours PASSÉS non touchés : un mercredi, la promo ne va ni lundi ni mardi. */
    sansPromo();
    figer("2026-10-07T12:00:00");                        // mercredi, même semaine
    const s6 = st.semaine;
    s6.plan.forEach((p) => { if (p.side && accPD.includes(p.side.nom)) delete p.side; });
    const debut6 = JSON.stringify(s6.plan.filter((p) => p.jour === "Lun" || p.jour === "Mar"));
    ajouterPromo("Patate douce");
    if (JSON.stringify(st.semaine.plan.filter((p) => p.jour === "Lun" || p.jour === "Mar")) !== debut6) ech("6. lundi ou mardi (passés) ont changé");
    res.details.mercredi = avecPD(st.semaine).map((p) => p.jour);
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
