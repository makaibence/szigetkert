const CACHE = 'szigetkert-shell-v10-workshops-4';
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
      const description = await (await cache.match('./assets/frames.json')).json();
      if (
        !['village', 'nature', 'props', 'expedition', 'workshops', 'items'].every(
          (name) => typeof description[name]?.src === 'string',
        )
      )
        throw Error('Incomplete graphics package: upload the full assets folder.');
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
      .open(CACHE)
      .then((cache) => cache.match(event.request))
      .then(
        (cached) =>
          cached ||
          fetch(event.request).catch(() =>
            event.request.mode === 'navigate'
              ? caches.open(CACHE).then((cache) => cache.match('./index.html'))
              : Response.error(),
          ),
      ),
  );
});
