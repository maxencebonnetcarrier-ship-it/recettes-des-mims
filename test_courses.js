/* Test de la liste de courses (copie, doublons, filtre par jour, accompagnement pris) — à exécuter dans la console du navigateur
   ou via le harnais Playwright/CDP. Retourne un objet résultat, n'affiche rien.
   Ce qui est coché, on l'a déjà : la liste copiée ne doit contenir que le reste à acheter.
   ATTENTION : décoche toute la liste de courses de l'appareil qui l'exécute. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const st = window.__mims.getState();
  const ech = (m) => res.echecs.push(m);

  // on capture le texte au lieu d'écrire dans le vrai presse-papiers
  let copie = null;
  const capture = (t) => { copie = t; return Promise.resolve(); };
  const avaitPressePapiers = !!navigator.clipboard;
  if (avaitPressePapiers) Object.defineProperty(navigator.clipboard, "writeText", { value: capture, configurable: true });
  else Object.defineProperty(navigator, "clipboard", { value: { writeText: capture }, configurable: true });

  const onglet = (v) => document.querySelector(`.tab[data-view="${v}"]`).click();
  const lignes = () => [...document.querySelectorAll("#view-courses .shop-row")];
  const nomDe = (row) => row.querySelector(".sn").textContent;
  const copier = () => { copie = null; document.getElementById("btn-copy").click(); return copie; };

  try {
    st.coursesCochees = {};
    window.__mims.generer();
    onglet("courses");
    const rows = lignes();
    if (rows.length < 3) ech(`liste trop courte pour tester (${rows.length} lignes)`);
    else {
      /* 1. Sans rien cocher, tout est copié. */
      const tout = copier() || "";
      rows.forEach((r) => { if (!tout.includes("• " + nomDe(r))) ech(`1. « ${nomDe(r)} » absent de la liste copiée`); });

      /* 2. Un article coché disparaît de la liste copiée ; les autres restent. */
      const cochee = nomDe(rows[0]), restante = nomDe(rows[1]);
      rows[0].querySelector("input").click();
      const texte = copier() || "";
      res.details.article = cochee;
      if (texte.split("\n").includes("• " + cochee)) ech(`2. « ${cochee} » est coché mais encore copié`);
      if (!texte.includes("• " + restante)) ech(`2. « ${restante} » n'est pas coché mais manque à la copie`);

      /* 3. Tout coché : rien n'est copié (et l'écran le dit au lieu de copier une liste vide). */
      lignes().forEach((r) => { const i = r.querySelector("input"); if (!i.checked) i.click(); });
      const vide = copier();
      if (vide !== null) ech(`3. tout est coché mais une liste a été copiée : ${JSON.stringify(vide).slice(0, 120)}`);
    }
    st.coursesCochees = {};

    /* 4. Un même achat n'a qu'UNE ligne : « oignon » / « oignons », « ail » / « gousses d'ail »,
          ou un article rangé dans deux rayons par deux recettes (mesuré avant v33 : des
          doublons dans 40 menus sur 40). Comparaison au singulier, sans accents ni contenant. */
    const sansAcc = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").trim();
    // même règle que l'app (achat) quand elle est exposée : « poivre du moulin » et « poivre » sont UN achat (v48 :
    // le tirage au sort amenait mercredi des plats où le test, plus naïf, les croyait différents)
    const canonNaif = (n) => sansAcc(n).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
      .replace(/^(gousses?|branches?|brins?|bottes?|cubes?) d(e |')/, "")
      .split(" ").map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w)).join(" ");
    const canon = (n) => (window.__mims.achat ? window.__mims.achat(n).cle : canonNaif(n));
    let doublons = 0; const exemples = [];
    for (let k = 0; k < 30; k++) {
      window.__mims.generer(); onglet("courses");
      const vus = {};
      lignes().filter((r) => !r.classList.contains("optionnel")).forEach((r) => {
        const c = canon(nomDe(r));
        if (vus[c]) { doublons++; if (exemples.length < 4) exemples.push(`${vus[c]} / ${nomDe(r)}`); }
        vus[c] = nomDe(r);
      });
    }
    res.details.doublons = doublons;
    if (doublons) ech(`4. ${doublons} doublon(s) sur 30 listes, ex. : ${exemples.join(" ; ")}`);

    /* 5. Filtre par jour : on ne voit (et ne copie) que ce qu'il faut pour les jours choisis. */
    window.__mims.generer(); onglet("courses");
    const plan = st.semaine.plan;
    const puce = (j) => document.querySelector(`#view-courses button[data-act="filtre-jour"][data-jour="${j}"]`);
    if (!puce("tous") || !puce("Mer")) ech("5. pas de choix des jours en tête de la liste de courses");
    else {
      const nTout = lignes().length;
      const mer = plan.find((p) => p.jour === "Mer");
      const recMer = window.RECIPES.find((r) => r.nom === mer.nom);
      puce("Mer").click();
      const vus = lignes().filter((r) => !r.classList.contains("optionnel"));
      res.details.lignesMercredi = vus.length + "/" + nTout;
      if (!(vus.length < nTout)) ech(`5. le filtre « Mer » montre ${vus.length} lignes sur ${nTout}`);
      const attendus = new Set(recMer.ingredients.map((i) => canon(i.nom)));
      vus.forEach((r) => { if (!attendus.has(canon(nomDe(r)))) ech(`5. « ${nomDe(r)} » affiché pour mercredi mais absent de « ${mer.nom} »`); });
      attendus.forEach((c) => { if (!vus.some((r) => canon(nomDe(r)) === c)) ech(`5. ingrédient « ${c} » de « ${mer.nom} » absent du filtre mercredi`); });
      const texteMer = copier() || "";
      const autre = plan.find((p) => p.jour === "Lun");
      const propreLun = window.RECIPES.find((r) => r.nom === autre.nom).ingredients
        .map((i) => canon(i.nom)).find((c) => !attendus.has(c));
      if (propreLun && texteMer.split("\n").some((l) => canon(l.replace(/^• /, "")) === propreLun))
        ech(`5. la copie filtrée sur mercredi contient « ${propreLun} », qui ne sert que lundi`);

      /* 6. Coché pour un jour ≠ coché pour un autre : l'ail acheté pour mercredi ne couvre pas jeudi. */
      const commun = vus.find((r) => {
        const c = canon(nomDe(r));
        return plan.some((p) => p.jour !== "Mer" && window.RECIPES.find((x) => x.nom === p.nom).ingredients.some((i) => canon(i.nom) === c));
      });
      if (commun) {
        const nom = nomDe(commun);
        commun.querySelector("input").click();               // coché en ne voyant que mercredi
        puce("tous").click();
        // même ACHAT, pas forcément le même libellé : la vue affiche la forme la plus longue des jours choisis
        // (« carotte » mercredi seul, « carottes » sur la semaine) — échec aléatoire constaté le 07/10
        const ligneTout = lignes().find((r) => canon(nomDe(r)) === canon(nom));
        res.details.articleDeuxJours = nom;
        if (!ligneTout) ech(`6. « ${nom} » disparaît de la vue « Tout »`);
        else if (ligneTout.querySelector("input").checked) ech(`6. « ${nom} » coché pour mercredi apparaît acheté pour toute la semaine`);
      }
      puce("tous").click();
    }
    st.coursesCochees = {};

    /* 7. L'accompagnement proposé n'entre dans les courses que s'il est PRIS, et remplace alors
          les féculents de la recette (« Sauté de veau aux légumes » contient des pommes de terre). */
    const M = window.__mims;
    const SAUTE = "Sauté de veau aux légumes";
    if (!window.RECIPES.some((r) => r.nom === SAUTE)) ech(`7. recette « ${SAUTE} » introuvable`);
    else {
      M.epingler("Sam", SAUTE); M.generer(); onglet("semaine");
      const p = st.semaine.plan.find((x) => x.jour === "Sam");
      const parPlat = (plat) => { const out = []; Object.values(M.listeCourses()).forEach((ray) => Object.values(ray).forEach((it) => { if (it.plats.includes(plat)) out.push(canon(it.nom)); })); return out; };
      if (!p.side) ech("7. aucun accompagnement proposé pour le samedi");
      else {
        const acc = window.ACCOMPAGNEMENTS.find((a) => a.nom === p.side.nom);
        if (parPlat(acc.nom).length) ech(`7. « ${acc.nom} » est dans les courses alors qu'il n'a pas été pris`);
        if (!parPlat(SAUTE).includes("pomme de terre")) ech("7. sans accompagnement pris, les pommes de terre de la recette manquent");
        const bouton = document.querySelector('#view-semaine button[data-act="choisir-side"][data-jour="Sam"]');
        if (!bouton) ech("7. pas de bouton pour prendre l'accompagnement du samedi");
        else {
          bouton.click();
          if (!st.semaine.plan.find((x) => x.jour === "Sam").sideChoisi) ech("7. le bouton ne retient pas le choix");
          if (!parPlat(acc.nom).length) ech(`7. « ${acc.nom} » pris mais absent des courses`);
          if (parPlat(SAUTE).includes("pomme de terre")) ech(`7. « ${acc.nom} » pris, mais les pommes de terre de la recette restent dans les courses`);
          const barre = [...document.querySelectorAll("#view-semaine .ing-list li.remplace")].map((li) => li.textContent);
          if (!barre.some((t) => /pommes de terre/.test(t))) ech("7. la recette n'indique pas que ses pommes de terre sont remplacées");
          document.querySelector('#view-semaine button[data-act="choisir-side"][data-jour="Sam"]').click();
          if (parPlat(acc.nom).length) ech("7. accompagnement retiré mais encore dans les courses");
        }
      }
      M.desepingler("Sam");
    }

    /* 8. Un plat qui contient déjà son accompagnement dans son nom n'en reçoit pas d'autre. */
    const COMPLET = "Tajine de poulet aux olives et pommes de terre";
    if (window.RECIPES.some((r) => r.nom === COMPLET)) {
      M.epingler("Sam", COMPLET); M.generer();
      const p = st.semaine.plan.find((x) => x.jour === "Sam");
      if (p.side) ech(`8. « ${COMPLET} » reçoit un accompagnement (${p.side.nom})`);
      M.desepingler("Sam");
    }
  } catch (e) {
    ech("exception : " + e);
  } finally {
    if (avaitPressePapiers) delete navigator.clipboard.writeText;
    else delete navigator.clipboard;
    st.coursesCochees = {};
    onglet("semaine");
  }

  res.ok = res.echecs.length === 0;
  res.echecs = res.echecs.slice(0, 15);
  return res;
})();
