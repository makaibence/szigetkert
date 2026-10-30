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
  'base-welcome-tests.mjs',
  'chapter-tests.mjs',
  'chapter-flow-tests.mjs',
])
  await import('./' + test);
