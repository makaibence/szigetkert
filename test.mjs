for (const test of [
  'tests.mjs',
  'gesture-tests.mjs',
  'navigation-tests.mjs',
  'save-tests.mjs',
  'hero-tests.mjs',
  'worker-tests.mjs',
])
  await import('./' + test);
