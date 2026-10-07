/* Test automatisé du générateur — à exécuter dans la console du navigateur
   ou via le harnais Playwright/CDP. Retourne un objet résultat, n'affiche rien. */
(function () {
  "use strict";
  const N = 30;
  const res = { runs: N, echecs: [], statsProt: {}, joursVides: 0 };

  for (let k = 0; k < N; k++) {
    const s = window.__mims.generer();
    const plan = s.plan;

    if (plan.length !== window.CADRE.length) {
      res.echecs.push(`run ${k}: ${plan.length}/${window.CADRE.length} jours remplis`);
      res.joursVides++;
    }

    // (v43) deux jours de suite avec la même protéine sont permis : plus de règle d'adjacence à vérifier

    // aucun avertissement « deux jours de suite » (retiré en v43)
    plan.forEach((p) => { if (p.protAlerte) res.echecs.push(`run ${k}: ${p.jour} porte encore un avertissement de protéine`); });

    // RÈGLE (v47) : jamais deux fois le même plat dans la semaine (hors deux jours imposés par l'utilisateur)
    const vus = {};
    plan.forEach((p) => { if (!p.epingle) vus[p.nom] = (vus[p.nom] || 0) + 1; });
    Object.entries(vus).forEach(([nom, n]) => { if (n > 1) res.echecs.push(`run ${k}: « ${nom} » ${n} fois dans la semaine`); });

    // RÈGLE : une protéine pas plus de 3x dans la semaine
    const c = {};
    plan.forEach((p) => { c[p.proteine] = (c[p.proteine] || 0) + 1; });
    Object.entries(c).forEach(([p, n]) => {
      res.statsProt[p] = Math.max(res.statsProt[p] || 0, n);
      if (n > 3) res.echecs.push(`run ${k}: "${p}" ${n} fois dans la semaine`);
    });

    // RÈGLE : aucune recette exclue ne passe
    plan.forEach((p) => {
      const r = window.RECIPES.find((x) => x.nom === p.nom);
      if (r && window.__mims.estExclu(r)) res.echecs.push(`run ${k}: ${p.nom} est exclue mais proposée`);
    });

    // RÈGLE : respect de la catégorie et du temps max du jour — selon le cadre ACTIF
    const cadreActif = window.__mims.getCadre();
    plan.forEach((p) => {
      const cadre = cadreActif.find((x) => x.jour === p.jour);
      const r = window.RECIPES.find((x) => x.nom === p.nom);
      if (!r) { res.echecs.push(`run ${k}: recette introuvable ${p.nom}`); return; }
      if (!cadre.cats.includes(r.cat)) res.echecs.push(`run ${k}: ${p.jour} attend ${cadre.cats} mais a ${r.cat}`);
      if (cadre.maxMin && r.total_min > cadre.maxMin) res.echecs.push(`run ${k}: ${p.jour} ${r.nom} ${r.total_min}min > ${cadre.maxMin}min`);
    });
  }

  // liste de courses non vide et quantifiée
  const courses = window.__mims.listeCourses();
  res.rayons = Object.keys(courses);
  res.nbArticles = Object.values(courses).reduce((n, o) => n + Object.keys(o).length, 0);
  if (!res.nbArticles) res.echecs.push("liste de courses vide");

  res.ok = res.echecs.length === 0;
  res.echecs = res.echecs.slice(0, 15);
  return res;
})();
