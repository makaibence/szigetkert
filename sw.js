const CACHE='szigetkert-shell-v1';
const FILES=['./','./index.html','./style.css','./app.js','./engine.js','./manifest.webmanifest','./icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('szigetkert-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>response).catch(()=>event.request.mode==='navigate'?caches.match('./index.html'):Response.error())))});
