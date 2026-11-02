// Service Worker mínimo — PWA
// Solo se necesita para que el navegador active el prompt de instalación.
// No se cachea nada: el CRM es dinámico (SSE en vivo, datos en tiempo real).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(self.clients.claim())
);

// Solo atiende navegaciones: la API y el SSE van directo a la red.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sin conexión</title>
<style>body{margin:0;padding:2rem;font-family:system-ui,sans-serif;text-align:center;color:#444}h1{margin-top:3rem;font-size:1.5rem}</style>
</head>
<body><h1>Sin conexión</h1><p>Comprueba tu red e intenta de nuevo.</p></body>
</html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        )
    )
  );
});
