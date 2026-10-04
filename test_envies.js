/* Test des envies par INGRÉDIENT (v36) — à exécuter dans la console du navigateur ou via le
   harnais Playwright/CDP. Retourne un objet résultat, n'affiche rien.
   « Poireaux pour jeudi » : l'app propose les plats de la base qui en contiennent, en met un au
   menu ce jour-là (cette semaine si le jour n'est pas passé, sinon la semaine prochaine), et
   l'envie s'efface d'elle-même une fois sa semaine terminée.
   ATTENTION : remet à zéro le menu, la semaine suivante, les envies et les épingles de l'appareil. */
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
  const sansAcc = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe");
  const R = (nom) => window.RECIPES.find((r) => r.nom === nom);
  const contient = (nom, ing) => { const r = R(nom); return !!r && r.ingredients.some((i) => sansAcc(i.nom).includes(ing)); };
  const plat = (s, j) => (s && s.plan.find((p) => p.jour === j) || {}).nom;
  function ouvrirEnvies() {
    onglet("reglages");
    const b = document.querySelector('#view-reglages button[data-act="reglages-ouvrir"][data-sec="envies"]');
    if (b) b.click();
  }
  function ajouter(texte, jour) {
    ouvrirEnvies();
    const inp = document.getElementById("new-envie");
    inp.value = texte;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("new-envie-jour").value = jour || "";
    document.getElementById("btn-add-envie").click();
  }

  try {
    st.semaine = null; st.suivante = null; st.envies = []; st.epingles = {}; st.historique = []; st.servis = [];
    figer("2026-10-05T12:00:00");                       // lundi, semaine 41
    onglet("semaine");

    /* 1. Taper un ingrédient fait apparaître les plats de la base qui en contiennent. */
    ouvrirEnvies();
    const inp = document.getElementById("new-envie");
    if (!inp) { ech("1. champ des envies introuvable"); return res; }
    inp.value = "poireaux";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const props = [...document.querySelectorAll('#envie-props button[data-act="envie-prop"]')].map((b) => b.dataset.nom);
    res.details.propositions = props;
    if (props.length < 3) ech(`1. seulement ${props.length} proposition(s) pour « poireaux »`);
    if (props.some((n) => !contient(n, "poireau"))) ech("1. une proposition ne contient pas de poireaux");
    if (props.length) {
      document.querySelector('#envie-props button[data-act="envie-prop"]').click();
      if (document.getElementById("new-envie").value !== props[0]) ech("1. toucher une proposition ne la met pas dans le champ");
    }

    /* 2. « Poireaux pour jeudi », un lundi : le jeudi de CETTE semaine en contient, les autres
          jours ne bougent pas, et la fiche le dit. */
    const avant = st.semaine.plan.map((p) => p.nom);
    ajouter("poireaux", "Jeu");
    const e = st.envies.find((x) => x && x.type === "ingredient" && x.nom === "poireaux");
    if (!e || e.jour !== "Jeu" || e.num !== 41 || e.an !== 2026) ech(`2. envie enregistrée : ${JSON.stringify(e)}`);
    res.details.jeudi = plat(st.semaine, "Jeu");
    if (!contient(plat(st.semaine, "Jeu"), "poireau")) ech(`2. jeudi : « ${plat(st.semaine, "Jeu")} » ne contient pas de poireaux`);
    const changes = st.semaine.plan.filter((p, i) => p.nom !== avant[i]).map((p) => p.jour);
    if (changes.some((j) => j !== "Jeu")) ech(`2. d'autres jours ont changé : ${changes.join(", ")}`);
    onglet("semaine");
    const fiche = document.querySelector('#view-semaine details[data-cle="jour-Jeu"]');
    if (!fiche || !/envie/i.test(fiche.textContent)) ech("2. la fiche du jeudi ne dit pas que c'est ton envie");
    if (st.epingles.Jeu && st.epingles.Jeu.nom) ech("2. l'envie a posé une épingle (plat imposé) au lieu d'un choix");

    /* 3. « Changer » le jeudi garde l'envie : le nouveau plat contient encore des poireaux. */
    const jeudiAvant = plat(st.semaine, "Jeu");
    document.querySelector('#view-semaine details[data-cle="jour-Jeu"] button[data-act="regen-day"]').click();
    res.details.jeudiChange = plat(st.semaine, "Jeu");
    if (plat(st.semaine, "Jeu") === jeudiAvant) ech("3. « Changer » n'a pas changé le jeudi");
    if (!contient(plat(st.semaine, "Jeu"), "poireau")) ech(`3. après « Changer », « ${plat(st.semaine, "Jeu")} » n'a plus de poireaux`);

    /* 4. Un vendredi, « lardons pour lundi » vise la semaine PROCHAINE. */
    figer("2026-10-09T12:00:00");                       // vendredi, semaine 41
    onglet("semaine");
    const semAvant = st.semaine.plan.map((p) => p.nom).join("|");
    ajouter("lardons", "Lun");
    const l = st.envies.find((x) => x && x.type === "ingredient" && x.nom === "lardons");
    if (!l || l.num !== 42) ech(`4. « lardons pour lundi » un vendredi vise ${JSON.stringify(l)} au lieu de la semaine 42`);
    if (st.semaine.plan.map((p) => p.nom).join("|") !== semAvant) ech("4. le menu de cette semaine a changé");
    onglet("semaine");
    document.querySelector('#view-semaine button[data-act="vue-semaine"][data-val="1"]').click();
    res.details.lundiS1 = plat(st.suivante, "Lun");
    if (!contient(plat(st.suivante, "Lun"), "lardon")) ech(`4. lundi S+1 : « ${plat(st.suivante, "Lun")} » ne contient pas de lardons`);
    document.querySelector('#view-semaine button[data-act="vue-semaine"][data-val="0"]').click();

    /* 5. Sans jour : UN plat des jours restants en contient, un seul jour change au plus. */
    const avant5 = st.semaine.plan.map((p) => p.nom);
    ajouter("poulet", "");
    const auj = 4;                                     // vendredi
    const jours5 = st.semaine.plan.filter((p, i) => p.nom !== avant5[i]).map((p) => p.jour);
    const avecPoulet = st.semaine.plan.filter((p) => ["Ven", "Sam", "Dim"].includes(p.jour) && contient(p.nom, "poulet"));
    res.details.poulet = avecPoulet.map((p) => p.jour + " " + p.nom);
    if (!avecPoulet.length) ech("5. aucun plat avec du poulet sur les jours restants");
    if (jours5.length > 1) ech(`5. plusieurs jours changés pour une envie sans jour : ${jours5.join(", ")}`);
    if (jours5.some((j) => ["Lun", "Mar", "Mer", "Jeu"].indexOf(j) >= 0)) ech("5. un jour déjà passé a été changé");
    void auj;

    /* 6. Un vrai NOM de plat garde l'ancien fonctionnement : il est imposé sur le jour. */
    ajouter("Cordon bleu", "Dim");
    if (!st.epingles.Dim || st.epingles.Dim.nom !== "Cordon bleu") ech("6. « Cordon bleu » pour dimanche n'est plus imposé comme avant");
    if (st.envies.some((x) => x && x.type === "ingredient" && x.nom === "Cordon bleu")) ech("6. un nom de plat a été pris pour un ingrédient");

    /* 8. Une envie de PLAT pour un jour déjà passé (v37) vise ce jour de la semaine PROCHAINE :
          avant, elle re-tirait toute la semaine en cours et le plat n'était jamais servi. */
    const vueS = (v) => { onglet("semaine"); document.querySelector(`#view-semaine button[data-act="vue-semaine"][data-val="${v}"]`).click(); };
    const noms = (s) => (s ? s.plan.map((p) => p.nom) : []);
    // 8a. vendredi, S+1 pas encore préparée : « Chou farci pour mardi »
    vueS("0");
    st.suivante = null;
    const cour8 = noms(st.semaine).join("|");
    ajouter("Chou farci", "Mar");
    const ep = st.epingles["Mar+1"];
    if (!ep || ep.nom !== "Chou farci" || ep.num !== 42) ech(`8a. pas d'épingle pour mardi S+1 : ${JSON.stringify(st.epingles)}`);
    if (st.epingles.Mar && st.epingles.Mar.nom === "Chou farci") ech("8a. le plat a été imposé sur le mardi déjà passé");
    if (noms(st.semaine).join("|") !== cour8) ech("8a. le menu de cette semaine a changé");
    const env = st.envies.find((x) => x && x.nom === "Chou farci");
    if (!env || env.num !== 42) ech(`8a. envie enregistrée sans la semaine 42 : ${JSON.stringify(env)}`);
    ouvrirEnvies();
    const chip = [...document.querySelectorAll("#view-reglages .chip.envie")].find((c) => c.textContent.includes("Chou farci"));
    if (!chip || !/semaine prochaine/.test(chip.textContent)) ech("8a. l'envie n'indique pas « semaine prochaine »");
    // 8b. ouvrir la semaine prochaine : mardi = Chou farci, imposé (pas de « Changer »)
    vueS("1");
    const marS1 = st.suivante && st.suivante.plan.find((p) => p.jour === "Mar");
    res.details.mardiS1 = marS1 && marS1.nom;
    if (!marS1 || marS1.nom !== "Chou farci" || !marS1.epingle) ech(`8b. mardi S+1 : ${JSON.stringify(marS1)}`);
    const ficheMar = document.querySelector('#view-semaine details[data-cle="s1-jour-Mar"]');
    if (!ficheMar || ficheMar.querySelector('button[data-act="regen-day"]') || !ficheMar.querySelector('button[data-act="desepingler"]'))
      ech("8b. la fiche de mardi S+1 ne montre pas « Ne plus imposer » à la place de « Changer »");
    // 8c. S+1 déjà préparée : « Rôti de veau pour lundi » ne change que lundi (et un éventuel doublon)
    const s1Avant = noms(st.suivante);
    ajouter("Rôti de veau", "Lun");
    const s1Apres = noms(st.suivante);
    if (s1Apres[0] !== "Rôti de veau" || !st.suivante.plan[0].epingle) ech(`8c. lundi S+1 = « ${s1Apres[0]} » au lieu de Rôti de veau imposé`);
    const autres = s1Apres.map((n, i) => i > 0 && n !== s1Avant[i] && s1Avant[i] !== "Rôti de veau" ? st.suivante.plan[i].jour : null).filter(Boolean);
    if (autres.length) ech(`8c. d'autres jours de S+1 ont changé : ${autres.join(", ")}`);
    if (s1Apres.filter((n) => n === "Rôti de veau").length > 1) ech("8c. Rôti de veau deux fois dans S+1");
    if (noms(st.semaine).join("|") !== cour8) ech("8c. le menu de cette semaine a changé");
    // 8d. « Ne plus imposer » sur lundi S+1 libère ce jour, sans toucher au reste
    vueS("1");
    document.querySelector('#view-semaine details[data-cle="s1-jour-Lun"] button[data-act="desepingler"]').click();
    if (!st.epingles["Lun+1"] || st.epingles["Lun+1"].nom !== null) ech("8d. l'épingle de lundi S+1 n'est pas levée");
    if (st.suivante.plan[0].epingle) ech("8d. lundi S+1 est encore marqué imposé");
    if ((st.suivante.plan.find((p) => p.jour === "Mar") || {}).nom !== "Chou farci") ech("8d. mardi S+1 a perdu son plat imposé");
    if (noms(st.semaine).join("|") !== cour8) ech("8d. le menu de cette semaine a changé");
    // 8e. retirer l'envie (✕) retire aussi l'épingle de la semaine prochaine
    ajouter("Pot-au-feu", "Mer");
    ouvrirEnvies();
    const iPot = st.envies.findIndex((x) => x && x.nom === "Pot-au-feu");
    document.querySelector(`#view-reglages button[data-act="del-envie"][data-i="${iPot}"]`).click();
    if (!st.epingles["Mer+1"] || st.epingles["Mer+1"].nom !== null) ech("8e. retirer l'envie ne lève pas l'épingle de mercredi S+1");
    if ((st.suivante.plan.find((p) => p.jour === "Mer") || {}).epingle) ech("8e. mercredi S+1 reste imposé après retrait de l'envie");
    vueS("0");

    /* 9. Le lundi venu, le plat imposé pour mardi S+1 est au menu de la semaine, toujours imposé. */
    figer("2026-10-12T12:00:00");                       // lundi, semaine 42
    onglet("semaine");
    const mar9 = st.semaine.plan.find((p) => p.jour === "Mar");
    res.details.mardiSemaine42 = mar9 && mar9.nom;
    if (!mar9 || mar9.nom !== "Chou farci" || !mar9.epingle) ech(`9. mardi de la semaine 42 : ${JSON.stringify(mar9)}`);
    if (!st.epingles.Mar || st.epingles.Mar.nom !== "Chou farci" || st.epingles.Mar.num !== 42) ech(`9. épingle de mardi non reprise : ${JSON.stringify(st.epingles.Mar)}`);
    if (Object.keys(st.epingles).some((k) => /\+1$/.test(k) && st.epingles[k].num !== 43)) ech(`9. épingles « S+1 » périmées encore là : ${Object.keys(st.epingles).join(", ")}`);
    const fiche9 = document.querySelector('#view-semaine details[data-cle="jour-Mar"]');
    if (!fiche9 || fiche9.querySelector('button[data-act="regen-day"]')) ech("9. mardi n'est plus protégé comme plat imposé");

    /* 7. Une envie d'ingrédient s'efface d'elle-même quand sa semaine est passée. */
    figer("2026-10-19T12:00:00");                       // semaine 43
    onglet("semaine");
    const restent = st.envies.filter((x) => x && x.type === "ingredient").map((x) => x.nom);
    if (restent.length) ech(`7. envies d'une semaine passée encore là : ${restent.join(", ")}`);
  } catch (err) {
    ech("exception : " + err + " " + (err.stack || "").split("\n")[1]);
  } finally {
    window.Date = Vraie;
    st.envies = []; st.epingles = {}; st.suivante = null; st.semaine = null;
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
