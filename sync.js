/* Synchronisation avec le hub partagé (Apps Script).
   Sans hub configuré, l'app fonctionne exactement comme avant (100% locale).

   Principe : chaque champ partagé porte un horodatage. Au moment de fusionner,
   la valeur la plus RÉCENTE gagne. Les cases de courses sont fusionnées case par
   case, pour que deux personnes puissent cocher en même temps en magasin. */
(function () {
  "use strict";

  const CONF = "mims_sync_conf";
  // champs synchronisés entre les téléphones du foyer
  const CHAMPS = ["semaine", "historique", "exclusions", "promos", "cadreJours", "favoris", "notes", "envies"];

  let conf = charger();
  let horodatages = {};   // champ -> dernier horodatage local connu
  let enCours = false;
  let aPousser = false;

  function charger() {
    try { return JSON.parse(localStorage.getItem(CONF)) || {}; } catch (e) { return {}; }
  }
  function sauverConf() { localStorage.setItem(CONF, JSON.stringify(conf)); }

  const actif = () => !!(conf.url && conf.token);

  /* ---------- appels réseau ---------- */
  async function lireDistant() {
    const u = conf.url + (conf.url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(conf.token);
    const r = await fetch(u, { method: "GET", redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "refus");
    return j.state || {};
  }

  async function ecrireDistant(patch) {
    // text/plain évite le pré-vol CORS, qu'Apps Script ne gère pas
    const r = await fetch(conf.url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: conf.token, patch }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "refus");
    return j.state || {};
  }

  /* ---------- conversions état <-> format horodaté ---------- */
  function versPatch(state, champs) {
    const p = {};
    champs.forEach((k) => {
      if (state[k] === undefined) return;
      if (k === "coursesCochees") return;   // traité à part
      p[k] = { v: state[k], t: horodatages[k] || Date.now() };
    });
    // cases de courses : un horodatage par case
    const cases = {};
    Object.keys(state.coursesCochees || {}).forEach((id) => {
      cases[id] = { c: true, t: (horodatages["case:" + id] || Date.now()) };
    });
    (conf.casesDecochees || []).forEach((o) => { cases[o.id] = { c: false, t: o.t }; });
    p.coursesCochees = { v: cases, t: Date.now() };
    return p;
  }

  function appliquer(distant, state) {
    let change = false;
    CHAMPS.forEach((k) => {
      const d = distant[k];
      if (!d || d.v === undefined) return;
      const tLocal = horodatages[k] || 0;
      if ((d.t || 0) > tLocal) {
        state[k] = d.v;
        horodatages[k] = d.t;
        change = true;
      }
    });
    // cases de courses
    const dc = distant.coursesCochees && distant.coursesCochees.v;
    if (dc) {
      Object.keys(dc).forEach((id) => {
        const e = dc[id], tLocal = horodatages["case:" + id] || 0;
        if ((e.t || 0) > tLocal) {
          horodatages["case:" + id] = e.t;
          if (e.c) state.coursesCochees[id] = true; else delete state.coursesCochees[id];
          change = true;
        }
      });
    }
    return change;
  }

  /* ---------- cycle de synchro ---------- */
  async function synchroniser(opts) {
    if (!actif() || enCours) { aPousser = aPousser || !!(opts && opts.pousser); return; }
    enCours = true;
    const api = window.__mims;
    const state = api.getState();
    try {
      const distant = (opts && opts.pousser)
        ? await ecrireDistant(versPatch(state, CHAMPS.concat("coursesCochees")))
        : await lireDistant();
      const change = appliquer(distant, state);
      conf.casesDecochees = [];
      conf.derniere = Date.now();
      conf.erreur = null;
      sauverConf();
      api.sauver();
      if (change) api.rafraichir();
      majIndicateur("ok");
    } catch (e) {
      conf.erreur = String(e.message || e);
      sauverConf();
      majIndicateur("erreur");
    } finally {
      enCours = false;
      if (aPousser) { aPousser = false; synchroniser({ pousser: true }); }
    }
  }

  // déclenché par l'app à chaque modification locale
  let minuteur = null;
  function signalerChangement(champ, idCase, decochee) {
    if (!actif()) return;
    const t = Date.now();
    if (champ) horodatages[champ] = t;
    if (idCase) {
      horodatages["case:" + idCase] = t;
      if (decochee) {
        conf.casesDecochees = (conf.casesDecochees || []).concat([{ id: idCase, t }]);
        sauverConf();
      }
    }
    clearTimeout(minuteur);
    // on groupe les modifications rapprochées en un seul envoi
    minuteur = setTimeout(() => synchroniser({ pousser: true }), 900); // sleep-ok: regroupement d'écritures (debounce), pas une attente de condition
  }

  function majIndicateur(etat) {
    const el = document.getElementById("sync-etat");
    if (!el) return;
    if (!actif()) { el.textContent = ""; return; }
    el.textContent = etat === "erreur" ? "⚠️ synchro impossible" : "🔗 partagé";
    el.className = "sync-etat " + etat;
  }

  /* ---------- API exposée aux Réglages ---------- */
  window.__sync = {
    actif,
    conf: () => ({ url: conf.url || "", token: conf.token || "", derniere: conf.derniere, erreur: conf.erreur }),
    async connecter(url, token) {
      conf.url = (url || "").trim();
      conf.token = (token || "").trim();
      sauverConf();
      try {
        // 1) on LIT d'abord : le foyer qui existe déjà fait autorité
        const distant = await lireDistant();
        const state = window.__mims.getState();
        appliquer(distant, state);
        // 2) on ne pousse que les champs ABSENTS du hub (sinon un téléphone vierge
        //    écraserait les données du conjoint avec ses valeurs vides)
        CHAMPS.concat("coursesCochees").forEach((k) => {
          if (!distant[k]) horodatages[k] = Date.now();
        });
        window.__mims.sauver();
        window.__mims.rafraichir();
        conf.erreur = null;
        sauverConf();
        await synchroniser({ pousser: true });
      } catch (e) {
        conf.erreur = String(e.message || e);
        sauverConf();
        majIndicateur("erreur");
      }
      return !conf.erreur;
    },
    deconnecter() {
      conf = {};
      localStorage.removeItem(CONF);
      majIndicateur();
    },
    maintenant: () => synchroniser({}),
    signalerChangement,
  };

  // synchro à l'ouverture, au retour sur l'app, et régulièrement
  document.addEventListener("DOMContentLoaded", () => { majIndicateur(); synchroniser({}); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) synchroniser({}); });
  setInterval(() => { if (!document.hidden) synchroniser({}); }, 20000); // sleep-ok: relève périodique des changements du conjoint, pas d'attente de condition
})();
