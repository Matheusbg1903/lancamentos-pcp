/* Service worker: guarda o app no aparelho para funcionar sem internet */
const VERSAO = '1.3.0';
const REVISAO = 2;   // muda quando só o service worker precisa reinstalar
const CACHE = 'pcp-lancamentos-v' + VERSAO + '-r' + REVISAO;
const ARQUIVOS = ['./', 'index.html', 'app.js?v=' + VERSAO, 'cadastro.js?v=' + VERSAO, 'vendor/xlsx.full.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
// Baixa cada arquivo ignorando caches intermediários (evita guardar versão antiga misturada com nova)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ARQUIVOS.map(async u => {
    const sep = u.includes('?') ? '&' : '?';
    const r = await fetch(u + sep + 'nc=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('falha ao baixar ' + u);
    await c.put(u, r);
  }))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
