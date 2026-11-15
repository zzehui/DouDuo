// Service Worker：缓存外壳，装到桌面后断网也能用。
// 版本号改一次 = 用户下次打开拿到新版。
const V = "pdfpocket-v1.7.0";
const ASSETS = [
  "./", "./index.html", "./core.js", "./compress.js", "./pdf-lib.esm.min.js",
  "./license.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./demo.pdf",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// HTML 走「网络优先」（保证版本一更新就能看到），静态资源走「缓存优先」（打开快）
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const isDoc = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(V).then((c) => c.put("./index.html", res.clone()));
          return res;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || fetch(req)))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) caches.open(V).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
