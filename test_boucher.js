/* Test du morceau à demander au boucher (v48) — console du navigateur ou lancer_tests.mjs.
   Choix du 07/10 : « toujours proposer la pièce du boucher quand c'est de la viande, comme pour le sauté de bœuf ».
   ATTENTION : remplace le menu, les épingles et le filtre de jours des courses de l'appareil, puis les remet. */
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
  const fiche = (nom) => {
    const c = [...document.querySelectorAll("#view-recettes .recipe")].find((x) => x.querySelector(".n").textContent.startsWith(nom));
    return c ? ((c.querySelector(".boucher") || {}).textContent || "") : null;
  };
  const SAUTE = "Sauté de bœuf aux oignons";
  const CH = ["semaine", "suivante", "epingles", "envies", "historique", "servis", "promos", "retraits"];
  const avant = Object.fromEntries(CH.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));
  const filtreAvant = localStorage.getItem("mims_courses_jours");

  try {
    figer("2026-10-05T12:00:00");                        // lundi
    st.semaine = null; st.suivante = null; st.epingles = {}; st.envies = []; st.historique = []; st.servis = []; st.promos = []; st.retraits = {};

    /* 1. Dans l'onglet Recettes : viande sans morceau → le morceau qui convient ; morceau nommé → repris tel quel ;
          pas de viande, ou seulement de la charcuterie → rien. */
    onglet("recettes");
    const attendus = [
      [SAUTE, /Chez le boucher : .*boeuf.*demande du rumsteck ou de la bavette, en lanières/i],
      ["Bœuf bourguignon", /demande du paleron/],
      ["Pot-au-feu", /plat de côtes/],
      ["Steak tartare", /haché devant toi/],
      ["Côtes de porc à la sauce moutarde", /^Chez le boucher : 4 unités côtes de porc$/],
      ["Rouelle de porc à l'ancienne", /demande : rouelle/],
      ["Ragoût de mouton aux haricots blancs", /demande de l'épaule ou du collier/],
      ["Coq au vin", /^Chez le boucher : [\d,]+ kg coq$/],
    ];
    attendus.forEach(([nom, re]) => {
      const t = fiche(nom);
      if (t === null) ech(`1. pas de fiche « ${nom} »`);
      else if (!re.test(t.trim())) ech(`1. « ${nom} » : « ${t.trim()} » ne correspond pas à ${re}`);
    });
    ["Riz au chorizo", "Curry de pois chiches au lait de coco", "Endives au jambon light"].forEach((nom) => {
      const t = fiche(nom);
      if (t === null) ech(`1. pas de fiche « ${nom} »`);
      else if (t) ech(`1. « ${nom} » a un conseil de boucher : « ${t.trim()} »`);
    });

    /* 2. Sur la fiche du jour, dans Semaine. */
    M.epingler("Ven", SAUTE);
    M.generer();
    onglet("semaine");
    const ven = [...document.querySelectorAll("#view-semaine details.jour-ligne")].find((d) => d.dataset.cle === "jour-Ven");
    const tv = ven ? ((ven.querySelector(".boucher") || {}).textContent || "") : "";
    if (!/rumsteck/.test(tv)) ech(`2. vendredi (${SAUTE}) sans conseil du boucher : « ${tv} »`);

    /* 3. Dans les courses de vendredi : le bœuf porte « demande du rumsteck… », la liste copiée aussi. */
    localStorage.setItem("mims_courses_jours", JSON.stringify(["Ven"]));
    onglet("courses");
    const ligne = [...document.querySelectorAll("#view-courses .shop-row")].find((r) => /^b(oe|œ)uf$/i.test(r.querySelector(".sn").textContent.trim()));
    const c3 = ligne ? ((ligne.querySelector(".boucher-c") || {}).textContent || "") : null;
    res.details.courses = c3;
    if (c3 === null) ech("3. pas de ligne « boeuf » dans les courses de vendredi");
    else if (!/demande du rumsteck ou de la bavette/.test(c3)) ech(`3. ligne « boeuf » sans conseil : « ${c3} »`);
    // le texte copié est capturé, comme dans test_courses.js (jamais le vrai presse-papiers)
    let copie = null;
    const capture = (t) => { copie = t; return Promise.resolve(); };
    const avaitPP = !!navigator.clipboard;
    if (avaitPP) Object.defineProperty(navigator.clipboard, "writeText", { value: capture, configurable: true });
    else Object.defineProperty(navigator, "clipboard", { value: { writeText: capture }, configurable: true });
    document.getElementById("btn-copy").click();
    if (avaitPP) delete navigator.clipboard.writeText;
    res.details.copie = copie && copie.split("\n").find((l) => /b(oe|œ)uf/i.test(l));
    if (copie === null) ech("3. « Copier la liste » n'a rien copié");
    else if (!/b(oe|œ)uf \(demande du rumsteck/i.test(copie)) ech(`3. la liste copiée n'a pas le conseil du boucher : « ${res.details.copie} »`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.Date = Vraie;
    CH.forEach((c) => { if (avant[c] === undefined) delete st[c]; else st[c] = JSON.parse(avant[c]); });
    if (filtreAvant === null) localStorage.removeItem("mims_courses_jours"); else localStorage.setItem("mims_courses_jours", filtreAvant);
    M.sauver();
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
