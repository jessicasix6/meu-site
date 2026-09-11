// Service worker do PWA — só cacheia o "esqueleto" estático do app (HTML,
// CSS, JS, fontes, ícones). Nunca cacheia /api/, /webhook/ ou /health: esses
// dados são sempre dinâmicos, cachear resposta velha seria pior que não ter
// cache nenhum (ex: mostrar pedido já aceito como "aberto").
const CACHE_NAME = "top3-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/assets/style.css",
  "/assets/app.js",
  "/assets/fonts/inter-latin.woff2",
  "/assets/fonts/space-grotesk-latin.woff2",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhook/") || url.pathname === "/health") {
    return;
  }

  // Stale-while-revalidate: responde do cache na hora (se tiver), e sempre
  // busca uma versão nova em paralelo pra atualizar o cache.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
