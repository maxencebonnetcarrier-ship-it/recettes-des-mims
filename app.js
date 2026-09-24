/* Recettes des Mim's — générateur de menu, liste de courses, exclusions */
(function () {
  "use strict";

  const STORE = "mims_state_v2";
  const PARTS_CIBLE = 4; // 3 au soir + 1 midi
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
    const s = norm(r.saison);
    return !s || s.includes("toute") || s.includes(saisonActuelle());
  }
  function numSemaineISO(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - y) / 86400000) + 1) / 7);
  }

  // ---------- state ----------
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  const save = () => localStorage.setItem(STORE, JSON.stringify(state));
  let state = load();
  if (!state.semaine) state.semaine = null;
  if (!state.historique) state.historique = [];
  if (!state.exclusions) state.exclusions = EXCLUS_DEFAUT.slice();
  if (!state.coursesCochees) state.coursesCochees = {};

  const estExclu = (r) => r.ingredients.some((i) => state.exclusions.some((ex) => norm(i.nom).includes(norm(ex))));

  function ajouterExclusion(mot) {
    const m = (mot || "").trim();
    if (!m) return false;
    if (state.exclusions.some((e) => norm(e) === norm(m))) return false;
    state.exclusions.push(m);
    save();
    return true;
  }

  // ---------- générateur ----------
  function recentes(numAvant) {
    const set = new Set();
    state.historique.forEach((h) => { if (numAvant - h.num >= 0 && numAvant - h.num < 3) set.add(h.nom); });
    return set;
  }

  function candidats(cadre, interdites) {
    return RECIPES.filter((r) =>
      cadre.cats.includes(r.cat) &&
      (!cadre.maxMin || (r.total_min || 0) <= cadre.maxMin) &&
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

    const paliers = [
      (r) => r.proteine !== protPrec && r.proteine !== protSuiv && (compteProt[r.proteine] || 0) < 2 && !saveursVues.has(saveurDe(r)),
      (r) => r.proteine !== protPrec && r.proteine !== protSuiv && (compteProt[r.proteine] || 0) < 2,
      (r) => r.proteine !== protPrec && r.proteine !== protSuiv,
      (r) => r.proteine !== protPrec,
    ];
    let pool = shuffle(candidats(cadre, interdites));
    if (!pool.length) pool = shuffle(RECIPES.filter((r) => cadre.cats.includes(r.cat) && !estExclu(r)));
    for (const test of paliers) {
      const hit = pool.find(test);
      if (hit) return hit;
    }
    return pool[0] || null;
  }

  function generer() {
    const num = numSemaineISO(new Date());
    const interdites = recentes(num - 1);
    const plan = new Array(CADRE.length).fill(null);
    // jours les plus contraints d'abord (moins de candidats disponibles)
    const ordre = CADRE.map((c, i) => ({ i, n: candidats(c, interdites).length })).sort((a, b) => a.n - b.n).map((o) => o.i);
    for (const i of ordre) {
      const r = choisir(CADRE[i], interdites, plan, i);
      if (r) plan[i] = { jour: CADRE[i].jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r) };
    }
    state.semaine = { num, plan: plan.filter(Boolean) };
    save();
    return state.semaine;
  }

  function regenJour(jour) {
    const s = state.semaine;
    const idx = s.plan.findIndex((p) => p.jour === jour);
    if (idx < 0) return;
    const cadre = CADRE.find((c) => c.jour === jour);
    const interdites = recentes(s.num - 1);
    s.plan.forEach((p, i) => { if (i !== idx) interdites.add(p.nom); });
    const copie = s.plan.slice(); copie[idx] = null;
    const r = choisir(cadre, interdites, copie, idx);
    if (r) { s.plan[idx] = { jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r) }; save(); }
  }

  const getR = (nom) => RECIPES.find((r) => r.nom === nom);

  // ---------- liste de courses ----------
  function listeCourses() {
    const acc = {};
    if (!state.semaine) return acc;
    state.semaine.plan.forEach((p) => {
      const r = getR(p.nom);
      if (!r) return;
      const facteur = PARTS_CIBLE / (r.parts_origine || PARTS_CIBLE);
      r.ingredients.forEach((ing) => {
        const rayon = ing.rayon || "Épicerie";
        const key = norm(ing.nom);
        acc[rayon] = acc[rayon] || {};
        const e = acc[rayon][key] = acc[rayon][key] || { nom: ing.nom, unites: {}, plats: [] };
        if (ing.qte) {
          const u = ing.unite || "";
          e.unites[u] = Math.round(((e.unites[u] || 0) + ing.qte * facteur) * 10) / 10;
        }
        if (!e.plats.includes(r.nom)) e.plats.push(r.nom);
      });
    });
    return acc;
  }
  function fmtQte(unites) {
    const parts = Object.entries(unites).filter(([u, q]) => q > 0).map(([u, q]) => `${q}${u ? " " + u : ""}`);
    return parts.length ? parts.join(" + ") : "qs"; // qs = quantité suffisante
  }

  // ---------- rendu ----------
  const badge = (t, c) => `<span class="badge ${c || ""}">${esc(t)}</span>`;

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
    if (!state.semaine || !state.semaine.plan.length) generer();
    const s = state.semaine;
    let html = `<div class="week-head"><strong>Semaine ${s.num}</strong> · 3 personnes · ${PARTS_CIBLE} parts par plat</div>
      <button id="btn-gen" class="primary">🔄 Générer un nouveau menu</button><div class="cards">`;
    s.plan.forEach((p) => {
      const r = getR(p.nom);
      if (!r) return;
      const cadre = CADRE.find((c) => c.jour === p.jour);
      html += `<div class="card day">
        <div class="card-top"><span class="jour">${esc(p.jour)}</span><span class="cat">${esc(r.cat)}</span></div>
        <div class="plat">${esc(r.nom)}</div>
        <div class="temps">${tempsRecette(r)}</div>
        <div class="meta">${(r.cuissons || []).map((c) => badge("🔥 " + c, "cuisson")).join(" ")} ${(r.tags || []).map((t) => badge(t, "tag")).join(" ")}</div>
        <div class="constraint">${esc(cadre ? cadre.note : "")}</div>
        ${blocRecette(r)}
        <div class="actions"><button data-act="regen-day" data-jour="${esc(p.jour)}">↻ Changer ce plat</button></div>
      </div>`;
    });
    el.innerHTML = html + `</div>`;
  }

  function renderCourses() {
    const el = document.getElementById("view-courses");
    const acc = listeCourses();
    const rayons = ORDRE_RAYONS.filter((r) => acc[r]).concat(Object.keys(acc).filter((r) => !ORDRE_RAYONS.includes(r)));
    if (!rayons.length) { el.innerHTML = `<p class="empty">Génère d'abord un menu dans l'onglet Semaine.</p>`; return; }
    let n = 0, html = `<p class="hint">Calculée pour ${PARTS_CIBLE} parts par plat, à partir du menu de la semaine.</p>`;
    rayons.forEach((rayon) => {
      const items = Object.values(acc[rayon]).sort((a, b) => a.nom.localeCompare(b.nom));
      html += `<h3 class="cat-title">${esc(rayon)}</h3><div class="shop-list">`;
      items.forEach((it) => {
        n++;
        const id = norm(rayon + "|" + it.nom);
        const ok = !!state.coursesCochees[id];
        html += `<label class="shop-row ${ok ? "checked" : ""}">
          <input type="checkbox" data-act="course" data-id="${esc(id)}" ${ok ? "checked" : ""} />
          <span class="sq">${esc(fmtQte(it.unites))}</span>
          <span class="sn">${esc(it.nom)}</span>
          <span class="sp">${esc(it.plats.join(" · "))}</span>
        </label>`;
      });
      html += `</div>`;
    });
    html += `<button id="btn-copy" class="primary ghost">📋 Copier la liste</button>
      <button id="btn-reset-courses" class="linkbtn">Tout décocher</button>`;
    el.innerHTML = `<div class="week-head"><strong>${n} articles</strong></div>` + html;
  }

  function texteCourses() {
    const acc = listeCourses();
    let out = "🛒 Liste de courses\n";
    ORDRE_RAYONS.filter((r) => acc[r]).forEach((rayon) => {
      out += `\n— ${rayon} —\n`;
      Object.values(acc[rayon]).sort((a, b) => a.nom.localeCompare(b.nom))
        .forEach((it) => { out += `• ${fmtQte(it.unites)} ${it.nom}\n`; });
    });
    return out;
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
          <div class="plat">${esc(r.nom)}${ex ? ` <span class="badge off">exclue</span>` : ""}</div>
          <div class="temps">${tempsRecette(r)}</div>
          <div class="meta">${(r.cuissons || []).map((c) => badge("🔥 " + c, "cuisson")).join(" ")} ${badge(r.saison, "season")} ${(r.tags || []).map((t) => badge(t, "tag")).join(" ")}</div>
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

  function renderReglages() {
    const el = document.getElementById("view-reglages");
    const nb = RECIPES.filter((r) => !estExclu(r)).length;
    let html = `<h3 class="cat-title">Ingrédients exclus</h3>
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
      <h3 class="cat-title">Historique</h3>
      <p class="hint">Les plats déjà cuisinés ne reviennent pas avant 3 semaines.</p>`;
    if (!state.historique.length) html += `<p class="empty">Aucun plat enregistré.</p>`;
    else {
      html += `<div class="hist-list">`;
      state.historique.slice().sort((a, b) => b.num - a.num).forEach((h) => {
        html += `<div class="hist-row"><span class="hs">S${h.num}</span><span class="hn">${esc(h.nom)}</span>
          <button data-act="del-hist" data-nom="${esc(h.nom)}" data-num="${h.num}">✕</button></div>`;
      });
      html += `</div>`;
    }
    html += `<h3 class="cat-title">Données</h3><button id="btn-reset" class="linkbtn danger">Tout réinitialiser</button>`;
    el.innerHTML = html;
  }

  // ---------- navigation ----------
  const RENDER = { semaine: renderSemaine, courses: renderCourses, recettes: renderRecettes, reglages: renderReglages };
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
    if (t.id === "btn-copy") {
      navigator.clipboard.writeText(texteCourses()).then(() => toast("Liste copiée")).catch(() => toast("Copie impossible"));
      return;
    }
    if (t.id === "btn-reset-courses") { state.coursesCochees = {}; save(); return renderCourses(); }
    if (t.id === "btn-reset") {
      if (confirm("Effacer le menu, l'historique et les exclusions personnalisées ?")) {
        state = { semaine: null, historique: [], exclusions: EXCLUS_DEFAUT.slice(), coursesCochees: {} };
        save(); show("semaine");
      }
      return;
    }
    const act = t.dataset.act;
    if (act === "regen-day") { regenJour(t.dataset.jour); return renderSemaine(); }
    if (act === "exclure") {
      const ing = t.dataset.ing;
      if (ajouterExclusion(ing)) {
        // remplace les plats du menu devenus invalides
        if (state.semaine) {
          state.semaine.plan.slice().forEach((p) => { const r = getR(p.nom); if (r && estExclu(r)) regenJour(p.jour); });
          save();
        }
        RENDER[vueActive()]();
        toast(`« ${ing} » exclu — recettes remplacées`);
      } else toast("Déjà dans les exclusions");
      return;
    }
    if (act === "unexclude") { state.exclusions.splice(+t.dataset.i, 1); save(); return renderReglages(); }
    if (act === "del-hist") {
      state.historique = state.historique.filter((h) => !(h.nom === t.dataset.nom && h.num === +t.dataset.num));
      save(); return renderReglages();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.dataset.act === "course") {
      const id = e.target.dataset.id;
      if (e.target.checked) state.coursesCochees[id] = true; else delete state.coursesCochees[id];
      save();
      e.target.closest(".shop-row").classList.toggle("checked", e.target.checked);
    }
  });

  // exposé pour les tests automatisés
  window.__mims = { generer, listeCourses, estExclu, getState: () => state };

  document.addEventListener("DOMContentLoaded", () => show("semaine"));
})();
