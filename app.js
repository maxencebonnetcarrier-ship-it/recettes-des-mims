/* Recettes des Mim's — logique générateur + UI */
(function () {
  "use strict";

  const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const STORE = "mims_state_v1";

  // ---------- utils ----------
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const fmtTemps = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? " " + (m % 60) : ""}` : `${m} min`);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };

  function saisonActuelle() {
    const m = new Date().getMonth(); // 0=jan
    if (m >= 2 && m <= 4) return "printemps";
    if (m >= 5 && m <= 7) return "ete";
    if (m >= 8 && m <= 10) return "automne";
    return "hiver";
  }
  function recetteDeSaison(r) {
    const s = norm(r.saison);
    if (s.includes("toute")) return true;
    const sais = saisonActuelle();
    return s.includes(sais);
  }
  function contientExclu(r) {
    return r.ingr.some((ing) => EXCLUS.some((ex) => norm(ing).includes(norm(ex))));
  }
  function saveurDe(r) {
    for (const sv of SAVEURS) {
      if (r.ingr.some((ing) => norm(ing).includes(norm(sv)))) return sv;
    }
    return null;
  }
  function estPoissonGras(r) { return r.tags.includes("poisson gras"); }

  // ---------- state ----------
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function saveState(s) { localStorage.setItem(STORE, JSON.stringify(s)); }
  let state = loadState();
  if (!state.semaine) state.semaine = null;      // {num, plan:[{jour,nom}]}
  if (!state.historique) state.historique = [];  // [{num,jour,nom,fait,note,comment}]

  function numSemaineISO(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yStart) / 86400000) + 1) / 7);
  }
  // recettes vues sur les 3 dernières semaines (num courant inclus)
  function recentesInterdites(numCourant) {
    const set = new Set();
    state.historique.forEach((h) => {
      if (numCourant - h.num >= 0 && numCourant - h.num < 3) set.add(h.nom);
    });
    return set;
  }

  // ---------- générateur ----------
  function eligibles(cadre, interdites) {
    return RECIPES.filter((r) => {
      if (!cadre.cats.includes(r.cat)) return false;
      if (cadre.maxMin && r.min > cadre.maxMin) return false;
      if (!recetteDeSaison(r)) return false;
      if (contientExclu(r)) return false;
      if (interdites.has(r.nom)) return false;
      return true;
    });
  }

  function genererSemaine() {
    const num = numSemaineISO(new Date());
    const interdites = recentesInterdites(num - 1); // n'inclut pas la semaine qu'on génère
    const plan = [];
    const saveursUtilisees = new Set();
    let poissonGrasOk = false;

    for (const cadre of CADRE) {
      let choix = shuffle(eligibles(cadre, interdites));
      // éviter 2× la même saveur dominante
      let pick = choix.find((r) => { const sv = saveurDe(r); return !sv || !saveursUtilisees.has(sv); });
      // relâche la contrainte saison si rien
      if (!pick) {
        const relache = shuffle(RECIPES.filter((r) => cadre.cats.includes(r.cat) && (!cadre.maxMin || r.min <= cadre.maxMin) && !contientExclu(r) && !interdites.has(r.nom)));
        pick = relache.find((r) => { const sv = saveurDe(r); return !sv || !saveursUtilisees.has(sv); }) || relache[0];
      }
      if (!pick) pick = choix[0] || RECIPES.find((r) => cadre.cats.includes(r.cat));
      const sv = saveurDe(pick);
      if (sv) saveursUtilisees.add(sv);
      if (estPoissonGras(pick)) poissonGrasOk = true;
      plan.push({ jour: cadre.jour, nom: pick.nom });
    }

    // garantir ≥ 1 poisson gras : sinon basculer Jeudi (Poisson) puis Mardi (Légumineuses porteuse)
    if (!poissonGrasOk) {
      for (const j of ["Jeu", "Mar"]) {
        const idx = plan.findIndex((p) => p.jour === j);
        const cadre = CADRE.find((c) => c.jour === j);
        const gras = shuffle(eligibles(cadre, interdites)).find(estPoissonGras)
          || shuffle(RECIPES.filter((r) => cadre.cats.includes(r.cat) && estPoissonGras(r) && !contientExclu(r)))[0];
        if (gras) { plan[idx] = { jour: j, nom: gras.nom }; poissonGrasOk = true; break; }
      }
    }

    state.semaine = { num, plan };
    saveState(state);
    return state.semaine;
  }

  const getRecette = (nom) => RECIPES.find((r) => r.nom === nom);

  // ---------- rendu ----------
  function badge(txt, cls) { return `<span class="badge ${cls || ""}">${txt}</span>`; }

  function renderSemaine() {
    const el = document.getElementById("view-semaine");
    if (!state.semaine) { genererSemaine(); }
    const s = state.semaine;
    const grasCount = s.plan.filter((p) => estPoissonGras(getRecette(p.nom))).length;
    let html = `<div class="week-head">
      <div><strong>Semaine ${s.num}</strong> · 3 pers · 4 parts/plat</div>
      <div class="week-flags">${grasCount >= 1 ? "🐟 poisson gras ✓" : "⚠️ pas de poisson gras"}</div>
    </div>
    <button id="btn-gen" class="primary">🔄 Générer un nouveau menu</button>
    <div class="cards">`;

    s.plan.forEach((p) => {
      const r = getRecette(p.nom);
      const cadre = CADRE.find((c) => c.jour === p.jour);
      const h = state.historique.find((x) => x.num === s.num && x.jour === p.jour);
      const fait = h && h.fait;
      html += `<div class="card day ${fait ? "done" : ""}">
        <div class="card-top">
          <span class="jour">${p.jour}</span>
          <span class="cat">${r.cat}</span>
        </div>
        <div class="plat">${r.nom}</div>
        <div class="meta">${badge(fmtTemps(r.min))} ${badge(r.piece)} ${r.tags.map((t) => badge(t, "tag")).join(" ")}</div>
        <div class="constraint">${cadre ? cadre.note : ""}</div>
        <div class="ingr">${r.ingr.join(" · ")}</div>
        <div class="actions">
          <button data-act="regen-day" data-jour="${p.jour}">↻ ce jour</button>
          <button data-act="done" data-jour="${p.jour}" data-nom="${encodeURIComponent(r.nom)}">${fait ? "✓ Fait" : "Marquer fait"}</button>
        </div>
      </div>`;
    });
    html += `</div>`;
    el.innerHTML = html;
  }

  function regenJour(jour) {
    const cadre = CADRE.find((c) => c.jour === jour);
    const s = state.semaine;
    const interdites = recentesInterdites(s.num - 1);
    const dejaSemaine = new Set(s.plan.filter((p) => p.jour !== jour).map((p) => p.nom));
    const saveurs = new Set(s.plan.filter((p) => p.jour !== jour).map((p) => saveurDe(getRecette(p.nom))).filter(Boolean));
    let choix = shuffle(eligibles(cadre, interdites)).filter((r) => !dejaSemaine.has(r.nom));
    let pick = choix.find((r) => { const sv = saveurDe(r); return !sv || !saveurs.has(sv); }) || choix[0];
    if (!pick) pick = shuffle(RECIPES.filter((r) => cadre.cats.includes(r.cat) && !dejaSemaine.has(r.nom)))[0];
    if (pick) {
      const idx = s.plan.findIndex((p) => p.jour === jour);
      s.plan[idx] = { jour, nom: pick.nom };
      saveState(state);
      renderSemaine();
    }
  }

  function marquerFait(jour, nom) {
    const s = state.semaine;
    let h = state.historique.find((x) => x.num === s.num && x.jour === jour);
    if (h) { h.fait = !h.fait; h.nom = nom; }
    else { state.historique.push({ num: s.num, jour, nom, fait: true, note: 0, comment: "" }); }
    saveState(state);
    renderSemaine();
  }

  function renderRecettes() {
    const el = document.getElementById("view-recettes");
    const cats = [...new Set(RECIPES.map((r) => r.cat))];
    let html = `<input id="search" placeholder="🔍 Chercher une recette, un ingrédient…" />`;
    cats.forEach((cat) => {
      html += `<h3 class="cat-title">${cat}</h3><div class="cards">`;
      RECIPES.filter((r) => r.cat === cat).forEach((r) => {
        html += `<div class="card recipe" data-search="${norm(r.nom + " " + r.ingr.join(" ") + " " + r.tags.join(" "))}">
          <div class="plat">${r.nom}</div>
          <div class="meta">${badge(fmtTemps(r.min))} ${badge(r.type)} ${badge(r.saison, "season")} ${r.tags.map((t) => badge(t, "tag")).join(" ")}</div>
          <div class="ingr">${r.ingr.join(" · ")}</div>
        </div>`;
      });
      html += `</div>`;
    });
    el.innerHTML = html;
    const search = document.getElementById("search");
    search.addEventListener("input", () => {
      const q = norm(search.value);
      el.querySelectorAll(".recipe").forEach((c) => {
        c.style.display = c.dataset.search.includes(q) ? "" : "none";
      });
      el.querySelectorAll(".cat-title").forEach((t) => {
        let n = t.nextElementSibling;
        const visible = [...n.querySelectorAll(".recipe")].some((c) => c.style.display !== "none");
        t.style.display = visible ? "" : "none";
      });
    });
  }

  function renderHistorique() {
    const el = document.getElementById("view-historique");
    const hist = state.historique.slice().sort((a, b) => b.num - a.num || JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour));
    if (!hist.length) { el.innerHTML = `<p class="empty">Aucun repas enregistré. Marque des plats « fait » dans l'onglet Semaine.</p>`; return; }
    let html = `<p class="hint">L'historique bloque une recette vue sur les 3 dernières semaines lors de la génération.</p><div class="hist-list">`;
    hist.forEach((h, i) => {
      html += `<div class="hist-row">
        <span class="hs">S${h.num}</span><span class="hj">${h.jour}</span>
        <span class="hn">${h.nom}</span>
        <span class="stars" data-i="${i}">${[1, 2, 3, 4, 5].map((n) => `<span class="star ${h.note >= n ? "on" : ""}" data-n="${n}">★</span>`).join("")}</span>
        <button data-act="del-hist" data-i="${i}">✕</button>
      </div>`;
    });
    html += `</div>`;
    el.innerHTML = html;
    el.querySelectorAll(".star").forEach((st) => st.addEventListener("click", (e) => {
      const row = e.target.closest(".stars"); const i = +row.dataset.i; const n = +e.target.dataset.n;
      const sorted = state.historique.slice().sort((a, b) => b.num - a.num || JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour));
      const target = sorted[i];
      const real = state.historique.find((x) => x.num === target.num && x.jour === target.jour && x.nom === target.nom);
      real.note = real.note === n ? 0 : n;
      saveState(state); renderHistorique();
    }));
  }

  // ---------- navigation ----------
  function show(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.getElementById("view-" + view).classList.add("active");
    document.querySelector(`.tab[data-view="${view}"]`).classList.add("active");
    if (view === "semaine") renderSemaine();
    if (view === "recettes") renderRecettes();
    if (view === "historique") renderHistorique();
  }

  // ---------- events (délégation) ----------
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("tab")) show(t.dataset.view);
    if (t.id === "btn-gen") { genererSemaine(); renderSemaine(); }
    const act = t.dataset.act;
    if (act === "regen-day") regenJour(t.dataset.jour);
    if (act === "done") marquerFait(t.dataset.jour, decodeURIComponent(t.dataset.nom));
    if (act === "del-hist") {
      const i = +t.dataset.i;
      const sorted = state.historique.slice().sort((a, b) => b.num - a.num || JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour));
      const target = sorted[i];
      state.historique = state.historique.filter((x) => !(x.num === target.num && x.jour === target.jour && x.nom === target.nom));
      saveState(state); renderHistorique();
    }
  });

  // init
  document.addEventListener("DOMContentLoaded", () => show("semaine"));
})();
