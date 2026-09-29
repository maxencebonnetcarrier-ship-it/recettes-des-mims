/* Test de « Copier la liste » — à exécuter dans la console du navigateur
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
