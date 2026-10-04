/* Test des exclusions qui ne sont le NOM d'aucun ingrédient (v35) — à exécuter dans la console du navigateur ou
   via le harnais Playwright/CDP. Retourne un objet résultat, n'affiche rien.
   « tomate crue » et « sucré-salé » sont reconnus par build_data.py sur la recette entière (champs tomate_crue,
   sucre_sale). La tomate n'est exclue que CRUE (choix de l'utilisateur, 2026-10-03) ; l'ancienne exclusion « tomate »,
   enregistrée sur les téléphones, vaut « tomate crue ». Les champignons restent exclus, cuits ou crus.
   Remet les exclusions de l'appareil comme avant à la fin. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims, st = M.getState();
  const ech = (m) => res.echecs.push(m);
  const avant = st.exclusions.slice();
  const R = (ingredients, extra) => Object.assign({ nom: "essai", ingredients: ingredients.map((nom) => ({ nom })) }, extra || {});
  const exclu = (exclusions, r) => { st.exclusions = exclusions; return M.estExclu(r); };

  try {
    /* 1. Les exclusions par défaut d'un nouvel appareil. */
    res.details.defaut = window.EXCLUS_DEFAUT.join(", ");
    if (!window.EXCLUS_DEFAUT.includes("tomate crue") || window.EXCLUS_DEFAUT.includes("tomate"))
      ech(`1. exclusions par défaut : ${res.details.defaut}`);

    /* 2. Tomate cuite permise, sous « tomate crue » comme sous l'ancienne « tomate ». */
    const sauce = R(["concentré de tomates", "poulet"]);
    for (const ex of ["tomate crue", "tomate"])
      if (exclu([ex], sauce)) ech(`2. « ${ex} » écarte une sauce au concentré de tomates`);

    /* 3. Tomate crue (drapeau posé par build_data.py) écartée sous les deux noms. */
    const crue = R(["tomates", "mozzarella"], { tomate_crue: ["tomates"] });
    for (const ex of ["tomate crue", "tomate", "Tomate"])
      if (!exclu([ex], crue)) ech(`3. « ${ex} » laisse passer une tomate crue`);

    /* 4. Sucré-salé : reconnu par son drapeau ; avant la v35, jamais. */
    const miel = R(["poulet", "miel"], { sucre_sale: ["miel"] });
    if (!exclu(["sucré-salé"], miel)) ech("4. « sucré-salé » laisse passer un poulet au miel");
    if (exclu(["sucré-salé"], R(["poulet", "sucre"]))) ech("4. un plat sans drapeau est écarté comme sucré-salé");

    /* 5. Les autres exclusions restent des noms : champignons cuits ou crus, et la croix ✕ sur « tomates ». */
    if (!exclu(["champignon"], R(["champignons de Paris"]))) ech("5. champignons non écartés");
    if (!exclu(["tomates"], R(["tomates"]))) ech("5. la croix ✕ sur « tomates » doit écarter les tomates");

    /* 6. La base livrée ne contient aucune tomate crue ni sucré-salé hors recette demandée. */
    const marques = window.RECIPES.filter((r) => (r.tomate_crue || r.sucre_sale) && !r.demande).map((r) => r.nom);
    if (marques.length) ech(`6. recettes non demandées marquées : ${marques.join(", ")}`);
    st.exclusions = window.EXCLUS_DEFAUT.slice();
    res.details.disponibles = `${window.RECIPES.filter((r) => !M.estExclu(r)).length}/${window.RECIPES.length}`;
  } catch (e) {
    ech("exception : " + e.message);
  } finally {
    st.exclusions = avant;
    M.sauver();
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
