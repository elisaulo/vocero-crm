// Service Worker mínimo — Vocero CRM PWA
// Solo se necesita para que el navegador active el prompt de instalación.
// No se cachea nada: el CRM es dinámico (SSE en vivo, datos en tiempo real).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(self.clients.claim())
);
