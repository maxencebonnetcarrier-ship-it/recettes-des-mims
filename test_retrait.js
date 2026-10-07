/* Test de la croix ✕ d'un ingrédient (v48) — console du navigateur ou lancer_tests.mjs.
   Choix du 07/10 : « les x d'une recette ne devraient pas exclure complètement la recette mais juste l'enlever de la
   recette ». Avant, ✕ ajoutait l'ingrédient aux exclusions : toutes les recettes qui en contiennent disparaissaient.
   ATTENTION : remplace le menu, les épingles, les exclusions et les ingrédients retirés de l'appareil, puis les remet ;
   la synchro de test (faux hub, aucun appel réseau) est déconnectée à la fin. */
(async function () {
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
  const RIZ = "Riz au chorizo", POIVRON = "poivron vert", OLIVES = "olives vertes farcies au piment";
  const bouton = (act, nom, ing, ou) => [...document.querySelectorAll(`${ou || "#view-semaine"} button[data-act="${act}"]`)]
    .find((b) => b.dataset.nom === nom && b.dataset.ing === ing);
  const achatsMercredi = () => Object.values(M.listeCourses(["Mer"])).flatMap((ray) => Object.values(ray)).map((x) => x.nom.toLowerCase());
  const mercredi = () => st.semaine.plan.find((p) => p.jour === "Mer") || {};
  const CH = ["semaine", "suivante", "epingles", "envies", "historique", "servis", "exclusions", "retraits", "promos"];
  const fetchVrai = window.fetch;
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

  try {
    figer("2026-10-05T12:00:00");                        // lundi
    const riz = window.RECIPES.find((r) => r.nom === RIZ);
    if (!riz || !riz.ingredients.some((i) => i.nom === POIVRON) || !riz.ingredients.some((i) => i.nom === OLIVES)) {
      ech(`précondition : « ${RIZ} » avec ${POIVRON} et ${OLIVES} absent de la base`); return res;
    }
    st.semaine = null; st.suivante = null; st.epingles = {}; st.envies = []; st.historique = []; st.servis = []; st.promos = [];
    st.exclusions = ["abats", "tomate crue", "champignon", "sucré-salé"]; st.retraits = {};
    M.epingler("Mer", RIZ);
    M.generer();
    onglet("semaine");
    const exclusionsAvant = JSON.stringify(st.exclusions);
    if (!achatsMercredi().some((n) => n.includes(POIVRON))) ech("précondition : pas de poivron vert dans les courses de mercredi");

    /* 1. ✕ sur « poivron vert » : retiré de CETTE recette, qui reste au menu ; rien n'est exclu ; plus dans les courses. */
    const x1 = bouton("retirer", RIZ, POIVRON);
    if (!x1) { ech("1. pas de ✕ « retirer » sur le poivron vert du riz"); return res; }
    x1.click();
    if (mercredi().nom !== RIZ) ech(`1. le riz a quitté le menu : mercredi = « ${mercredi().nom} »`);
    if (JSON.stringify(st.exclusions) !== exclusionsAvant) ech(`1. les exclusions ont changé : ${JSON.stringify(st.exclusions)}`);
    if (JSON.stringify(st.retraits[RIZ]) !== JSON.stringify([POIVRON])) ech(`1. retraits : ${JSON.stringify(st.retraits)}`);
    if (achatsMercredi().some((n) => n.includes(POIVRON))) ech("1. le poivron vert est encore dans les courses de mercredi");
    if (!achatsMercredi().some((n) => n.includes("chorizo"))) ech("1. le reste du riz a disparu des courses");
    const remettre = bouton("remettre", RIZ, POIVRON);
    if (!remettre) ech("1. pas de bouton « Remettre » sur le poivron retiré");
    if (window.RECIPES.filter((r) => r.ingredients.some((i) => i.nom === POIVRON)).some((r) => M.estExclu(r))) ech("1. une recette au poivron vert est devenue exclue");

    /* 2. « Remettre » : de retour dans la recette et les courses. */
    if (remettre) {
      remettre.click();
      if (st.retraits[RIZ]) ech(`2. retraits après « Remettre » : ${JSON.stringify(st.retraits)}`);
      if (!achatsMercredi().some((n) => n.includes(POIVRON))) ech("2. le poivron vert n'est pas revenu dans les courses");
    }

    /* 3. Un ingrédient EXCLU (Réglages) retiré de la recette : la recette n'est plus exclue, l'alerte disparaît. */
    M.exclure(OLIVES);
    onglet("semaine");
    if (!mercredi().exclusAlerte) ech("3. précondition : pas d'alerte « contient » sur le riz imposé après l'exclusion des olives");
    if (!M.estExclu(riz)) ech("3. précondition : le riz n'est pas exclu");
    const x3 = bouton("retirer", RIZ, OLIVES);
    if (!x3) ech("3. pas de ✕ sur les olives");
    else {
      x3.click();
      if (M.estExclu(riz)) ech("3. le riz reste exclu alors que ses olives sont retirées");
      if (mercredi().exclusAlerte) ech(`3. alerte encore posée : ${JSON.stringify(mercredi().exclusAlerte)}`);
      if (/normalement exclu/.test((document.querySelector("#view-semaine") || { textContent: "" }).textContent)) ech("3. l'écran dit encore « normalement exclu »");
    }

    /* 4. Même croix dans l'onglet Recettes : retire, la fiche reste disponible. */
    onglet("recettes");
    const autre = window.RECIPES.find((r) => r.nom !== RIZ && !M.estExclu(r) && r.ingredients.length > 2);
    const ing4 = autre.ingredients[0].nom;
    const x4 = bouton("retirer", autre.nom, ing4, "#view-recettes");
    if (!x4) ech(`4. pas de ✕ dans la fiche « ${autre.nom} »`);
    else {
      x4.click();
      if (!(st.retraits[autre.nom] || []).includes(ing4)) ech("4. la croix de l'onglet Recettes n'a rien retiré");
      const carte = [...document.querySelectorAll("#view-recettes .recipe")].find((c) => c.querySelector(".n").textContent.startsWith(autre.nom));
      if (!carte || carte.classList.contains("excluded")) ech("4. la fiche est marquée exclue");
    }

    /* 5. Partagé avec l'autre téléphone : les ingrédients retirés partent vers le hub, et ceux de l'autre arrivent. */
    const envois = [];
    const distant = { retraits: { v: { [RIZ]: ["oignon"] }, t: Date.now() + 60000 } };
    window.fetch = async (url, opt) => {
      if (opt && opt.method === "POST") envois.push(JSON.parse(opt.body));
      return { ok: true, json: async () => ({ ok: true, state: JSON.parse(JSON.stringify(distant)) }) };
    };
    const ok = await window.__sync.connecter("https://script.google.com/macros/s/TEST/exec", "jeton-test");
    if (!ok) ech("5. connexion au faux hub refusée");
    if (!envois.some((e) => e.patch && "retraits" in e.patch)) ech(`5. les ingrédients retirés ne partent pas vers le hub (champs : ${envois.map((e) => Object.keys(e.patch || {}).join(",")).join(" | ")})`);
    if (JSON.stringify(st.retraits[RIZ]) !== JSON.stringify(["oignon"])) ech(`5. les retraits de l'autre téléphone ne sont pas reçus : ${JSON.stringify(st.retraits)}`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.Date = Vraie;
    window.fetch = fetchVrai;
    try { window.__sync.deconnecter(); } catch (e) { /* synchro absente */ }
    CH.forEach((c) => { if (avant[c] === undefined) delete st[c]; else st[c] = JSON.parse(avant[c]); });
    M.sauver();
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
