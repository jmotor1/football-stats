/* Offline helper for the stats app.
   Opens instantly from the copy saved on the device (works in airplane mode),
   then quietly checks GitHub for a newer version whenever there's a signal.
   A new version is saved for next time and the app shows "Update ready". */
const CACHE = "football-stats";
const FILES = ["./", "./index.html", "./manifest.json",
               "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
const PAGE = new URL("index.html", self.registration.scope).href;
const FLAG = new URL("__updated__", self.registration.scope).href;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function tellPages(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === "navigate";
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = isPage ? await cache.match(PAGE) : await cache.match(req, { ignoreSearch: true });
    const refresh = (async () => {
      try {
        const res = await fetch(isPage ? PAGE : req, { cache: "no-cache" });
        if (!res.ok) return null;
        if (isPage && cached) {
          // read the saved copy fresh: the one handed to the page has already been used
          const saved = await cache.match(PAGE);
          const [now, before] = await Promise.all([res.clone().text(), saved ? saved.text() : ""]);
          if (now !== before) {
            await cache.put(PAGE, res.clone());
            // leave a timestamp so a page that was still loading can notice too
            await cache.put(FLAG, new Response(String(Date.now())));
            await tellPages({ type: "app-updated" });
          }
        } else {
          await cache.put(isPage ? PAGE : req, res.clone());
        }
        return res;
      } catch (e) { return null; }          // no signal: the saved copy is all we need
    })();
    if (cached) { event.waitUntil(refresh); return cached; }
    return (await refresh) || new Response("Offline and not saved yet — open the app once with a connection.",
                                            { status: 503, headers: { "Content-Type": "text/plain" } });
  })());
});
