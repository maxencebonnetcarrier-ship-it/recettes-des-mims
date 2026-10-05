/* Test du suivi des envies (v38) — à exécuter dans la console du navigateur ou via lancer_tests.mjs.
   Le guetteur du PC écrit sur le hub où en est chaque envie de plat (champ « guetteur ») ; Réglages ›
   Mes envies l'affiche. Le champ est en LECTURE SEULE pour les téléphones : ils ne le renvoient jamais
   (sinon un téléphone en retard effacerait le résultat du PC).
   v41 : une envie que le PC a reliée à une recette au titre différent (recherche élargie) la retrouve, menu
   compris ; une recette qui contient un ingrédient exclu le dit ; les pluriels retrouvent le titre.
   ATTENTION : remplace les envies de l'appareil, puis les vide ; la synchro de test est déconnectée. Le menu,
   les épingles et les exclusions sont remis comme avant. */
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
  const CHAMPS_REMIS = ["semaine", "suivante", "epingles", "exclusions", "servis"];
  const avant = Object.fromEntries(CHAMPS_REMIS.map((c) => [c, st[c] === undefined ? undefined : JSON.stringify(st[c])]));

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
    window.__sync.deconnecter();
    window.fetch = fetchVrai;

    /* 5. Recette au titre différent de l'envie, reliée par le PC (v41, « riz poivrons chorizos » → « Riz au
       chorizo ») : l'envie la retrouve, et l'épingle du jour aussi. */
    const LIEE = "Cordon bleu";
    if (!window.RECIPES.some((r) => r.nom === LIEE)) ech(`5. précondition : « ${LIEE} » n'est plus dans la base`);
    st.envies = [{ nom: "Plat fictif golf" }, { nom: "Plat fictif hotel", jour: "Mar" }];
    st.guetteur = { passe: maintenant - MIN, envies: {
      [sansAcc("Plat fictif golf")]: S("Plat fictif golf", "ajoutee", { recette: LIEE }),
      [sansAcc("Plat fictif hotel")]: S("Plat fictif hotel", "ajoutee", { recette: LIEE, detail: "contient chapelure" }),
    } };
    st.exclusions = (st.exclusions || []).filter((x) => sansAcc(x) !== "chapelure");
    ouvrirEnvies();
    if (!/ajoutée par le PC : Cordon bleu$/.test(etat("Plat fictif golf") || "")) ech(`5. envie reliée : « ${etat("Plat fictif golf")} »`);
    if (/mettre l'app à jour/.test(etat("Plat fictif golf") || "")) ech("5. recette déjà dans l'app mais mise à jour proposée");
    if (M.ajoutsEnAttente().length) ech("5. ajouts en attente alors que la recette est dans l'app : " + JSON.stringify(M.ajoutsEnAttente()));
    M.epingler("Lun", "Plat fictif golf");
    M.generer();
    const lun = st.semaine && st.semaine.plan.find((p) => p && p.jour === "Lun");
    res.details.lundiRelie = lun && lun.nom;
    if (!lun || lun.nom !== LIEE) ech(`5. l'épingle « Plat fictif golf » ne donne pas ${LIEE} lundi : ${lun && lun.nom}`);

    /* 6. La recette contient un ingrédient exclu (le PC l'a proposée faute de mieux) : l'envie le dit, et dit
       comment l'avoir au menu, puisqu'une recette exclue n'est jamais tirée au sort. */
    st.exclusions.push("chapelure");
    ouvrirEnvies();
    const g6 = etat("Plat fictif golf") || "", h6 = etat("Plat fictif hotel") || "";
    res.details.exclue = { golf: g6, hotel: h6 };
    if (!/contient chapelure, normalement exclu/.test(g6) || !/ajoute-la de nouveau avec un jour/.test(g6)) ech(`6. envie sans jour : « ${g6} »`);
    if (!/contient chapelure, normalement exclu/.test(h6) || !/imposée quand même mardi/.test(h6)) ech(`6. envie pour mardi : « ${h6} »`);
    st.exclusions = st.exclusions.filter((x) => x !== "chapelure");

    /* 7. Pluriels : « Escalopes poulets panées » retrouve « Escalopes de poulet panées ». */
    M.desepingler("Lun");
    M.epingler("Lun", "Escalopes poulets panées");
    M.generer();
    const lun7 = st.semaine && st.semaine.plan.find((p) => p && p.jour === "Lun");
    res.details.lundiPluriels = lun7 && lun7.nom;
    if (!lun7 || lun7.nom !== "Escalopes de poulet panées") ech(`7. « Escalopes poulets panées » donne lundi : ${lun7 && lun7.nom}`);
  } catch (e) {
    ech("exception : " + e + " " + (e.stack || "").split("\n")[1]);
  } finally {
    window.fetch = fetchVrai;
    try { window.__sync.deconnecter(); } catch (e) { /* synchro absente */ }
    st.envies = []; st.guetteur = undefined;
    CHAMPS_REMIS.forEach((c) => { if (avant[c] === undefined) delete st[c]; else st[c] = JSON.parse(avant[c]); });
    M.sauver();
    try { onglet("semaine"); } catch (e) { /* écran absent */ }
  }
  res.ok = res.echecs.length === 0;
  return res;
})();
