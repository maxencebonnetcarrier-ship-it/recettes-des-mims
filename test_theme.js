/* Test du réglage « Apparence » (Réglages) — à exécuter dans la console du navigateur
   ou via le harnais Playwright/CDP, téléphone en clair PUIS en sombre. Retourne un objet
   résultat, n'affiche rien. Remet l'apparence sur « Auto » à la fin. */
(function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims;
  const ech = (m) => res.echecs.push(m);
  const fond = () => getComputedStyle(document.body).backgroundColor;
  const CLAIR = "rgb(247, 241, 232)", SOMBRE = "rgb(28, 27, 24)";
  const tel = matchMedia("(prefers-color-scheme: dark)").matches ? "sombre" : "clair";
  res.details.telephone = tel;
  const onglet = (v) => document.querySelector(`.tab[data-view="${v}"]`).click();
  const bouton = (v) => document.querySelector(`#view-reglages button[data-act="theme"][data-val="${v}"]`);
  const barres = () => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content"));

  try {
    onglet("reglages");
    /* 1. Les trois choix sont sur le sommaire des Réglages. */
    if (!bouton("auto") || !bouton("clair") || !bouton("sombre")) {
      ech("1. les 3 choix Auto / Clair / Sombre ne sont pas dans Réglages");
      return res;
    }

    /* 2. « Sombre » force le sombre, quel que soit le téléphone, et reste sur l'appareil. */
    bouton("sombre").click();
    if (fond() !== SOMBRE) ech(`2. « Sombre » : fond ${fond()} au lieu de ${SOMBRE}`);
    if (localStorage.getItem("mims_theme") !== "sombre") ech("2. « Sombre » n'est pas retenu sur l'appareil");
    if (bouton("sombre").getAttribute("aria-pressed") !== "true") ech("2. le bouton « Sombre » n'apparaît pas choisi");
    if (barres().some((c) => c !== "#1c1b18")) ech(`2. barre du téléphone en « Sombre » : ${barres().join(", ")}`);

    /* 3. « Clair » force le clair, même avec un téléphone en sombre. */
    bouton("clair").click();
    if (fond() !== CLAIR) ech(`3. « Clair » : fond ${fond()} au lieu de ${CLAIR}`);
    if (barres().some((c) => c !== "#f7f1e8")) ech(`3. barre du téléphone en « Clair » : ${barres().join(", ")}`);

    /* 4. « Auto » suit le téléphone et n'enregistre aucun choix forcé. */
    bouton("auto").click();
    const attendu = tel === "sombre" ? SOMBRE : CLAIR;
    if (fond() !== attendu) ech(`4. « Auto » avec un téléphone en ${tel} : fond ${fond()} au lieu de ${attendu}`);
    if (localStorage.getItem("mims_theme") !== null) ech("4. « Auto » laisse un choix forcé enregistré");
    if (barres().join(",") !== "#f7f1e8,#1c1b18") ech(`4. barre du téléphone revenue en « Auto » : ${barres().join(", ")}`);
    const resume = document.querySelector('#view-reglages button[data-act="theme"]').closest(".so").querySelector(".m").textContent;
    res.details.resumeAuto = resume;
    if (!resume.includes(tel)) ech(`4. le résumé ne dit pas que le téléphone est en ${tel} : « ${resume} »`);

    /* 5. L'apparence est un réglage de CET appareil : elle ne part pas dans les données partagées. */
    if ("theme" in M.getState()) ech("5. l'apparence est rangée dans les données partagées");
  } finally {
    try { localStorage.removeItem("mims_theme"); } catch (e) { /* stockage indisponible */ }
    if (M.choisirTheme) M.choisirTheme("auto");
  }
  return res;
})();
