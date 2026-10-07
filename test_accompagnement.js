/* Test de la version du repas AVEC son accompagnement (v46) — console du navigateur ou lancer_tests.mjs.
   Choix du 07/10 : « mettre recette alternative avec l'accompagnement en idée en ajustant avec la recette de base ».
   Idée d'accompagnement : une « Version avec … » dépliable, avec les féculents du plat qu'il remplace barrés, ses
   ingrédients pour 4 parts et ses étapes, et un bouton pour la prendre. Pris : affiché d'office, sans bouton.
   ATTENTION : remplace le menu de l'appareil, puis le remet. */
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
  const ACC = window.ACCOMPAGNEMENTS || [];
  const R = (nom) => window.RECIPES.find((r) => r.nom === nom);
  // même règle que l'app (estFeculent, v46) : « pâte de curry », « purée de tomate », « fécule » ne sont pas des féculents
  const FEC = /\b(pommes? de terre|riz|pates?|penne|spaghetti|tagliatelles?|nouilles?|semoule|boulgour|quinoa|patates? douces?|puree)\b/;
  const PAS_FEC = /\b(pate (de|d|a|au|aux|brisee|feuilletee|sablee|filo|phyllo)|pates (feuilletees|brisees|sablees)|puree (de )?tomates?|fecule|en une pate|concentre)\b/;
  const brut = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const FECULENT = { test: (t) => FEC.test(t) && !PAS_FEC.test(t) };
  const CH = ["semaine", "suivante", "promos", "epingles", "envies", "historique", "servis"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

  try {
    figer("2026-10-05T12:00:00");                        // lundi : toute la semaine est à venir
    st.semaine = null; st.suivante = null; st.promos = []; st.epingles = {}; st.envies = []; st.historique = []; st.servis = [];
    // mardi : un plat dont les INGRÉDIENTS ont un féculent (pas le nom), avec une idée d'accompagnement compatible.
    // Posé à la main : seuls ~30 plats sur 235 s'y prêtent, un tirage au hasard n'en donnait pas toujours un.
    const s = M.generer();
    const r = window.RECIPES.find((x) => !FECULENT.test(brut(x.nom)) && x.ingredients.some((i) => FECULENT.test(brut(i.nom)))
      && ACC.some((y) => (y.suits || []).includes(x.cat)) && !M.estExclu(x));
    if (!r) { ech("précondition : aucun plat à féculent qui accepte un accompagnement"); return res; }
    const a = ACC.find((y) => (y.suits || []).includes(r.cat));
    const p = s.plan.find((x) => x.jour === "Mar");
    Object.assign(p, { nom: r.nom, proteine: r.proteine, side: { nom: a.nom, url: a.url, source: a.source } });
    delete p.sideChoisi; delete p.epingle; delete p.envie;
    M.sauver();
    res.details.jour = `${p.jour} : ${r.nom} + ${a.nom}`;
    onglet("semaine");
    const cle = `alt-${p.jour}`;
    const alt = document.querySelector(`#view-semaine details.alt[data-cle="${cle}"]`);

    /* 1. Une « Version avec … » existe, avec le bon accompagnement. */
    if (!alt) { ech(`1. pas de « Version avec ${a.nom} » pour ${p.jour}`); return res; }
    alt.open = true;
    const titre = alt.querySelector("summary").textContent;
    if (!titre.includes(a.nom)) ech(`1. titre : « ${titre} »`);

    /* 2. Ajustée à la recette de base : les féculents du plat barrés, avec leur quantité pour 4 parts. */
    const feculents = r.ingredients.filter((i) => FECULENT.test(brut(i.nom)));
    const barres = [...alt.querySelectorAll("li.remplace s")].map((x) => x.textContent);
    if (JSON.stringify(barres) !== JSON.stringify(feculents.map((i) => i.nom))) ech(`2. barrés : ${JSON.stringify(barres)} au lieu de ${JSON.stringify(feculents.map((i) => i.nom))}`);

    /* 3. Les ingrédients de l'accompagnement pour 4 parts, et ses étapes. */
    const lignes = [...alt.querySelectorAll(".acc-ing li")];
    if (lignes.length !== a.ingredients.length) ech(`3. ${lignes.length} ingrédients d'accompagnement au lieu de ${a.ingredients.length}`);
    const i0 = a.ingredients.findIndex((i) => i.qte);
    if (i0 >= 0) {
      const i = a.ingredients[i0];
      const attendu = `${Math.round(i.qte * 4 / (a.parts_origine || 4) * 10) / 10}`;
      const lu = lignes[i0] ? lignes[i0].querySelector(".iq").textContent.trim() : "";
      if (!lu.startsWith(attendu)) ech(`3. « ${i.nom} » : « ${lu} » au lieu de ${attendu} (pour 4 parts)`);
    }
    const etapes = alt.querySelectorAll(".step-list li").length;
    if (etapes !== (a.etapes || []).length) ech(`3. ${etapes} étapes au lieu de ${(a.etapes || []).length}`);
    // un féculent de l'accompagnement n'est jamais « aussi dans le plat » : celui du plat est justement remplacé
    const fauxCommun = lignes.filter((li, k) => a.ingredients[k] && FECULENT.test(brut(a.ingredients[k].nom)) && li.querySelector(".aussi"));
    if (fauxCommun.length) ech(`3. « aussi dans le plat » sur un féculent remplacé : ${fauxCommun.map((li) => li.textContent.trim()).join(" ; ")}`);

    /* 4. « Prendre cette version » : elle entre dans les courses, s'affiche d'office, et le plat est barré. */
    const prendre = alt.querySelector('button[data-act="choisir-side"]');
    if (!prendre) ech("4. pas de bouton pour prendre cette version");
    else {
      prendre.click();
      const p2 = st.semaine.plan.find((x) => x.jour === p.jour);
      if (!p2.sideChoisi) ech("4. l'accompagnement n'est pas pris");
      if (document.querySelector(`#view-semaine details.alt[data-cle="${cle}"]`)) ech("4. la version reste une simple idée dépliable");
      const corps = document.querySelector(`#view-semaine details[data-cle="ing-${p.jour}"]`);
      const txt = corps ? corps.textContent : "";
      if (!txt.includes(`Accompagnement : ${a.nom}`)) ech("4. une fois prise, la recette de l'accompagnement n'est pas affichée");
    }

    /* 4 bis. Un ingrédient qui porte le mot sans être un féculent (pâte de curry, purée de tomate) n'est ni barré
             ni retiré des courses quand l'accompagnement est pris. Avant la v46, il l'était. */
    const PIEGE = /pate de curry|puree (de )?tomate/;
    const piege = window.RECIPES.find((x) => !FECULENT.test(brut(x.nom)) && x.ingredients.some((i) => PIEGE.test(brut(i.nom)))
      && ACC.some((y) => (y.suits || []).includes(x.cat)) && !M.estExclu(x));
    if (!piege) res.details.note4bis = "aucun plat à pâte de curry ou purée de tomate : cas 4 bis non testable";
    else {
      const ing = piege.ingredients.find((i) => PIEGE.test(brut(i.nom)));
      const a2 = ACC.find((y) => (y.suits || []).includes(piege.cat));
      const pj = st.semaine.plan.find((x) => x.jour === "Jeu");
      Object.assign(pj, { nom: piege.nom, proteine: piege.proteine, side: { nom: a2.nom, url: a2.url, source: a2.source } });
      delete pj.sideChoisi; delete pj.epingle; delete pj.envie;
      M.sauver(); onglet("courses"); onglet("semaine");
      const alt4 = document.querySelector('#view-semaine details.alt[data-cle="alt-Jeu"]');
      if (!alt4) ech(`4 bis. pas de « Version avec » pour ${piege.nom}`);
      const barres4 = alt4 ? [...alt4.querySelectorAll("li.remplace s")].map((x) => x.textContent) : [];
      if (barres4.includes(ing.nom)) ech(`4 bis. « ${ing.nom} » barré comme un féculent`);
      pj.sideChoisi = true; M.sauver();
      const achats = Object.values(M.listeCourses(["Jeu"])).flatMap((ray) => Object.values(ray)).map((x) => brut(x.nom));
      res.details.piege = `${piege.nom} : ${ing.nom} → ${achats.filter((n) => PIEGE.test(n)).join(", ")}`;
      if (!achats.some((n) => PIEGE.test(n))) ech(`4 bis. « ${ing.nom} » retiré des courses quand l'accompagnement est pris`);
    }

    /* 5. Un plat sans accompagnement (nom avec son féculent) n'a pas de « version avec ». */
    const complet = st.semaine.plan.find((x) => !x.side);
    if (complet && document.querySelector(`#view-semaine details.alt[data-cle="alt-${complet.jour}"]`)) ech(`5. « ${complet.nom} » a une version avec accompagnement`);
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
