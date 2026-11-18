// Service Worker：缓存外壳，装到桌面后断网也能用。
// 版本号改一次 = 用户下次打开拿到新版。
const V = "pdfpocket-v2.12.0";
// OCR 大件（约 23MB）不进预缓存，避免安装时全量下载
const OCR_HEAVY = /\/vendor\/(font|tessdata|tesseract|pdfjs)\//;
const ASSETS = [
  "./", "./index.html", "./core.js", "./compress.js", "./pdf-lib.esm.min.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./demo.pdf",
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

// 缓存优先、后台更新：打开快，更新静默生效
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (OCR_HEAVY.test(new URL(req.url).pathname)) return;   // 交给浏览器 HTTP 缓存
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

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
