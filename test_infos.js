/* Test du prix (€ / €€ / €€€) et des calories par part — à exécuter dans la console du
   navigateur ou via le harnais Playwright/CDP. Retourne un objet résultat, n'affiche rien.
   Ces deux informations sont RELEVÉES sur la page source (Marmiton) : l'app ne les estime
   jamais. Une recette sans l'information n'affiche rien plutôt qu'un chiffre inventé.
   ATTENTION : remplace le menu de la semaine de l'appareil qui l'exécute. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims, st = M.getState();
  const ech = (m) => res.echecs.push(m);
  const onglet = (v) => document.querySelector(`.tab[data-view="${v}"]`).click();
  const R = (nom) => window.RECIPES.find((r) => r.nom === nom);

  try {
    /* 1. La base porte les deux informations, relevées sur la source. */
    const avecPrix = window.RECIPES.filter((r) => r.cout).length;
    const avecKcal = window.RECIPES.filter((r) => r.kcal_part).length;
    res.details.base = `${avecPrix} prix, ${avecKcal} calories sur ${window.RECIPES.length} recettes`;
    if (avecPrix < 50 || avecKcal < 40) ech(`1. trop peu de recettes renseignées : ${res.details.base}`);
    if (window.RECIPES.some((r) => r.kcal_part && !/marmiton\.org/.test(r.url))) ech("1. des calories viennent d'une source qui ne les publie pas par part");

    /* 2. La fiche du jour montre le niveau de prix et les calories par part. */
    const DIJON = "Rôti de porc de Dijon";
    const r = R(DIJON);
    if (!r || !r.cout || !r.kcal_part) ech(`2. « ${DIJON} » n'a pas son prix et ses calories`);
    else {
      M.epingler("Dim", DIJON); M.generer(); onglet("semaine");
      const fiche = [...document.querySelectorAll("#view-semaine .eco")].map((e) => e.textContent).join(" | ");
      res.details.fiche = fiche;
      if (!fiche.includes(r.kcal_part + " kcal")) ech(`2. la fiche ne montre pas « ${r.kcal_part} kcal » : ${fiche}`);
      const prix = document.querySelector(`#view-semaine .prix[aria-label="Prix : ${r.cout}"]`);
      if (!prix) ech(`2. pas d'échelle de prix « ${r.cout} » sur la semaine`);
      else if (prix.textContent.replace(/\s/g, "") !== "€€€") ech(`2. l'échelle doit toujours montrer 3 € (pleins ou pâles) : « ${prix.textContent} »`);

      /* 3. Accompagnement pris : ses calories s'ajoutent, et c'est dit. */
      const p = st.semaine.plan.find((x) => x.jour === "Dim");
      const a = p.side && window.ACCOMPAGNEMENTS.find((x) => x.nom === p.side.nom);
      const bouton = document.querySelector('#view-semaine button[data-act="choisir-side"][data-jour="Dim"]');
      if (a && bouton) {
        bouton.click();
        const apres = [...document.querySelectorAll("#view-semaine .eco")].map((e) => e.textContent).join(" | ");
        res.details.ficheAvecAccompagnement = apres;
        if (a.kcal_part && !apres.includes(String(r.kcal_part + a.kcal_part))) ech(`3. le total avec « ${a.nom} » (${r.kcal_part + a.kcal_part}) n'apparaît pas : ${apres}`);
        if (!a.kcal_part && !/non compt/.test(apres)) ech(`3. « ${a.nom} » n'a pas de calories connues et la fiche ne le dit pas`);
      }
      M.desepingler("Dim");
    }

    /* 3 bis. Quand l'accompagnement REMPLACE un féculent de la recette, pas d'addition : le
              chiffre de la source compte déjà ce féculent (on compterait deux fois). */
    const SAUTE = "Sauté de veau aux légumes", rs = R(SAUTE);
    if (rs && rs.kcal_part) {
      M.epingler("Sam", SAUTE); M.generer(); onglet("semaine");
      const p = st.semaine.plan.find((x) => x.jour === "Sam");
      const a = p.side && window.ACCOMPAGNEMENTS.find((x) => x.nom === p.side.nom);
      const b = document.querySelector('#view-semaine button[data-act="choisir-side"][data-jour="Sam"]');
      if (a && a.kcal_part && b) {
        b.click();
        const fiche = [...document.querySelectorAll("#view-semaine .eco")].map((e) => e.textContent).join(" | ");
        res.details.ficheRemplacement = fiche.split(" | ").find((t) => t.includes(String(rs.kcal_part)));
        if (fiche.includes(String(rs.kcal_part + a.kcal_part))) ech(`3 bis. ${rs.kcal_part} + ${a.kcal_part} additionnés alors que ${a.nom} remplace les pommes de terre`);
        if (!fiche.includes(`${a.kcal_part} kcal`)) ech(`3 bis. les calories de ${a.nom} ne sont pas indiquées à part`);
      }
      M.desepingler("Sam");
    }

    /* 4. Sans information à la source, rien n'est affiché (pas de chiffre inventé). */
    const sans = window.RECIPES.find((x) => !x.kcal_part && !x.cout);
    if (sans) {
      onglet("recettes");
      const carte = [...document.querySelectorAll("#view-recettes .recipe")].find((c) => c.querySelector(".n").textContent.startsWith(sans.nom));
      res.details.sansInfo = sans.nom;
      if (!carte) ech(`4. carte « ${sans.nom} » introuvable`);
      else if (/kcal|€/.test(carte.querySelector("summary").textContent)) ech(`4. « ${sans.nom} » affiche un prix ou des calories que sa source ne donne pas`);
    }

    /* 6. En tête de la Semaine : le nombre de plats €, €€, €€€ et les calories moyennes par
          part, calculés sur le menu affiché — et sur combien de plats quand il en manque. */
    const NIV = { "Très bon marché": 1, "Bon marché": 1, "Moyen": 2, "Assez cher": 3, "Cher": 3 };
    const verifierBilan = (etape) => {
      onglet("semaine");
      const bilan = document.querySelector("#view-semaine .bilan");
      const ceSoir = document.querySelector("#view-semaine .ce-soir");
      if (!bilan) { ech(`${etape}. pas de résumé budget / calories en tête de la Semaine`); return; }
      if (ceSoir && !(bilan.compareDocumentPosition(ceSoir) & Node.DOCUMENT_POSITION_FOLLOWING)) ech(`${etape}. le résumé n'est pas avant « Ce soir »`);
      const plats = st.semaine.plan.map((p) => R(p.nom)).filter(Boolean);
      [1, 2, 3].forEach((n) => {
        const attendu = plats.filter((r) => NIV[r.cout] === n).length;
        const el = bilan.querySelector(`.niv[data-niveau="${n}"] b`);
        const lu = el ? +el.textContent : 0;
        if (lu !== attendu) ech(`${etape}. ${"€".repeat(n)} : ${lu} plat(s) affiché(s) au lieu de ${attendu}`);
      });
      const sansPrix = plats.filter((r) => !NIV[r.cout]).length;
      const texte = bilan.textContent.replace(/\s+/g, " ");
      if (sansPrix && !texte.includes(`${sansPrix} sans prix`)) ech(`${etape}. « ${sansPrix} sans prix » n'est pas dit : ${texte}`);
      const k = plats.filter((r) => r.kcal_part);
      if (k.length) {
        const moy = Math.round(k.reduce((t, r) => t + r.kcal_part, 0) / k.length / 10) * 10;
        if (!texte.includes(`≈ ${moy} kcal`)) ech(`${etape}. moyenne attendue ≈ ${moy} kcal : ${texte}`);
        if (k.length < plats.length && !texte.includes(`sur ${k.length} plats`)) ech(`${etape}. ne dit pas « sur ${k.length} plats » : ${texte}`);
        if (k.length === plats.length && /sur \d+ plats/.test(texte)) ech(`${etape}. dit « sur N plats » alors que tous ont leurs calories`);
      }
      return texte;
    };
    M.generer();
    res.details.bilan = verifierBilan(6);
    // un plat sans prix ni calories imposé au lundi : le résumé doit le dire, pas l'inventer
    const SANS = "Émincés de dinde aux poireaux";
    if (R(SANS) && !R(SANS).cout && !R(SANS).kcal_part) {
      M.epingler("Lun", SANS); M.generer();
      res.details.bilanAvecPlatSansInfo = verifierBilan("6 bis");
      M.desepingler("Lun");
    }

    /* 5. Le carnet de recettes montre le prix et les calories sur chaque carte renseignée. */
    onglet("recettes");
    const carteDijon = [...document.querySelectorAll("#view-recettes .recipe")].find((c) => c.querySelector(".n").textContent.startsWith(DIJON));
    if (r && carteDijon) {
      const m = carteDijon.querySelector("summary").textContent;
      if (!m.includes(`${r.kcal_part} kcal`) || !carteDijon.querySelector(".prix")) ech(`5. la carte « ${DIJON} » n'affiche pas prix et calories : ${m}`);
    }
  } catch (e) {
    ech("exception : " + e);
  } finally {
    onglet("semaine");
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
