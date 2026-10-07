/* Test des recettes épinglées — à exécuter dans la console du navigateur.
   Vérifie qu'un plat imposé sur un jour donné est bien respecté, sans casser
   le reste du menu. Retourne un objet résultat, n'affiche rien. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims;
  const ech = (m) => res.echecs.push(m);

  if (!M || typeof M.epingler !== "function" || typeof M.desepingler !== "function") {
    ech("window.__mims.epingler / desepingler absents");
    res.ok = false;
    return res;
  }

  const etat = M.getState();
  const sauvegarde = JSON.parse(JSON.stringify(etat.epingles || {}));
  const nomsDe = (cat) => window.RECIPES.filter((r) => r.cat === cat).map((r) => r.nom);
  const toutes = window.RECIPES.map((r) => r.nom);

  function reset() {
    Object.keys(M.getState().epingles || {}).forEach((j) => M.desepingler(j));
  }

  /* 1. Une épingle est respectée, même hors du cadre du jour.
        On prend une recette dont la catégorie ne correspond PAS au jeudi. */
  reset();
  const cadre = M.getCadre();
  const jeudi = cadre.find((c) => c.jour === "Jeu");
  const horsCadre = window.RECIPES.find((r) => !jeudi.cats.includes(r.cat));
  if (!horsCadre) ech("jeu de données : aucune recette hors du cadre du jeudi");
  else {
    M.epingler("Jeu", horsCadre.nom);
    const plan = M.generer().plan;
    const jour = plan.find((p) => p.jour === "Jeu");
    if (!jour) ech("1. le jeudi a disparu du menu");
    else if (jour.nom !== horsCadre.nom) ech(`1. jeudi = "${jour.nom}" au lieu de "${horsCadre.nom}" (épingle ignorée)`);
    else if (!jour.epingle) ech("1. le jour n'est pas marqué comme épinglé");
    res.details.horsCadre = horsCadre.nom;
  }

  /* 2. Une épingle survit à une régénération complète du menu. */
  if (horsCadre) {
    let tenu = true;
    for (let k = 0; k < 10; k++) {
      const p = M.generer().plan.find((x) => x.jour === "Jeu");
      if (!p || p.nom !== horsCadre.nom) { tenu = false; break; }
    }
    if (!tenu) ech("2. l'épingle saute quand on régénère le menu");
  }

  /* 3. Une recette contenant un ingrédient exclu passe si elle est épinglée,
        et le plat porte la mention de l'exclu. */
  reset();
  {
    // La base ne contient JAMAIS de recette exclue (build_data.py les rejette). Pour tester
    // vraiment ce chemin, on ajoute le temps du test une exclusion qui touche une recette
    // existante, puis on la retire.
    const st = M.getState();
    const exclusAvant = st.exclusions.slice();
    const cible = window.RECIPES.find((r) => (r.ingredients || []).some((i) => /poulet/i.test(i.nom)));
    if (!cible) res.details.note = "aucune recette au poulet : cas 3 non testable";
    else {
      st.exclusions.push("poulet");
      if (!M.estExclu(cible)) ech("3. montage du test : la recette n'est pas vue comme exclue");
      M.epingler("Mer", cible.nom);
      const p = M.generer().plan.find((x) => x.jour === "Mer");
      if (!p || p.nom !== cible.nom) ech(`3. la recette exclue "${cible.nom}" est refusée alors qu'elle est épinglée`);
      else if (!p.exclusAlerte || !p.exclusAlerte.length) ech("3. aucun avertissement sur l'ingrédient exclu");
      else res.details.alerteExclu = p.exclusAlerte;
      // contrôle négatif : SANS épingle, cette recette ne doit plus jamais sortir
      M.desepingler("Mer");
      let vueSansEpingle = false;
      for (let k = 0; k < 10; k++) if (M.generer().plan.some((x) => x.nom === cible.nom)) vueSansEpingle = true;
      if (vueSansEpingle) ech("3b. une recette exclue est proposée alors qu'elle n'est PAS épinglée");
      st.exclusions = exclusAvant;
      res.details.exclue = cible.nom;
    }
  }

  /* 4. Le menu reste résoluble avec 5 jours sur 7 épinglés. */
  reset();
  const cinq = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
  cinq.forEach((j, i) => M.epingler(j, toutes[i % toutes.length]));
  const plan5 = M.generer().plan;
  if (plan5.length !== cadre.length) ech(`4. menu incomplet avec 5 épingles : ${plan5.length}/${cadre.length} jours`);
  cinq.forEach((j, i) => {
    const p = plan5.find((x) => x.jour === j);
    if (!p || p.nom !== toutes[i % toutes.length]) ech(`4. épingle non tenue sur ${j}`);
  });
  res.details.joursRemplis5 = plan5.length;

  /* 5. (v43) La même protéine deux jours de suite est PERMISE : poisson imposé jeudi, le vendredi peut servir
        un poisson. Le poisson express est mis en favori et noté 5/5 ; le tirage étant pondéré depuis la v48 (plus
        « à coup sûr »), on tire jusqu'à 40 menus : avant la v43, la règle d'adjacence l'interdisait à chaque fois.
        Favoris, notes, promos et menus servis sont remis. */
  reset();
  {
    const st5 = M.getState();
    const ven = cadre.find((c) => c.jour === "Ven");
    const poissonJeu = window.RECIPES.find((r) => r.cat === "Poisson" && r.saison === "Toute l'année" && !M.estExclu(r));
    const poissonVen = window.RECIPES.find((r) => ven && ven.cats.includes(r.cat) && r.proteine === "poisson" &&
      r.saison === "Toute l'année" && (!ven.maxMin || r.total_min <= ven.maxMin) && !M.estExclu(r));
    if (!poissonJeu || !poissonVen) res.details.note5 = "pas de poisson express dans la base : cas 5 non testable";
    else {
      const CH = ["favoris", "notes", "promos", "servis", "historique"];
      const avant5 = Object.fromEntries(CH.map((c) => [c, JSON.stringify(st5[c])]));
      st5.favoris = [poissonVen.nom]; st5.notes = { [poissonVen.nom]: 5 }; st5.promos = []; st5.servis = []; st5.historique = [];
      M.epingler("Jeu", poissonJeu.nom);
      let plan = null, v = null, essais = 0;
      for (; essais < 40; essais++) {
        plan = M.generer().plan;
        v = plan.find((x) => x.jour === "Ven");
        if (plan.some((x) => x.protAlerte)) { ech("5. un avertissement « deux jours de suite » est encore posé"); break; }
        if (v && v.proteine === "poisson") break;
      }
      res.details.vendredi5 = `${v && v.nom} (${essais + 1} tirage(s))`;
      if (!v || v.proteine !== "poisson") ech(`5. aucun poisson vendredi en 40 tirages, jeudi imposé poisson (adjacence encore interdite ?)`);
      CH.forEach((c) => { st5[c] = avant5[c] === undefined ? undefined : JSON.parse(avant5[c]); });
    }
  }

  /* 6. Le plat épinglé apparaît dans la liste de courses. */
  reset();
  if (horsCadre) {
    M.epingler("Jeu", horsCadre.nom);
    M.generer();
    const courses = M.listeCourses();
    const r = window.RECIPES.find((x) => x.nom === horsCadre.nom);
    // la liste de courses stocke les noms SANS accents : on compare sur la même base,
    // sinon « crème fraîche » ne retrouverait jamais « creme fraiche ».
    const sansAccents = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const tous = [];
    Object.values(courses).forEach((rayon) => Object.keys(rayon).forEach((n) => tous.push(sansAccents(n))));
    const manquants = (r.ingredients || [])
      .map((i) => sansAccents(i.nom))
      .filter((n) => !tous.some((t) => t.includes(n) || n.includes(t)));
    if (manquants.length) ech(`6. ingrédients du plat épinglé absents des courses : ${manquants.slice(0, 3).join(", ")}`);
    res.details.nbIngredientsEpingle = (r.ingredients || []).length;
  }

  /* 7. Désépingler rend le jour au générateur. */
  reset();
  if (horsCadre) {
    M.epingler("Jeu", horsCadre.nom);
    M.generer();
    M.desepingler("Jeu");
    const p = M.generer().plan.find((x) => x.jour === "Jeu");
    if (p && p.nom === horsCadre.nom && p.epingle) ech("7. le jour reste épinglé après désépinglage");
  }

  /* 8. Une épingle passe outre l'historique (sinon inutilisable deux fois de suite). */
  reset();
  if (horsCadre) {
    const st = M.getState();
    const avant = st.historique.slice();
    st.historique.push({ nom: horsCadre.nom, num: 99999 });
    M.epingler("Jeu", horsCadre.nom);
    const p = M.generer().plan.find((x) => x.jour === "Jeu");
    if (!p || p.nom !== horsCadre.nom) ech("8. l'épingle est bloquée par l'historique");
    st.historique = avant;
  }

  /* 9. Une épingle posée une SEMAINE PRÉCÉDENTE ne doit plus s'appliquer. */
  reset();
  if (horsCadre) {
    M.epingler("Jeu", horsCadre.nom);
    const st9 = M.getState();
    const e9 = st9.epingles["Jeu"];
    if (!e9 || typeof e9.num !== "number") ech("9. l'épingle ne mémorise pas sa semaine (champ num absent)");
    else {
      e9.num = e9.num - 1;                       // on la fait dater de la semaine dernière
      const p = M.generer().plan.find((x) => x.jour === "Jeu");
      if (p && p.epingle) ech("9. une épingle de la semaine précédente s'applique encore");
      if (st9.epingles["Jeu"]) ech("9. l'épingle périmée n'a pas été retirée de l'état");
    }
  }

  /* 10. (v43) Deux épingles adjacentes avec la MÊME protéine : AUCUN avertissement (choix du 07/10). */
  reset();
  {
    const prot = window.RECIPES[0].proteine;
    const deux = window.RECIPES.filter((r) => r.proteine === prot).slice(0, 2);
    if (deux.length < 2) res.details.note10 = "pas deux recettes de même protéine : cas 10 non testable";
    else {
      M.epingler("Jeu", deux[0].nom);
      M.epingler("Ven", deux[1].nom);
      const plan = M.generer().plan;
      const a = plan.find((x) => x.jour === "Jeu"), b = plan.find((x) => x.jour === "Ven");
      if (!a || !b) ech("10. un des deux jours épinglés est absent du menu");
      else if (a.protAlerte || b.protAlerte) ech(`10. deux "${prot}" côte à côte encore signalés : ${a.protAlerte || b.protAlerte}`);
      const tab = document.querySelector('.tab[data-view="semaine"]');
      if (tab) {
        tab.click();
        const texte = (document.querySelector("#view-semaine") || { textContent: "" }).textContent;
        if (/deux jours de suite/.test(texte)) ech("10. l'écran Semaine affiche encore « deux jours de suite »");
      }
    }
  }

  /* 11. Exclure un ingrédient APRÈS coup doit faire apparaître l'alerte sur le plat épinglé. */
  reset();
  {
    const st11 = M.getState();
    const exclusAvant = st11.exclusions.slice();
    const cible = window.RECIPES.find((r) => (r.ingredients || []).some((i) => /poulet/i.test(i.nom)));
    if (cible) {
      M.epingler("Mer", cible.nom);
      M.generer();
      const avant = M.getState().semaine.plan.find((x) => x.jour === "Mer");
      if (avant && avant.exclusAlerte) ech("11. montage : l'alerte existait déjà avant l'exclusion");
      M.exclure("poulet");                       // le geste réel de l'utilisateur
      const apres = M.getState().semaine.plan.find((x) => x.jour === "Mer");
      if (!apres || apres.nom !== cible.nom) ech("11. le plat épinglé a été remplacé alors qu'il est imposé");
      else if (!apres.exclusAlerte || !apres.exclusAlerte.length) ech("11. aucune alerte après ajout de l'exclusion sur un plat épinglé");
      st11.exclusions = exclusAvant;
    }
  }

  /* 12. Une demande faite avec un nom PARTIEL doit retrouver la recette.
        Cas réel : l'utilisateur tape « Tendron de veau », la base contient
        « Tendron de veau printanier ». Il ne peut pas deviner le titre exact. */
  reset();
  {
    // on cherche une recette dont les 2 premiers mots n'appartiennent QU'À ELLE :
    // sinon le test mesurerait une ambiguïté réelle, pas la recherche par nom partiel.
    // même critère que le code : le texte demandé apparaît N'IMPORTE OÙ dans le titre.
    const sansAcc = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const deuxMots = (r) => sansAcc(r.nom.split(" ").slice(0, 2).join(" "));
    const cible = window.RECIPES.find((r) => r.nom.split(" ").length > 2 &&
      window.RECIPES.filter((x) => sansAcc(x.nom).includes(deuxMots(r))).length === 1);
    if (!cible) res.details.note12 = "aucun nom partiel non ambigu : cas 12 non testable";
    else {
      const partiel = cible.nom.split(" ").slice(0, 2).join(" ");   // deux premiers mots
      M.epingler("Mar", partiel);
      const p = M.generer().plan.find((x) => x.jour === "Mar");
      if (!p) ech("12. le mardi a disparu du menu");
      else if (!p.epingle) ech(`12. « ${partiel} » n'a pas retrouvé « ${cible.nom} » — reste en attente à vie`);
      else if (p.nom !== cible.nom) ech(`12. « ${partiel} » a retrouvé « ${p.nom} » au lieu de « ${cible.nom} »`);
      res.details.nomPartiel = partiel + " -> " + (p && p.nom);
    }
  }

  /* 12b. Nom partiel AMBIGU (plusieurs recettes correspondent) : le comportement retenu est
         de prendre le titre le plus court, pas de laisser le jour en attente. */
  reset();
  {
    const groupes = {};
    window.RECIPES.forEach((r) => {
      const k = r.nom.split(" ").slice(0, 2).join(" ").toLowerCase();
      (groupes[k] = groupes[k] || []).push(r);
    });
    const ambigu = Object.keys(groupes).find((k) => groupes[k].length > 1);
    if (!ambigu) res.details.note12b = "aucun nom ambigu dans la base : cas 12b non testable";
    else {
      // même comparaison que l'app (trouverRecette) : sans accents ni majuscules, sur TOUTE la base.
      // « émincés de » vise aussi « Emincés de porc au vin blanc » (v44) : le groupe ci-dessus, sensible aux
      // accents, ne le contient pas.
      const sansAcc = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const attendu = window.RECIPES.filter((r) => sansAcc(r.nom).includes(sansAcc(ambigu)))
        .sort((a, b) => a.nom.length - b.nom.length)[0];
      M.epingler("Mar", ambigu);
      const p = M.generer().plan.find((x) => x.jour === "Mar");
      if (!p || !p.epingle) ech(`12b. « ${ambigu} » (ambigu) laisse le jour en attente`);
      else if (p.nom !== attendu.nom) ech(`12b. « ${ambigu} » a donné « ${p.nom} », attendu « ${attendu.nom} » (le plus court)`);
      res.details.ambigu = ambigu + " -> " + (p && p.nom);
    }
  }

  /* 13. Un nom qui ne correspond à RIEN doit rester « en attente », pas piocher au hasard. */
  reset();
  {
    M.epingler("Mar", "Zzz plat totalement inexistant");
    const p = M.generer().plan.find((x) => x.jour === "Mar");
    if (p && p.epingle) ech(`13. un nom inexistant a été résolu vers « ${p.nom} »`);
  }

  reset();
  Object.keys(sauvegarde).forEach((j) => M.epingler(j, sauvegarde[j].nom || sauvegarde[j]));
  res.ok = res.echecs.length === 0;
  res.echecs = res.echecs.slice(0, 15);
  return res;
})();
