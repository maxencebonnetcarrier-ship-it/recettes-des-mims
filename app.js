/* Recettes des Mim's — générateur de menu, liste de courses, exclusions */
(function () {
  "use strict";

  // Numéro de version de l'app. À INCRÉMENTER à chaque déploiement : c'est ce que le bouton
  // « Chercher une mise à jour » compare au fichier servi. Sans ça, une amélioration qui ne
  // touche pas la base de recettes passait inaperçue et l'app restait sur l'ancien code.
  const VERSION_APP = 42;

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
  if (state.suivante === undefined) state.suivante = null;  // menu préparé de la semaine prochaine (S+1, v36)

  /* ---------- apparence (v32) ----------
     « auto » suit le téléphone ; « clair » et « sombre » le forcent. C'est un réglage de CET
     appareil : rangé à part (clé mims_theme), hors des données partagées par la synchro.
     index.html le relit avant la feuille de style, pour que l'app ne s'affiche pas une
     fraction de seconde dans l'autre thème au démarrage. */
  const THEME_CLE = "mims_theme";
  const THEMES = { auto: "Auto", clair: "Clair", sombre: "Sombre" };
  const COULEUR_BARRE = { clair: "#f7f1e8", sombre: "#1c1b18" };   // = --pap de chaque thème
  const sombreTelephone = () => !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  function themeChoisi() {
    try { const t = localStorage.getItem(THEME_CLE); return t === "clair" || t === "sombre" ? t : "auto"; } catch (e) { return "auto"; }
  }
  function appliquerTheme(t) {
    const racine = document.documentElement;
    if (t === "clair" || t === "sombre") racine.dataset.theme = t; else delete racine.dataset.theme;
    // barre d'état du téléphone : en « auto », chaque balise retrouve sa couleur d'origine
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (!m.dataset.origine) m.dataset.origine = m.getAttribute("content");
      m.setAttribute("content", COULEUR_BARRE[t] || m.dataset.origine);
    });
  }
  function choisirTheme(t) {
    if (!THEMES[t]) return;
    try { if (t === "auto") localStorage.removeItem(THEME_CLE); else localStorage.setItem(THEME_CLE, t); } catch (e) { /* stockage indisponible : le choix vaut pour la session */ }
    appliquerTheme(t);
  }
  appliquerTheme(themeChoisi());

  const estFavori = (nom) => state.favoris.includes(nom);
  const ACC = () => window.ACCOMPAGNEMENTS || [];

  /* ---------- un article = un ACHAT (v33) ----------
     Avant, la liste de courses regroupait par nom EXACT et par rayon : « oignon » / « oignons »,
     « ail » / « gousses d'ail », ou le laurier rangé en Épicerie par une recette et en Fruits &
     légumes par une autre faisaient deux lignes. Mesuré le 02/10/2026 : des doublons dans
     40 menus générés sur 40. */
  const CONTENANT = /^(gousses?|branches?|brins?|bottes?|cubes?) d(e |')/i;
  // variantes d'écriture d'un même achat → nom affiché dans la liste
  const MEME_ACHAT_BRUT = {
    "ail pressé": "ail", "poivre du moulin": "poivre", "poivre noir du moulin": "poivre",
    "poireaux émincés": "poireaux", "vin blanc sec": "vin blanc",
    "crème fraîche épaisse": "crème fraîche", "crème épaisse": "crème fraîche",
    "crème fraîche liquide": "crème liquide", "crème fleurette": "crème liquide",
    "persil plat": "persil", "romarin frais": "romarin", "échalotes grises": "échalotes",
    "lardons fumés": "lardons", "citron non traité": "citrons",
    "filet mignon": "filet mignon de porc", "filets mignons de porc": "filet mignon de porc",
    "gros sel de mer": "gros sel", "sel de mer": "sel", "gingembre en poudre": "gingembre moulu",
    "cannelle en poudre": "cannelle", "eau chaude": "eau", "moutarde de Dijon forte": "moutarde",
    "pomme de terre belle de Fontenay": "pommes de terre", "pomme de terre roseval": "pommes de terre",
    "pommes de terre nouvelles": "pommes de terre",
  };
  // sans accents ni parenthèse ni contenant : « Gousses d'ail » → « ail »
  const brut = (nom) => norm(nom).replace(/œ/g, "oe").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().replace(CONTENANT, "");
  // chaque mot au singulier — clé de comparaison seulement, jamais affichée
  const singulier = (s) => s.split(" ").map((m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m)).join(" ");
  const MEME_ACHAT = {};
  Object.entries(MEME_ACHAT_BRUT).forEach(([v, n]) => { MEME_ACHAT[singulier(brut(v))] = n; });
  function achat(nom) {
    const k = singulier(brut(nom));
    if (MEME_ACHAT[k]) return { cle: singulier(brut(MEME_ACHAT[k])), affiche: MEME_ACHAT[k] };
    const affiche = (nom || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().replace(CONTENANT, "");
    return { cle: k, affiche: affiche || nom };
  }

  /* ---------- accompagnement PRIS (v33) ----------
     L'accompagnement est une PROPOSITION : il n'entre dans les courses que si on le prend
     (« Ajouter aux courses »). Pris, il remplace les féculents de la recette (pommes de terre,
     riz, pâtes…), qui sortent de la liste. Un plat dont le NOM contient déjà son féculent
     (« Tajine… et pommes de terre », « Penne au poulet ») n'en reçoit pas. */
  const FECULENT = /\b(pommes? de terre|riz|pates?|penne|spaghetti|tagliatelles?|nouilles?|semoule|boulgour|quinoa|patates? douces?|puree)\b/;
  const estFeculent = (nom) => FECULENT.test(brut(nom));
  const platComplet = (r) => FECULENT.test(brut(r.nom));
  const sideDe = (p, r) => (p && p.side && r && !platComplet(r) ? p.side : null);
  const sidePris = (p, r) => !!(sideDe(p, r) && p.sideChoisi);
  const accDe = (side) => (side ? ACC().find((a) => a.nom === side.nom) : null);

  // accompagnement qui VARIE : choisi au hasard parmi ceux adaptés à la catégorie du plat
  function pickSide(r, idx, plan) {
    if (platComplet(r)) return null;
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

  /* Exclusions qui ne sont le NOM d'aucun ingrédient (v35). build_data.py les reconnaît sur la recette entière et
     range les ingrédients en cause dans r.tomate_crue / r.sucre_sale. Comparées aux noms comme les autres,
     « sucré-salé » n'écartait jamais rien (constaté le 2026-10-03). « tomate » seule vaut « tomate crue » :
     l'exclusion par défaut s'appelait ainsi, et elle est enregistrée sur chaque téléphone (et le hub). Choix de
     l'utilisateur du 2026-10-03 : « sans tomate crue mais sans champi » — sauce, concentré, tomate cuite permis. */
  const EXCLUSIONS_RECETTE = { "tomate": "tomate_crue", "tomate crue": "tomate_crue",
                               "sucre-sale": "sucre_sale", "sucre sale": "sucre_sale" };
  const exclusParRegle = (r, ex) => {
    const champ = EXCLUSIONS_RECETTE[norm(ex)];
    if (champ) return r[champ] || [];
    return (r.ingredients || []).filter((i) => norm(i.nom).includes(norm(ex))).map((i) => i.nom);
  };
  const estExclu = (r) => state.exclusions.some((ex) => exclusParRegle(r, ex).length > 0);

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
     la même protéine plus de 2x dans la semaine, et une saveur déjà utilisée.
     `garder` (facultatif) ne retient que certaines recettes : envie d'un ingrédient (v36). */
  function choisir(cadre, interdites, plan, idx, garder) {
    const protPrec = idx > 0 && plan[idx - 1] ? plan[idx - 1].proteine : null;
    const protSuiv = plan[idx + 1] ? plan[idx + 1].proteine : null;
    const compteProt = {};
    plan.forEach((p, i) => { if (p && i !== idx) compteProt[p.proteine] = (compteProt[p.proteine] || 0) + 1; });
    const saveursVues = new Set(plan.filter((p, i) => p && i !== idx).map((p) => p.saveur).filter(Boolean));
    const garde = garder || (() => true);

    let pool = candidats(cadre, interdites).filter(garde);
    if (!pool.length) {
      // Repli : on relâche la saison et l'anti-répétition, JAMAIS le temps ni la protéine —
      // sinon un jour « Express ≤15 min » pourrait servir un mijoté de 3 h.
      pool = RECIPES.filter((r) =>
        cadre.cats.includes(r.cat) && !estExclu(r) &&
        (!cadre.maxMin || (r.total_min || 0) <= cadre.maxMin) &&
        (!cadre.proteine || PROT_SPORT.has(norm(r.proteine)))
      ).filter(garde);
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
  /* v37 : un plat imposé pour la SEMAINE PROCHAINE est rangé sous « Mar+1 » (même convention
     que les jours « S+1 » des courses). Cas d'origine : une envie demandée pour un jour déjà
     passé re-tirait toute la semaine en cours et le plat n'était jamais servi. Le lundi venu,
     « Mar+1 » devient « Mar » (voir purgerEpingles). s1 = vrai pour la semaine prochaine. */
  const cleEpingle = (jour, s1) => (s1 ? jour + "+1" : jour);
  // une entrée peut être une pierre tombale { nom: null } : un désépinglage doit se
  // PROPAGER à l'autre téléphone, ce qu'une simple suppression ne ferait pas.
  const nomEpingle = (jour, s1) => {
    const e = epinglesDe()[cleEpingle(jour, s1)];
    if (!e) return null;
    if (s1 && rangDe(e) !== rangCourant() + 1) return null;   // périmée, pas encore purgée
    return typeof e === "string" ? e : (e.nom || null);
  };
  const semaineEpingle = (s1) => (s1 ? semaineDuRang(rangCourant() + 1) : semaineCourante());

  /** Impose une recette sur un jour. Une seule par jour : la nouvelle remplace l'ancienne.
      On mémorise la SEMAINE visée : une épingle ne vaut que pour elle. */
  function epingler(jour, nom, s1) {
    if (!jour || !nom) return false;
    const sem = semaineEpingle(s1);
    epinglesDe()[cleEpingle(jour, s1)] = { nom: nom, t: Date.now(), num: sem.num, an: sem.an };
    save("epingles");
    return true;
  }

  /** Retire les épingles d'une semaine terminée. Sans ça, un plat imposé une fois le resterait
      indéfiniment — l'inverse de ce qui est promis à l'utilisateur. Une épingle « S+1 » dont la
      semaine est arrivée devient l'épingle du jour (la plus récente gagne en cas de conflit). */
  function purgerEpingles(rang) {
    const e = epinglesDe();
    let change = false;
    Object.keys(e).forEach((k) => {
      const v = e[k];
      if (/\+1$/.test(k)) {
        if (rangDe(v) === rang + 1) return;
        if (rangDe(v) === rang) {
          const j = k.slice(0, -2), cur = e[j];
          if (!cur || rangDe(cur) !== rang || (cur.t || 0) <= (v.t || 0)) e[j] = v;
        }
        delete e[k]; change = true;
        return;
      }
      if (rangDe(v) !== rang) {
        // v40 : un plat DEMANDÉ (envie de plat avec ce jour) et jamais servi est REPORTÉ, pas effacé : sur ce
        // jour cette semaine s'il n'est pas passé, sinon la semaine prochaine. Cas réel du 05/10 : « Gratin
        // ravioles pour mardi » demandé un dimanche (ancienne version : épingle datée de la semaine finie),
        // recette ajoutée par le guetteur le lundi ; la demande était effacée et le plat jamais servi.
        const envie = v && v.nom && rangDe(v) !== null && rangDe(v) < rang && enviePlatDuJour(v.nom, k);
        if (envie && !serviLaSemaine(v.nom, rangDe(v))) {
          const s1 = JOURS.indexOf(k) < indexAujourdhui();
          const cible = semaineDuRang(rang + (s1 ? 1 : 0));
          const deja = e[cleEpingle(k, s1)];
          if (s1 || !deja || deja === v) {
            if (!deja || deja === v || rangDe(deja) !== rangSemaine(cible.an, cible.num)) {
              e[cleEpingle(k, s1)] = { nom: v.nom, t: v.t, num: cible.num, an: cible.an };
            }
            if (s1) delete e[k];
            envie.an = cible.an; envie.num = cible.num;   // l'envie dit la semaine visée (et « ✕ » retire la bonne)
            save("envies");
            change = true;
            return;
          }
        }
        delete e[k]; change = true;
      }
    });
    if (change) save("epingles");
    return change;
  }
  // envie de PLAT encore notée pour ce jour (la demande qui a posé l'épingle)
  const enviePlatDuJour = (nom, jour) => state.envies.find((x) => x && typeof x === "object" && x.type !== "ingredient"
    && x.jour === jour && norm(x.nom) === norm(nom)) || null;
  // le plat a-t-il été servi (menu de fin de semaine) ou cuisiné (historique) la semaine de rang r ?
  function serviLaSemaine(nom, r) {
    const rec = trouverRecette(nom);
    const n = rec ? rec.nom : nom;
    return (state.servis || []).some((s) => rangDe(s) === r && (s.noms || []).includes(n))
      || state.historique.some((h) => rangDe(h) === r && h.nom === n)
      || (!!state.semaine && rangDe(state.semaine) === r && state.semaine.plan.some((p) => p && p.nom === n));
  }

  function desepingler(jour, s1) {
    if (!nomEpingle(jour, s1)) return false;
    // pierre tombale plutôt que suppression : sinon l'autre téléphone, qui a encore
    // l'épingle, la renverrait à la prochaine synchro et elle réapparaîtrait toute seule.
    const sem = semaineEpingle(s1);
    epinglesDe()[cleEpingle(jour, s1)] = { nom: null, t: Date.now(), num: sem.num, an: sem.an };
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

  const ingredientsExclus = (r) => [...new Set(state.exclusions.flatMap((ex) => exclusParRegle(r, ex)))];

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
    // la semaine prochaine déjà préparée aussi (v36) : elle ne doit pas garder un plat exclu
    [state.semaine, semaineSuivante()].forEach((s) => {
      if (!s) return;
      s.plan.slice().forEach((p) => {
        const r = getR(p.nom);
        if (!r || !estExclu(r)) return;
        if (p.epingle) return;                  // imposé : on le garde et on l'annote
        if (regenJour(p.jour, s) !== "epingle") n++;
      });
    });
    rafraichirAlertes();                        // recalcule aussi les jours épinglés
    return n;
  }

  function rafraichirAlertes() {
    if (!state.semaine) return;
    const s1 = semaineSuivante();
    [state.semaine, s1].forEach((s) => {
      if (!s) return;
      s.plan.forEach((p) => {
        if (!p.epingle) return;
        const r = getR(p.nom);
        if (!r) return;
        const exclus = ingredientsExclus(r);
        if (exclus.length) p.exclusAlerte = exclus; else delete p.exclusAlerte;
      });
      marquerProteinesVoisines(s.plan);
    });
    save("semaine");
    if (s1) save("suivante");
  }

  /* ---------- semaine suivante (S+1, v36) ----------
     Le menu de la semaine prochaine se prépare d'avance (onglet Semaine › « Semaine
     prochaine »), pour faire les courses avant le lundi. Il est rangé dans `state.suivante`,
     partagé par la synchro. Le lundi venu, il DEVIENT le menu de la semaine au lieu d'un
     nouveau tirage : sinon les courses faites pour lui ne correspondraient plus à rien.
     Les deux semaines s'excluent l'une l'autre (pas le même plat d'une semaine à l'autre). */
  function semaineSuivante() {
    const s = state.suivante;
    return s && Array.isArray(s.plan) && s.plan.length && rangDe(s) === rangCourant() + 1 ? s : null;
  }
  const nomsPlan = (s) => (s && Array.isArray(s.plan) ? s.plan.map((p) => p && p.nom).filter(Boolean) : []);
  // l'autre semaine montrée : S+1 pour la semaine courante, la semaine courante pour S+1
  const autreSemaine = (s) => (s === state.semaine ? semaineSuivante()
    : (state.semaine && rangDe(state.semaine) === rangDe(s) - 1 ? state.semaine : null));
  const champDe = (s) => (s === state.suivante ? "suivante" : "semaine");

  // jours sans plat imposé, posés d'après le cadre : protéine la plus FORCÉE d'abord
  function composer(cadre, interdites, plan) {
    // les autres jours se génèrent autour et VOIENT les protéines déjà posées : un plat
    // imposé n'échappe donc pas à l'anti-répétition, il la contraint.
    // Jours à protéine la plus FORCÉE d'abord (ex : Poisson = 1 seule protéine possible),
    // pour que les jours souples (Express, Mijoté) s'adaptent ensuite et évitent l'adjacence.
    const ordre = cadre.map((c, i) => {
      const cand = candidats(c, interdites);
      return { i, prot: new Set(cand.map((r) => r.proteine)).size || 99, n: cand.length };
    }).filter((o) => !plan[o.i])
      .sort((a, b) => a.prot - b.prot || a.n - b.n).map((o) => o.i);
    for (const i of ordre) {
      const r = choisir(cadre[i], interdites, plan, i);
      if (r) plan[i] = entreePlan(cadre[i].jour, r, i, plan, false);
    }
    return plan;
  }

  function generer() {
    const sem = semaineCourante();
    const rang = rangSemaine(sem.an, sem.num);
    // le menu d'une semaine TERMINÉE est noté avant d'être remplacé
    noterMenuServi(rang);
    // 0) une épingle ne vaut QUE pour la semaine où elle a été posée ; une envie
    //    d'ingrédient aussi ; une case de courses aussi (v36).
    purgerEpingles(rang);
    purgerEnvies(rang);
    purgerCourses(rang);
    const cadre = getCadre();

    // 1) changement de semaine avec une S+1 préparée : elle devient le menu tel quel.
    const prete = state.suivante && rangDe(state.suivante) === rang && Array.isArray(state.suivante.plan)
      && state.suivante.plan.length && (!state.semaine || rangDe(state.semaine) !== rang);
    if (prete) {
      const plan = state.suivante.plan;
      // une épingle posée pour cette semaine (depuis l'autre téléphone) prime quand même
      cadre.forEach((c) => {
        const r = trouverRecette(nomEpingle(c.jour));
        const k = plan.findIndex((p) => p.jour === c.jour);
        if (r && k >= 0 && plan[k].nom !== r.nom) plan[k] = entreePlan(c.jour, r, k, plan, true);
      });
      state.semaine = { num: sem.num, an: sem.an, plan };
      state.suivante = null; save("suivante");
      appliquerEnviesIngredient(state.semaine);
      rafraichirAlertes();                       // protéines voisines + enregistre la semaine
      return state.semaine;
    }
    if (state.suivante && rangDe(state.suivante) !== rang + 1) { state.suivante = null; save("suivante"); }

    const interdites = recentes(rang - 1);
    nomsPlan(semaineSuivante()).forEach((n) => interdites.add(n));   // déjà prévus la semaine prochaine
    // et ceux déjà imposés pour la semaine prochaine, même si son menu n'est pas encore préparé
    JOURS.forEach((j) => { const r = trouverRecette(nomEpingle(j, true)); if (r) interdites.add(r.nom); });
    const plan = new Array(cadre.length).fill(null);

    // 2) les jours ÉPINGLÉS sont posés AVANT tout le reste : ils priment sur le cadre du
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

    // 3) les autres jours autour
    composer(cadre, interdites, plan);
    state.semaine = { num: sem.num, an: sem.an, plan: marquerProteinesVoisines(plan.filter(Boolean)) };
    appliquerEnviesIngredient(state.semaine);
    save("semaine");
    return state.semaine;
  }

  /** Prépare (ou refait) le menu de la semaine prochaine. Les plats de cette semaine comptent
      comme déjà servis : la règle « pas deux fois en 3 semaines » vaut aussi pour S+1. Seuls
      les plats imposés POUR la semaine prochaine (clés « Mar+1 », v37) s'y appliquent. */
  function genererSuivante() {
    const rang = rangCourant() + 1;
    const sem = semaineDuRang(rang);
    const cadre = getCadre();
    const interdites = recentes(rang - 1);
    nomsPlan(state.semaine && rangDe(state.semaine) === rang - 1 ? state.semaine : null).forEach((n) => interdites.add(n));
    const plan = new Array(cadre.length).fill(null);
    // les plats imposés pour la semaine prochaine (v37) sont posés d'abord, comme dans generer()
    cadre.forEach((c, i) => {
      const demande = nomEpingle(c.jour, true);
      const r = trouverRecette(demande);
      if (!r) return;
      if (r.nom !== demande) { epinglesDe()[cleEpingle(c.jour, true)].nom = r.nom; save("epingles"); }
      plan[i] = entreePlan(c.jour, r, i, plan, true);
    });
    composer(cadre, interdites, plan);
    state.suivante = { num: sem.num, an: sem.an, plan: marquerProteinesVoisines(plan.filter(Boolean)) };
    appliquerEnviesIngredient(state.suivante);
    save("suivante");
    return state.suivante;
  }

  /** Applique au menu S+1 DÉJÀ préparé le plat imposé pour ce jour, sans retirer au sort les
      autres jours (les courses faites d'avance restent justes). Si ce plat était déjà prévu un
      autre jour de S+1, cet autre jour est changé. Renvoie vrai si le menu a changé. */
  function imposerSuivante(jour) {
    const s = semaineSuivante();
    const demande = nomEpingle(jour, true);
    const r = trouverRecette(demande);
    if (!s || !r) return false;
    if (r.nom !== demande) { epinglesDe()[cleEpingle(jour, true)].nom = r.nom; save("epingles"); }
    let idx = s.plan.findIndex((p) => p.jour === jour);
    if (idx < 0) { s.plan.push({ jour }); s.plan.sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour)); idx = s.plan.findIndex((p) => p.jour === jour); }
    s.plan[idx] = entreePlan(jour, r, idx, s.plan, true);
    s.plan.forEach((p) => { if (p.jour !== jour && p.nom === r.nom && !nomEpingle(p.jour, true)) regenJour(p.jour, s); });
    marquerProteinesVoisines(s.plan);
    save("suivante");
    return true;
  }
  /** Le jour redevient automatique dans S+1 : un autre plat y est tiré. */
  function libererSuivante(jour) {
    const s = semaineSuivante();
    const p = s && s.plan.find((x) => x.jour === jour);
    if (!p || !p.epingle) return;
    delete p.epingle; delete p.horsCadre; delete p.exclusAlerte;
    regenJour(jour, s);
    save("suivante");
  }

  // s : la semaine visée (courante par défaut, ou S+1)
  function regenJour(jour, s) {
    s = s || state.semaine;
    const courante = s === state.semaine;
    const idx = s.plan.findIndex((p) => p.jour === jour);
    if (idx < 0) return;
    // un jour épinglé est un choix explicite : on ne le tire pas au sort dans son dos.
    // Il faut d'abord retirer l'épingle (bouton « Ne plus imposer »).
    if (nomEpingle(jour, !courante)) return "epingle";
    const cadre = getCadre().find((c) => c.jour === jour);
    const interdites = recentes(rangDe(s) - 1);
    nomsPlan(autreSemaine(s)).forEach((n) => interdites.add(n));
    s.plan.forEach((p) => interdites.add(p.nom));   // exclut TOUTE la semaine, dont le plat actuel → force un vrai changement
    const copie = s.plan.slice(); copie[idx] = null;
    // un jour choisi pour une ENVIE d'ingrédient le garde quand on le change
    const envie = s.plan[idx].envie;
    const garder = envie ? (r) => contientIngr(r, envie) : null;
    let r = choisir(cadre, interdites, copie, idx, garder);
    if (!r && garder) r = choisir(cadre, interdites, copie, idx);
    // si un seul candidat existe (plat actuel ré-exclu), on relâche pour ne pas planter
    if (!r) { interdites.delete(s.plan[idx].nom); r = choisir(cadre, interdites, copie, idx); }
    if (r) {
      const e = { jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r), side: pickSide(r, idx, copie) };
      if (envie && contientIngr(r, envie)) e.envie = envie;
      s.plan[idx] = e;
      marquerProteinesVoisines(s.plan);
      save(champDe(s));
    }
  }

  /* ---------- envies par INGRÉDIENT (v36) ----------
     « J'ai envie de poireaux (jeudi) » : un plat de la base qui en contient est mis au menu ce
     jour-là — ou, sans jour, sur un des jours qui restent. Ce n'est PAS une épingle : le plat
     choisi respecte le style du jour, l'anti-répétition et les exclusions, et « Changer » en
     propose un autre avec le même ingrédient. L'envie vise UNE semaine (cette semaine si le
     jour n'est pas passé, sinon la suivante) et s'efface quand cette semaine est finie. */
  const cleIngr = (t) => singulier(brut(t));
  function contientIngr(r, ing) {
    const c = cleIngr(ing);
    return c.length >= 3 && !!r && (r.ingredients || []).some((i) => cleIngr(i.nom).includes(c));
  }
  const recettesAvec = (ing) => RECIPES.filter((r) => contientIngr(r, ing));
  const estEnvieIngr = (e) => !!(e && typeof e === "object" && e.type === "ingredient");
  const enviesIngrPour = (s) => state.envies.filter((e) => estEnvieIngr(e) && rangDe(e) !== null && rangDe(e) === rangDe(s));
  function purgerEnvies(rang) {
    const avant = state.envies.length;
    state.envies = state.envies.filter((e) => !estEnvieIngr(e) || rangDe(e) === null || rangDe(e) >= rang);
    if (state.envies.length !== avant) save("envies");
  }
  /** Place dans la semaine s un plat contenant chaque ingrédient demandé pour elle. Renvoie les
      jours changés. Un jour passé (semaine courante) ou imposé n'est jamais touché. */
  function appliquerEnviesIngredient(s) {
    const changes = [];
    if (!s || !Array.isArray(s.plan)) return changes;
    const courante = rangDe(s) === rangCourant();
    const debut = courante ? indexAujourdhui() : 0;
    enviesIngrPour(s).forEach((e) => {
      const deja = s.plan.find((p) => (!e.jour || p.jour === e.jour) && JOURS.indexOf(p.jour) >= debut && contientIngr(getR(p.nom), e.nom));
      if (deja) { deja.envie = e.nom; return; }
      const jours = (e.jour ? [e.jour] : getCadre().map((c) => c.jour))
        .filter((j) => JOURS.indexOf(j) >= debut && !nomEpingle(j, !courante));
      for (const j of jours) {
        if (remplacerPourEnvie(s, j, e.nom, !!e.jour)) { changes.push(j); break; }
      }
    });
    if (changes.length) marquerProteinesVoisines(s.plan);
    return changes;
  }
  // horsStyle : avec un jour précis, on accepte un plat d'un autre style plutôt que rien
  function remplacerPourEnvie(s, jour, ing, horsStyle) {
    const cadre = getCadre().find((c) => c.jour === jour);
    if (!cadre) return false;
    const idx = s.plan.findIndex((p) => p.jour === jour);
    const interdites = recentes(rangDe(s) - 1);
    nomsPlan(autreSemaine(s)).forEach((n) => interdites.add(n));
    s.plan.forEach((p, k) => { if (k !== idx) interdites.add(p.nom); });
    const copie = s.plan.slice(); if (idx >= 0) copie[idx] = null;
    const garder = (r) => contientIngr(r, ing);
    let r = choisir(cadre, interdites, copie, idx, garder), hors = false;
    if (!r && horsStyle) {
      const tous = { cats: [...new Set(RECIPES.map((x) => x.cat))], maxMin: null };
      r = choisir(tous, interdites, copie, idx, garder);
      hors = !!r;
    }
    if (!r) return false;
    const e = { jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r), side: pickSide(r, idx, copie), envie: ing };
    if (hors) e.horsCadre = cadre.cats.join(" / ");
    if (idx >= 0) s.plan[idx] = e;
    else { s.plan.push(e); s.plan.sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour)); }
    return true;
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
    // v41 : la recette que le guetteur du PC a associée à cette envie (suivi sur le hub). Sa recherche
    // élargie peut retenir un titre qui ne contient pas tous les mots écrits : « riz poivrons chorizos »
    // → « Riz au chorizo » (poivrons dans les ingrédients). Même ordre que recette_liee() de guetteur.py.
    const g = state.guetteur;
    const lie = g && typeof g === "object" && g.envies ? g.envies[norm(nom)] : null;
    if (lie && lie.recette) { const r = getR(lie.recette); if (r) return r; }
    const d = norm(nom).trim();
    if (d.length < 3) return null;
    // 1) le texte demandé tel quel dans le titre : « tendron de veau » → « Tendron de veau
    //    printanier ». C'est le cas courant et le plus sûr.
    let candidats = RECIPES.filter((r) => norm(r.nom).includes(d));
    // 2) à défaut seulement, tous les mots présents mais dans le désordre.
    if (!candidats.length) {
      // au singulier (v41) : « Escalopes poulets panées » retrouve « Escalopes de poulet panées »
      const mots = d.split(/\s+/).filter((m) => m.length > 2).map((m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m));
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
  const rangRayon = (r) => { const i = ORDRE_RAYONS.indexOf(r); return i < 0 ? 99 : i; };
  /** Articles à acheter : { rayon: { nomSansAccents: { nom, cle, unites, plats, jours } } }.
      `jours` (facultatif) limite aux plats de ces jours. Un article = un achat (voir achat()) :
      son nom est la forme la plus longue rencontrée (« oignons » plutôt que « oignon »), son
      rayon le plus fréquent. L'accompagnement n'y entre que s'il a été pris (voir sidePris). */
  /* Jours de courses (v36) : « Lun » = lundi de cette semaine, « Lun+1 » = lundi de la semaine
     prochaine (S+1). Sans filtre, seule la semaine courante compte. */
  const estJourS1 = (k) => /\+1$/.test(k);
  const jourDe = (k) => (estJourS1(k) ? k.slice(0, -2) : k);
  const ordreJour = (k) => JOURS.indexOf(jourDe(k)) + (estJourS1(k) ? 7 : 0);
  const libJour = (k) => (estJourS1(k) ? `${jourDe(k)} S+1` : k);
  // les plats des jours demandés, de cette semaine et de S+1 : [{ cle, p }]
  function platsDesJours(jours) {
    const out = [];
    if (state.semaine) state.semaine.plan.forEach((p) => { if (!jours || jours.includes(p.jour)) out.push({ cle: p.jour, p }); });
    const s1 = semaineSuivante();
    if (s1 && jours) s1.plan.forEach((p) => { if (jours.includes(p.jour + "+1")) out.push({ cle: p.jour + "+1", p }); });
    return out;
  }
  function listeCourses(jours) {
    const acc = {};
    if (!state.semaine) return acc;
    const vus = {};
    const ajoute = (jour, source, ingredients, parts, sauf) => {
      const facteur = PARTS_CIBLE / (parts || PARTS_CIBLE);
      (ingredients || []).forEach((ing) => {
        if (sauf && sauf(ing)) return;
        const { cle, affiche } = achat(ing.nom);
        const e = vus[cle] = vus[cle] || { cle, noms: {}, rayons: {}, unites: {}, plats: [], jours: [] };
        e.noms[affiche] = true;
        const rayon = ing.rayon || "Épicerie";
        e.rayons[rayon] = (e.rayons[rayon] || 0) + 1;
        if (ing.qte) {
          const u = ing.unite || "";
          e.unites[u] = Math.round(((e.unites[u] || 0) + ing.qte * facteur) * 10) / 10;
        }
        if (!e.plats.includes(source)) e.plats.push(source);
        if (!e.jours.includes(jour)) e.jours.push(jour);
      });
    };
    platsDesJours(jours).forEach(({ cle, p }) => {
      const r = getR(p.nom);
      if (!r) return;
      const a = sidePris(p, r) ? accDe(p.side) : null;
      // accompagnement pris : il remplace les féculents de la recette
      ajoute(cle, r.nom, r.ingredients, r.parts_origine, a ? (ing) => estFeculent(ing.nom) : null);
      if (a) ajoute(cle, a.nom, a.ingredients, a.parts_origine);
    });
    Object.values(vus).forEach((e) => {
      const nom = Object.keys(e.noms).sort((x, y) => y.length - x.length || x.localeCompare(y))[0];
      const rayon = Object.keys(e.rayons).sort((x, y) => e.rayons[y] - e.rayons[x] || rangRayon(x) - rangRayon(y))[0];
      e.jours.sort((x, y) => ordreJour(x) - ordreJour(y));
      (acc[rayon] = acc[rayon] || {})[norm(nom)] = { nom, cle: e.cle, unites: e.unites, plats: e.plats, jours: e.jours };
    });
    return acc;
  }
  function fmtQte(unites) {
    const parts = Object.entries(unites).filter(([u, q]) => q > 0).map(([u, q]) => `${q}${u ? " " + u : ""}`);
    return parts.length ? parts.join(" + ") : "qs"; // qs = quantité suffisante
  }

  // ---------- rendu ----------
  /* Design « Chez les Mim's » (v31, choisi sur maquettes le 01/10/2026) : papier, titres en
     serif, ornements centrés, accent terracotta. Les pictos sont dessinés en SVG au lieu
     d'emoji : un emoji change d'aspect d'un téléphone à l'autre et ignore la couleur du thème. */
  const SVG = (corps, taille, epais) =>
    `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${epais}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corps}</svg>`;
  const COEUR = "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z";
  const icoCoeur = (plein) => SVG(`<path d="${COEUR}"${plein ? ' fill="currentColor"' : ""}/>`, 20, 1.8);
  const icoCoche = SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 14, 2.6);
  const icoLoupe = SVG('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', 17, 1.9);
  const icoCopier = SVG('<path d="M9 3.5h6v3H9z"/><path d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15"/>', 18, 1.8);

  const JOURS_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  // rang du jour courant dans JOURS (lundi = 0)
  const indexAujourdhui = () => (new Date().getDay() + 6) % 7;
  // numéro dans le mois du i-ème jour (lundi = 0) de la semaine { an, num }
  function quantieme(sem, i) {
    const d = lundiSemaineISO(sem.num, sem.an);
    d.setUTCDate(d.getUTCDate() + i);
    return d.getUTCDate();
  }
  const ornement = (texte) => `<div class="orn"><i></i>${texte}<i></i></div>`;
  // en-tête commun aux onglets : ornement, nom de l'app, ligne d'information
  const enTete = (orn, ligne, classe) =>
    `<div class="vue-tete">${ornement(orn)}<div class="titre">Chez les Mim's</div>${ligne ? `<div class="${classe || "sous"}">${ligne}</div>` : ""}</div>`;

  /* Prix et calories (v33) : RELEVÉS sur la page source par lots → build_data.py (champs
     « cout » et « kcal_part »), jamais estimés par l'app. Seul Marmiton les publie : une
     recette d'une autre source n'affiche rien plutôt qu'un chiffre inventé. */
  const NIVEAU_PRIX = { "Très bon marché": 1, "Bon marché": 1, "Moyen": 2, "Assez cher": 3, "Cher": 3 };
  // échelle à 3 € : les atteints en plein, les autres pâles (« €€ » + « € » pâle = Moyen)
  const echellePrix = (n, etiquette, bulle) =>
    `<span class="prix" role="img" aria-label="${esc(etiquette)}" title="${esc(bulle || etiquette)}">${"€".repeat(n)}<i>${"€".repeat(3 - n)}</i></span>`;
  function prixHtml(r) {
    const n = r && NIVEAU_PRIX[r.cout];
    if (!n) return "";
    return echellePrix(n, `Prix : ${r.cout}`, `Prix : ${r.cout} (selon ${r.source || "la source"})`);
  }
  const LIBELLE_NIVEAU = { 1: "bon marché", 2: "moyen", 3: "assez cher" };

  /* Résumé en tête de la Semaine (v34) : combien de plats €, €€, €€€, et les calories moyennes
     par part. PLATS SEULS : un accompagnement ajouté remplace souvent un féculent dont la part
     dans le chiffre de la source est inconnue (voir kcalTexte). Calculé sur les plats qui ont
     l'information, en disant sur combien — jamais complété par une estimation. */
  function bilanSemaine(s) {
    const plats = s.plan.map((p) => getR(p.nom)).filter(Boolean);
    if (!plats.length) return "";
    const parNiveau = { 1: 0, 2: 0, 3: 0 };
    plats.forEach((r) => { const n = NIVEAU_PRIX[r.cout]; if (n) parNiveau[n]++; });
    const avecPrix = parNiveau[1] + parNiveau[2] + parNiveau[3];
    const sansPrix = plats.length - avecPrix;
    const budget = avecPrix
      ? [1, 2, 3].filter((n) => parNiveau[n]).map((n) =>
          `<span class="niv" data-niveau="${n}"><b>${parNiveau[n]}</b>&nbsp;×&nbsp;${echellePrix(n, `${parNiveau[n]} plat${parNiveau[n] > 1 ? "s" : ""} ${LIBELLE_NIVEAU[n]}`)}</span>`).join("")
        + (sansPrix ? `<span class="nd">${sansPrix} sans prix</span>` : "")
      : `<span class="nd">non donné par les sources</span>`;
    const k = plats.filter((r) => r.kcal_part);
    const moy = k.length ? Math.round(k.reduce((t, r) => t + r.kcal_part, 0) / k.length / 10) * 10 : 0;
    const kcal = k.length
      ? `≈ <b>${moy}</b> kcal par part${k.length < plats.length ? ` <span class="nd">(sur ${k.length} plats)</span>` : ""}`
      : `<span class="nd">non données par les sources</span>`;
    return `<div class="bilan" role="group" aria-label="Résumé de la semaine">
        <div class="bc"><span class="bk">Budget</span>${budget}</div>
        <div class="bc"><span class="bk">Calories moyennes</span>${kcal}</div>
      </div>`;
  }
  /* « ≈ 370 kcal par part » ; avec l'accompagnement pris : le total. SAUF quand il remplace des
     féculents de la recette : le chiffre de la source les compte déjà, et on ne connaît pas leur
     part (pas de calories par ingrédient) — additionner compterait deux fois le féculent. */
  function kcalTexte(r, a, remplaces) {
    if (!r || !r.kcal_part) return "";
    if (!a) return `≈ ${r.kcal_part} kcal par part`;
    if (!a.kcal_part) return `≈ ${r.kcal_part} kcal par part (accompagnement non compté)`;
    if (remplaces && remplaces.length) return `≈ ${r.kcal_part} kcal par part avec ${remplaces.join(", ")} · ${a.nom} à la place : ≈ ${a.kcal_part} kcal`;
    return `≈ ${r.kcal_part + a.kcal_part} kcal par part avec ${a.nom}`;
  }
  function ligneEco(r, a, remplaces) {
    const k = kcalTexte(r, a, remplaces);
    if (!r.cout && !k) return "";
    return `<div class="eco">${prixHtml(r)}${r.cout ? ` ${esc(r.cout)}` : ""}${r.cout && k ? " · " : ""}${esc(k)}</div>`;
  }

  const dureeTotale = (r) => r.total_min || ((r.prep_min || 0) + (r.cuisson_min || 0));
  const detailDuree = (r) => (r.prep_min && r.cuisson_min) ? `prépa ${fmtDuree(r.prep_min)} + cuisson ${fmtDuree(r.cuisson_min)}` : "";
  // modes de cuisson en clair : « four ou air fryer », « cocotte · four »
  function cuissonsTexte(r) {
    const c = (r.cuissons || []).join(" · ");
    if (!r.air_fryer) return c;
    return c ? `${c} ou air fryer` : "air fryer";
  }

  /* Redessiner un onglet referme ses dépliants. On rouvre ceux qui étaient ouverts (repérés par
     data-cle) : sans ça, « Marquer fait » dans un jour déplié refermait aussitôt ce jour. */
  function redessiner(el, html) {
    const ouverts = new Set([...el.querySelectorAll("details[data-cle][open]")].map((d) => d.dataset.cle));
    el.innerHTML = html;
    if (ouverts.size) el.querySelectorAll("details[data-cle]").forEach((d) => { if (ouverts.has(d.dataset.cle)) d.open = true; });
  }

  // entrée d'historique du jour « jour » de la semaine « semaine » (même année ET même numéro)
  const entreeHistorique = (semaine, jour) => {
    const rang = rangDe(semaine);
    return state.historique.find((h) => h.jour === jour && rangDe(h) === rang);
  };
  const estFait = (semaine, jour) => { const h = entreeHistorique(semaine, jour); return !!(h && h.fait); };

  function btnFavori(nom) {
    const on = estFavori(nom);
    return `<button class="fav ${on ? "on" : ""}" data-act="fav" data-nom="${esc(nom)}" title="J'aime — à reproposer" aria-label="${on ? "Retirer des favoris" : "Ajouter aux favoris"}">${icoCoeur(on)}</button>`;
  }

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

  // ingrédients (mis à l'échelle), étapes et lien source d'une recette
  // remplacePar : nom de l'accompagnement pris, qui remplace les féculents de la recette
  function corpsRecette(r, remplacePar) {
    const facteur = PARTS_CIBLE / (r.parts_origine || PARTS_CIBLE);
    const ingr = r.ingredients.map((i) => {
      const q = i.qte ? `${Math.round(i.qte * facteur * 10) / 10}${i.unite ? " " + i.unite : ""} ` : "";
      const rempl = remplacePar && estFeculent(i.nom);
      return `<li${rempl ? ' class="remplace"' : ""}><span class="iq">${esc(q)}</span>${rempl
          ? `<span class="in"><s>${esc(i.nom)}</s> <em>→ ${esc(remplacePar)}</em></span>` : esc(i.nom)}
        <button class="x" data-act="exclure" data-ing="${esc(i.nom)}" title="Je n'aime pas — exclure">✕</button></li>`;
    }).join("");
    const etapes = (r.etapes || []).map((e) => `<li>${esc(e)}</li>`).join("");
    return `<p class="det-t">Pour ${PARTS_CIBLE} parts</p>
        <ul class="ing-list">${ingr}</ul>
        ${etapes ? `<p class="det-t">Préparation</p><ol class="step-list">${etapes}</ol>` : ""}
        ${r.url ? `<a class="src" href="${esc(r.url)}" target="_blank" rel="noopener">Voir sur ${esc(r.source || "le site")} ↗</a>` : ""}`;
  }
  const blocRecette = (r, cle, fin, remplacePar) => `<details class="detail" data-cle="${esc(cle)}">
      <summary>Ingrédients, étapes &amp; source</summary>
      <div class="det-body">${corpsRecette(r, remplacePar)}${fin || ""}</div>
    </details>`;

  // les épingles ne valent que pour la semaine courante : jamais montrées sur S+1 (v36)
  const epingleDuJour = (jour, s) => (!s ? null : nomEpingle(jour, s !== state.semaine));
  // titre du plat d'un jour, ou ce qui le remplace quand le jour est vide
  function nomDuJour(cadre, p, r, s) {
    if (r) return `${p.epingle ? "📌 " : ""}${esc(r.nom)}`;
    const attendu = epingleDuJour(cadre.jour, s);
    return attendu ? `📌 ${esc(attendu)}` : "Aucun plat ne correspond";
  }
  // durée, accompagnement, p'tit plus, lien et boutons du plat d'un jour
  function corpsJour(p, r, cadre, s) {
    const s1 = s !== state.semaine;               // semaine prochaine : rien n'est encore cuisiné
    const fait = !s1 && estFait(s, p.jour);
    const attendu = epingleDuJour(cadre.jour, s);
    let alerte = "";
    if (p.envie && !p.epingle) {
      alerte = `<div class="epingle-info">Ton envie : <strong>${esc(p.envie)}</strong>${p.horsCadre
        ? `<br>⚠️ Hors du style prévu (${esc(p.horsCadre)}) : aucun plat de ce style n'en contient.` : ""}</div>`;
    } else if (!p.epingle && attendu) {
      alerte = `<div class="epingle-info">📌 Tu as demandé <strong>${esc(attendu)}</strong> pour ce jour.
          En attendant qu'il soit ajouté à ta base, voici une proposition.
          <br><button class="linkbtn" data-act="desepingler" data-jour="${esc(p.jour)}">Annuler la demande</button></div>`;
    } else if (p.epingle) {
      alerte = `<div class="epingle-info">Plat imposé par toi pour ce jour.
          ${p.horsCadre ? `<br>⚠️ Hors du style prévu (${esc(p.horsCadre)}).` : ""}
          ${p.exclusAlerte ? `<br>⚠️ Contient : ${esc(p.exclusAlerte.join(", "))} — normalement exclu.` : ""}
          ${p.protAlerte ? `<br>⚠️ ${esc(p.protAlerte)} — deux jours de suite.` : ""}</div>`;
    } else if (p.protAlerte) {
      alerte = `<div class="epingle-info">⚠️ ${esc(p.protAlerte)} — deux jours de suite.</div>`;
    }
    const detail = detailDuree(r);
    const plus = [r.bonus ? `Le p'tit plus : ${esc(r.bonus)}` : "", esc(cuissonsTexte(r))].filter(Boolean).join(" · ");
    const side = sideDe(p, r), pris = sidePris(p, r);
    const feculents = side ? r.ingredients.filter((i) => estFeculent(i.nom)).map((i) => i.nom) : [];
    return `${alerte}
      <div class="duree"><b>${fmtDuree(dureeTotale(r))}</b>${detail ? `<span>${detail}</span>` : ""}</div>
      ${side ? `<div class="avec">${pris ? "avec" : "idée d'accompagnement :"} <a href="${esc(side.url)}" target="_blank" rel="noopener">${esc(side.nom)}</a>
        <button class="btn-side" data-act="regen-side" data-jour="${esc(p.jour)}" title="Changer l'accompagnement" aria-label="Changer l'accompagnement">↻</button></div>
        <div class="avec-choix"><button class="pris${pris ? " on" : ""}" data-act="choisir-side" data-jour="${esc(p.jour)}" aria-pressed="${pris}">${pris ? `${icoCoche}Dans les courses` : "+ Ajouter aux courses"}</button>${feculents.length
          ? `<span class="remplace-info">${pris ? "remplace" : "à la place de"} : ${esc(feculents.join(", "))}</span>` : ""}</div>` : ""}
      ${ligneEco(r, pris ? accDe(side) : null, feculents)}
      ${plus ? `<div class="plus">${plus}</div>` : ""}
      ${r.url ? `<a class="bt" href="${esc(r.url)}" target="_blank" rel="noopener">Voir la recette sur ${esc(r.source || "le site")} ↗</a>` : ""}
      <div class="actions">
        ${p.epingle
          ? `<button data-act="desepingler" data-jour="${esc(p.jour)}">Ne plus imposer</button>`
          : `<button data-act="regen-day" data-jour="${esc(p.jour)}">↻ Changer</button>`}
        ${s1 ? "" : `<button class="fait ${fait ? "done" : ""}" data-act="fait" data-jour="${esc(p.jour)}" data-nom="${esc(r.nom)}">${icoCoche}${fait ? "Fait" : "Marquer fait"}</button>`}
        ${btnFavori(r.nom)}
      </div>
      ${blocRecette(r, (s1 ? "ing-s1-" : "ing-") + p.jour, `<p class="style-jour">Style du jour : ${esc(cadre.note)}</p>
        <div class="note-row">Ta note : ${etoiles(r.nom)}</div>`, pris ? side.nom : null)}`;
  }
  // jour sans plat : demande en attente, ou aucun plat possible
  function corpsJourVide(cadre, s) {
    if (epingleDuJour(cadre.jour, s)) {
      return `<div class="epingle-info">Tu as demandé ce plat pour ce jour. Il apparaîtra ici dès qu'il sera ajouté à ta base.</div>
        <div class="actions"><button data-act="desepingler" data-jour="${esc(cadre.jour)}">Annuler la demande</button></div>`;
    }
    return `<p class="constraint">Aucune recette de la base ne tient ce critère (temps trop court, ou tout est exclu). Choisis un autre style pour ce jour dans Réglages, ou ajoute une envie pour enrichir la base.</p>`;
  }
  function platDuJour(s, cadre) {
    const p = s.plan.find((x) => x.jour === cadre.jour);
    return { p, r: p && getR(p.nom) };
  }
  // « Volaille », « en attente » ou le style du jour quand il n'y a pas de plat
  const quoiDuJour = (cadre, r, s) => r ? r.cat : (epingleDuJour(cadre.jour, s) ? "en attente" : cadre.note);

  function blocCeSoir(i, sem, s, cadres) {
    const cadre = cadres[i];
    const { p, r } = platDuJour(s, cadre);
    return `<section class="ce-soir${r ? "" : " vide"}">
        <div class="kk">Ce soir · ${JOURS_LONG[i]} ${quantieme(sem, i)} · ${esc(quoiDuJour(cadre, r, s))}</div>
        <div class="nm">${nomDuJour(cadre, p, r, s)}</div>
        ${r ? corpsJour(p, r, cadre, s) : corpsJourVide(cadre, s)}
      </section>`;
  }
  // un autre jour : une ligne de menu, qui se déplie sur la même fiche que « ce soir »
  function ligneJour(i, sem, s, cadres) {
    const cadre = cadres[i];
    const { p, r } = platDuJour(s, cadre);
    const l2 = r ? [sidePris(p, r) ? `avec ${esc(p.side.nom)}` : "", fmtDuree(dureeTotale(r))].filter(Boolean).join(" — ")
      + (prixHtml(r) ? " · " + prixHtml(r) : "") : "";
    // S+1 a ses propres clés de dépliage : sinon ouvrir lundi S+1 rouvrait lundi de cette semaine
    const cle = (s === state.semaine ? "jour-" : "s1-jour-") + cadre.jour;
    return `<details class="jour-ligne${r ? "" : " vide"}" data-cle="${esc(cle)}">
        <summary><div class="dy">${JOURS_LONG[i]} ${quantieme(sem, i)} · ${esc(quoiDuJour(cadre, r, s))}</div>
          <div class="n">${nomDuJour(cadre, p, r, s)}</div>${l2 ? `<div class="l2">${l2}</div>` : ""}</summary>
        <div class="fiche-int">${r ? corpsJour(p, r, cadre, s) : corpsJourVide(cadre, s)}</div>
      </details>`;
  }

  /* Onglet Semaine (v36) : « Cette semaine » ou « Semaine prochaine ». Réglage d'affichage de
     l'écran seulement (pas enregistré) : l'app s'ouvre toujours sur la semaine en cours. */
  let vueSuivante = false;
  const semaineVue = () => (vueSuivante ? semaineSuivante() : state.semaine);
  const choixSemaine = () => `<div class="sem-choix" role="group" aria-label="Semaine affichée">
      <button data-act="vue-semaine" data-val="0" aria-pressed="${!vueSuivante}">Cette semaine</button>
      <button data-act="vue-semaine" data-val="1" aria-pressed="${vueSuivante}">Semaine prochaine</button>
    </div>`;

  function renderSuivante(el) {
    const s = semaineSuivante() || genererSuivante();
    const sem = semaineDuRang(rangDe(s));
    const cadres = getCadre();
    const html = enTete("Semaine prochaine",
      `<strong>Semaine ${sem.num}</strong> · ${esc(plageSemaine(sem.an, sem.num))} · ${PARTS_CIBLE} parts/plat`, "week-head")
      + choixSemaine()
      + bilanSemaine(s)
      + `<p class="hint">Préparé d'avance : ce menu deviendra celui de la semaine lundi. Pour acheter
          d'avance, choisis les jours « S+1 » dans Courses.</p>`
      + `<div class="menu">${cadres.map((c, i) => ligneJour(i, sem, s, cadres)).join("")}</div>`
      + `<div class="pied"><button id="btn-gen" class="pill">↻ Générer un nouveau menu</button></div>`;
    redessiner(el, html);
  }

  function renderSemaine() {
    const el = document.getElementById("view-semaine");
    // Une nouvelle semaine = un nouveau menu. Sans ce contrôle l'app restait affichée sur
    // la semaine précédente indéfiniment (et les épingles périmées n'étaient jamais purgées,
    // puisque c'est generer() qui s'en charge).
    if (!state.semaine || !state.semaine.plan.length || rangDe(state.semaine) !== rangCourant()) {
      generer();
      vueSuivante = false;                     // nouvelle semaine : on montre celle qui commence
    }
    if (vueSuivante) return renderSuivante(el);
    const s = state.semaine;
    const sem = semaineDuRang(rangDe(s));
    // on parcourt le CADRE (et non le plan) pour rendre visible un jour sans plat possible
    const cadres = getCadre();
    // la semaine affichée est toujours la semaine courante (contrôle ci-dessus) : son jour
    // d'aujourd'hui est donc celui de l'horloge
    const auj = indexAujourdhui();
    let html = enTete("Menu de la semaine",
      `<strong>Semaine ${sem.num}</strong> · ${esc(plageSemaine(sem.an, sem.num))} · ${PARTS_CIBLE} parts/plat`, "week-head");
    html += choixSemaine();
    html += bilanSemaine(s);
    html += blocCeSoir(auj, sem, s, cadres);
    if (auj < 6) {
      html += `<div class="orn orn-sec"><i></i>La suite<i></i></div>
        <div class="menu">${cadres.slice(auj + 1).map((c, k) => ligneJour(auj + 1 + k, sem, s, cadres)).join("")}</div>`;
    }
    if (auj > 0) {
      const resume = auj === 1 ? "Lundi : 1 plat déjà passé" : `Lundi → ${JOURS_LONG[auj - 1].toLowerCase()} : ${auj} plats déjà passés`;
      html += `<details class="passes" data-cle="passes"><summary>${resume}</summary>
        <div class="menu">${cadres.slice(0, auj).map((c, k) => ligneJour(k, sem, s, cadres)).join("")}</div></details>`;
    }
    html += `<div class="pied"><button id="btn-gen" class="pill">↻ Générer un nouveau menu</button></div>`;
    redessiner(el, html);
  }

  /* Cases à cocher : une par article ET PAR JOUR (v33). Avec le filtre par jour, l'ail acheté
     pour mercredi ne doit pas paraître acheté pour jeudi. Une ligne est cochée quand toutes
     ses cases visibles le sont ; la cocher les coche toutes. L'écran ET la liste copiée
     calculent ces identifiants de la même façon. */
  /* v36 : chaque case porte le RANG de sa semaine. Avant, « ail · Lun » coché un lundi restait
     coché tous les lundis suivants (rien ne remettait la liste à zéro). Avec le rang, une case
     cochée pour lundi S+1 reste cochée quand S+1 devient la semaine courante. */
  const rangDuJour = (k) => rangDe(state.semaine) + (estJourS1(k) ? 1 : 0);
  const idArticle = (cle, k) => norm("art|" + cle + "|" + rangDuJour(k) + "|" + jourDe(k));
  const idsArticle = (it) => it.jours.map((j) => idArticle(it.cle, j));
  const idPlus = (plat, rang) => norm("plus|" + rang + "|" + plat);
  const estCoche = (id) => !!state.coursesCochees[id];
  const toutCoche = (ids) => ids.length > 0 && ids.every(estCoche);
  /** Oublie les cases des semaines passées, et celles d'avant la v36 (sans semaine). Locale :
      si l'autre téléphone les renvoie, elles n'apparaissent nulle part et repartent ici. */
  function purgerCourses(rang) {
    const cc = state.coursesCochees || {};
    let change = false;
    Object.keys(cc).forEach((id) => {
      const m = id.split("|");
      const r = m[0] === "art" && m.length === 4 ? +m[2] : (m[0] === "plus" && m.length === 3 ? +m[1] : NaN);
      if (!(r >= rang)) { delete cc[id]; change = true; }
    });
    if (change) localStorage.setItem(STORE, JSON.stringify(state));
  }

  /* Filtre des courses par jour (v33) : pour ne pas tout acheter d'un coup. Réglage de CET
     appareil (chacun fait ses courses), oublié au changement de semaine. null = toute la semaine. */
  const FILTRE_CLE = "mims_courses_jours";
  const JOURS_S1 = JOURS.map((j) => j + "+1");
  // une sélection qui couvre exactement cette semaine = pas de filtre
  const estToutCetteSemaine = (sel) => sel.length === JOURS.length && JOURS.every((j) => sel.includes(j));
  function joursFiltres() {
    try {
      const f = JSON.parse(localStorage.getItem(FILTRE_CLE));
      if (f && state.semaine && f.rang === rangDe(state.semaine) && Array.isArray(f.jours)) {
        const permis = semaineSuivante() ? JOURS.concat(JOURS_S1) : JOURS;
        const j = permis.filter((x) => f.jours.includes(x));
        if (j.length && !estToutCetteSemaine(j)) return j;
      }
    } catch (e) { /* stockage illisible : toute la semaine */ }
    return null;
  }
  // « Tout » remet la semaine ; depuis « Tout », un jour touché devient le seul choisi ;
  // ensuite chaque jour s'ajoute ou se retire. « S+1 » ajoute ou retire toute la semaine
  // prochaine en gardant le reste (depuis « Tout » : les deux semaines entières).
  function filtrerJour(j) {
    const avant = joursFiltres();
    let sel;
    if (j === "tous") sel = null;
    else if (j === "s1") {
      const base = avant || JOURS.slice();
      const toutS1 = JOURS_S1.every((k) => base.includes(k));
      sel = toutS1 ? base.filter((k) => !estJourS1(k)) : base.concat(JOURS_S1.filter((k) => !base.includes(k)));
    } else sel = !avant ? [j] : avant.includes(j) ? avant.filter((x) => x !== j) : avant.concat(j);
    if (sel && (!sel.length || estToutCetteSemaine(sel))) sel = null;
    if (sel) sel.sort((a, b) => ordreJour(a) - ordreJour(b));
    try {
      if (sel) localStorage.setItem(FILTRE_CLE, JSON.stringify({ rang: rangDe(state.semaine), jours: sel }));
      else localStorage.removeItem(FILTRE_CLE);
    } catch (e) { /* stockage indisponible : le filtre ne survit pas au rechargement */ }
  }
  // « p'tits plus » des plats des jours choisis
  const plusDesJours = (jours) => platsDesJours(jours)
    .map(({ cle, p }) => ({ r: getR(p.nom), rang: rangDuJour(cle) })).filter((x) => x.r && x.r.bonus)
    .map((x) => ({ plat: x.r.nom, quoi: x.r.bonus, rang: x.rang }));

  function renderCourses() {
    const el = document.getElementById("view-courses");
    if (!state.semaine) {
      el.innerHTML = enTete("Liste de courses") + `<p class="empty">Génère d'abord un menu dans l'onglet Semaine.</p>`;
      return;
    }
    const filtre = joursFiltres();
    const acc = listeCourses(filtre);
    const rayons = ORDRE_RAYONS.filter((r) => acc[r]).concat(Object.keys(acc).filter((r) => !ORDRE_RAYONS.includes(r)));
    const choisi = (k) => !!filtre && filtre.includes(k);
    const s1 = semaineSuivante();
    // 2e rangée (v36) : les jours de la semaine prochaine, si elle est préparée
    const rangeeS1 = s1
      ? `<div class="jours-filtre s1" role="group" aria-label="Jours de la semaine prochaine à acheter">
          <button data-act="filtre-jour" data-jour="s1" aria-pressed="${JOURS_S1.every(choisi)}" title="Toute la semaine prochaine (semaine ${s1.num})">S+1</button>${JOURS.map((j) =>
            `<button data-act="filtre-jour" data-jour="${j}+1" aria-pressed="${choisi(j + "+1")}" aria-label="${j} de la semaine prochaine">${j}</button>`).join("")}
        </div>`
      : `<p class="hint s1-vide">Pour acheter aussi pour la semaine prochaine :
          <button class="lien" data-act="preparer-suivante">préparer son menu ›</button></p>`;
    const puces = `<div class="jours-filtre" role="group" aria-label="Jours à acheter">
        <button data-act="filtre-jour" data-jour="tous" aria-pressed="${!filtre}">Tout</button>${JOURS.map((j) =>
          `<button data-act="filtre-jour" data-jour="${j}" aria-pressed="${choisi(j)}">${j}</button>`).join("")}
      </div>${rangeeS1}`;
    let n = 0, html = "";
    rayons.forEach((rayon) => {
      const items = Object.values(acc[rayon]).sort((a, b) => a.nom.localeCompare(b.nom));
      html += `<h3 class="cat-title orn"><i></i>${esc(rayon)}<i></i></h3><div class="shop-list">`;
      items.forEach((it) => {
        n++;
        const ids = idsArticle(it);
        const ok = toutCoche(ids);
        html += `<label class="shop-row ${ok ? "checked" : ""}">
          <input type="checkbox" data-act="course" data-ids="${esc(JSON.stringify(ids))}" ${ok ? "checked" : ""} />
          <span class="sn">${esc(it.nom)}</span>
          <span class="sp">${esc(it.jours.map(libJour).join(", ") + " — " + it.plats.join(" · "))}</span>
        </label>`;
      });
      html += `</div>`;
    });
    // section optionnelle : les « p'tits plus » qui subliment les plats
    const plus = plusDesJours(filtre);
    if (plus.length) {
      html += `<h3 class="cat-title orn"><i></i>Pour sublimer (optionnel)<i></i></h3>
        <p class="hint">Pas indispensable — juste le petit truc en plus.</p><div class="shop-list">`;
      plus.forEach((it) => {
        const id = idPlus(it.plat, it.rang);
        const ok = estCoche(id);
        html += `<label class="shop-row optionnel ${ok ? "checked" : ""}">
          <input type="checkbox" data-act="course" data-ids="${esc(JSON.stringify([id]))}" ${ok ? "checked" : ""} />
          <span class="sn">${esc(it.quoi)}</span>
          <span class="sp">${esc(it.plat)}</span>
        </label>`;
      });
      html += `</div>`;
    }
    if (!n) html = `<p class="empty">Rien à acheter pour ${esc(filtre ? filtre.map(libJour).join(", ") : "cette semaine")}.</p>` + html;
    const sem = semaineDuRang(rangDe(state.semaine));
    // « Copier » et « Tout décocher » restent collés en bas de l'écran : avant, il fallait
    // descendre au bout des ~70 articles pour les atteindre
    el.innerHTML = enTete("Liste de courses", `<strong>${n} articles</strong> · ${filtre ? esc(filtre.map(libJour).join(", ")) : `semaine ${sem.num}`}`, "week-head")
      + puces
      + `<p class="hint">Choisis les jours à acheter, puis coche ce que tu as déjà. Les quantités sont dans chaque recette (onglet Semaine).</p>`
      + html
      + `<div class="barre-bas"><button id="btn-copy" class="cp">${icoCopier}Copier la liste</button>
          <button id="btn-reset-courses" class="lien">Tout décocher</button></div>`;
  }

  /** Texte de « Copier la liste » : seulement ce qui RESTE à acheter pour les jours choisis.
      L'écran dit « Coche ce que tu as déjà » — recopier aussi les articles cochés les
      renvoyait dans le panier. Renvoie "" quand tout est coché. */
  function texteCourses() {
    const filtre = joursFiltres();
    const acc = listeCourses(filtre);
    let out = `🛒 Liste de courses${filtre ? " — " + filtre.map(libJour).join(", ") : ""}\n`, n = 0;
    ORDRE_RAYONS.filter((r) => acc[r]).forEach((rayon) => {
      const reste = Object.values(acc[rayon]).filter((it) => !toutCoche(idsArticle(it)))
        .sort((a, b) => a.nom.localeCompare(b.nom));
      if (!reste.length) return;
      out += `\n— ${rayon} —\n`;
      reste.forEach((it) => { out += `• ${it.nom}\n`; n++; });
    });
    const plus = plusDesJours(filtre).filter((it) => !estCoche(idPlus(it.plat, it.rang)));
    if (plus.length) {
      out += `\n— Pour sublimer (optionnel) —\n`;
      plus.forEach((it) => { out += `• ${it.quoi} (${it.plat})\n`; n++; });
    }
    return n ? out : "";
  }

  function renderRecettes() {
    const el = document.getElementById("view-recettes");
    const ancien = document.getElementById("search");
    const recherche = ancien ? ancien.value : "";
    const cats = [...new Set(RECIPES.map((r) => r.cat))];
    const dispo = RECIPES.filter((r) => !estExclu(r)).length;
    let html = enTete("Le carnet de recettes", `${RECIPES.length} recettes · ${dispo} disponibles`)
      + `<p class="hint">€ bon marché · €€ moyen · €€€ assez cher. Prix et calories par part relevés sur Marmiton, quand le site les donne.</p>`
      + `<label class="recherche">${icoLoupe}<input id="search" type="search" autocomplete="off" placeholder="Chercher une recette, un ingrédient…" /></label>`;
    cats.forEach((cat) => {
      const liste = RECIPES.filter((r) => r.cat === cat);
      html += `<h3 class="cat-title orn"><i></i>${esc(cat)} · ${liste.length}<i></i></h3><div class="cards">`;
      liste.forEach((r) => {
        const ex = estExclu(r);
        const meta = [fmtDuree(dureeTotale(r)), ...(r.cuissons || []), r.air_fryer ? "air fryer" : "", r.saison || ""].filter(Boolean).join(" · ");
        const detail = detailDuree(r);
        html += `<div class="recipe ${ex ? "excluded" : ""}" data-search="${esc(norm(r.nom + " " + r.ingredients.map((i) => i.nom).join(" ") + " " + (r.tags || []).join(" ")))}">
          <details data-cle="rec-${esc(r.nom)}">
            <summary><span class="n">${esc(r.nom)}${ex ? `<span class="tag">exclue</span>` : ""}</span><span class="m">${prixHtml(r)}${prixHtml(r) ? " " : ""}${esc(meta)}${r.kcal_part ? esc(` · ≈ ${r.kcal_part} kcal`) : ""}</span></summary>
            <div class="det-body">
              ${detail ? `<p class="plus">${fmtDuree(dureeTotale(r))} : ${detail}</p>` : ""}
              ${r.bonus ? `<p class="plus">Le p'tit plus : ${esc(r.bonus)}</p>` : ""}
              ${corpsRecette(r)}
            </div>
          </details>
          ${btnFavori(r.nom)}
        </div>`;
      });
      html += `</div>`;
    });
    redessiner(el, html);
    const s = document.getElementById("search");
    const filtrer = () => {
      const q = norm(s.value);
      el.querySelectorAll(".recipe").forEach((c) => { c.style.display = c.dataset.search.includes(q) ? "" : "none"; });
      el.querySelectorAll(".cat-title").forEach((t) => {
        const vis = [...t.nextElementSibling.querySelectorAll(".recipe")].some((c) => c.style.display !== "none");
        t.style.display = vis ? "" : "none";
      });
    };
    s.addEventListener("input", filtrer);
    // un redessin (cœur, note, exclusion) ne doit pas effacer la recherche en cours
    if (recherche) { s.value = recherche; filtrer(); }
  }

  function renderHistorique() {
    const el = document.getElementById("view-historique");
    const faits = state.historique.filter((h) => h.fait);
    if (!faits.length) {
      el.innerHTML = enTete("Historique") + `<p class="empty">Aucun plat cuisiné pour l'instant.<br>Touche « Marquer fait » sur un plat de la semaine.</p>`;
      return;
    }
    const notes = faits.map((h) => state.notes[h.nom] || 0).filter((n) => n > 0);
    const moy = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : null;
    let html = enTete("Historique",
      `<strong>${faits.length} plat${faits.length > 1 ? "s" : ""} cuisiné${faits.length > 1 ? "s" : ""}</strong>${moy ? ` · note moyenne ${moy}/5` : ""}`, "week-head")
      + `<p class="hint">Un plat cuisiné ne revient pas avant 3 semaines. Les mieux notés reviennent en priorité.</p>`;
    // groupé par semaine (année comprise : deux « semaine 40 » ne se mélangent pas), plus récent d'abord
    const parSem = {};
    faits.forEach((h) => { const r = rangDe(h); if (r !== null) (parSem[r] = parSem[r] || []).push(h); });
    Object.keys(parSem).map(Number).sort((a, b) => b - a).forEach((rang) => {
      const sem = semaineDuRang(rang);
      html += `<h3 class="cat-title orn"><i></i>Semaine ${sem.num} · ${esc(plageSemaine(sem.an, sem.num))}<i></i></h3><div class="cards">`;
      parSem[rang].sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour)).forEach((h) => {
        const r = getR(h.nom);
        const i = JOURS.indexOf(h.jour);
        html += `<div class="card hist">
          <div class="dd"><small>${esc(h.jour.toUpperCase())}</small><span>${i >= 0 ? quantieme(sem, i) : ""}</span></div>
          <div class="tx">
            <div class="n">${esc(h.nom)}</div>
            <div class="note-row">${etoiles(h.nom)}</div>
            <div class="liens">
              ${r && r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Voir la recette ↗</a>` : ""}
              <button data-act="del-hist" data-nom="${esc(h.nom)}" data-rang="${rang}">Retirer</button>
            </div>
          </div>
          ${btnFavori(h.nom)}
        </div>`;
      });
      html += `</div>`;
    });
    el.innerHTML = html;
  }

  /* ---------- Réglages : un sommaire, puis une page par section ----------
     Les 8 sections tenaient sur une seule page très longue. Le sommaire montre ce qui est
     réglé dans chacune ; un toucher ouvre la section, « ‹ Réglages » y revient. */
  let sectionReglages = null;     // section ouverte (null = le sommaire)
  // « 💪 Rapide sport (protéiné, ≤30 min) » → « Rapide sport »
  const courtStyle = (label) => label.replace(/^[^\p{L}]+/u, "").split(/ \(| \//)[0].trim();
  const nbDisponibles = () => RECIPES.filter((r) => !estExclu(r)).length;
  const confPartage = () => { const sc = window.__sync ? window.__sync.conf() : null; return sc && sc.url && sc.token ? sc : null; };
  const nomsEnvies = () => state.envies.map((e) => (e && e.nom ? e.nom : e));

  function sectionCadre() {
    let h = `<p class="hint">Choisis le style de plat pour chaque jour (sport = express, plus de temps = mijoté…). Le menu se génère selon TES choix.</p>
      <div class="jours-editor">`;
    JOURS.forEach((j, i) => {
      const cur = (state.cadreJours || CADRE_JOURS_DEFAUT)[i];
      h += `<div class="jour-row"><span class="jour">${esc(j)}</span>
        <select data-act="cadre-jour" data-i="${i}">
          ${STYLES.map((s) => `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${esc(s.label)}</option>`).join("")}
        </select></div>`;
    });
    h += `</div><p class="hint">Ou pars d'un modèle tout fait :</p><div class="preset-quick">`;
    (window.CADRE_PRESETS || []).forEach((p) => {
      h += `<button class="preset-mini" data-act="preset" data-id="${esc(p.id)}">${esc(p.nom)}</button>`;
    });
    return h + `</div>`;
  }
  function sectionPromos() {
    let h = `<p class="hint">Tape ce qui est en promo (ex : cabillaud, poulet). Le prochain menu généré privilégiera les recettes qui l'utilisent.</p>
      <div class="add-row">
        <input id="new-promo" placeholder="Ex. : cabillaud" />
        <button id="btn-add-promo">Ajouter</button>
      </div>
      <div class="chips">`;
    state.promos.forEach((e, i) => {
      h += `<span class="chip promo">${esc(e)}<button data-act="unpromo" data-i="${i}" title="Retirer">✕</button></span>`;
    });
    return h + `</div>`;
  }
  function sectionExclus() {
    let h = `<p class="hint">Une recette contenant un de ces ingrédients ne sera jamais proposée. ${nbDisponibles()}/${RECIPES.length} recettes disponibles.</p>
      <div class="add-row">
        <input id="new-ex" placeholder="Ex. : coriandre" />
        <button id="btn-add-ex">Ajouter</button>
      </div>
      <div class="chips">`;
    state.exclusions.forEach((e, i) => {
      h += `<span class="chip">${esc(e)}<button data-act="unexclude" data-i="${i}" title="Retirer">✕</button></span>`;
    });
    return h + `</div>`;
  }
  function sectionFavoris() {
    let h = `<p class="hint">Les recettes que tu aimes (cœur sur une carte) reviennent plus souvent.</p>`;
    if (!state.favoris.length) return h + `<p class="empty">Aucun favori. Touche le cœur sur une recette.</p>`;
    h += `<div class="chips">`;
    state.favoris.forEach((nom) => {
      h += `<span class="chip fav-chip">${esc(nom)}<button data-act="fav" data-nom="${esc(nom)}" title="Retirer">✕</button></span>`;
    });
    return h + `</div>`;
  }
  /* Propositions sous le champ des envies (v36) : les plats de la base dont le TITRE ou un
     INGRÉDIENT correspond au texte tapé. Un toucher met le plat dans le champ. */
  function propositionsEnvie(texte) {
    const t = (texte || "").trim();
    if (cleIngr(t).length < 3) return "";
    const d = norm(t);
    const parTitre = RECIPES.filter((r) => norm(r.nom).includes(d));
    const parIngr = recettesAvec(t).filter((r) => !parTitre.includes(r));
    const tous = parTitre.concat(parIngr).filter((r) => !estExclu(r));
    if (!tous.length) return `<p class="hint">Rien dans ta base pour « ${esc(t)} » : l'envie sera notée pour l'ajouter.</p>`;
    const titre = parIngr.length
      ? `${tous.length} plat${tous.length > 1 ? "s" : ""} avec « ${esc(t)} » dans ta base :`
      : `Dans ta base :`;
    return `<p class="hint">${titre}</p><div class="chips props">${tous.slice(0, 8).map((r) =>
      `<button class="chip prop" data-act="envie-prop" data-nom="${esc(r.nom)}">${esc(r.nom)} <em>${esc(r.cat)}</em></button>`).join("")}</div>`;
  }
  /* ---------- suivi des envies par le guetteur du PC (v38) ----------
     guetteur.py écrit sur le hub, champ « guetteur » (lecture seule pour les téléphones, voir sync.js), où
     en est chaque envie de PLAT : en_cours · attente · ajoutee · introuvable · refusee · erreur, et quand il
     a regardé les envies pour la dernière fois (« passe »). */
  const suiviPC = () => (state.guetteur && typeof state.guetteur === "object" ? state.guetteur : null);
  const suiviEnvie = (nom) => { const g = suiviPC(); return g && g.envies ? g.envies[norm(nom)] || null : null; };
  function quandEssai(ms) {
    if (!ms) return "plus tard";
    const d = new Date(ms), auj = new Date();
    const h = `${d.getHours()} h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`;
    const ecart = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
      new Date(auj.getFullYear(), auj.getMonth(), auj.getDate())) / JOUR_MS);
    if (ecart <= 0) return `aujourd'hui vers ${h}`;
    if (ecart === 1) return `demain vers ${h}`;
    return `le ${d.getDate()}/${d.getMonth() + 1} vers ${h}`;
  }
  function depuis(ms) {
    const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    if (min < 24 * 60) return `il y a ${Math.floor(min / 60)} h`;
    return `le ${new Date(ms).toLocaleDateString("fr-FR")}`;
  }
  // texte (et classe) du suivi d'une envie de plat ; maj = recette à récupérer par une mise à jour
  // jour : celui de l'envie. Une recette qui contient un ingrédient exclu n'est jamais tirée au sort : elle
  // n'arrive au menu qu'imposée sur un jour (v41, le guetteur la propose quand il n'a rien trouvé d'autre).
  function statutEnvie(nom, jour) {
    const r = trouverRecette(nom);
    const s = suiviEnvie(nom);
    if (r) {
      let txt = s && s.etat === "ajoutee" ? `ajoutée par le PC : ${r.nom}` : `dans ta base : ${r.nom}`;
      const ex = ingredientsExclus(r);
      if (ex.length) {
        txt += ` · ⚠️ contient ${ex.join(", ")}, normalement exclu${ex.length > 1 ? "s" : ""} · ` + (jour
          ? `imposée quand même ${JOURS_LONG[JOURS.indexOf(jour)].toLowerCase()}`
          : "pour l'avoir au menu, ajoute-la de nouveau avec un jour");
      }
      return { cls: "ok", txt };
    }
    if (!s) return { cls: "", txt: "le PC ne l'a pas encore cherchée" };
    const essai = `nouvel essai ${quandEssai(s.prochain)}`;
    switch (s.etat) {
      case "en_cours": return { cls: "encours", txt: `le PC la cherche…${s.detail ? " " + s.detail : ""}` };
      case "attente": return { cls: "", txt: s.detail || "le PC réessaie à sa prochaine passe" };
      case "ajoutee": return { cls: "ok", txt: `ajoutée par le PC : ${s.recette || nom}, pas encore dans cette version de l'app`, maj: true };
      case "introuvable": return { cls: "ko", txt: `introuvable sur Marmiton, Saveurs et le Journal des Femmes · ${essai}` };
      case "refusee": return { cls: "ko", txt: `trouvée mais refusée${s.detail ? ` (${s.detail})` : ""} · ${essai}` };
      default: return { cls: "ko", txt: `erreur pendant la recherche · ${essai}` };
    }
  }
  /** Recettes ajoutées par le PC mais absentes de cette version de l'app : à récupérer. */
  function ajoutsEnAttente() {
    return state.envies.filter((e) => !estEnvieIngr(e)).map((e) => (e && e.nom ? e.nom : e)).filter((nom) => {
      const s = suiviEnvie(nom);
      return !!s && s.etat === "ajoutee" && Date.now() - (s.t || 0) < 7 * JOUR_MS && !trouverRecette(nom);
    });
  }
  // la recette ajoutée par le PC arrive toute seule : mise à jour de l'app (au plus un essai toutes les 2 min)
  let dernierEssaiMaj = 0;
  function recupererAjouts() {
    if (!ajoutsEnAttente().length || Date.now() - dernierEssaiMaj < 120000) return;
    dernierEssaiMaj = Date.now();
    forcerMiseAJour();
  }
  // en tête de Mes envies : quand le PC les a regardées
  function enteteSuivi() {
    if (!state.envies.some((e) => !estEnvieIngr(e))) return "";
    const g = suiviPC();
    if (!g || !g.passe) {
      return `<p class="hint suivi-pc">Le PC n'a pas encore lu tes envies de plats. Il les lit toutes les 30 min quand il
        est allumé, si « Partage à deux » est activé ici.</p>`;
    }
    const muet = Date.now() - g.passe > 2 * 3600000;
    return `<p class="hint suivi-pc">Le PC a regardé tes envies ${esc(depuis(g.passe))}.${muet
      ? " Il ne les a pas relues depuis plus de 2 h : est-il allumé ?" : ""}</p>`;
  }
  const ligneEnvie = (i, nom, meta, s) => `<div class="envie-l">
      <div class="el-t"><span class="el-n">${esc(nom)}</span>${meta ? ` <em>${esc(meta)}</em>` : ""}</div>
      <button class="x" data-act="del-envie" data-i="${i}" title="Retirer" aria-label="Retirer ${esc(nom)}">✕</button>
      ${s ? `<div class="el-s ${s.cls}">${esc(s.txt)}${s.maj ? ` <button class="lien" data-act="maj-app">mettre l'app à jour</button>` : ""}</div>` : ""}
    </div>`;

  function sectionEnvies() {
    let h = `<p class="hint">Un plat que tu aimerais voir ajouté, ou un <strong>ingrédient</strong> dont tu as
        envie (ex. : poireaux) : l'app met au menu un plat qui en contient, le jour choisi. Pour un plat,
        tu peux coller le lien de la recette. Un jour déjà passé vise la semaine prochaine.</p>
      <div class="add-row">
        <input id="new-envie" placeholder="Un plat ou un ingrédient" autocomplete="off" />
      </div>
      <div id="envie-props"></div>
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
      ${enteteSuivi()}
      <div class="envies-liste">`;
    const jourLong = (j) => JOURS_LONG[JOURS.indexOf(j)].toLowerCase();
    state.envies.forEach((e, i) => {
      if (estEnvieIngr(e)) {
        // envie d'ingrédient : son jour, et la semaine qu'elle vise (l'app la sert seule, pas le PC)
        const quand = [e.jour ? jourLong(e.jour) : "", rangDe(e) === rangCourant() ? "cette semaine" : "semaine prochaine"].filter(Boolean).join(" · ");
        h += ligneEnvie(i, e.nom, `ingrédient · ${quand}`, null);
        return;
      }
      // une envie de plat est soit un simple texte (ancien format), soit { nom, url, jour }
      const nom = e && e.nom ? e.nom : e;
      const jour = e && e.jour ? e.jour : null;
      const s1 = !!(e && typeof e === "object" && rangDe(e) === rangCourant() + 1);
      const meta = ["plat", jour ? `pour ${jourLong(jour)}` : "", s1 ? "semaine prochaine" : "", e && e.url ? "lien fourni" : ""].filter(Boolean).join(" · ");
      // même recherche souple que le menu (trouverRecette) : « Tendron de veau » est bien dans la base
      h += ligneEnvie(i, nom, meta, statutEnvie(nom, jour));
    });
    return h + `</div>`;
  }
  function sectionPartage() {
    const sc = confPartage();
    if (sc) {
      return `<p class="hint">Cet appareil partage son menu, ses courses et ses notes.
          ${sc.erreur ? `<br><strong>⚠️ Dernière synchro en échec : ${esc(sc.erreur)}</strong>` : ""}
          ${sc.derniere ? `<br>Dernière synchro : ${new Date(sc.derniere).toLocaleString("fr-FR")}` : ""}</p>
        <div class="actions">
          <button id="btn-sync-now">↻ Synchroniser</button>
          <button id="btn-sync-off">Se déconnecter</button>
        </div>`;
    }
    return `<p class="hint">Colle ici l'adresse du hub et le mot de passe pour partager le menu et la liste de courses avec Marine. Les deux téléphones doivent saisir exactement les mêmes.</p>
      <div class="add-row"><input id="sync-url" placeholder="Adresse du hub (…/exec)" /></div>
      <div class="add-row">
        <input id="sync-token" placeholder="Mot de passe partagé" />
        <button id="btn-sync-on">Connecter</button>
      </div>`;
  }
  function sectionDonnees() {
    return `<p class="hint">L'historique de tes plats cuisinés est dans l'onglet Historique.</p>
      <p class="hint">Les nouvelles recettes et améliorations arrivent toutes seules, mais si tu
        attends quelque chose qui ne vient pas, tu peux forcer la vérification.</p>
      <div class="pied"><button id="btn-maj" class="pill">↻ Chercher une mise à jour</button></div>
      <p class="hint">L'app se rechargera si une nouvelle version existe. Tes données sont conservées.</p>
      <button id="btn-reset" class="linkbtn danger">Tout réinitialiser</button>`;
  }
  const SECTIONS_REGLAGES = [
    { id: "cadre", titre: "Mon cadre — jour par jour", corps: sectionCadre,
      resume: () => (state.cadreJours || CADRE_JOURS_DEFAUT).map((id) => courtStyle(STYLE(id).label)).join(", ") },
    { id: "promos", titre: "Promos de la semaine", corps: sectionPromos,
      resume: () => state.promos.length ? state.promos.join(", ") : "Aucune promo pour l'instant" },
    { id: "saison", titre: "Saison", interrupteur: true,
      resume: () => {
        const s = LIBELLE_SAISON[saisonActuelle()];
        return `${s.charAt(0).toUpperCase() + s.slice(1)} détecté · ${state.saisonOff ? "saison ignorée, toute la base est utilisée" : "recettes de saison privilégiées"}`;
      } },
    { id: "apparence", titre: "Apparence", choix: true,
      resume: () => {
        const t = themeChoisi();
        return t === "auto" ? `Suit le téléphone · ${sombreTelephone() ? "sombre" : "clair"} en ce moment` : `Toujours ${t}, quel que soit le téléphone`;
      } },
    { id: "exclus", titre: "Ingrédients exclus", corps: sectionExclus,
      resume: () => `${state.exclusions.length ? state.exclusions.join(", ") : "Aucun"} · ${nbDisponibles()}/${RECIPES.length} recettes disponibles` },
    { id: "favoris", titre: "Mes favoris", corps: sectionFavoris,
      resume: () => state.favoris.length ? state.favoris.join(", ") : "Aucun favori" },
    { id: "envies", titre: "Mes envies (à scraper)", corps: sectionEnvies,
      resume: () => state.envies.length ? nomsEnvies().join(", ") : "Aucune envie" },
    { id: "partage", titre: "Partage à deux", corps: sectionPartage,
      resume: () => { const sc = confPartage(); return !sc ? "Pas connecté" : (sc.erreur ? "Connecté · dernière synchro en échec" : "Connecté · menu, courses et notes partagés"); } },
    { id: "donnees", titre: "Données", corps: sectionDonnees,
      resume: () => "Chercher une mise à jour · Tout réinitialiser" },
  ];

  function renderReglages() {
    const el = document.getElementById("view-reglages");
    const sec = SECTIONS_REGLAGES.find((x) => x.id === sectionReglages && x.corps);
    if (sec) {
      el.innerHTML = `<button class="retour" data-act="reglages-retour">‹ Réglages</button>
        <div class="vue-tete">${ornement("Réglages")}<h2 class="sec-titre">${esc(sec.titre)}</h2></div>
        <div class="sec">${sec.corps()}</div>`;
      return;
    }
    let html = enTete("Réglages") + `<div class="sommaire">`;
    SECTIONS_REGLAGES.forEach((x) => {
      const texte = `<span class="tx"><span class="n">${esc(x.titre)}</span><span class="m">${esc(x.resume())}</span></span>`;
      if (x.interrupteur) {
        html += `<label class="so">${texte}<input type="checkbox" class="switch" data-act="saison" aria-label="Privilégier les recettes de saison" ${state.saisonOff ? "" : "checked"} /></label>`;
      } else if (x.choix) {
        const actuel = themeChoisi();
        html += `<div class="so choix">${texte}<span class="seg" role="group" aria-label="Apparence">${Object.entries(THEMES)
          .map(([v, l]) => `<button data-act="theme" data-val="${v}" aria-pressed="${v === actuel}">${l}</button>`).join("")}</span></div>`;
      } else {
        html += `<button class="so" data-act="reglages-ouvrir" data-sec="${x.id}">${texte}<span class="cv">›</span></button>`;
      }
    });
    el.innerHTML = html + `</div>`;
  }
  // en « Auto », le résumé « sombre / clair en ce moment » suit le téléphone s'il change de thème
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const majResume = () => {
      if (!sectionReglages && document.getElementById("view-reglages").classList.contains("active")) renderReglages();
    };
    if (mq.addEventListener) mq.addEventListener("change", majResume);
  }

  // ---------- navigation ----------
  const RENDER = { semaine: renderSemaine, courses: renderCourses, recettes: renderRecettes, historique: renderHistorique, reglages: renderReglages };
  function show(v) {
    document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.getElementById("view-" + v).classList.add("active");
    if (v === "reglages") sectionReglages = null;   // l'onglet s'ouvre toujours sur le sommaire
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
  function majPropositionsEnvie() {
    const inp = document.getElementById("new-envie"), box = document.getElementById("envie-props");
    if (inp && box) box.innerHTML = propositionsEnvie(inp.value);
  }
  document.addEventListener("input", (e) => { if (e.target.id === "new-envie") majPropositionsEnvie(); });
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("tab")) return show(t.dataset.view);
    if (t.id === "btn-gen") { if (vueSuivante) genererSuivante(); else generer(); return renderSemaine(); }
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
        state = { semaine: null, suivante: null, historique: [], exclusions: EXCLUS_DEFAUT.slice(), promos: [], cadreJours: CADRE_JOURS_DEFAUT.slice(), favoris: [], notes: {}, envies: [], coursesCochees: {}, epingles: {}, servis: [] };
        save("semaine"); show("semaine");
      }
      return;
    }
    const act = t.dataset.act;
    if (act === "theme") {
      choisirTheme(t.dataset.val);
      renderReglages();
      return toast(t.dataset.val === "auto" ? "L'app suit maintenant ton téléphone" : `Thème ${t.dataset.val} activé`);
    }
    if (act === "reglages-ouvrir") { sectionReglages = t.dataset.sec; renderReglages(); window.scrollTo(0, 0); return; }
    if (act === "reglages-retour") { sectionReglages = null; renderReglages(); window.scrollTo(0, 0); return; }
    if (act === "envie-prop") {
      const inp = document.getElementById("new-envie");
      if (inp) { inp.value = t.dataset.nom; majPropositionsEnvie(); }
      return;
    }
    if (act === "vue-semaine") { vueSuivante = t.dataset.val === "1"; renderSemaine(); window.scrollTo(0, 0); return; }
    if (act === "preparer-suivante") { vueSuivante = true; return show("semaine"); }
    if (act === "epingler") {
      epingler(t.dataset.jour, t.dataset.nom);
      generer();                                  // le reste de la semaine se réorganise autour
      vueSuivante = false;                        // une épingle vaut pour cette semaine : on la montre
      renderSemaine();
      return toast(`📌 ${t.dataset.nom} imposé ${t.dataset.jour.toLowerCase()}`);
    }
    if (act === "desepingler") {
      // sur la semaine prochaine (v37) : seul ce jour est retiré, le reste de S+1 ne bouge pas
      if (vueSuivante && semaineSuivante()) {
        desepingler(t.dataset.jour, true);
        libererSuivante(t.dataset.jour);
        renderSemaine();
        return toast("Plat libéré — le jour redevient automatique");
      }
      desepingler(t.dataset.jour);
      generer();
      renderSemaine();
      return toast("Plat libéré — le jour redevient automatique");
    }
    // les boutons d'un jour agissent sur la semaine AFFICHÉE : cette semaine ou S+1 (v36)
    if (act === "regen-day") {
      const s = semaineVue();
      if (!s) return;
      if (regenJour(t.dataset.jour, s) === "epingle") return toast("Ce plat est imposé — retire d'abord l'épingle");
      return renderSemaine();
    }
    if (act === "regen-side") {
      // repioche un accompagnement COMPATIBLE avec la catégorie du plat, et différent de l'actuel
      const s = semaineVue();
      const p = s && s.plan.find((x) => x.jour === t.dataset.jour);
      const r = p && getR(p.nom);
      if (r) {
        const compat = ACC().filter((a) => (a.suits || []).includes(r.cat));
        const pool = (compat.length ? compat : ACC()).filter((a) => !p.side || a.nom !== p.side.nom);
        if (pool.length) {
          const a = pool[Math.floor(Math.random() * pool.length)];
          // un accompagnement déjà pris reste pris : on change seulement lequel
          p.side = { nom: a.nom, url: a.url, source: a.source };
          save(champDe(s)); renderSemaine();
        } else toast("Pas d'autre accompagnement adapté");
      }
      return;
    }
    if (act === "choisir-side") {
      const s = semaineVue();
      const p = s && s.plan.find((x) => x.jour === t.dataset.jour);
      if (p && p.side) {
        p.sideChoisi = !p.sideChoisi;
        save(champDe(s)); renderSemaine();
        toast(p.sideChoisi ? `${p.side.nom} ajouté aux courses` : `${p.side.nom} retiré des courses`);
      }
      return;
    }
    if (act === "filtre-jour") { filtrerJour(t.dataset.jour); return renderCourses(); }
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
        t.disabled = false; t.textContent = "↻ Chercher une mise à jour";
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
      // v36 : un INGRÉDIENT de la base devient une envie d'ingrédient. Restent un PLAT (imposé
      // comme avant) : un titre exact, ou un nom de plusieurs mots qui ne désigne qu'un plat
      // (« Tendron de veau »). Un seul mot (« lardons ») est un ingrédient même s'il figure dans
      // un titre : sinon « lardons » imposait le seul plat qui le porte dans son nom.
      const titres = RECIPES.filter((r) => norm(r.nom).includes(norm(v)));
      const plusieursMots = norm(v).split(/\s+/).filter((m) => m.length > 2).length >= 2;
      const unPlat = !!getR(v) || (titres.length === 1 && plusieursMots);
      if (!unPlat && !url && recettesAvec(v).some((r) => !estExclu(r))) {
        const auj = indexAujourdhui();
        // le jour choisi encore à venir cette semaine (ou, sans jour, toujours) : cette semaine ;
        // sinon la semaine prochaine
        const cible = !jour || JOURS.indexOf(jour) >= auj ? semaineCourante() : semaineDuRang(rangCourant() + 1);
        state.envies = state.envies.filter((e) => !(estEnvieIngr(e) && norm(e.nom) === norm(v) && rangDe(e) === rangSemaine(cible.an, cible.num)));
        state.envies.push({ nom: v, type: "ingredient", jour: jour || null, an: cible.an, num: cible.num });
        save("envies");
        const s = rangSemaine(cible.an, cible.num) === rangCourant() ? state.semaine : semaineSuivante();
        const quand = s === state.semaine ? "cette semaine" : "la semaine prochaine";
        inp.value = ""; if (inpUrl) inpUrl.value = "";
        if (!s) { renderReglages(); return toast(`Noté : ${v}${jour ? " " + jour.toLowerCase() : ""} la semaine prochaine, quand tu prépareras son menu`); }
        const changes = appliquerEnviesIngredient(s);
        save(champDe(s));
        renderReglages();
        const p = s.plan.find((x) => x.envie === v && (!jour || x.jour === jour));
        if (changes.length && p) return toast(`${v} : ${p.nom}, ${JOURS_LONG[JOURS.indexOf(p.jour)].toLowerCase()} (${quand})`);
        if (p) return toast(`${p.nom} (${p.jour.toLowerCase()}) contient déjà ${v}`);
        return toast(`Aucun plat avec ${v} ne convient ${jour ? "ce jour-là" : "aux jours qui restent"} — envie notée`);
      }
      // Si le plat est DÉJÀ dans la liste, on ne refuse pas : on met à jour son jour et son
      // lien. Refuser en silence donnait un bouton « Ajouter » qui semblait mort quand on
      // revenait préciser un jour sur une envie déjà notée.
      // v37 : un jour déjà passé cette semaine vise ce jour de la semaine PROCHAINE. Avant, le
      // plat s'imposait sur le jour passé (jamais servi) et toute la semaine était re-tirée.
      const s1 = !!jour && JOURS.indexOf(jour) < indexAujourdhui();
      const semV = semaineEpingle(s1);
      const dejaI = state.envies.findIndex((e) => norm(e && e.nom ? e.nom : e) === norm(v));
      if (dejaI >= 0) {
        const anc = state.envies[dejaI];
        const ancNom = anc && anc.nom ? anc.nom : anc;
        const ancJour = anc && anc.jour;
        const ancS1 = !!(anc && typeof anc === "object" && rangDe(anc) === rangCourant() + 1);
        if (ancJour && (ancJour !== jour || ancS1 !== s1) && nomEpingle(ancJour, ancS1) === ancNom) {
          desepingler(ancJour, ancS1);
          if (ancS1) libererSuivante(ancJour);
        }
        state.envies[dejaI] = { nom: ancNom, url: url || (anc && anc.url) || null, jour: jour || null, ...(jour ? { an: semV.an, num: semV.num } : {}) };
      } else {
        state.envies.push({ nom: v, url: url || null, jour: jour || null, ...(jour ? { an: semV.an, num: semV.num } : {}) });
      }
      save("envies");
      // un jour choisi = épingle posée d'avance : elle restera « en attente » tant que la
      // recette n'est pas dans la base, puis s'appliquera toute seule au premier menu suivant.
      if (jour && !s1) { epingler(jour, v); generer(); }
      if (jour && s1) { epingler(jour, v, true); imposerSuivante(jour); }   // ce jour seulement, cette semaine intacte
      inp.value = ""; if (inpUrl) inpUrl.value = "";
      renderReglages();
      if (!jour) return toast("Envie ajoutée — je la scraperai");
      const quand = `${JOURS_LONG[JOURS.indexOf(jour)].toLowerCase()}${s1 ? " de la semaine prochaine" : ""}`;
      return toast(trouverRecette(v) ? `${v} imposé ${quand}` : `Noté — ${v} sera imposé ${quand} dès que je l'ai ajouté`);
    }
    if (act === "maj-app") {
      t.disabled = true; t.textContent = "recherche…";
      forcerMiseAJour().then((neuf) => {
        if (neuf) return;                        // la page se recharge d'elle-même
        t.disabled = false; t.textContent = "mettre l'app à jour";
        toast("Pas encore en ligne : réessaie dans une minute");
      });
      return;
    }
    if (act === "del-envie") {
      const e = state.envies[+t.dataset.i];
      const j = e && e.jour;
      const s1 = !!(e && typeof e === "object" && rangDe(e) === rangCourant() + 1);
      if (j && nomEpingle(j, s1) === (e.nom || e)) {        // on retire aussi l'épingle en attente
        desepingler(j, s1);
        if (s1) libererSuivante(j);
      }
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
      // une ligne porte une case par jour où l'article sert (voir idArticle) — en JSON, car un
      // identifiant contient des espaces (« blanc de poulet ») et des virgules (noms de plats)
      let ids = [];
      try { ids = JSON.parse(e.target.dataset.ids || "[]"); } catch (err) { ids = []; }
      ids.forEach((id) => {
        if (e.target.checked) state.coursesCochees[id] = true; else delete state.coursesCochees[id];
        save(null, id, !e.target.checked);
      });
      e.target.closest(".shop-row").classList.toggle("checked", e.target.checked);
    }
  });

  // exposé pour les tests automatisés
  window.__mims = {
    generer, listeCourses, estExclu, getCadre, epingler, desepingler, choisirTheme, themeChoisi,
    exclure: (mot) => { if (!ajouterExclusion(mot)) return 0; return appliquerExclusion(); },
    getState: () => state,
    sauver: () => localStorage.setItem(STORE, JSON.stringify(state)),   // sans re-signaler (évite les boucles de synchro)
    rafraichir: () => { try { RENDER[vueActive()](); } catch (e) {} recupererAjouts(); },
    ajoutsEnAttente,
  };

  document.addEventListener("DOMContentLoaded", () => { show("semaine"); recupererAjouts(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) recupererAjouts(); });
})();
