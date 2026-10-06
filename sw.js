/* ============================================================
   BluePlanet Service Worker（v3）
   缓存优先策略：全部本地资源离线可用；http(s) 下注册，
   file:// 双击打开时由 main.js 的环境判断自动跳过。
   版本号随 ?v= 一起升级（当前 bp8）。
   ============================================================ */

const CACHE = 'blueplanet-v14';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/modules.css',
  './css/v3.css',
  './js/lib/three.min.js',
  './js/lib/OrbitControls.js',
  './js/textures-data.js',
  './js/data.js',
  './js/textures.js',
  './js/scene.js',
  './js/markers.js',
  './js/labels.js',
  './js/figures.js',
  './js/layers.js',
  './js/cutaway.js',
  './js/tours.js',
  './js/game.js',
  './js/insights.js',
  './js/panels.js',
  './js/search.js',
  './js/assistant.js',
  './js/lab.js',
  './js/random.js',
  './js/i18n.js',
  './puzzle.html',
  './js/puzzle-page.js',
  './js/i18n.js',
  './puzzle.html',
  './js/quakes.js',
  './js/deeptime-data.js',
  './js/deeptime.js',
  './js/puzzle.js',
  './js/ui.js',
  './js/main.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  /* 页面导航（index.html）：网络优先，离线才用缓存 —— 避免改版后被旧页面锁死 */
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  /* 静态资源：缓存优先 + 运行时更新 */
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return resp;
      }).catch(() => hit)
    )
  );
});
