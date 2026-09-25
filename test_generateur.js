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

    // RÈGLE DURE : jamais la même protéine deux jours consécutifs
    for (let i = 1; i < plan.length; i++) {
      if (plan[i].proteine === plan[i - 1].proteine) {
        res.echecs.push(`run ${k}: ${plan[i - 1].jour}+${plan[i].jour} tous deux "${plan[i].proteine}" (${plan[i - 1].nom} / ${plan[i].nom})`);
      }
    }

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
