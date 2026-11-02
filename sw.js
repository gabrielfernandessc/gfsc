// Service worker da CNA: deixa o site instalável como app, abre mesmo com internet ruim
// e recebe as notificações do Radar Irã (que o servidor limita a 1 por dia).
const CACHE = "cna-v1";
const BASE = ["/", "/styles.css", "/app.js", "/data.js", "/registro.js", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (pra sempre pegar a versão nova), cache só se estiver offline.
// A API nunca passa pelo cache.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === "navigate" ? "/" : req).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "CNA", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: d.tag || "cna",
      data: { url: d.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      const janela = abertas.find((c) => new URL(c.url).origin === self.location.origin);
      if (janela) return janela.focus().then((c) => (c || janela).navigate(destino));
      return self.clients.openWindow(destino);
    })
  );
});
