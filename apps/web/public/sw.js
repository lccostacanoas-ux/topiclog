/* ============================================================================
   TOPICLOG — SERVICE WORKER PWA (STANDALONE & OFFLINE RESILIENT)
   Política Estrita: Cache apenas de assets estáticos e Network-First para páginas.
   NUNCA intercepta ou armazena chamadas /api/* ou métodos POST/PUT/DELETE/PATCH.
   ============================================================================ */

const CACHE_NAME = "topiclog-pwa-v1.0.4";

// Assets estáticos de pré-cache essenciais
const STATIC_PRECACHE = [
  "/",
  "/manifest.json",
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable.png",
  "/icons/apple-touch-icon.png",
  "/apple-touch-icon.png"
];

// 1. Instalação: ativa imediatamente sem bloquear o usuário
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_PRECACHE))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Falha no precache:", err);
        return self.skipWaiting();
      })
  );
});

// 2. Ativação: assume o controle de todos os clientes abertos e descarta caches legados
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log("[SW] Removendo cache legado:", name);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. Interceptação de Requisições
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // REGRA ABSOLUTA 1: Ignora qualquer método mutante (POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
  if (request.method !== "GET") {
    return;
  }

  // REGRA ABSOLUTA 2: NUNCA interceptar chamadas de API, autenticação, pagamentos ou webhooks
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/api/") ||
    url.pathname.startsWith("/api/v1/")
  ) {
    return; // Passa direto para a rede viva sem cache
  }

  // REGRA 3: Em ambiente localhost ou rotas internas de desenvolvimento, não cacheia scripts
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return;
  }

  // ESTRATÉGIA A: Assets estáticos imutáveis (CSS, fontes, imagens, ícones, _next/static)
  // Estratégia Stale-While-Revalidate para velocidade máxima
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|woff2|woff|ttf|css)$/)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        })
      )
    );
    return;
  }

  // ESTRATÉGIA B: Rotas de Páginas / Navegação HTML
  // Estratégia Network-First: sempre tenta buscar a versão mais recente da rede
  // Se estiver offline ou a rede falhar, utiliza o cache com fallback seguro
  if (request.headers.get("accept")?.includes("text/html") || request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            url.origin === self.location.origin &&
            !url.pathname.startsWith("/admin")
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match("/").then((homeCached) => {
              if (homeCached) {
                return homeCached;
              }
              return new Response(
                "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>TopicLog Offline</title><style>body{font-family:sans-serif;padding:32px 16px;text-align:center;background:#0F172A;color:#FFFFFF;}a{color:#38BDF8;font-weight:bold;text-decoration:none;}</style></head><body><h2>Sem Conexão com a Internet</h2><p>Conecte-se para continuar suas entregas no TopicLog.</p><button onclick='window.location.reload()' style='background:#1E3A8A;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:14px;cursor:pointer;'>Tentar Novamente</button></body></html>",
                {
                  status: 503,
                  headers: { "Content-Type": "text/html; charset=utf-8" }
                }
              );
            });
          });
        })
    );
  }
});
