/* Recettes des Mim's — générateur de menu, liste de courses, exclusions */
(function () {
  "use strict";

  const STORE = "mims_state_v2";
  const PARTS_CIBLE = 4; // 3 au soir + 1 midi
  const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  // styles de plat sélectionnables par jour
  const STYLES = [
    { id: "volaille", label: "🍗 Volaille", cats: ["Volaille"], maxMin: null },
    { id: "porc", label: "🥓 Porc", cats: ["Porc"], maxMin: null },
    { id: "poisson", label: "🐟 Poisson", cats: ["Poisson"], maxMin: null },
    { id: "legumineuses", label: "🫘 Légumineuses / végé", cats: ["Légumineuses"], maxMin: null },
    { id: "express", label: "⚡ Express (sport, ≤25 min)", cats: ["Rapide (sport)"], maxMin: 25 },
    { id: "mijote", label: "🍲 Mijoté (j'ai le temps)", cats: ["Mijoté"], maxMin: null },
    { id: "roti", label: "🔥 Rôti / four", cats: ["Rôti"], maxMin: null },
    { id: "libre", label: "🎲 Peu importe", cats: ["Volaille", "Porc", "Poisson", "Légumineuses", "Rapide (sport)", "Mijoté", "Rôti"], maxMin: null },
  ];
  const STYLE = (id) => STYLES.find((s) => s.id === id) || STYLES[STYLES.length - 1];
  const CADRE_JOURS_DEFAUT = ["volaille", "legumineuses", "porc", "poisson", "express", "mijote", "roti"];
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
  // Lundi de la semaine ISO donnée (année courante par défaut)
  function lundiSemaineISO(num, annee) {
    const jan4 = new Date(Date.UTC(annee, 0, 4));
    const j = jan4.getUTCDay() || 7;
    const lundiS1 = new Date(jan4); lundiS1.setUTCDate(jan4.getUTCDate() - j + 1);
    const lundi = new Date(lundiS1); lundi.setUTCDate(lundiS1.getUTCDate() + (num - 1) * 7);
    return lundi;
  }
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function plageSemaine(num) {
    const lun = lundiSemaineISO(num, new Date().getFullYear());
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
      return { jour: JOURS[i], cats: st.cats, maxMin: st.maxMin, note: st.label };
    });
  }

  // ---------- state ----------
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  const save = () => localStorage.setItem(STORE, JSON.stringify(state));
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
    state.promos.push(m); save(); return true;
  }

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

    let pool = candidats(cadre, interdites);
    if (!pool.length) pool = RECIPES.filter((r) => cadre.cats.includes(r.cat) && !estExclu(r));
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

  function generer() {
    const num = numSemaineISO(new Date());
    const cadre = getCadre();
    const interdites = recentes(num - 1);
    const plan = new Array(cadre.length).fill(null);
    // jours à protéine la plus FORCÉE d'abord (ex : Poisson = 1 seule protéine possible),
    // pour que les jours souples (Express, Mijoté) s'adaptent ensuite et évitent l'adjacence.
    const ordre = cadre.map((c, i) => {
      const cand = candidats(c, interdites);
      return { i, prot: new Set(cand.map((r) => r.proteine)).size || 99, n: cand.length };
    }).sort((a, b) => a.prot - b.prot || a.n - b.n).map((o) => o.i);
    for (const i of ordre) {
      const r = choisir(cadre[i], interdites, plan, i);
      if (r) plan[i] = { jour: cadre[i].jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r), side: pickSide(r, i, plan) };
    }
    state.semaine = { num, plan: plan.filter(Boolean) };
    save();
    return state.semaine;
  }

  function regenJour(jour) {
    const s = state.semaine;
    const idx = s.plan.findIndex((p) => p.jour === jour);
    if (idx < 0) return;
    const cadre = getCadre().find((c) => c.jour === jour);
    const interdites = recentes(s.num - 1);
    s.plan.forEach((p) => interdites.add(p.nom));   // exclut TOUTE la semaine, dont le plat actuel → force un vrai changement
    const copie = s.plan.slice(); copie[idx] = null;
    let r = choisir(cadre, interdites, copie, idx);
    // si un seul candidat existe (plat actuel ré-exclu), on relâche pour ne pas planter
    if (!r) { interdites.delete(s.plan[idx].nom); r = choisir(cadre, interdites, copie, idx); }
    if (r) { s.plan[idx] = { jour, nom: r.nom, proteine: r.proteine, saveur: saveurDe(r), side: pickSide(r, idx, copie) }; save(); }
  }

  const getR = (nom) => RECIPES.find((r) => r.nom === nom);

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

  const estFait = (num, jour) => state.historique.some((h) => h.num === num && h.jour === jour && h.fait);

  // widget de note en DEMI-étoiles (0,5 à 5)
  function etoiles(nom) {
    const note = state.notes[nom] || 0;
    let h = `<span class="stars">`;
    for (let n = 1; n <= 5; n++) {
      const cls = note >= n ? "full" : (note >= n - 0.5 ? "half" : "empty");
      h += `<span class="star ${cls}">★<span class="hz l" data-act="note" data-nom="${esc(nom)}" data-val="${n - 0.5}"></span><span class="hz r" data-act="note" data-nom="${esc(nom)}" data-val="${n}"></span></span>`;
    }
    h += note ? ` <span class="note-val">${note}/5</span><button class="clr" data-act="note" data-nom="${esc(nom)}" data-val="0" title="Effacer">✕</button>` : "";
    return h + `</span>`;
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
    if (!state.semaine || !state.semaine.plan.length) generer();
    const s = state.semaine;
    let html = `<div class="week-head"><strong>Semaine ${s.num}</strong> · ${esc(plageSemaine(s.num))} · ${PARTS_CIBLE} parts/plat</div>
      <button id="btn-gen" class="primary">🔄 Générer un nouveau menu</button><div class="cards">`;
    s.plan.forEach((p) => {
      const r = getR(p.nom);
      if (!r) return;
      const cadre = getCadre().find((c) => c.jour === p.jour);
      html += `<div class="card day">
        <div class="card-top"><span class="jour">${esc(p.jour)}</span><span class="cat">${esc(r.cat)}</span>
          <button class="fav ${estFavori(r.nom) ? "on" : ""}" data-act="fav" data-nom="${esc(r.nom)}" title="J'aime — à reproposer">${estFavori(r.nom) ? "❤️" : "🤍"}</button>
        </div>
        <div class="plat">${esc(r.nom)}</div>
        <div class="temps">${tempsRecette(r)}</div>
        <div class="meta">${bullesRecette(r)}</div>
        ${p.side ? `<div class="side">🍽️ avec <a href="${esc(p.side.url)}" target="_blank" rel="noopener">${esc(p.side.nom)}</a></div>` : ""}
        ${r.bonus ? `<div class="bonus">✨ Le p'tit plus : ${esc(r.bonus)}</div>` : ""}
        <div class="constraint">${esc(cadre ? cadre.note : "")}</div>
        ${blocRecette(r)}
        <div class="note-row">Ta note : ${etoiles(r.nom)}</div>
        <div class="actions">
          <button data-act="regen-day" data-jour="${esc(p.jour)}">↻ Changer</button>
          <button class="fait ${estFait(s.num, p.jour) ? "done" : ""}" data-act="fait" data-jour="${esc(p.jour)}" data-nom="${esc(r.nom)}">${estFait(s.num, p.jour) ? "✓ Fait" : "Marquer fait"}</button>
        </div>
      </div>`;
    });
    el.innerHTML = html + `</div>`;
  }

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
        const id = norm(rayon + "|" + it.nom);
        const ok = !!state.coursesCochees[id];
        html += `<label class="shop-row ${ok ? "checked" : ""}">
          <input type="checkbox" data-act="course" data-id="${esc(id)}" ${ok ? "checked" : ""} />
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
        .forEach((it) => { out += `• ${it.nom}\n`; });
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
      <p class="hint">Propose un plat que tu aimerais voir ajouté. Je le rechercherai sur les sites et l'ajouterai à ta base.</p>
      <div class="add-row">
        <input id="new-envie" placeholder="Ex. : blanquette de la mer" />
        <button id="btn-add-envie">Ajouter</button>
      </div>
      <div class="chips">`;
    state.envies.forEach((e, i) => {
      html += `<span class="chip envie">${esc(e)}<button data-act="del-envie" data-i="${i}" title="Retirer">✕</button></span>`;
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
    if (t.id === "btn-add-promo") {
      const inp = document.getElementById("new-promo");
      if (ajouterPromo(inp.value)) { inp.value = ""; renderReglages(); toast("Promo ajoutée — régénère le menu"); }
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
        state = { semaine: null, historique: [], exclusions: EXCLUS_DEFAUT.slice(), promos: [], cadreJours: CADRE_JOURS_DEFAUT.slice(), favoris: [], notes: {}, envies: [], coursesCochees: {} };
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
    if (act === "fait") {
      const num = state.semaine.num, jour = t.dataset.jour, nom = t.dataset.nom;
      const h = state.historique.find((x) => x.num === num && x.jour === jour);
      if (h) { h.fait = !h.fait; h.nom = nom; }
      else state.historique.push({ num, jour, nom, fait: true, note: state.notes[nom] || 0 });
      save(); renderSemaine();
      return;
    }
    if (act === "note") {
      const nom = t.dataset.nom, val = parseFloat(t.dataset.val);
      if (val > 0) state.notes[nom] = val; else delete state.notes[nom];
      // répercute sur l'historique du plat
      state.historique.forEach((h) => { if (h.nom === nom) h.note = val; });
      save(); RENDER[vueActive()]();
      return;
    }
    if (act === "fav") {
      const nom = t.dataset.nom;
      if (estFavori(nom)) state.favoris = state.favoris.filter((x) => x !== nom);
      else state.favoris.push(nom);
      save();
      RENDER[vueActive()]();
      toast(estFavori(nom) ? "Ajouté aux favoris ❤️" : "Retiré des favoris");
      return;
    }
    if (t.id === "btn-add-envie") {
      const inp = document.getElementById("new-envie");
      const v = (inp.value || "").trim();
      if (v && !state.envies.includes(v)) { state.envies.push(v); save(); inp.value = ""; renderReglages(); toast("Envie ajoutée — je la scraperai"); }
      return;
    }
    if (act === "del-envie") { state.envies.splice(+t.dataset.i, 1); save(); return renderReglages(); }
    if (act === "unpromo") { state.promos.splice(+t.dataset.i, 1); save(); return renderReglages(); }
    if (act === "preset") {
      const p = (window.CADRE_PRESETS || []).find((x) => x.id === t.dataset.id);
      if (p) {
        const CAT2 = { "Volaille": "volaille", "Porc": "porc", "Poisson": "poisson", "Légumineuses": "legumineuses", "Rapide (sport)": "express", "Mijoté": "mijote", "Rôti": "roti" };
        state.cadreJours = p.cadre.map((c) => CAT2[c.cats[0]] || "libre");
        generer(); save(); renderReglages();
        toast("Modèle appliqué — menu régénéré");
      }
      return;
    }
    if (act === "del-hist") {
      state.historique = state.historique.filter((h) => !(h.nom === t.dataset.nom && h.num === +t.dataset.num));
      save(); return renderReglages();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.dataset.act === "cadre-jour") {
      const i = +e.target.dataset.i;
      state.cadreJours = (state.cadreJours || CADRE_JOURS_DEFAUT).slice();
      state.cadreJours[i] = e.target.value;
      generer(); save(); renderReglages();
      toast(JOURS[i] + " : " + STYLE(e.target.value).label);
      return;
    }
    if (e.target.dataset.act === "course") {
      const id = e.target.dataset.id;
      if (e.target.checked) state.coursesCochees[id] = true; else delete state.coursesCochees[id];
      save();
      e.target.closest(".shop-row").classList.toggle("checked", e.target.checked);
    }
  });

  // exposé pour les tests automatisés
  window.__mims = { generer, listeCourses, estExclu, getCadre, getState: () => state };

  document.addEventListener("DOMContentLoaded", () => show("semaine"));
})();
