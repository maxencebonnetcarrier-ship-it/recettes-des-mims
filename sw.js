/* Service worker — rend l'app utilisable hors-ligne une fois ouverte.
   Stratégie : réseau d'abord (pour recevoir les mises à jour), cache en secours. */
const CACHE = "mims-v22";
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
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copie = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
