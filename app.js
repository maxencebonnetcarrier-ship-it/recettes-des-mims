/* Recettes des Mim's — générateur de menu, liste de courses, exclusions */
(function () {
  "use strict";

  // Numéro de version de l'app. À INCRÉMENTER à chaque déploiement : c'est ce que le bouton
  // « Chercher une mise à jour » compare au fichier servi. Sans ça, une amélioration qui ne
  // touche pas la base de recettes passait inaperçue et l'app restait sur l'ancien code.
  const VERSION_APP = 29;

  const STORE = "mims_state_v2";
  const PARTS_CIBLE = 4; // 3 au soir + 1 midi
  const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  // styles de plat sélectionnables par jour
  const STYLES = [
    { id: "volaille", label: "🍗 Volaille", cats: ["Volaille"], maxMin: null },
    { id: "porc", label: "🥓 Porc", cats: ["Porc"], maxMin: null },
    { id: "poisson", label: "🐟 Poisson", cats: ["Poisson"], maxMin: null },
    { id: "legumineuses", label: "🫘 Légumineuses / végé", cats: ["Légumineuses"], maxMin: null },
    { id: "express", label: "🚀 Express (≤15 min)", cats: ["Volaille", "Porc", "Poisson", "Légumineuses", "Rapide (sport)"], maxMin: 15 },
    { id: "rapide", label: "⚡ Rapide (≤30 min)", cats: ["Volaille", "Porc", "Poisson", "Légumineuses", "Rapide (sport)"], maxMin: 30 },
    { id: "sport", label: "💪 Rapide sport (protéiné, ≤30 min)", cats: ["Volaille", "Porc", "Poisson", "Rapide (sport)"], maxMin: 30, proteine: true },
    { id: "mijote", label: "🍲 Mijoté (j'ai le temps)", cats: ["Mijoté"], maxMin: null },
    { id: "roti", label: "🔥 Rôti / four", cats: ["Rôti"], maxMin: null },
    { id: "libre", label: "🎲 Peu importe", cats: ["Volaille", "Porc", "Poisson", "Légumineuses", "Rapide (sport)", "Mijoté", "Rôti"], maxMin: null },
  ];
  const STYLE = (id) => STYLES.find((s) => s.id === id) || STYLES[STYLES.length - 1];
  const CADRE_JOURS_DEFAUT = ["volaille", "legumineuses", "porc", "poisson", "sport", "mijote", "roti"];
  // protéines "riches" retenues par le style sport
  const PROT_SPORT = new Set(["bœuf", "boeuf", "veau", "porc", "agneau", "volaille", "poisson"]);
  const ORDRE_RAYONS = ["Boucherie", "Poissonnerie", "Fruits & légumes", "Crèmerie", "Boulangerie", "Épicerie"];

  // ---------- utils ----------
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = (s) => (s || "").toString().replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fmtDuree(m) {
    if (!m) return "—";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r}` : `${h} h`;
  }
  function tempsRecette(r) {
    const total = r.total_min || ((r.prep_min || 0) + (r.cuisson_min || 0));
    let d = `⏱️ ${fmtDuree(total)}`;
    if (r.prep_min && r.cuisson_min) d += ` (prépa ${fmtDuree(r.prep_min)} + cuisson ${fmtDuree(r.cuisson_min)})`;
    return d;
  }
  function saisonActuelle() {
    const m = new Date().getMonth();
    if (m >= 2 && m <= 4) return "printemps";
    if (m >= 5 && m <= 7) return "ete";
    if (m >= 8 && m <= 10) return "automne";
    return "hiver";
  }
  function deSaison(r) {
    if (state.saisonOff) return true;          // filtre de saison coupé : tout est permis
    const s = norm(r.saison);
    return !s || s.includes("toute") || s.includes(saisonActuelle());
  }
  const LIBELLE_SAISON = { printemps: "printemps", ete: "été", automne: "automne", hiver: "hiver" };

  /* ---------- semaines ----------
     Une semaine se repère par son ANNÉE ISO et son numéro. Le numéro seul revient chaque année,
     et il ne suit pas l'année civile : la semaine 53 de 2026 va du 28 déc. 2026 au 3 janv. 2027.
     Avant la v28, seul le numéro était enregistré : au Nouvel An les dates affichées sautaient
     d'un an, les plats de fin décembre revenaient dès janvier, et une semaine 40 héritait du
     « Fait » de la semaine 40 de l'année précédente. */
  const JOUR_MS = 86400000, SEMAINE_MS = 7 * JOUR_MS;
  // l'année ISO d'une semaine est celle de son JEUDI
  function semaineDuJeudi(jeudi) {
    const an = jeudi.getUTCFullYear();
    return { an, num: Math.ceil((((jeudi - Date.UTC(an, 0, 1)) / JOUR_MS) + 1) / 7) };
  }
  function semaineDe(d) {
    const jeudi = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    jeudi.setUTCDate(jeudi.getUTCDate() + 4 - (jeudi.getUTCDay() || 7));
    return semaineDuJeudi(jeudi);
  }
  const semaineCourante = () => semaineDe(new Date());
  // Lundi de la semaine ISO donnée
  function lundiSemaineISO(num, annee) {
    const jan4 = new Date(Date.UTC(annee, 0, 4));
    const j = jan4.getUTCDay() || 7;
    const lundiS1 = new Date(jan4); lundiS1.setUTCDate(jan4.getUTCDate() - j + 1);
    const lundi = new Date(lundiS1); lundi.setUTCDate(lundiS1.getUTCDate() + (num - 1) * 7);
    return lundi;
  }
  // Rang absolu d'une semaine (celle du lundi 5 janvier 1970 = 0) : l'écart entre deux rangs
  // compte les semaines par-dessus le Nouvel An, ce que les numéros seuls ne savent pas faire.
  const rangSemaine = (an, num) => Math.round((lundiSemaineISO(num, an) - Date.UTC(1970, 0, 5)) / SEMAINE_MS);
  const semaineDuRang = (rang) => semaineDuJeudi(new Date(Date.UTC(1970, 0, 8) + rang * SEMAINE_MS));
  const rangCourant = () => { const s = semaineCourante(); return rangSemaine(s.an, s.num); };
  /** Rang d'une semaine ENREGISTRÉE (menu, historique, épingle). Ce qu'a écrit une version
      antérieure à la v28 — ou l'autre téléphone pas encore à jour — n'a que le numéro : on
      prend alors sa plus récente occurrence qui ne soit pas dans le futur. */
  function rangDe(o) {
    if (!o || typeof o.num !== "number") return null;
    if (typeof o.an === "number") return rangSemaine(o.an, o.num);
    const an = semaineCourante().an;
    const r = rangSemaine(an, o.num);
    return r <= rangCourant() ? r : rangSemaine(an - 1, o.num);
  }
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function plageSemaine(an, num) {
    const lun = lundiSemaineISO(num, an);
    const dim = new Date(lun); dim.setUTCDate(lun.getUTCDate() + 6);
    const mSame = lun.getUTCMonth() === dim.getUTCMonth();
    return mSame
      ? `${lun.getUTCDate()}–${dim.getUTCDate()} ${MOIS[dim.getUTCMonth()]}`
      : `${lun.getUTCDate()} ${MOIS[lun.getUTCMonth()]} – ${dim.getUTCDate()} ${MOIS[dim.getUTCMonth()]}`;
  }
  // cadre actif construit depuis le style choisi pour chaque jour
  function getCadre() {
    return (state.cadreJours || CADRE_JOURS_DEFAUT).map((id, i) => {
      const st = STYLE(id);
      return { jour: JOURS[i], cats: st.cats, maxMin: st.maxMin, proteine: !!st.proteine, note: st.label };
    });
  }

  // ---------- state ----------
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  // save(champ) : persiste et, si un hub partagé est configuré, signale le champ modifié
  function save(champ, idCase, decochee) {
    localStorage.setItem(STORE, JSON.stringify(state));
    if (window.__sync) window.__sync.signalerChangement(champ, idCase, decochee);
  }
  let state = load();
  if (!state.semaine) state.semaine = null;
  if (!state.historique) state.historique = [];
  if (!state.exclusions) state.exclusions = EXCLUS_DEFAUT.slice();
  if (!state.promos) state.promos = [];        // ingrédients en promo cette semaine (priorité)
  if (!state.cadreJours) state.cadreJours = CADRE_JOURS_DEFAUT.slice(); // style choisi pour chaque jour
  if (!state.favoris) state.favoris = [];       // noms de recettes aimées (priorité à la génération)
  if (!state.notes) state.notes = {};           // note /5 (demi-étoiles) par recette → priorité
  if (!state.envies) state.envies = [];         // plats que l'utilisateur veut voir scrapés plus tard
  if (!state.coursesCochees) state.coursesCochees = {};
  if (!state.epingles) state.epingles = {};     // jour → recette imposée pour la semaine en cours
  if (state.saisonOff === undefined) state.saisonOff = false;  // filtre « de saison » actif par défaut
  if (!Array.isArray(state.servis)) state.servis = [];  // menus des semaines passées : { an, num, noms }

  const estFavori = (nom) => state.favoris.includes(nom);
  const ACC = () => window.ACCOMPAGNEMENTS || [];
  // accompagnement qui VARIE : choisi au hasard parmi ceux adaptés à la catégorie du plat
  function pickSide(r, idx, plan) {
    const compat = ACC().filter((a) => (a.suits || []).includes(r.cat));
    const pool = compat.length ? compat : ACC();
    if (!pool.length) return null;
    // évite de répéter le même accompagnement qu'un autre jour déjà servi
    const dejaVus = new Set((plan || []).filter(Boolean).map((p) => p && p.side && p.side.nom));
    const libres = pool.filter((a) => !dejaVus.has(a.nom));
    const choix = (libres.length ? libres : pool);
    const a = choix[Math.floor(Math.random() * choix.length)];
    return { nom: a.nom, url: a.url, source: a.source };
  }

  const enPromo = (r) => state.promos.length &&
    r.ingredients.some((i) => state.promos.some((p) => norm(i.nom).includes(norm(p))));
  // saison spécifique (pas "toute l'année") correspondant au mois courant
  function pleineSaison(r) {
    const s = norm(r.saison);
    return !!s && !s.includes("toute") && s.includes(saisonActuelle());
  }

  function ajouterPromo(mot) {
    const m = (mot || "").trim();
    if (!m || state.promos.some((e) => norm(e) === norm(m))) return false;
    state.promos.push(m); save("promos"); return true;
  }

  const estExclu = (r) => r.ingredients.some((i) => state.exclusions.some((ex) => norm(i.nom).includes(norm(ex))));

  function ajouterExclusion(mot) {
    const m = (mot || "").trim();
    if (!m) return false;
    if (state.exclusions.some((e) => norm(e) === norm(m))) return false;
    state.exclusions.push(m);
    save("exclusions");
    return true;
  }

  // ---------- générateur ----------
  // plats à écarter : ceux des 3 semaines qui finissent à la semaine de rang « rangAvant ».
  // Deux sources : les menus SERVIS (notés d'office au changement de semaine, voir
  // noterMenuServi) et l'historique (« Marquer fait »).
  function recentes(rangAvant) {
    const set = new Set();
    const dansFenetre = (o) => { const r = rangDe(o); return r !== null && rangAvant - r >= 0 && rangAvant - r < 3; };
    state.historique.forEach((h) => { if (dansFenetre(h)) set.add(h.nom); });
    (Array.isArray(state.servis) ? state.servis : []).forEach((s) => {
      if (dansFenetre(s) && Array.isArray(s.noms)) s.noms.forEach((n) => set.add(n));
    });
    return set;
  }

  /** Au CHANGEMENT de semaine, le dernier menu affiché compte d'office comme servi. Avant la
      v29, la règle « pas deux fois en 3 semaines » ne voyait que les plats marqués « Fait » :
      sans ce clic, environ 3 plats sur 7 revenaient dès la semaine suivante (mesuré : 103
      reprises sur 30 menus). Un menu remplacé en cours de semaine (« Générer », « Changer »)
      ne compte pas. L'historique n'est PAS touché : il reste la liste de ce qui a vraiment été
      cuisiné, avec les notes. Le champ `servis` est partagé par la synchro (sync.js). */
  function noterMenuServi(rang) {
    const s = state.semaine;
    const r = rangDe(s);
    if (r === null || r >= rang || !s.plan || !s.plan.length) return;
    // on ne garde que ce que la règle regarde encore : les 3 semaines précédentes
    const garde = (Array.isArray(state.servis) ? state.servis : []).filter((x) => {
      const rx = rangDe(x);
      return rx !== null && rx !== r && rang - rx <= 3;
    });
    if (rang - r <= 3) {
      const sem = semaineDuRang(r);
      garde.push({ an: sem.an, num: sem.num, noms: s.plan.map((p) => p && p.nom).filter(Boolean) });
    }
    state.servis = garde;
    save("servis");
  }

  function candidats(cadre, interdites) {
    return RECIPES.filter((r) =>
      cadre.cats.includes(r.cat) &&
      (!cadre.maxMin || (r.total_min || 0) <= cadre.maxMin) &&
      (!cadre.proteine || PROT_SPORT.has(norm(r.proteine))) &&
      deSaison(r) && !estExclu(r) && !interdites.has(r.nom)
    );
  }

  function saveurDe(r) {
    for (const sv of SAVEURS) if (r.ingredients.some((i) => norm(i.nom).includes(norm(sv)))) return sv;
    return null;
  }

  /* Choisit une recette en évitant : la protéine des jours adjacents (règle dure),
     la même protéine plus de 2x dans la semaine, et une saveur déjà utilisée. */
  function choisir(cadre, interdites, plan, idx) {
    const protPrec = idx > 0 && plan[idx - 1] ? plan[idx - 1].proteine : null;
    const protSuiv = plan[idx + 1] ? plan[idx + 1].proteine : null;
    const compteProt = {};
    plan.forEach((p, i) => { if (p && i !== idx) compteProt[p.proteine] = (compteProt[p.proteine] || 0) + 1; });
    const saveursVues = new Set(plan.filter((p, i) => p && i !== idx).map((p) => p.saveur).filter(Boolean));

    let pool = candidats(cadre, interdites);
    if (!pool.length) {
      // Repli : on relâche la saison et l'anti-répétition, JAMAIS le temps ni la protéine —
      // sinon un jour « Express ≤15 min » pourrait servir un mijoté de 3 h.
      pool = RECIPES.filter((r) =>
        cadre.cats.includes(r.cat) && !estExclu(r) &&
        (!cadre.maxMin || (r.total_min || 0) <= cadre.maxMin) &&
        (!cadre.proteine || PROT_SPORT.has(norm(r.proteine)))
      );
    }
    if (!pool.length) return null;

    // CONTRAINTES DURES (adjacence protéine, quota hebdo) : on relâche par paliers si besoin
    const contraintes = [
      (r) => r.proteine !== protPrec && r.proteine !== protSuiv && (compteProt[r.proteine] || 0) < 2,
      (r) => r.proteine !== protPrec && r.proteine !== protSuiv,
      (r) => r.proteine !== protPrec,
      () => true,
    ];
    let eligibles = pool;
    for (const c of contraintes) { const f = pool.filter(c); if (f.length) { eligibles = f; break; } }

    // PRÉFÉRENCES (n'excluent jamais, elles classent) : promo dominante > saison > saveur neuve > aléa.
    // Score calculé UNE fois par recette (sinon Math.random() dans le comparateur = tri instable).
    const scored = eligibles.map((r) => ({
      r,
      s: (enPromo(r) ? 100 : 0) + (estFavori(r.nom) ? 30 : 0) + (state.notes[r.nom] || 0) * 4 + (pleineSaison(r) ? 10 : 0) + (!saveursVues.has(saveurDe(r)) ? 5 : 0) + Math.random(),
    }));
    scored.sort((a, b) => b.s - a.s);
    return scored[0].r;
  }

  /** Va chercher une nouvelle version sans rien effacer des données de l'utilisateur.
      On compare le contenu réellement servi à celui en mémoire : si la base de recettes a
      changé, on recharge. Utile quand une recette demandée vient d'être ajoutée et que
      l'app, installée sur l'écran d'accueil, tourne encore sur l'ancienne version. */
  async function forcerMiseAJour() {
    try {
      const t = Date.now();
      // 1a) le CODE a-t-il changé ? On lit le numéro de version du fichier servi. Sans ce
      //     contrôle, une amélioration qui ne touche pas les recettes restait invisible.
      const codeServi = await fetch("app.js?maj=" + t, { cache: "reload" }).then((r) => r.text());
      const m = codeServi.match(/VERSION_APP\s*=\s*(\d+)/);
      const versionServie = m ? parseInt(m[1], 10) : 0;
      const codeNeuf = versionServie > VERSION_APP;

      // 1b) la BASE de recettes a-t-elle changé ? On la lit vraiment (compter les « nom »
      //     du texte compterait aussi les ingrédients).
      const texte = await fetch("data.js?maj=" + t, { cache: "reload" }).then((r) => r.text());
      const bac = {};
      new Function("window", texte)(bac);
      const distantes = bac.RECIPES || [];
      const connues = new Set(RECIPES.map((r) => r.nom));
      const baseNeuve = distantes.length > 0 &&
        (distantes.length !== RECIPES.length || distantes.some((r) => !connues.has(r.nom)));
      const changement = codeNeuf || baseNeuve;

      // 2) on demande aussi au mode hors-ligne de se mettre à jour
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
      if (!changement) return false;
      // 3) on vide les caches (JAMAIS le localStorage : les données restent)
      if (window.caches) { for (const n of await caches.keys()) await caches.delete(n); }
      location.reload();
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- recettes épinglées (imposées sur un jour précis) ---------- */

  const epinglesDe = () => state.epingles || (state.epingles = {});
  // une entrée peut être une pierre tombale { nom: null } : un désépinglage doit se
  // PROPAGER à l'autre téléphone, ce qu'une simple suppression ne ferait pas.
  const nomEpingle = (jour) => {
    const e = epinglesDe()[jour];
    if (!e) return null;
    return typeof e === "string" ? e : (e.nom || null);
  };

  /** Impose une recette sur un jour. Une seule par jour : la nouvelle remplace l'ancienne.
      On mémorise la SEMAINE de pose : une épingle ne vaut que pour la semaine en cours. */
  function epingler(jour, nom) {
    if (!jour || !nom) return false;
    const sem = semaineCourante();
    epinglesDe()[jour] = { nom: nom, t: Date.now(), num: sem.num, an: sem.an };
    save("epingles");
    return true;
  }

  /** Retire les épingles posées une semaine précédente. Sans ça, un plat imposé une fois
      le resterait indéfiniment — l'inverse de ce qui est promis à l'utilisateur. */
  function purgerEpingles(rang) {
    const e = epinglesDe();
    let change = false;
    Object.keys(e).forEach((j) => {
      if (rangDe(e[j]) !== rang) { delete e[j]; change = true; }
    });
    if (change) save("epingles");
    return change;
  }

  function desepingler(jour) {
    if (!nomEpingle(jour)) return false;
    // pierre tombale plutôt que suppression : sinon l'autre téléphone, qui a encore
    // l'épingle, la renverrait à la prochaine synchro et elle réapparaîtrait toute seule.
    const sem = semaineCourante();
    epinglesDe()[jour] = { nom: null, t: Date.now(), num: sem.num, an: sem.an };
    save("epingles");
    return true;
  }

  /** Construit l'entrée de menu d'un jour. Un plat épinglé prime sur le cadre du jour et
      sur les exclusions, mais ne les CACHE jamais : il porte ses avertissements. */
  function entreePlan(jour, r, idx, plan, epingle) {
    const e = { jour: jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r), side: pickSide(r, idx, plan) };
    if (epingle) {
      e.epingle = true;
      const c = getCadre().find((x) => x.jour === jour);
      if (c && !c.cats.includes(r.cat)) e.horsCadre = c.cats.join(" / ");
      const exclus = ingredientsExclus(r);
      if (exclus.length) e.exclusAlerte = exclus;
    }
    return e;
  }

  const ingredientsExclus = (r) => (r.ingredients || [])
    .filter((i) => state.exclusions.some((ex) => norm(i.nom).includes(norm(ex))))
    .map((i) => i.nom);

  /** Signale deux jours VOISINS qui servent la même protéine. Le cas ne peut venir que
      d'épingles (le générateur l'interdit), mais il ne doit pas passer sous silence. */
  function marquerProteinesVoisines(plan) {
    plan.forEach((p, i) => { if (p) delete p.protAlerte; });
    for (let i = 1; i < plan.length; i++) {
      const a = plan[i - 1], b = plan[i];
      if (!a || !b || a.proteine !== b.proteine) continue;
      const libelle = `même protéine que ${a.jour === b.jour ? "le jour voisin" : ""}`.trim();
      a.protAlerte = `${a.proteine} aussi ${b.jour.toLowerCase()}`;
      b.protAlerte = `${b.proteine} aussi ${a.jour.toLowerCase()}`;
    }
    return plan;
  }

  /** Recalcule les avertissements des jours épinglés sans retoucher au menu : appelé quand
      les exclusions changent APRÈS coup, sinon un plat imposé garderait une alerte périmée
      (ou n'en afficherait aucune alors qu'il contient un ingrédient fraîchement exclu). */
  /** Après une nouvelle exclusion : remplace les plats NON épinglés devenus invalides, et
      met à jour l'avertissement des plats épinglés (qui, eux, restent — choix assumé).
      Renvoie le nombre de plats réellement remplacés, pour ne pas annoncer un remplacement
      qui n'a pas eu lieu. */
  function appliquerExclusion() {
    if (!state.semaine) return 0;
    let n = 0;
    state.semaine.plan.slice().forEach((p) => {
      const r = getR(p.nom);
      if (!r || !estExclu(r)) return;
      if (p.epingle) return;                    // imposé : on le garde et on l'annote
      if (regenJour(p.jour) !== "epingle") n++;
    });
    rafraichirAlertes();                        // recalcule aussi les jours épinglés
    return n;
  }

  function rafraichirAlertes() {
    if (!state.semaine) return;
    state.semaine.plan.forEach((p) => {
      if (!p.epingle) return;
      const r = getR(p.nom);
      if (!r) return;
      const exclus = ingredientsExclus(r);
      if (exclus.length) p.exclusAlerte = exclus; else delete p.exclusAlerte;
    });
    marquerProteinesVoisines(state.semaine.plan);
    save("semaine");
  }

  function generer() {
    const sem = semaineCourante();
    const rang = rangSemaine(sem.an, sem.num);
    // le menu d'une semaine TERMINÉE est noté avant d'être remplacé
    noterMenuServi(rang);
    const cadre = getCadre();
    const interdites = recentes(rang - 1);
    const plan = new Array(cadre.length).fill(null);

    // 0) une épingle ne vaut QUE pour la semaine où elle a été posée.
    purgerEpingles(rang);

    // 1) les jours ÉPINGLÉS sont posés AVANT tout le reste : ils priment sur le cadre du
    //    jour, sur les exclusions et sur l'historique — c'est un choix délibéré assumé.
    //    Un nom encore absent de la base (envie en attente d'ajout) laisse le jour libre.
    cadre.forEach((c, i) => {
      const demande = nomEpingle(c.jour);
      const r = trouverRecette(demande);
      if (!r) return;
      // la recette demandée vient d'être trouvée : on fige son vrai titre dans l'épingle,
      // pour que l'affichage et les jours suivants ne dépendent plus du texte approximatif.
      if (r.nom !== demande) { epinglesDe()[c.jour].nom = r.nom; save("epingles"); }
      plan[i] = entreePlan(c.jour, r, i, plan, true);
    });

    // 2) les autres jours se génèrent autour et VOIENT les protéines déjà posées : un plat
    //    imposé n'échappe donc pas à l'anti-répétition, il la contraint.
    //    Jours à protéine la plus FORCÉE d'abord (ex : Poisson = 1 seule protéine possible),
    //    pour que les jours souples (Express, Mijoté) s'adaptent ensuite et évitent l'adjacence.
    const ordre = cadre.map((c, i) => {
      const cand = candidats(c, interdites);
      return { i, prot: new Set(cand.map((r) => r.proteine)).size || 99, n: cand.length };
    }).filter((o) => !plan[o.i])
      .sort((a, b) => a.prot - b.prot || a.n - b.n).map((o) => o.i);
    for (const i of ordre) {
      const r = choisir(cadre[i], interdites, plan, i);
      if (r) plan[i] = entreePlan(cadre[i].jour, r, i, plan, false);
    }
    state.semaine = { num: sem.num, an: sem.an, plan: marquerProteinesVoisines(plan.filter(Boolean)) };
    save("semaine");
    return state.semaine;
  }

  function regenJour(jour) {
    const s = state.semaine;
    const idx = s.plan.findIndex((p) => p.jour === jour);
    if (idx < 0) return;
    // un jour épinglé est un choix explicite : on ne le tire pas au sort dans son dos.
    // Il faut d'abord retirer l'épingle (bouton « Ne plus imposer »).
    if (nomEpingle(jour)) return "epingle";
    const cadre = getCadre().find((c) => c.jour === jour);
    const interdites = recentes(rangDe(s) - 1);
    s.plan.forEach((p) => interdites.add(p.nom));   // exclut TOUTE la semaine, dont le plat actuel → force un vrai changement
    const copie = s.plan.slice(); copie[idx] = null;
    let r = choisir(cadre, interdites, copie, idx);
    // si un seul candidat existe (plat actuel ré-exclu), on relâche pour ne pas planter
    if (!r) { interdites.delete(s.plan[idx].nom); r = choisir(cadre, interdites, copie, idx); }
    if (r) { s.plan[idx] = { jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r), side: pickSide(r, idx, copie) }; save("semaine"); }
  }

  const getR = (nom) => RECIPES.find((r) => r.nom === nom);

  /** Retrouve la recette demandée pour un jour. L'utilisateur écrit ce qu'il a en tête
      (« tendron de veau ») alors que la base porte un titre complet (« Tendron de veau
      printanier ») : exiger l'égalité stricte laissait le jour « en attente » pour toujours.
      On accepte donc un nom PARTIEL, mais jamais au hasard : il faut que tous les mots
      demandés soient présents dans le titre, et une seule recette doit correspondre. */
  function trouverRecette(nom) {
    if (!nom) return null;
    const exact = getR(nom);
    if (exact) return exact;
    const d = norm(nom).trim();
    if (d.length < 3) return null;
    // 1) le texte demandé tel quel dans le titre : « tendron de veau » → « Tendron de veau
    //    printanier ». C'est le cas courant et le plus sûr.
    let candidats = RECIPES.filter((r) => norm(r.nom).includes(d));
    // 2) à défaut seulement, tous les mots présents mais dans le désordre.
    if (!candidats.length) {
      const mots = d.split(/\s+/).filter((m) => m.length > 2);
      if (!mots.length) return null;
      candidats = RECIPES.filter((r) => { const t = norm(r.nom); return mots.every((m) => t.includes(m)); });
    }
    if (candidats.length === 1) return candidats[0];
    if (candidats.length > 1) {
      // plusieurs titres possibles : on prend le plus court, c'est le plus proche de la demande
      return candidats.slice().sort((a, b) => a.nom.length - b.nom.length)[0];
    }
    return null;
  }

  // ---------- liste de courses ----------
  function listeCourses() {
    const acc = {};
    if (!state.semaine) return acc;
    const ajoute = (source, ingredients, parts) => {
      const facteur = PARTS_CIBLE / (parts || PARTS_CIBLE);
      (ingredients || []).forEach((ing) => {
        const rayon = ing.rayon || "Épicerie";
        const key = norm(ing.nom);
        acc[rayon] = acc[rayon] || {};
        const e = acc[rayon][key] = acc[rayon][key] || { nom: ing.nom, unites: {}, plats: [] };
        if (ing.qte) {
          const u = ing.unite || "";
          e.unites[u] = Math.round(((e.unites[u] || 0) + ing.qte * facteur) * 10) / 10;
        }
        if (!e.plats.includes(source)) e.plats.push(source);
      });
    };
    state.semaine.plan.forEach((p) => {
      const r = getR(p.nom);
      if (r) ajoute(r.nom, r.ingredients, r.parts_origine);
      // ingrédients de l'accompagnement du jour
      if (p.side) {
        const a = ACC().find((x) => x.nom === p.side.nom);
        if (a) ajoute(a.nom, a.ingredients, a.parts_origine);
      }
    });
    return acc;
  }
  function fmtQte(unites) {
    const parts = Object.entries(unites).filter(([u, q]) => q > 0).map(([u, q]) => `${q}${u ? " " + u : ""}`);
    return parts.length ? parts.join(" + ") : "qs"; // qs = quantité suffisante
  }

  // ---------- rendu ----------
  const badge = (t, c) => `<span class="badge ${c || ""}">${esc(t)}</span>`;

  // entrée d'historique du jour « jour » de la semaine « semaine » (même année ET même numéro)
  const entreeHistorique = (semaine, jour) => {
    const rang = rangDe(semaine);
    return state.historique.find((h) => h.jour === jour && rangDe(h) === rang);
  };
  const estFait = (semaine, jour) => { const h = entreeHistorique(semaine, jour); return !!(h && h.fait); };

  // widget de note en DEMI-étoiles (0,5 à 5)
  function etoiles(nom) {
    const note = state.notes[nom] || 0;
    let h = `<span class="stars">`;
    for (let n = 1; n <= 5; n++) {
      const cls = note >= n ? "full" : (note >= n - 0.5 ? "half" : "empty");
      h += `<span class="star ${cls}">★<span class="hz l" data-act="note" data-nom="${esc(nom)}" data-val="${n - 0.5}"></span><span class="hz r" data-act="note" data-nom="${esc(nom)}" data-val="${n}"></span></span>`;
    }
    h += `</span>`;
    // fix-ok: ajout UI demandé par l'utilisateur — bouton d'effacement explicite, le re-clic
    // sur la demi-étoile étant trop difficile à viser au doigt.
    h += note
      ? ` <span class="note-val">${note}/5</span>
         <button class="btn-clr" data-act="note" data-nom="${esc(nom)}" data-val="0">✕ Effacer</button>`
      : ` <span class="note-val note-vide">pas encore notée</span>`;
    return h;
  }

  // bulles d'une recette : modes de cuisson (dont air fryer)
  function bullesRecette(r) {
    let out = (r.cuissons || []).map((c) => badge("🔥 " + c, "cuisson")).join(" ");
    if (r.air_fryer) out += " " + badge("🍟 air fryer", "airfryer");
    return out;
  }

  function blocRecette(r) {
    const facteur = PARTS_CIBLE / (r.parts_origine || PARTS_CIBLE);
    const ingr = r.ingredients.map((i) => {
      const q = i.qte ? `${Math.round(i.qte * facteur * 10) / 10}${i.unite ? " " + i.unite : ""} ` : "";
      return `<li><span class="iq">${esc(q)}</span>${esc(i.nom)}
        <button class="x" data-act="exclure" data-ing="${esc(i.nom)}" title="Je n'aime pas — exclure">✕</button></li>`;
    }).join("");
    const etapes = (r.etapes || []).map((e) => `<li>${esc(e)}</li>`).join("");
    return `<details class="detail">
      <summary>Ingrédients, étapes &amp; source</summary>
      <div class="det-body">
        <p class="det-t">Pour ${PARTS_CIBLE} parts</p>
        <ul class="ing-list">${ingr}</ul>
        ${etapes ? `<p class="det-t">Préparation</p><ol class="step-list">${etapes}</ol>` : ""}
        ${r.url ? `<a class="src" href="${esc(r.url)}" target="_blank" rel="noopener">Voir sur ${esc(r.source || "le site")} ↗</a>` : ""}
      </div>
    </details>`;
  }

  function renderSemaine() {
    const el = document.getElementById("view-semaine");
    // Une nouvelle semaine = un nouveau menu. Sans ce contrôle l'app restait affichée sur
    // la semaine précédente indéfiniment (et les épingles périmées n'étaient jamais purgées,
    // puisque c'est generer() qui s'en charge).
    if (!state.semaine || !state.semaine.plan.length || rangDe(state.semaine) !== rangCourant()) generer();
    const s = state.semaine;
    const sem = semaineDuRang(rangDe(s));
    let html = `<div class="week-head"><strong>Semaine ${sem.num}</strong> · ${esc(plageSemaine(sem.an, sem.num))} · ${PARTS_CIBLE} parts/plat</div>
      <button id="btn-gen" class="primary">🔄 Générer un nouveau menu</button><div class="cards">`;
    // on parcourt le CADRE (et non le plan) pour rendre visible un jour sans plat possible
    getCadre().forEach((cadre) => {
      const p = s.plan.find((x) => x.jour === cadre.jour);
      const r = p && getR(p.nom);
      const attendu = nomEpingle(cadre.jour);
      if (!r && attendu) {
        // une recette a été demandée pour ce jour mais n'est pas encore dans la base
        html += `<div class="card day vide">
          <div class="card-top"><span class="jour">${esc(cadre.jour)}</span><span class="cat">en attente</span></div>
          <div class="plat">📌 ${esc(attendu)}</div>
          <div class="epingle-info">Tu as demandé ce plat pour ce jour. Il apparaîtra ici dès qu'il sera ajouté à ta base.</div>
          <div class="actions"><button data-act="desepingler" data-jour="${esc(cadre.jour)}">Annuler la demande</button></div>
        </div>`;
        return;
      }
      if (!r) {
        html += `<div class="card day vide">
          <div class="card-top"><span class="jour">${esc(cadre.jour)}</span><span class="cat">${esc(cadre.note)}</span></div>
          <div class="plat">Aucun plat ne correspond</div>
          <div class="constraint">Aucune recette de la base ne tient ce critère (temps trop court, ou tout est exclu). Choisis un autre style pour ce jour dans Réglages, ou ajoute une envie pour enrichir la base.</div>
        </div>`;
        return;
      }
      html += `<div class="card day">
        <div class="card-top"><span class="jour">${esc(p.jour)}</span><span class="cat">${esc(r.cat)}</span>
          <button class="fav ${estFavori(r.nom) ? "on" : ""}" data-act="fav" data-nom="${esc(r.nom)}" title="J'aime — à reproposer">${estFavori(r.nom) ? "❤️" : "🤍"}</button>
        </div>
        <div class="plat">${p.epingle ? "📌 " : ""}${esc(r.nom)}</div>
        ${(!p.epingle && attendu) ? `<div class="epingle-info">📌 Tu as demandé <strong>${esc(attendu)}</strong> pour ce jour.
          En attendant qu'il soit ajouté à ta base, voici une proposition.
          <br><button class="linkbtn" data-act="desepingler" data-jour="${esc(p.jour)}">Annuler la demande</button></div>` : ""}
        ${p.epingle ? `<div class="epingle-info">Plat imposé par toi pour ce jour.
          ${p.horsCadre ? `<br>⚠️ Hors du style prévu (${esc(p.horsCadre)}).` : ""}
          ${p.exclusAlerte ? `<br>⚠️ Contient : ${esc(p.exclusAlerte.join(", "))} — normalement exclu.` : ""}
          ${p.protAlerte ? `<br>⚠️ ${esc(p.protAlerte)} — deux jours de suite.` : ""}</div>`
          : (p.protAlerte ? `<div class="epingle-info">⚠️ ${esc(p.protAlerte)} — deux jours de suite.</div>` : "")}
        <div class="temps">${tempsRecette(r)}</div>
        ${r.url ? `<div class="src-carte"><a href="${esc(r.url)}" target="_blank" rel="noopener">📖 Voir la recette sur ${esc(r.source || "le site")} ↗</a></div>` : ""}
        <div class="meta">${bullesRecette(r)}</div>
        ${p.side ? `<div class="side">🍽️ avec <a href="${esc(p.side.url)}" target="_blank" rel="noopener">${esc(p.side.nom)}</a>
          <button class="btn-side" data-act="regen-side" data-jour="${esc(p.jour)}" title="Changer l'accompagnement">↻</button></div>` : ""}
        ${r.bonus ? `<div class="bonus">✨ Le p'tit plus : ${esc(r.bonus)}</div>` : ""}
        <div class="constraint">${esc(cadre ? cadre.note : "")}</div>
        ${blocRecette(r)}
        <div class="note-row">Ta note : ${etoiles(r.nom)}</div>
        <div class="actions">
          ${p.epingle
            ? `<button data-act="desepingler" data-jour="${esc(p.jour)}">📌 Ne plus imposer</button>`
            : `<button data-act="regen-day" data-jour="${esc(p.jour)}">↻ Changer</button>`}
          <button class="fait ${estFait(s, p.jour) ? "done" : ""}" data-act="fait" data-jour="${esc(p.jour)}" data-nom="${esc(r.nom)}">${estFait(s, p.jour) ? "✓ Fait" : "Marquer fait"}</button>
        </div>
      </div>`;
    });
    el.innerHTML = html + `</div>`;
  }

  // identifiant de la case à cocher d'un article (et d'un « p'tit plus ») : l'écran ET la liste
  // copiée le lisent, ils doivent donc le calculer de la même façon
  const idArticle = (rayon, nom) => norm(rayon + "|" + nom);
  const idPlus = (plat) => norm("plus|" + plat);
  const estCoche = (id) => !!state.coursesCochees[id];

  function renderCourses() {
    const el = document.getElementById("view-courses");
    const acc = listeCourses();
    const rayons = ORDRE_RAYONS.filter((r) => acc[r]).concat(Object.keys(acc).filter((r) => !ORDRE_RAYONS.includes(r)));
    if (!rayons.length) { el.innerHTML = `<p class="empty">Génère d'abord un menu dans l'onglet Semaine.</p>`; return; }
    let n = 0, html = `<p class="hint">Coche ce que tu as déjà. Les quantités sont dans chaque recette (onglet Semaine).</p>`;
    rayons.forEach((rayon) => {
      const items = Object.values(acc[rayon]).sort((a, b) => a.nom.localeCompare(b.nom));
      html += `<h3 class="cat-title">${esc(rayon)}</h3><div class="shop-list">`;
      items.forEach((it) => {
        n++;
        const id = idArticle(rayon, it.nom);
        const ok = estCoche(id);
        html += `<label class="shop-row ${ok ? "checked" : ""}">
          <input type="checkbox" data-act="course" data-id="${esc(id)}" ${ok ? "checked" : ""} />
          <span class="sn">${esc(it.nom)}</span>
          <span class="sp">${esc(it.plats.join(" · "))}</span>
        </label>`;
      });
      html += `</div>`;
    });
    // section optionnelle : les « p'tits plus » qui subliment les plats
    const plus = [];
    (state.semaine ? state.semaine.plan : []).forEach((p) => {
      const r = getR(p.nom);
      if (r && r.bonus) plus.push({ plat: r.nom, quoi: r.bonus });
    });
    if (plus.length) {
      html += `<h3 class="cat-title">✨ Pour sublimer (optionnel)</h3>
        <p class="hint">Pas indispensable — juste le petit truc en plus.</p><div class="shop-list">`;
      plus.forEach((it) => {
        const id = idPlus(it.plat);
        const ok = estCoche(id);
        html += `<label class="shop-row optionnel ${ok ? "checked" : ""}">
          <input type="checkbox" data-act="course" data-id="${esc(id)}" ${ok ? "checked" : ""} />
          <span class="sn">${esc(it.quoi)}</span>
          <span class="sp">${esc(it.plat)}</span>
        </label>`;
      });
      html += `</div>`;
    }
    html += `<button id="btn-copy" class="primary ghost">📋 Copier la liste</button>
      <button id="btn-reset-courses" class="linkbtn">Tout décocher</button>`;
    el.innerHTML = `<div class="week-head"><strong>${n} articles</strong></div>` + html;
  }

  /** Texte de « Copier la liste » : seulement ce qui RESTE à acheter. L'écran dit « Coche ce
      que tu as déjà » — recopier aussi les articles cochés les renvoyait dans le panier.
      Renvoie "" quand tout est coché. */
  function texteCourses() {
    const acc = listeCourses();
    let out = "🛒 Liste de courses\n", n = 0;
    ORDRE_RAYONS.filter((r) => acc[r]).forEach((rayon) => {
      const reste = Object.values(acc[rayon]).filter((it) => !estCoche(idArticle(rayon, it.nom)))
        .sort((a, b) => a.nom.localeCompare(b.nom));
      if (!reste.length) return;
      out += `\n— ${rayon} —\n`;
      reste.forEach((it) => { out += `• ${it.nom}\n`; n++; });
    });
    const plus = (state.semaine ? state.semaine.plan : [])
      .map((p) => getR(p.nom)).filter((r) => r && r.bonus && !estCoche(idPlus(r.nom)));
    if (plus.length) {
      out += `\n— Pour sublimer (optionnel) —\n`;
      plus.forEach((r) => { out += `• ${r.bonus} (${r.nom})\n`; n++; });
    }
    return n ? out : "";
  }

  function renderRecettes() {
    const el = document.getElementById("view-recettes");
    const cats = [...new Set(RECIPES.map((r) => r.cat))];
    let html = `<input id="search" placeholder="🔍 Chercher une recette, un ingrédient…" />`;
    cats.forEach((cat) => {
      html += `<h3 class="cat-title">${esc(cat)}</h3><div class="cards">`;
      RECIPES.filter((r) => r.cat === cat).forEach((r) => {
        const ex = estExclu(r);
        html += `<div class="card recipe ${ex ? "excluded" : ""}" data-search="${esc(norm(r.nom + " " + r.ingredients.map((i) => i.nom).join(" ") + " " + (r.tags || []).join(" ")))}">
          <div class="card-top"><span class="plat">${esc(r.nom)}${ex ? ` <span class="badge off">exclue</span>` : ""}</span>
            <button class="fav ${estFavori(r.nom) ? "on" : ""}" data-act="fav" data-nom="${esc(r.nom)}" title="J'aime — à reproposer">${estFavori(r.nom) ? "❤️" : "🤍"}</button>
          </div>
          <div class="temps">${tempsRecette(r)}</div>
          <div class="meta">${bullesRecette(r)} ${badge(r.saison, "season")}</div>
          ${r.bonus ? `<div class="bonus">✨ Le p'tit plus : ${esc(r.bonus)}</div>` : ""}
          ${blocRecette(r)}
        </div>`;
      });
      html += `</div>`;
    });
    el.innerHTML = html;
    const s = document.getElementById("search");
    s.addEventListener("input", () => {
      const q = norm(s.value);
      el.querySelectorAll(".recipe").forEach((c) => { c.style.display = c.dataset.search.includes(q) ? "" : "none"; });
      el.querySelectorAll(".cat-title").forEach((t) => {
        const vis = [...t.nextElementSibling.querySelectorAll(".recipe")].some((c) => c.style.display !== "none");
        t.style.display = vis ? "" : "none";
      });
    });
  }

  function renderHistorique() {
    const el = document.getElementById("view-historique");
    const faits = state.historique.filter((h) => h.fait);
    if (!faits.length) {
      el.innerHTML = `<p class="empty">Aucun plat cuisiné pour l'instant.<br>Touche « Marquer fait » sur un plat de la semaine.</p>`;
      return;
    }
    const notes = faits.map((h) => state.notes[h.nom] || 0).filter((n) => n > 0);
    const moy = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : null;
    let html = `<div class="week-head"><strong>${faits.length} plat${faits.length > 1 ? "s" : ""} cuisiné${faits.length > 1 ? "s" : ""}</strong>${moy ? ` · note moyenne ${moy}/5` : ""}</div>
      <p class="hint">Un plat cuisiné ne revient pas avant 3 semaines. Les mieux notés reviennent en priorité.</p>`;
    // groupé par semaine (année comprise : deux « semaine 40 » ne se mélangent pas), plus récent d'abord
    const parSem = {};
    faits.forEach((h) => { const r = rangDe(h); if (r !== null) (parSem[r] = parSem[r] || []).push(h); });
    Object.keys(parSem).map(Number).sort((a, b) => b - a).forEach((rang) => {
      const sem = semaineDuRang(rang);
      html += `<h3 class="cat-title">Semaine ${sem.num} · ${esc(plageSemaine(sem.an, sem.num))}</h3><div class="cards">`;
      parSem[rang].sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour)).forEach((h) => {
        const r = getR(h.nom);
        html += `<div class="card hist">
          <div class="card-top"><span class="jour">${esc(h.jour)}</span>
            <button class="fav ${estFavori(h.nom) ? "on" : ""}" data-act="fav" data-nom="${esc(h.nom)}" title="J'aime">${estFavori(h.nom) ? "❤️" : "🤍"}</button>
          </div>
          <div class="plat">${esc(h.nom)}</div>
          <div class="note-row">Ta note : ${etoiles(h.nom)}</div>
          <div class="actions">
            ${r && r.url ? `<a class="btn-link" href="${esc(r.url)}" target="_blank" rel="noopener">Voir la recette ↗</a>` : ""}
            <button data-act="del-hist" data-nom="${esc(h.nom)}" data-rang="${rang}">Retirer</button>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
    el.innerHTML = html;
  }

  function renderReglages() {
    const el = document.getElementById("view-reglages");
    const nb = RECIPES.filter((r) => !estExclu(r)).length;
    let html = `<h3 class="cat-title">Mon cadre — jour par jour</h3>
      <p class="hint">Choisis le style de plat pour chaque jour (sport = express, plus de temps = mijoté…). Le menu se génère selon TES choix.</p>
      <div class="jours-editor">`;
    JOURS.forEach((j, i) => {
      const cur = (state.cadreJours || CADRE_JOURS_DEFAUT)[i];
      html += `<div class="jour-row"><span class="jour">${esc(j)}</span>
        <select data-act="cadre-jour" data-i="${i}">
          ${STYLES.map((s) => `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
        </select></div>`;
    });
    html += `</div>
      <p class="hint">Ou pars d'un modèle tout fait :</p>
      <div class="preset-quick">`;
    (window.CADRE_PRESETS || []).forEach((p) => {
      html += `<button class="preset-mini" data-act="preset" data-id="${esc(p.id)}">${esc(p.nom)}</button>`;
    });
    html += `</div>
      <h3 class="cat-title">Promos de la semaine</h3>
      <p class="hint">Tape ce qui est en promo (ex : cabillaud, poulet). Le prochain menu généré privilégiera les recettes qui l'utilisent.</p>
      <div class="add-row">
        <input id="new-promo" placeholder="Ex. : cabillaud" />
        <button id="btn-add-promo">Ajouter</button>
      </div>
      <div class="chips">`;
    state.promos.forEach((e, i) => {
      html += `<span class="chip promo">${esc(e)}<button data-act="unpromo" data-i="${i}" title="Retirer">✕</button></span>`;
    });
    html += `</div>
      <h3 class="cat-title">☀️ Saison</h3>
      <p class="hint">Quand c'est activé, les plats de pleine saison passent devant et les recettes
        hors saison sont écartées. Saison détectée : <strong>${esc(LIBELLE_SAISON[saisonActuelle()])}</strong>.
        Coupe-le pour ouvrir le choix à toute la base.</p>
      <label class="ligne-reglage">
        <input type="checkbox" data-act="saison" ${state.saisonOff ? "" : "checked"} />
        Privilégier les recettes de saison
      </label>
      <h3 class="cat-title">Ingrédients exclus</h3>
      <p class="hint">Une recette contenant un de ces ingrédients ne sera jamais proposée. ${nb}/${RECIPES.length} recettes disponibles.</p>
      <div class="add-row">
        <input id="new-ex" placeholder="Ex. : coriandre" />
        <button id="btn-add-ex">Ajouter</button>
      </div>
      <div class="chips">`;
    state.exclusions.forEach((e, i) => {
      html += `<span class="chip">${esc(e)}<button data-act="unexclude" data-i="${i}" title="Retirer">✕</button></span>`;
    });
    html += `</div>
      <h3 class="cat-title">❤️ Mes favoris</h3>
      <p class="hint">Les recettes que tu aimes (cœur sur une carte) reviennent plus souvent.</p>`;
    if (!state.favoris.length) html += `<p class="empty">Aucun favori. Touche le 🤍 sur une recette.</p>`;
    else {
      html += `<div class="chips">`;
      state.favoris.forEach((nom) => {
        html += `<span class="chip fav-chip">${esc(nom)}<button data-act="fav" data-nom="${esc(nom)}" title="Retirer">✕</button></span>`;
      });
      html += `</div>`;
    }
    html += `<h3 class="cat-title">💡 Mes envies (à scraper)</h3>
      <p class="hint">Propose un plat que tu aimerais voir ajouté. Tu peux coller le lien d'une recette,
        et choisir un jour pour qu'elle y soit imposée dès qu'elle est dans ta base.</p>
      <div class="add-row">
        <input id="new-envie" placeholder="Ex. : enchiladas au poulet" />
      </div>
      <div class="add-row">
        <input id="new-envie-url" placeholder="Lien de la recette (facultatif)" />
      </div>
      <div class="add-row">
        <select id="new-envie-jour">
          <option value="">Sans jour précis</option>
          ${JOURS.map((j) => `<option value="${j}">Pour ${j.toLowerCase()}</option>`).join("")}
        </select>
        <button id="btn-add-envie">Ajouter</button>
      </div>
      <div class="chips">`;
    state.envies.forEach((e, i) => {
      // une envie est soit un simple texte (ancien format), soit { nom, url, jour }
      const nom = e && e.nom ? e.nom : e;
      const jour = e && e.jour ? e.jour : null;
      const url = e && e.url ? e.url : null;
      // même recherche souple que le menu : sinon « Tendron de veau » restait affiché
      // « en attente » alors que « Tendron de veau printanier » est bien dans la base.
      const trouvee = trouverRecette(nom);
      const attente = jour && !trouvee ? ` · en attente d'ajout` : "";
      html += `<span class="chip envie">${esc(nom)}${jour ? ` <em>(${esc(jour)}${esc(attente)})</em>` : ""}${url ? " 🔗" : ""}<button data-act="del-envie" data-i="${i}" title="Retirer">✕</button></span>`;
    });
    html += `</div>
      <h3 class="cat-title">🔗 Partage à deux</h3>`;
    const sc = window.__sync ? window.__sync.conf() : null;
    if (sc && sc.url && sc.token) {
      html += `<p class="hint">Cet appareil partage son menu, ses courses et ses notes.
        ${sc.erreur ? `<br><strong>⚠️ Dernière synchro en échec : ${esc(sc.erreur)}</strong>` : ""}
        ${sc.derniere ? `<br>Dernière synchro : ${new Date(sc.derniere).toLocaleString("fr-FR")}` : ""}</p>
        <div class="actions">
          <button id="btn-sync-now">↻ Synchroniser</button>
          <button id="btn-sync-off">Se déconnecter</button>
        </div>`;
    } else {
      html += `<p class="hint">Colle ici l'adresse du hub et le mot de passe pour partager le menu et la liste de courses avec Marine. Les deux téléphones doivent saisir exactement les mêmes.</p>
        <div class="add-row"><input id="sync-url" placeholder="Adresse du hub (…/exec)" /></div>
        <div class="add-row">
          <input id="sync-token" placeholder="Mot de passe partagé" />
          <button id="btn-sync-on">Connecter</button>
        </div>`;
    }
    html += `<h3 class="cat-title">Données</h3>
      <p class="hint">L'historique de tes plats cuisinés est dans l'onglet 🕑 Historique.</p>
      <p class="hint">Les nouvelles recettes et améliorations arrivent toutes seules, mais si tu
        attends quelque chose qui ne vient pas, tu peux forcer la vérification.</p>
      <button id="btn-maj">🔄 Chercher une mise à jour</button>
      <p class="hint">L'app se rechargera si une nouvelle version existe. Tes données sont conservées.</p>
      <button id="btn-reset" class="linkbtn danger">Tout réinitialiser</button>`;
    el.innerHTML = html;
  }

  // ---------- navigation ----------
  const RENDER = { semaine: renderSemaine, courses: renderCourses, recettes: renderRecettes, historique: renderHistorique, reglages: renderReglages };
  function show(v) {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.getElementById("view-" + v).classList.add("active");
    document.querySelector(`.tab[data-view="${v}"]`).classList.add("active");
    RENDER[v]();
    window.scrollTo(0, 0);
  }
  const vueActive = () => document.querySelector(".view.active").id.replace("view-", "");

  /* Notification éphémère. L'auto-masquage est porté par une animation CSS
     (classe .on -> keyframes toastlife), pas par un minuteur JS. */
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.addEventListener("animationend", () => t.classList.remove("on"));
      document.body.appendChild(t);
    }
    t.classList.remove("on");
    void t.offsetWidth; // relance l'animation
    t.textContent = msg;
    t.classList.add("on");
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("tab")) return show(t.dataset.view);
    if (t.id === "btn-gen") { generer(); return renderSemaine(); }
    if (t.id === "btn-add-ex") {
      const inp = document.getElementById("new-ex");
      if (ajouterExclusion(inp.value)) { inp.value = ""; renderReglages(); toast("Ingrédient exclu"); }
      else toast("Déjà dans la liste");
      return;
    }
    if (t.id === "btn-add-promo") {
      const inp = document.getElementById("new-promo");
      if (ajouterPromo(inp.value)) { inp.value = ""; renderReglages(); toast("Promo ajoutée — régénère le menu"); }
      else toast("Déjà dans la liste");
      return;
    }
    if (t.id === "btn-copy") {
      const texte = texteCourses();
      if (!texte) return toast("Tout est déjà coché — rien à copier");
      navigator.clipboard.writeText(texte).then(() => toast("Liste copiée")).catch(() => toast("Copie impossible"));
      return;
    }
    if (t.id === "btn-sync-on") {
      const u = document.getElementById("sync-url").value;
      const k = document.getElementById("sync-token").value;
      if (!u || !k) return toast("Adresse et mot de passe requis");
      t.disabled = true; t.textContent = "…";
      window.__sync.connecter(u, k).then((ok) => {
        renderReglages();
        toast(ok ? "Partage activé 🔗" : "Connexion impossible — vérifie l'adresse et le mot de passe");
      });
      return;
    }
    if (t.id === "btn-sync-off") { window.__sync.deconnecter(); renderReglages(); return toast("Partage désactivé"); }
    if (t.id === "btn-sync-now") {
      t.disabled = true; t.textContent = "…";
      window.__sync.maintenant().then(() => { renderReglages(); toast("Synchronisé"); });
      return;
    }
    if (t.id === "btn-reset-courses") { state.coursesCochees = {}; save("coursesCochees"); return renderCourses(); }
    if (t.id === "btn-reset") {
      if (confirm("Effacer le menu, l'historique et les exclusions personnalisées ?")) {
        state = { semaine: null, historique: [], exclusions: EXCLUS_DEFAUT.slice(), promos: [], cadreJours: CADRE_JOURS_DEFAUT.slice(), favoris: [], notes: {}, envies: [], coursesCochees: {}, epingles: {}, servis: [] };
        save("semaine"); show("semaine");
      }
      return;
    }
    const act = t.dataset.act;
    if (act === "epingler") {
      epingler(t.dataset.jour, t.dataset.nom);
      generer();                                  // le reste de la semaine se réorganise autour
      renderSemaine();
      return toast(`📌 ${t.dataset.nom} imposé ${t.dataset.jour.toLowerCase()}`);
    }
    if (act === "desepingler") {
      desepingler(t.dataset.jour);
      generer();
      renderSemaine();
      return toast("Plat libéré — le jour redevient automatique");
    }
    if (act === "regen-day") {
      if (regenJour(t.dataset.jour) === "epingle") return toast("Ce plat est imposé — retire d'abord l'épingle");
      return renderSemaine();
    }
    if (act === "regen-side") {
      // repioche un accompagnement COMPATIBLE avec la catégorie du plat, et différent de l'actuel
      const p = state.semaine.plan.find((x) => x.jour === t.dataset.jour);
      const r = p && getR(p.nom);
      if (r) {
        const compat = ACC().filter((a) => (a.suits || []).includes(r.cat));
        const pool = (compat.length ? compat : ACC()).filter((a) => !p.side || a.nom !== p.side.nom);
        if (pool.length) {
          const a = pool[Math.floor(Math.random() * pool.length)];
          p.side = { nom: a.nom, url: a.url, source: a.source };
          save("semaine"); renderSemaine();
        } else toast("Pas d'autre accompagnement adapté");
      }
      return;
    }
    if (act === "exclure") {
      const ing = t.dataset.ing;
      if (ajouterExclusion(ing)) {
        const n = appliquerExclusion();
        RENDER[vueActive()]();
        toast(n ? `« ${ing} » exclu — ${n} plat${n > 1 ? "s" : ""} remplacé${n > 1 ? "s" : ""}`
                : `« ${ing} » exclu`);
      } else toast("Déjà dans les exclusions");
      return;
    }
    if (act === "unexclude") { state.exclusions.splice(+t.dataset.i, 1); save("exclusions"); return renderReglages(); }
    if (act === "fait") {
      const sem = semaineDuRang(rangDe(state.semaine)), jour = t.dataset.jour, nom = t.dataset.nom;
      const h = entreeHistorique(state.semaine, jour);
      // l'année est (ré)écrite à chaque passage : une entrée de l'ancien format se met à niveau
      if (h) { h.fait = !h.fait; h.nom = nom; h.num = sem.num; h.an = sem.an; }
      else state.historique.push({ num: sem.num, an: sem.an, jour, nom, fait: true, note: state.notes[nom] || 0 });
      save("historique"); renderSemaine();
      return;
    }
    if (act === "note") {
      const nom = t.dataset.nom, val = parseFloat(t.dataset.val);
      // re-cliquer la MÊME valeur efface la note (utile si clic par erreur)
      if (val > 0 && state.notes[nom] !== val) state.notes[nom] = val;
      else delete state.notes[nom];
      // répercute sur l'historique du plat (0 si la note vient d'être effacée)
      const nouvelle = state.notes[nom] || 0;
      state.historique.forEach((h) => { if (h.nom === nom) h.note = nouvelle; });
      save("notes"); RENDER[vueActive()]();
      return;
    }
    if (act === "fav") {
      const nom = t.dataset.nom;
      if (estFavori(nom)) state.favoris = state.favoris.filter((x) => x !== nom);
      else state.favoris.push(nom);
      save("favoris");
      RENDER[vueActive()]();
      toast(estFavori(nom) ? "Ajouté aux favoris ❤️" : "Retiré des favoris");
      return;
    }
    if (t.id === "btn-maj") {
      t.disabled = true; t.textContent = "Recherche…";
      forcerMiseAJour().then((neuf) => {
        if (neuf) return;                        // la page se recharge d'elle-même
        t.disabled = false; t.textContent = "🔄 Chercher une mise à jour";
        toast("Tu as déjà la dernière version");
      });
      return;
    }
    if (t.id === "btn-add-envie") {
      const inp = document.getElementById("new-envie");
      const inpUrl = document.getElementById("new-envie-url");
      const selJour = document.getElementById("new-envie-jour");
      const v = (inp.value || "").trim();
      if (!v) return;
      const jour = selJour ? selJour.value : "";
      let url = inpUrl ? (inpUrl.value || "").trim() : "";
      // On n'accepte qu'une vraie adresse web : un « javascript: » ou « data: » n'a rien à
      // faire là, et ce lien voyage jusqu'à l'autre téléphone via le hub.
      if (url && !/^https?:\/\//i.test(url)) {
        return toast("Le lien doit commencer par https://");
      }
      // Si le plat est DÉJÀ dans la liste, on ne refuse pas : on met à jour son jour et son
      // lien. Refuser en silence donnait un bouton « Ajouter » qui semblait mort quand on
      // revenait préciser un jour sur une envie déjà notée.
      const dejaI = state.envies.findIndex((e) => norm(e && e.nom ? e.nom : e) === norm(v));
      if (dejaI >= 0) {
        const anc = state.envies[dejaI];
        const ancNom = anc && anc.nom ? anc.nom : anc;
        const ancJour = anc && anc.jour;
        if (ancJour && ancJour !== jour && nomEpingle(ancJour) === ancNom) desepingler(ancJour);
        state.envies[dejaI] = { nom: ancNom, url: url || (anc && anc.url) || null, jour: jour || null };
      } else {
        state.envies.push({ nom: v, url: url || null, jour: jour || null });
      }
      save("envies");
      // un jour choisi = épingle posée d'avance : elle restera « en attente » tant que la
      // recette n'est pas dans la base, puis s'appliquera toute seule au premier menu suivant.
      if (jour) { epingler(jour, v); generer(); }
      inp.value = ""; if (inpUrl) inpUrl.value = "";
      renderReglages();
      return toast(jour ? `Noté — ${v} sera imposé ${jour.toLowerCase()} dès que je l'ai ajouté` : "Envie ajoutée — je la scraperai");
    }
    if (act === "del-envie") {
      const e = state.envies[+t.dataset.i];
      const j = e && e.jour;
      if (j && nomEpingle(j) === (e.nom || e)) desepingler(j);   // on retire aussi l'épingle en attente
      state.envies.splice(+t.dataset.i, 1); save("envies"); return renderReglages();
    }
    if (act === "unpromo") { state.promos.splice(+t.dataset.i, 1); save("promos"); return renderReglages(); }
    if (act === "preset") {
      const p = (window.CADRE_PRESETS || []).find((x) => x.id === t.dataset.id);
      if (p) {
        const CAT2 = { "Volaille": "volaille", "Porc": "porc", "Poisson": "poisson", "Légumineuses": "legumineuses", "Rapide (sport)": "express", "Mijoté": "mijote", "Rôti": "roti" };
        state.cadreJours = p.cadre.map((c) => CAT2[c.cats[0]] || "libre");
        generer(); save("cadreJours"); renderReglages();
        toast("Modèle appliqué — menu régénéré");
      }
      return;
    }
    if (act === "del-hist") {
      state.historique = state.historique.filter((h) => !(h.nom === t.dataset.nom && rangDe(h) === +t.dataset.rang));
      // le bouton vit dans l'onglet Historique : c'est LUI qu'il faut redessiner (redessiner
      // Réglages laissait la carte à l'écran jusqu'au prochain changement d'onglet)
      save("historique"); return renderHistorique();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.dataset.act === "cadre-jour") {
      const i = +e.target.dataset.i;
      state.cadreJours = (state.cadreJours || CADRE_JOURS_DEFAUT).slice();
      state.cadreJours[i] = e.target.value;
      generer(); save("cadreJours"); renderReglages();
      toast(JOURS[i] + " : " + STYLE(e.target.value).label);
      return;
    }
    if (e.target.dataset.act === "saison") {
      state.saisonOff = !e.target.checked;
      save("saisonOff");
      generer();                                 // le menu se refait avec le nouveau filtre
      renderReglages();
      return toast(state.saisonOff ? "Saison ignorée — toute la base est utilisable"
                                   : "Recettes de saison privilégiées");
    }
    if (e.target.dataset.act === "course") {
      const id = e.target.dataset.id;
      if (e.target.checked) state.coursesCochees[id] = true; else delete state.coursesCochees[id];
      save(null, id, !e.target.checked);
      e.target.closest(".shop-row").classList.toggle("checked", e.target.checked);
    }
  });

  // exposé pour les tests automatisés
  window.__mims = {
    generer, listeCourses, estExclu, getCadre, epingler, desepingler,
    exclure: (mot) => { if (!ajouterExclusion(mot)) return 0; return appliquerExclusion(); },
    getState: () => state,
    sauver: () => localStorage.setItem(STORE, JSON.stringify(state)),   // sans re-signaler (évite les boucles de synchro)
    rafraichir: () => { try { RENDER[vueActive()](); } catch (e) {} },
  };

  document.addEventListener("DOMContentLoaded", () => show("semaine"));
})();
