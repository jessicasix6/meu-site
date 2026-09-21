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

  // Código do app (HTML, CSS, JS) vai pela rede primeiro, com o cache só como
  // rede de segurança pra quando estiver sem conexão.
  //
  // Antes era stale-while-revalidate pra tudo: respondia do cache na hora e
  // atualizava em segundo plano. O efeito colateral é que o primeiro acesso
  // depois de uma publicação SEMPRE mostrava a versão antiga — quem fosse
  // conferir se a mudança subiu concluía que não tinha subido, mesmo com o
  // deploy verde. Isso aconteceu de verdade e enganou por vários minutos.
  //
  // Fonte e ícone continuam vindo do cache primeiro: são grandes, quase nunca
  // mudam, e é deles que vem o ganho de carregar rápido.
  const ehCodigoDoApp =
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js");

  if (ehCodigoDoApp) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response("", { status: 503 })))
    );
    return;
  }

  // Stale-while-revalidate pro resto: responde do cache na hora (se tiver), e
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
