/**
 * Hub de synchronisation — Recettes des Mim's
 *
 * Rôle : mémoire commune entre plusieurs téléphones (Maxence & Marine).
 * L'app y lit/écrit son état (menu, courses cochées, notes, favoris, exclusions…).
 *
 * Stockage : PropertiesService (pas besoin de Sheet). Une clé = un foyer.
 * Protection : un token secret partagé. L'URL est publique, le token fait la serrure.
 *
 * API :
 *   GET  ?token=XXX            -> { ok:true, state:{...}, updatedAt:123 }
 *   POST { token, patch:{...} } -> fusionne le patch et renvoie l'état fusionné
 *
 * Fusion : chaque champ porte un horodatage ; le plus RÉCENT gagne (champ par champ).
 * Les cases de courses sont fusionnées case par case, pour que deux personnes
 * puissent cocher en même temps en magasin sans s'écraser.
 */

var SECRET_TOKEN = "CHANGE_MOI_avec_un_secret_long";
var CLE = "mims_state";          // clé de stockage du foyer
var MAX_OCTETS = 450000;          // garde-fou (limite Properties ~500 ko)

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.token !== SECRET_TOKEN) return _json({ ok: false, error: "token" }, 401);
    return _json({ ok: true, state: _lire(), updatedAt: _lire().__updatedAt || 0 });
  } catch (err) {
    return _json({ ok: false, error: String(err) }, 500);
  }
}

function doPost(e) {
  var verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(10000);   // évite deux écritures simultanées
    var corps = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (corps.token !== SECRET_TOKEN) return _json({ ok: false, error: "token" }, 401);

    var actuel = _lire();
    var fusionne = _fusionner(actuel, corps.patch || {});
    fusionne.__updatedAt = Date.now();

    var texte = JSON.stringify(fusionne);
    if (texte.length > MAX_OCTETS) return _json({ ok: false, error: "trop gros" }, 413);
    PropertiesService.getScriptProperties().setProperty(CLE, texte);

    return _json({ ok: true, state: fusionne, updatedAt: fusionne.__updatedAt });
  } catch (err) {
    return _json({ ok: false, error: String(err) }, 500);
  } finally {
    try { verrou.releaseLock(); } catch (e2) {}
  }
}

/** Fusion champ par champ : on garde la valeur dont l'horodatage est le plus récent. */
function _fusionner(actuel, patch) {
  var out = {};
  var cles = {};
  Object.keys(actuel || {}).forEach(function (k) { cles[k] = 1; });
  Object.keys(patch || {}).forEach(function (k) { cles[k] = 1; });

  Object.keys(cles).forEach(function (k) {
    if (k === "__updatedAt") return;
    var a = actuel ? actuel[k] : undefined;
    var b = patch ? patch[k] : undefined;

    if (b === undefined) { out[k] = a; return; }
    if (a === undefined) { out[k] = b; return; }

    // cases de courses : fusion élément par élément
    if (k === "coursesCochees") { out[k] = _fusionnerCases(a, b); return; }

    var ta = (a && typeof a === "object" && a.t) || 0;
    var tb = (b && typeof b === "object" && b.t) || 0;
    out[k] = (tb >= ta) ? b : a;
  });
  return out;
}

/** Cases de courses : { v: { id: {c:bool, t:ts} }, t: ts } */
function _fusionnerCases(a, b) {
  var va = (a && a.v) || {}, vb = (b && b.v) || {};
  var res = {};
  var ids = {};
  Object.keys(va).forEach(function (i) { ids[i] = 1; });
  Object.keys(vb).forEach(function (i) { ids[i] = 1; });
  Object.keys(ids).forEach(function (i) {
    var xa = va[i], xb = vb[i];
    if (!xa) { res[i] = xb; return; }
    if (!xb) { res[i] = xa; return; }
    res[i] = ((xb.t || 0) >= (xa.t || 0)) ? xb : xa;
  });
  return { v: res, t: Math.max((a && a.t) || 0, (b && b.t) || 0) };
}

function _lire() {
  var brut = PropertiesService.getScriptProperties().getProperty(CLE);
  if (!brut) return {};
  try { return JSON.parse(brut); } catch (e) { return {}; }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Remet le foyer à zéro (à lancer à la main depuis l'éditeur si besoin). */
function _reinitialiser() {
  PropertiesService.getScriptProperties().deleteProperty(CLE);
  Logger.log("État effacé.");
}

/** Test rapide à lancer depuis l'éditeur : doit afficher ok:true puis l'état fusionné. */
function _testHub() {
  var faux = { postData: { contents: JSON.stringify({
    token: SECRET_TOKEN,
    patch: { favoris: { v: ["Test"], t: Date.now() } }
  }) } };
  Logger.log(doPost(faux).getContent());
  Logger.log(doGet({ parameter: { token: SECRET_TOKEN } }).getContent());
}
