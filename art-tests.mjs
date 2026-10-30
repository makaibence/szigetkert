import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { validateArtManifest, loadArt } from './art.js';
const manifest = JSON.parse(await fs.readFile(new URL('./assets/frames.json', import.meta.url)));
assert.equal(validateArtManifest(manifest), manifest);
const stale = structuredClone(manifest);
delete stale.expedition;
assert.throws(() => validateArtManifest(stale), /assets/);
assert.throws(() => validateArtManifest(null), /assets/);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => ({ ok: true, json: async () => stale });
  await assert.rejects(loadArt(), /assets/);
} finally {
  globalThis.fetch = originalFetch;
}
for (const file of Object.values(manifest)) await fs.access(new URL(file.src, import.meta.url));
const handlers = {};
let description = stale;
const active = { version: 'current' };
const context = vm.createContext({
  self: {
    addEventListener: (name, fn) => {
      handlers[name] = fn;
    },
  },
  location: { origin: 'https://game.test' },
  URL,
  Request,
  Response,
  fetch: async () => ({ ok: true, json: async () => ['./assets/frames.json'] }),
  caches: {
    open: async (name) => {
      assert.match(name, /v13-discoveries-3$/);
      return {
        add: async () => {},
        match: async (request) =>
          request === './assets/frames.json' ? { json: async () => description } : active,
      };
    },
  },
});
vm.runInContext(await fs.readFile(new URL('./sw.js', import.meta.url), 'utf8'), context);
let result;
// The browser resolves relative Requests; emulate that resolution for this isolated worker test.
context.Request = class {
  constructor(url) {
    this.url = new URL(url, 'https://game.test/').href;
  }
};
handlers.install({
  waitUntil: (promise) => {
    result = promise;
  },
});
await assert.rejects(result, /Incomplete graphics/);
description = manifest;
handlers.install({
  waitUntil: (promise) => {
    result = promise;
  },
});
await result;
handlers.fetch({
  request: { method: 'GET', url: 'https://game.test/art.js' },
  respondWith: (promise) => {
    result = promise;
  },
});
assert.equal(await result, active);
console.log(
  'PASS: graphics manifest completeness, clear stale-upload error, offline installation rejects old art, active cache never reads another version.',
);
