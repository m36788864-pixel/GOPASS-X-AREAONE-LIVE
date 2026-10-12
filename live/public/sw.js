/* AREAONE-LIVE service worker — เบา ๆ: เครือข่ายก่อน, ถ้าออฟไลน์ใช้ของที่แคชไว้
   ไม่แคช /api/ และหน้า admin จึงไม่ทำให้ข้อมูลหรือแชตค้าง */
const CACHE = 'areaone-live-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.includes('admin')) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./')))
  );
});
