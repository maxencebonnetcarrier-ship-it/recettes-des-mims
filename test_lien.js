/* Test du lien fourni dans une envie (v50) — console du navigateur ou lancer_tests.mjs.
   Choix du 08/10 : « un lien que je donne passe toujours devant la recette de même nom déjà dans la base ».
   Cas réel : « Chili con carne » pour samedi avec un lien Marmiton ; la base avait un autre chili de ce nom, servi
   à la place, et le lien n'était jamais lu. Le test prend une recette QUELCONQUE de la base comme homonyme et un lien
   FICTIF : avec le vrai lien, le test devenait rouge dès que le guetteur ajoutait le vrai chili, et bloquait sa
   publication (constaté le 08/10, même piège que test_suivi_envies.js le 05/10). La recette du lien « arrive »
   comme le ferait une mise à jour poussée par le guetteur : une copie de l'homonyme, au nom « … (lien fictif) ».
   ATTENTION : remplace le menu, les envies, les épingles et le suivi du PC de l'appareil, puis les remet. */
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
  const plat = (j) => (st.semaine.plan.find((p) => p.jour === j) || {});
  const autres = () => st.semaine.plan.filter((p) => p.jour !== "Sam").map((p) => p.jour + ":" + p.nom).join(" | ");
  function statut(nom) {
    onglet("reglages");
    const b = document.querySelector('#view-reglages button[data-act="reglages-ouvrir"][data-sec="envies"]');
    if (b) b.click();
    const l = [...document.querySelectorAll("#view-reglages .envie-l")].find((x) => x.querySelector(".el-n").textContent === nom);
    return l ? ((l.querySelector(".el-s") || { textContent: "" }).textContent) : null;
  }
  const sansAcc = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const echap = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // homonyme : une recette ordinaire de la base, sans parenthèse dans son nom
  const HOMO = window.RECIPES.find((r) => r.saison === "Toute l'année" && !/[()]/.test(r.nom) && r.url && r.ingredients.length > 2);
  const NOM = HOMO ? HOMO.nom : "", LIE = NOM + " (lien fictif)";
  const LIEN = "https://www.marmiton.org/recettes/recette_plat-fictif-du-test-lien_9999999.aspx";
  const CH = ["semaine", "suivante", "envies", "epingles", "historique", "servis", "promos", "guetteur", "retraits", "exclusions"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));
  let ajoutee = null;

  try {
    figer("2026-10-08T12:00:00");                        // jeudi, semaine 41 : samedi est à venir
    const base = HOMO;
    if (!base) { ech("précondition : aucune recette ordinaire dans la base"); return res; }
    res.details.homonyme = NOM;
    if (M.estExclu(base)) st.exclusions = (st.exclusions || []).filter((x) => !base.ingredients.some((i) => sansAcc(i.nom).includes(sansAcc(x))));
    if (window.RECIPES.some((r) => r.url === LIEN || r.nom === LIE)) { ech("précondition : la recette du lien est déjà dans la base"); return res; }
    st.semaine = null; st.suivante = null; st.historique = []; st.servis = []; st.promos = []; st.retraits = {};
    st.envies = [{ nom: NOM, url: LIEN, jour: "Sam", an: 2026, num: 41 }];
    st.epingles = {};
    st.guetteur = { passe: Date.now(), envies: { [sansAcc(NOM)]: { nom: NOM, etat: "ajoutee", recette: LIE, t: Date.now() - 60000 } } };
    M.epingler("Sam", NOM);
    M.generer();
    onglet("semaine");

    /* 1. Avant l'arrivée de la recette du lien : samedi sert le chili de la base (repli), l'envie dit que la recette
          du PC n'est pas encore dans l'app, et la mise à jour est proposée. */
    if (plat("Sam").nom !== NOM || !plat("Sam").epingle) ech(`1. samedi = « ${plat("Sam").nom} » au lieu de l'homonyme « ${NOM} » imposé`);
    const s1 = statut(NOM) || "";
    res.details.avant = s1;
    if (!/pas encore dans cette version/.test(s1)) ech(`1. statut de l'envie : « ${s1} » (attendu : ajoutée par le PC, pas encore dans l'app)`);
    if (JSON.stringify(M.ajoutsEnAttente()) !== JSON.stringify([NOM])) ech(`1. ajouts en attente : ${JSON.stringify(M.ajoutsEnAttente())}`);

    /* 2. La recette du lien arrive : samedi la prend tout seul, l'épingle prend son nom, le reste du menu ne bouge pas. */
    onglet("semaine");
    const reste = autres();
    ajoutee = Object.assign(JSON.parse(JSON.stringify(base)), { nom: LIE, url: LIEN });
    window.RECIPES.push(ajoutee);
    onglet("semaine");
    res.details.samedi = plat("Sam").nom;
    if (plat("Sam").nom !== LIE || !plat("Sam").epingle) ech(`2. samedi = « ${plat("Sam").nom} » au lieu de « ${LIE} » imposé`);
    if ((st.epingles.Sam || {}).nom !== LIE) ech(`2. épingle de samedi : ${JSON.stringify(st.epingles.Sam)}`);
    if (autres() !== reste) ech(`2. d'autres jours ont changé : « ${reste} » → « ${autres()} »`);
    if (M.ajoutsEnAttente().length) ech(`2. encore en attente : ${JSON.stringify(M.ajoutsEnAttente())}`);
    const s2 = statut(NOM) || "";
    if (!new RegExp("ajoutée par le PC : " + echap(LIE)).test(s2)) ech(`2. statut de l'envie : « ${s2} »`);

    /* 3. Une envie SANS lien du même nom reste servie par la recette de la base (comportement inchangé). */
    st.envies = [{ nom: NOM, jour: "Sam", an: 2026, num: 41 }];
    st.epingles = {}; st.guetteur = undefined;
    M.epingler("Sam", NOM);
    M.generer();
    if (plat("Sam").nom !== NOM) ech(`3. sans lien, samedi = « ${plat("Sam").nom} » au lieu de « ${NOM} »`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.Date = Vraie;
    if (ajoutee) { const i = window.RECIPES.indexOf(ajoutee); if (i >= 0) window.RECIPES.splice(i, 1); }
    CH.forEach((c) => { if (avant[c] === undefined) delete st[c]; else st[c] = JSON.parse(avant[c]); });
    M.sauver();
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
