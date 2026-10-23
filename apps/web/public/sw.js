/* ============================================================================
   TOPIC LOG — SERVICE WORKER PWA (PR-MOB-01)
   Política Estrita de Cache Seguro e Proteção Contra Exposição Offline
   ============================================================================ */

const CACHE_NAME = "topiclog-static-v1.0.2";

// Recursos estáticos seguros para pre-cache
const STATIC_PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable.png",
  "/apple-touch-icon.png",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg"
];

// PADRÕES DE ROTAS E DADOS SENSÍVEIS ESTRITAMENTE PROIBIDOS DE CACHE
// (Em estrito cumprimento às diretrizes D05, D08, D16 e Decisões de Arquitetura)
const FORBIDDEN_CACHE_URL_PATTERNS = [
  "/delivery-code",       // CÓDIGO D16 DE 4 DÍGITOS — PROIBIDO CACHEAR LOCALMENTE
  "/api/v1/auth",         // Tokens JWT, senhas e refresh tokens
  "/api/v1/kyc",          // Dossiês biométricos, fotos de CNH/documentos
  "/api/v1/admin",        // Rotas administrativas restritas
  "/api/v1/finance",      // Dados bancários e liquidações
  "/api/v1/deliveries/confirm-delivery", // Validação online mandatória de entrega
  "/api/v1/legal/accept-term"            // Aceite bilateral exige gravação direta online
];

// 1. INSTALAÇÃO DO SERVICE WORKER
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// 2. ATIVAÇÃO E LIMPEZA DE CACHES ANTIGOS
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. INTERCEPTAÇÃO DE REQUISIÇÕES COM DEFESA CONTRA VAZAMENTO
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Não intercepta requisições não-GET
  if (request.method !== "GET") {
    return;
  }

  // REGRA DE SEGURANÇA E DESENVOLVIMENTO:
  // Em localhost, para scripts Next.js (_next/) ou rotas administrativas (/admin),
  // NUNCA intercepta nem serve cache stale. Encaminha direto para a rede viva.
  const isDevOrAdminOrInternal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/admin");

  if (isDevOrAdminOrInternal) {
    event.respondWith(fetch(request));
    return;
  }

  // REGRA DE SEGURANÇA: Se a URL contiver qualquer padrão proibido, ignora cache e força rede
  const isForbidden = FORBIDDEN_CACHE_URL_PATTERNS.some((pattern) =>
    url.pathname.includes(pattern)
  );

  if (isForbidden) {
    event.respondWith(fetch(request));
    return;
  }

  // Estratégia Stale-While-Revalidate para assets estáticos (_next/static, icons, manifest)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
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

  // Estratégia Network-First para páginas com fallback para cache
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Se a resposta for bem-sucedida e for HTML da mesma origem, armazena em cache
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          request.headers.get("accept")?.includes("text/html") &&
          url.origin === self.location.origin &&
          !url.pathname.startsWith("/admin") // Não armazena páginas admin no cache público
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback offline a partir do cache se a rede falhar
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Se for requisição HTML e não houver cache da página específica, retorna home cached
          if (request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }
          return new Response("Conexão com o servidor indisponível. Conecte-se à internet para continuar.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: new Headers({ "Content-Type": "text/plain; charset=utf-8" })
          });
        });
      })
  );
});
