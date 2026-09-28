/* LOCAKAR — Service Worker
 * Navegação: network-first → cache → /offline
 * /admin e /assinar: nunca vão para o cache (dados privados); offline mostra /offline
 * /api: sempre rede
 * /_next/static (hash imutável): cache-first
 * Imagens, ícones, fontes: stale-while-revalidate
 * Vídeo: rede (requisições Range não são cacheadas)
 * Web Push (VAPID): evento "push" mostra a notificação; clique abre a tela certa do painel.
 * Troque VERSION a cada mudança relevante neste arquivo.
 */
const VERSION = "v5";
const PAGES = `locakar-pages-${VERSION}`;
const STATIC = `locakar-static-${VERSION}`;
const MEDIA = `locakar-media-${VERSION}`;
const KEEP = [PAGES, STATIC, MEDIA];
const OFFLINE_URL = "/offline";
const MAX_MEDIA = 80;

// Shell mínimo do site. O painel não é pré-cacheado: exige login e dados do Supabase.
const PRECACHE = [
  OFFLINE_URL,
  "/",
  "/manifest.webmanifest",
  "/admin/manifest.webmanifest",
  "/logos/locakar-logo-light.png",
  "/logos/locakar-circular.png",
  "/images/hero-poster.jpg",
  "/icons/icon-192.png",
  "/icons/admin-192.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Assume o controle imediatamente, limpando versões antigas do /admin
  event.waitUntil(
    caches
      .open(PAGES)
      // Falha individual não impede a instalação (ex.: rota indisponível no momento).
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("locakar-") && !KEEP.includes(k)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

// A página pede a ativação imediata da nova versão (botão "Atualizar").
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(event) {
  const cache = await caches.open(PAGES);
  const path = new URL(event.request.url).pathname;
  // Painel e assinatura têm dados privados: nunca vão para o cache.
  const isPrivate = path.startsWith("/admin") || path.startsWith("/assinar");
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request));
    if (response.ok && response.type === "basic" && !isPrivate) cache.put(event.request, response.clone());
    return response;
  } catch {
    if (isPrivate) return (await cache.match(OFFLINE_URL)) || new Response("Sem conexão.", { status: 503 });
    return (
      (await cache.match(event.request, { ignoreSearch: true })) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(MEDIA);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((response) => {
      if (response.ok) cache.put(event.request, response.clone()).then(() => trim(MEDIA, MAX_MEDIA));
      return response;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // WhatsApp, Instagram, Google Fonts CSS: sempre rede
  if (request.headers.has("range") || url.pathname.startsWith("/video/")) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(event));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (
    url.pathname.startsWith("/_next/image") ||
    /\.(png|jpe?g|webp|avif|svg|ico|woff2?)$/.test(url.pathname) ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(staleWhileRevalidate(event));
  }
  // Demais (RSC/prefetch do Next): rede padrão; offline, a navegação cai no fallback acima.
});

/* ---------- Web Push (VAPID) ----------
 * Payload JSON enviado por src/lib/server/push.ts: { id?, title, body, url, severity, category?, tag? }.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/admin") ? data.url : "/admin";
  const critical = data.severity === "critical";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || "LOCAKAR", {
        body: data.body || "",
        icon: "/icons/admin-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag || data.id || undefined,
        renotify: Boolean(data.tag || data.id),
        requireInteraction: critical, // urgente fica na tela até ser visto; sem som extra
        timestamp: Date.now(),
        lang: "pt-BR",
        data: { url, id: data.id },
      });
      // Número no ícone do app instalado (quando suportado); o painel recalcula ao abrir.
      if (self.navigator && "setAppBadge" in self.navigator) {
        const open = await self.registration.getNotifications();
        self.navigator.setAppBadge(open.length).catch(() => {});
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/admin", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Prefere uma janela do painel já aberta: foca e navega até o registro.
      const admin = windows.find((w) => new URL(w.url).pathname.startsWith("/admin")) || windows[0];
      if (admin) {
        await admin.focus();
        if ("navigate" in admin) return admin.navigate(target.href).catch(() => self.clients.openWindow(target.href));
        return undefined;
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});

// O navegador trocou as chaves da inscrição: re-inscreve com a mesma chave pública e atualiza o servidor.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .then((subscription) =>
        fetch("/api/push", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "register", subscription: subscription.toJSON() }),
        }),
      )
      .catch(() => {}),
  );
});
