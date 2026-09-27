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

  /* 5. L'anti-répétition par protéine tient toujours sur les jours NON épinglés. */
  reset();
  if (horsCadre) {
    M.epingler("Jeu", horsCadre.nom);
    for (let k = 0; k < 10; k++) {
      const plan = M.generer().plan;
      for (let i = 1; i < plan.length; i++) {
        const a = plan[i - 1], b = plan[i];
        if (a.epingle || b.epingle) continue;      // deux épingles adjacentes = choix assumé
        if (a.proteine === b.proteine) ech(`5. ${a.jour}+${b.jour} tous deux "${a.proteine}" (jours libres)`);
      }
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

  reset();
  Object.keys(sauvegarde).forEach((j) => M.epingler(j, sauvegarde[j].nom || sauvegarde[j]));
  res.ok = res.echecs.length === 0;
  res.echecs = res.echecs.slice(0, 15);
  return res;
})();
