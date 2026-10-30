for (const test of [
  'tests.mjs',
  'art-tests.mjs',
  'gesture-tests.mjs',
  'navigation-tests.mjs',
  'save-tests.mjs',
  'hero-tests.mjs',
  'worker-tests.mjs',
  'adventure-tests.mjs',
  'supply-tests.mjs',
])
  await import('./' + test);
