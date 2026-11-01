import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { freshAdventure, restoration, inspectSite } from './adventure.js';
import { siteNotice } from './site-notices.js';
import { carpenterSpeech, restorationHint } from './story-text.js';
import { actorPalette } from './avatar-style.js';
import { revealAround } from './navigation.js';
const s = freshAdventure();
assert.ok(siteNotice({ type: 'lumber' }).text.includes('szerszámos kunyhó'));
assert.ok(siteNotice({ type: 'farm' }).text.includes('munkások'));
assert.ok(siteNotice({ type: 'farm' }).text.includes('energiájuk'));
assert.ok(carpenterSpeech(s).includes('Előbb keresd meg'));
assert.ok(!carpenterSpeech(s).includes('már működő'));
s.buildings.push({ id: 'test-mill', type: 'sawmill', level: 1, x: 19, y: 10 });
assert.ok(carpenterSpeech(s).includes('már működő'));
s.buildings[0].level = 3;
assert.ok(carpenterSpeech(s).includes('műhelyszinted megmarad'));
const mason = s.adventure.sites.find((p) => p.id === 'mason');
assert.ok(restorationHint(s, mason).includes('beszélj az áccsal'));
s.chapter.carpenterIntro = true;
assert.ok(restorationHint(s, mason).includes('tetőjavításhoz'));
assert.ok(!restorationHint(s, mason).includes('kapcsolódó helyszín'));
s.adventure.sites.find((p) => p.id === 'bridge').restored = true;
revealAround(s, mason, 2.5);
s.hero.x = mason.x;
s.hero.y = mason.y + 1;
inspectSite(s, mason.id);
Object.assign(s.resources, { planks: 100, stone: 100 });
assert.equal(restoration(s, mason.id).ok, false);
assert.ok(restoration(s, mason.id).reason.includes('ács'));
const carpenter = actorPalette('carpenter'),
  worker = actorPalette('worker:1');
assert.notEqual(carpenter.shirt, worker.shirt);
assert.notEqual(carpenter.hair, worker.hair);
const app = await fs.readFile(new URL('./app.js', import.meta.url), 'utf8'),
  renderer = await fs.readFile(new URL('./renderer.js', import.meta.url), 'utf8'),
  css = await fs.readFile(new URL('./style.css', import.meta.url), 'utf8');
assert.ok(app.includes('&& !noticeEligible(p)'));
assert.ok(renderer.includes('active && !s.adventure.trader.chapterMerchant'));
assert.ok(renderer.includes("ctx.fillText('Ács'"));
assert.ok(css.includes('#detail .craft-planner p.craft-time'));
console.log(
  'PASS: state-aware carpenter dialogue before discovery and after upgrades; explicit mason prerequisite despite sufficient materials; food purpose; no repeated discovery toast; distinct carpenter palette and tag, cart-free chapter merchant, correctly scoped craft spacing.',
);
