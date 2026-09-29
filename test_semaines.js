/* Test des semaines et de l'historique — à exécuter dans la console du navigateur
   ou via le harnais Playwright/CDP. Retourne un objet résultat, n'affiche rien.
   Couvre : le bouton « Retirer » de l'historique, et le passage du Nouvel An (dates affichées,
   anti-répétition, semaines de même numéro d'une année sur l'autre).
   ATTENTION : remet à zéro le menu et l'historique de l'appareil qui l'exécute. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims;
  const st = M.getState();
  const ech = (m) => res.echecs.push(m);

  // L'app lit l'heure via « new Date() » : on la fige le temps du test, puis on la rend.
  const Vraie = window.Date;
  function figer(iso) {
    const fixe = new Vraie(iso).getTime();
    window.Date = class extends Vraie {
      constructor(...a) { super(...(a.length ? a : [fixe])); }
      static now() { return fixe; }
    };
  }
  const onglet = (v) => document.querySelector(`.tab[data-view="${v}"]`).click();
  const boutonFait = (jour) =>
    document.querySelector(`#view-semaine button[data-act="fait"]${jour ? `[data-jour="${jour}"]` : ""}`);
  // chaque clic redessine la semaine : on re-cherche le bouton à chaque tour
  function toutMarquerFait() {
    st.semaine.plan.forEach((p) => { const b = boutonFait(p.jour); if (b && !b.classList.contains("done")) b.click(); });
  }
  const repris = (noms, n) => {
    let total = 0;
    for (let k = 0; k < n; k++) total += M.generer().plan.filter((p) => noms.includes(p.nom)).length;
    return total;
  };

  try {
    /* 1. « Retirer » fait disparaître la carte de l'écran Historique, tout de suite. */
    figer("2026-09-29T12:00:00");
    st.historique = [];
    M.generer();
    onglet("semaine");
    boutonFait().click();
    onglet("historique");
    const avant = document.querySelectorAll("#view-historique .card.hist").length;
    const retirer = document.querySelector('#view-historique button[data-act="del-hist"]');
    if (!retirer) ech("1. aucun bouton « Retirer » dans l'historique");
    else {
      retirer.click();
      const apres = document.querySelectorAll("#view-historique .card.hist").length;
      if (apres !== avant - 1) ech(`1. après « Retirer », l'écran montre encore ${apres} carte(s) au lieu de ${avant - 1}`);
    }

    /* 2. Le samedi 2 janvier 2027 est en semaine 53 de 2026 : du 28 déc. au 3 janv. */
    figer("2027-01-02T12:00:00");
    st.historique = [];
    M.generer();
    onglet("semaine");
    const tete = document.querySelector("#view-semaine .week-head").textContent;
    res.details.enTeteNouvelAn = tete;
    if (!tete.includes("Semaine 53") || !tete.includes("28 déc. – 3 janv."))
      ech(`2. en-tête « ${tete} » au lieu de « Semaine 53 · 28 déc. – 3 janv. »`);

    /* 3. Les plats cuisinés fin décembre ne reviennent pas la première semaine de janvier. */
    toutMarquerFait();
    const servis = st.semaine.plan.map((p) => p.nom);
    figer("2027-01-05T12:00:00");
    const n3 = repris(servis, 30);
    res.details.reprisApresNouvelAn = n3;
    if (n3) ech(`3. ${n3} plat(s) de la semaine 53 reviennent sur 30 menus de la semaine 1`);

    /* 4. Même chose avec un historique écrit par une version précédente (numéro sans année). */
    st.historique = servis.map((nom, i) => ({ num: 53, jour: st.semaine.plan[i].jour, nom, fait: true, note: 0 }));
    const n4 = repris(servis, 30);
    res.details.reprisAncienFormat = n4;
    if (n4) ech(`4. ancien format : ${n4} plat(s) de la semaine 53 reviennent en semaine 1`);

    /* 5. La semaine 40 de 2027 n'hérite pas du « Fait » de la semaine 40 de 2026. */
    st.historique = [];
    figer("2026-09-29T12:00:00");
    M.generer();
    onglet("semaine");
    boutonFait("Lun").click();
    figer("2027-10-05T12:00:00");
    onglet("semaine");                         // l'app doit voir que c'est une autre semaine
    const lun = boutonFait("Lun");
    if (!lun) ech("5. pas de bouton « Marquer fait » le lundi");
    else if (lun.classList.contains("done")) ech("5. le lundi de 2027 apparaît déjà « Fait » (hérité de 2026)");
    else {
      lun.click();
      onglet("historique");
      const titres = [...document.querySelectorAll("#view-historique .cat-title")].map((t) => t.textContent);
      res.details.titresHistorique = titres;
      if (titres.length !== 2) ech(`5. l'historique fusionne les deux semaines 40 : ${JSON.stringify(titres)}`);
    }
  } catch (e) {
    ech("exception : " + e);
  } finally {
    window.Date = Vraie;
    st.historique = [];
    M.generer();
    onglet("semaine");
  }

  res.ok = res.echecs.length === 0;
  res.echecs = res.echecs.slice(0, 15);
  return res;
})();
