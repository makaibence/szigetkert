const CACHE = 'szigetkert-shell-v7-release-3';
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('install', (event) =>
  event.waitUntil(
    (async () => {
      const response = await fetch('./offline-files.json', { cache: 'no-store' });
      if (!response.ok) throw Error('Offline manifest missing');
      const files = await response.json(),
        cache = await caches.open(CACHE);
      // Sequential small batches avoid overwhelming the mobile browser during first installation.
      for (let i = 0; i < files.length; i += 4)
        await Promise.all(
          files.slice(i, i + 4).map((file) => cache.add(new Request(file, { cache: 'reload' }))),
        );
      await cache.add('./offline-files.json');
    })(),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('szigetkert-shell-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin)
    return;
  event.respondWith(
    caches
      .match(event.request)
      .then(
        (cached) =>
          cached ||
          fetch(event.request).catch(() =>
            event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error(),
          ),
      ),
  );
});
