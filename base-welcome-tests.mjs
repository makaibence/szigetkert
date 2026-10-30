import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  freshAdventure,
  inspectSite,
  pendingBaseWelcome,
  acknowledgeBaseWelcome,
  validateCampaign,
  BASE_STARTER_SUPPLIES,
} from './adventure.js';
import { revealAround } from './navigation.js';
const s = freshAdventure();
s.adventure.introSeen = true;
s.adventure.tutorialSeen = true;
const base = s.adventure.sites.find((p) => p.id === 'camp');
revealAround(s, base, 2);
s.hero = { ...s.hero, x: 4, y: 10 };
assert.equal(pendingBaseWelcome(s), null);
const before = { ...s.resources };
assert.ok(inspectSite(s, base.id).ok);
for (const [k, v] of Object.entries(BASE_STARTER_SUPPLIES))
  assert.equal(s.resources[k], before[k] + v);
const saved = validateCampaign(JSON.parse(JSON.stringify(s)));
assert.deepEqual(pendingBaseWelcome(saved), { siteId: 'camp', reward: BASE_STARTER_SUPPLIES });
const once = { ...saved.resources };
inspectSite(saved, 'camp');
assert.deepEqual(saved.resources, once);
assert.equal(acknowledgeBaseWelcome(saved, 'camp'), true);
assert.equal(pendingBaseWelcome(saved), null);
assert.equal(acknowledgeBaseWelcome(saved, 'camp'), false);
inspectSite(saved, 'camp');
assert.deepEqual(saved.resources, once);
assert.equal(pendingBaseWelcome(saved), null);
assert.equal(pendingBaseWelcome(validateCampaign(JSON.parse(JSON.stringify(saved)))), null);
const old = structuredClone(s);
delete old.adventure.sites.find((p) => p.id === 'camp').baseWelcomePending;
delete old.adventure.sites.find((p) => p.id === 'camp').baseWelcomeReward;
assert.equal(pendingBaseWelcome(validateCampaign(old)), null);
const bad = structuredClone(s);
bad.adventure.sites.find((p) => p.id === 'camp').baseWelcomeReward.food = -1;
assert.throws(() => validateCampaign(bad));
console.log(
  'PASS: starter card resumes after reload without duplicate supplies, acknowledgement survives export/import, old claimed bases stay quiet, corrupt reward rejected.',
);
