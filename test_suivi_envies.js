/* Test du suivi des envies (v38) — à exécuter dans la console du navigateur ou via lancer_tests.mjs.
   Le guetteur du PC écrit sur le hub où en est chaque envie de plat (champ « guetteur ») ; Réglages ›
   Mes envies l'affiche. Le champ est en LECTURE SEULE pour les téléphones : ils ne le renvoient jamais
   (sinon un téléphone en retard effacerait le résultat du PC).
   ATTENTION : remplace les envies de l'appareil, puis les vide ; la synchro de test est déconnectée. */
(async function () {
  "use strict";
  const res = { echecs: [], details: {} };
  const M = window.__mims, st = M.getState();
  const ech = (m) => res.echecs.push(m);
  const onglet = (v) => document.querySelector(`.tab[data-view="${v}"]`).click();
  const sansAcc = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const MIN = 60000, H = 3600000, maintenant = Date.now();
  const ligne = (nom) => [...document.querySelectorAll("#view-reglages .envie-l")].find((l) => l.querySelector(".el-n").textContent === nom);
  const etat = (nom) => { const l = ligne(nom); return l ? (l.querySelector(".el-s") || { textContent: "" }).textContent : null; };
  function ouvrirEnvies() {
    onglet("reglages");
    document.querySelector('#view-reglages button[data-act="reglages-ouvrir"][data-sec="envies"]').click();
  }
  const fetchVrai = window.fetch;

  try {
    // noms FICTIFS : un vrai nom de plat finirait par entrer dans la base (ajouté par le guetteur lui-même),
    // et ce test virerait au rouge, ce qui bloquerait toute publication du guetteur (constaté le 05/10)
    const absents = ["Plat fictif alpha", "Plat fictif bravo", "Plat fictif charlie", "Plat fictif delta", "Plat fictif echo", "Plat fictif foxtrot"];
    const present = absents.filter((n) => window.RECIPES.some((r) => sansAcc(r.nom).includes(sansAcc(n))));
    if (present.length) ech("précondition : déjà dans la base : " + present.join(", "));
    st.envies = [{ nom: "Plat fictif alpha", jour: "Mar" }, { nom: "Plat fictif bravo" }, { nom: "Tendron de veau", jour: "Dim" },
      { nom: "Plat fictif charlie" }, { nom: "Plat fictif delta" }, { nom: "Plat fictif echo" }, { nom: "Plat fictif foxtrot" },
      { nom: "poireaux", type: "ingredient", jour: "Jeu" }];
    const S = (nom, etat, plus) => Object.assign({ nom, etat, t: maintenant - 5 * MIN }, plus || {});
    st.guetteur = { passe: maintenant - 10 * MIN, envies: {
      [sansAcc("Plat fictif alpha")]: S("Plat fictif alpha", "en_cours"),
      [sansAcc("Plat fictif charlie")]: S("Plat fictif charlie", "introuvable", { prochain: maintenant + 20 * H }),
      [sansAcc("Plat fictif delta")]: S("Plat fictif delta", "refusee", { detail: "contient un ingrédient exclu par défaut : champignons", prochain: maintenant + 20 * H }),
      [sansAcc("Plat fictif echo")]: S("Plat fictif echo", "erreur", { prochain: maintenant + 2 * H }),
      [sansAcc("Plat fictif foxtrot")]: S("Plat fictif foxtrot", "ajoutee", { recette: "Recette fictive echo" }),
    } };

    /* 1. Chaque envie de plat dit où elle en est. */
    ouvrirEnvies();
    const attendus = [["Plat fictif alpha", /cherche/], ["Plat fictif bravo", /pas encore/], ["Tendron de veau", /dans ta base.*Tendron de veau printanier/],
      ["Plat fictif charlie", /introuvable.*nouvel essai/], ["Plat fictif delta", /refusée.*champignons.*nouvel essai/],
      ["Plat fictif echo", /nouvel essai/], ["Plat fictif foxtrot", /ajoutée/]];
    attendus.forEach(([nom, re]) => {
      const t = etat(nom);
      if (t === null) ech(`1. pas de ligne pour « ${nom} »`);
      else if (!re.test(t)) ech(`1. « ${nom} » : « ${t} » ne correspond pas à ${re}`);
    });
    res.details.etats = Object.fromEntries(attendus.map(([n]) => [n, etat(n)]));
    if (!ligne("poireaux") || ligne("poireaux").querySelector(".el-s")) ech("1. l'envie d'ingrédient porte un suivi du PC (elle ne doit pas)");
    if (!ligne("Plat fictif foxtrot") || !ligne("Plat fictif foxtrot").querySelector('button[data-act="maj-app"]')) ech("1. pas de bouton pour mettre l'app à jour sur une recette ajoutée");
    const tete = (document.querySelector("#view-reglages .suivi-pc") || { textContent: "" }).textContent;
    res.details.passe = tete;
    if (!/il y a 10 min/.test(tete)) ech(`1. dernier passage du PC mal affiché : « ${tete} »`);
    // « ✕ » retire toujours la bonne envie (ligne et indice cohérents)
    const iMou = st.envies.findIndex((e) => e.nom === "Plat fictif foxtrot");
    if (!ligne("Plat fictif foxtrot").querySelector(`button[data-act="del-envie"][data-i="${iMou}"]`)) ech("1. le ✕ de « Plat fictif foxtrot » ne vise pas la bonne envie");

    /* 2. PC silencieux depuis plus de 2 h : l'écran le signale. */
    st.guetteur.passe = maintenant - 3 * H;
    ouvrirEnvies();
    const vieux = (document.querySelector("#view-reglages .suivi-pc") || { textContent: "" }).textContent;
    if (!/allumé/.test(vieux)) ech(`2. pas d'alerte pour un PC muet depuis 3 h : « ${vieux} »`);

    /* 3. Recette ajoutée par le PC mais pas encore dans l'app : elle est à récupérer. */
    const att = M.ajoutsEnAttente();
    if (JSON.stringify(att) !== '["Plat fictif foxtrot"]') ech(`3. ajouts en attente : ${JSON.stringify(att)} au lieu de ["Plat fictif foxtrot"]`);

    /* 4. Synchro : le téléphone REÇOIT le suivi mais ne le renvoie JAMAIS. */
    st.guetteur = undefined;
    const distant = { envies: { v: [{ nom: "Plat fictif alpha", jour: "Mar" }], t: 5 },
      guetteur: { v: { passe: maintenant - MIN, envies: { [sansAcc("Plat fictif alpha")]: S("Plat fictif alpha", "en_cours") } }, t: 10 } };
    const envois = [];
    window.fetch = async (url, opt) => {
      if (opt && opt.method === "POST") envois.push(JSON.parse(opt.body));
      return { ok: true, json: async () => ({ ok: true, state: JSON.parse(JSON.stringify(distant)) }) };
    };
    const ok = await window.__sync.connecter("https://script.google.com/macros/s/TEST/exec", "jeton-test");
    if (!ok) ech("4. connexion au faux hub refusée");
    const recu = st.guetteur && st.guetteur.envies && st.guetteur.envies[sansAcc("Plat fictif alpha")];
    if (!recu || recu.etat !== "en_cours") ech("4. le suivi du hub n'est pas reçu : " + JSON.stringify(st.guetteur));
    if (!envois.length) ech("4. aucun envoi vers le hub (le test ne prouve rien)");
    if (envois.some((p) => p.patch && "guetteur" in p.patch)) ech("4. le téléphone renvoie le suivi du PC au hub");
    res.details.champsEnvoyes = envois.length ? Object.keys(envois[envois.length - 1].patch).join(",") : "";
    // le PC met à jour : « ajoutée »
    distant.guetteur = { v: { passe: maintenant, envies: { [sansAcc("Plat fictif alpha")]: S("Plat fictif alpha", "ajoutee", { recette: "Recette fictive alpha", t: maintenant }) } }, t: 20 };
    ouvrirEnvies();
    await window.__sync.maintenant();
    const maj = st.guetteur.envies[sansAcc("Plat fictif alpha")];
    if (!maj || maj.etat !== "ajoutee") ech("4. la mise à jour du PC n'est pas reçue");
    if (!/ajoutée/.test(etat("Plat fictif alpha") || "")) ech(`4. l'écran ouvert ne s'est pas mis à jour : « ${etat("Plat fictif alpha")} »`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.fetch = fetchVrai;
    try { window.__sync.deconnecter(); } catch (e) { /* synchro absente */ }
    st.envies = []; st.guetteur = undefined;
    M.sauver();
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
