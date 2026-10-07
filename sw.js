/* Service worker — rend l'app utilisable hors-ligne une fois ouverte.
   Stratégie : réseau d'abord (pour recevoir les mises à jour), cache en secours. */
const CACHE = "mims-v43";
const FICHIERS = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
  // NE PAS forcer ici un self.clients.matchAll(...).navigate() pour recharger les pages
  // ouvertes : testé le 28/09/2026, ça met la page dans une BOUCLE de rechargement
  // infinie (page figée, plus aucun JS évaluable). Le rechargement est déclenché côté
  // page, via « controllerchange » dans index.html, qui porte un garde-fou anti-boucle.
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;
  // « Réseau d'abord » ne suffisait PAS : GitHub Pages répond « Cache-Control: max-age=600 »,
  // donc pendant 10 minutes le navigateur servait sa propre copie SANS interroger le serveur
  // — une mise à jour pouvait rester invisible alors que tout était en ligne. On force donc
  // un vrai aller-retour réseau pour les fichiers de l'app ; le cache reste le secours
  // hors-ligne. Mesuré le 28/09/2026 sur la production.
  // NB : on ne peut PAS recréer une requête de navigation (« Cannot construct a Request
  // with a RequestInit whose mode member is set as navigate ») — on passe donc par l'URL.
  const chemin = new URL(req.url).pathname;
  const aJour = req.mode === "navigate" || /\.(html|js|css|webmanifest)$/i.test(chemin);
  const appel = aJour
    ? fetch(req.url, { cache: "no-store", credentials: "same-origin" })
    : fetch(req);
  e.respondWith(
    appel
      .then((res) => {
        const copie = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
