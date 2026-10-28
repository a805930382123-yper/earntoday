// Real Widget/InteractivePet/ChibiGirl. Clock/random and native bridge are controlled ONLY in this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const { prepare } = require('./verify-themes.cjs');
const approved = require('../src/autonomous/approved.json');
const audit = require('../docs/action-repair/base-audit.json');
const out = path.resolve('docs/autonomous-integration');
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
const results = { environment: 'Windows / Edge headless / real React components / controlled browser clock and native bridge', manual: [], checks: [] };
const check = label => { results.checks.push(label); console.log('PASS:', label); };
const debug = page => page.evaluate(() => window.__autonomousDebug?.snapshot());
const state = page => page.locator('.chibi-girl').getAttribute('data-autonomous-state');
const ready = page => page.waitForFunction(() => window.__autonomousDebug?.snapshot().allowed && window.__autonomousDebug.snapshot().actions.length > 0, null, { polling: 50 });
const play = (page, id) => page.evaluate(id => window.__autonomousDebug?.play(id), id);
const cancel = page => page.evaluate(() => window.dispatchEvent(new Event('pet-autonomous-interrupt')));
const invoke = (page, cmd, args) => page.evaluate(({ cmd, args }) => window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
const time = async (page, at) => { await page.clock.setSystemTime(new Date(at)); await page.clock.runFor(1000); };
const save = (page, extra) => page.evaluate(extra => window.__TAURI_INTERNALS__.invoke('save_settings', { settings: window.__themeTest.data.settings, ...extra }), extra);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .05, `${actual} != ${expected}`);
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 260, height: 276 }, deviceScaleFactor: 1, timezoneId: 'Asia/Shanghai' });
  context.setDefaultNavigationTimeout(120000);
  context.setDefaultTimeout(60000);
  const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  await context.addInitScript(() => { Math.random = () => 0; });
  try {
    // Lock art by actual preview references and bytes, not modification date.
    const manifest = require('../src/dev/repaired/manifest.json');
    for (const [id, action] of Object.entries(approved.actions)) {
      for (const key of ['sequence', 'timing', 'size', 'base']) assert.deepEqual(action[key], manifest.actions[id][key]);
      for (const name of new Set(action.sequence.filter(s => s !== 'static'))) {
        const file = `${id}-${name}.png`;
        const old = fs.readFileSync(path.join('src/dev/repaired', file));
        const current = fs.readFileSync(path.join('src/assets/autonomous', file));
        assert.equal(crypto.createHash('sha256').update(current).digest('hex'), crypto.createHash('sha256').update(old).digest('hex'));
      }
    }
    // FIRST: manual one-shot in formal components, all seven combinations.
    for (const [id, action] of Object.entries(approved.actions)) for (const mode of id === 'mibao-tail' ? ['full'] : ['full', 'mini']) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 260, height: mode === 'mini' ? 108 : 276 });
      const themeId = id.startsWith('blue') ? 'blue-whale-girl' : 'mibao';
      await prepare(page, themeId, { windowMode: mode });
      await page.waitForSelector(`[data-theme-id="${themeId}"]`); await ready(page);
      await page.waitForFunction(id => window.__autonomousDebug?.snapshot().actions.includes(id), id, { polling: 50 });
      const sample = `${id}-${mode}`, expected = audit.samples.find(s => s.id === sample);
      assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight]), expected.viewport);
      const original = page.locator('.chibi-awake'), bounds = await original.boundingBox();
      for (const [key, value] of Object.entries(expected.characterBox)) near(bounds[key === 'left' ? 'x' : key === 'top' ? 'y' : key], value);
      const style = await original.evaluate(el => ({ fit: getComputedStyle(el).objectFit, position: getComputedStyle(el).objectPosition, mask: getComputedStyle(el).maskImage }));
      const other = await page.locator(mode === 'full' ? '.pet-card' : '.mini-card').boundingBox();
      const snapshot = { sample, bounds, style, frames: [], duration: 720 + action.timing.reduce((a, b) => a + b, 0) };
      assert.equal(await play(page, id), true); assert.equal(await state(page), 'static');
      let elapsed = 0;
      for (let step = 0; step < action.sequence.length; step++) {
        const current = action.sequence[step]; assert.equal(await state(page), current);
        const file = `frames/${sample}-${step}.png`;
        await page.screenshot({ path: path.join(out, file), omitBackground: true });
        snapshot.frames.push({ state: current, at: elapsed, file });
        if (current !== 'static') {
          const image = page.locator('.chibi-autonomous'); assert.deepEqual(await image.boundingBox(), bounds);
          assert.deepEqual(await image.evaluate(el => ({ fit: getComputedStyle(el).objectFit, position: getComputedStyle(el).objectPosition, mask: getComputedStyle(el).maskImage })), style);
          assert.deepEqual(await image.evaluate(el => [el.naturalWidth, el.naturalHeight]), action.size);
          assert.equal(await image.evaluate(el => getComputedStyle(el).transform), 'none');
        } else assert.equal(await page.locator('.chibi-autonomous').count(), 0);
        assert.deepEqual(await page.locator(mode === 'full' ? '.pet-card' : '.mini-card').boundingBox(), other, 'Card/jar/bowl cannot move with character');
        const duration = step === 0 ? 360 : step === action.sequence.length - 1 ? 360 : action.timing[step - 1];
        await page.clock.runFor(duration); elapsed += duration;
      }
      assert.equal(await state(page), null); assert.equal((await debug(page)).waitingTimers, 1);
      results.manual.push(snapshot); await page.close();
    }
    check('Seven formal-component samples: approved sizes, crops, masks, static entry/return, unchanged card, exact frames and timing');
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(results, null, 2));
    const page = await context.newPage(); await prepare(page); await ready(page);
    const initial = await debug(page), initialNow = await page.evaluate(() => Date.now());
    assert.equal(initial.due['blue-blink'] - initialNow, 30000);
    assert.equal(initial.due['blue-yawn'] - initialNow, 60000);
    await page.evaluate(() => { Math.random = () => .25; }); await cancel(page);
    const start = await debug(page);
    assert.deepEqual(start.actions, ['blue-blink', 'blue-yawn']); assert.equal(start.waitingTimers, 1);
    await page.clock.runFor(32750); assert.deepEqual((await debug(page)).due, start.due); assert.equal(await state(page), null);
    await page.clock.runFor(1000); assert.equal(await state(page), 'static');
    assert.equal(await page.locator('.chibi-girl').getAttribute('data-autonomous-action'), 'blue-blink');
    await page.clock.runFor(1420); assert.equal((await debug(page)).due['blue-yawn'], start.due['blue-yawn']);
    await page.clock.runFor(90000 - 35170); assert.equal(await page.locator('.chibi-girl').getAttribute('data-autonomous-action'), 'blue-yawn');
    check('30–45-second fast action; 1–3-minute yawn not postponed by salary refresh or blinks; one waiting timer');
    await cancel(page); await play(page, 'blue-yawn'); await page.clock.runFor(620);
    const box = await page.locator('.pet-hit-area').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    assert.equal(await state(page), null); assert.equal((await debug(page)).allowed, false);
    await page.mouse.up(); assert.ok(await page.locator('.pet-reacting').count());
    await page.clock.runFor(2000); await ready(page); assert.equal(await state(page), null);
    // Hold the real native-drag promise until the simulated move loop finishes.
    await page.evaluate(() => { const original = window.__TAURI_INTERNALS__.invoke; window.__TAURI_INTERNALS__.invoke = (cmd, args) => cmd === 'plugin:window|start_dragging' ? new Promise(resolve => { window.__releaseDrag = resolve; }) : original(cmd, args); });
    await play(page, 'blue-blink'); await page.clock.runFor(400);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 15);
    assert.equal(await state(page), null); assert.equal((await debug(page)).allowed, false);
    await page.mouse.up(); await page.evaluate(() => window.__releaseDrag()); await page.clock.runFor(10); await ready(page);
    check('Pointer down immediately cancels; existing click reaction takes priority; native drag lifetime blocks motion');
    // Native visibility is authoritative; focus/HTML page visibility are not eligibility.
    await play(page, 'blue-blink'); await invoke(page, 'hide_main'); assert.equal(await state(page), null); assert.equal((await debug(page)).waitingTimers, 0);
    await page.clock.runFor(900000); await invoke(page, 'toggle_main_visibility'); await ready(page); assert.equal(await state(page), null);
    const shown = await debug(page); assert.equal(shown.due['blue-blink'], await page.evaluate(() => Date.now() + 33750));
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal((await debug(page)).allowed, true); assert.deepEqual((await debug(page)).due, shown.due);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    check('Native hidden clears action/tasks; restore waits fresh; blur and document.hidden alone do not suppress visible pet');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__autonomousDebug?.snapshot().allowed === false, null, { polling: 50 });
    assert.equal((await debug(page)).waitingTimers, 0); assert.equal((await debug(page)).allowed, false);
    await invoke(page, 'open_settings'); await page.getByLabel('桌宠自主小动作', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.__autonomousDebug)), false);
    assert.ok(await page.getByText('系统已要求减少动态效果，自主小动作暂时暂停。').isVisible());
    await page.screenshot({ path: path.join(out, 'settings-reduced-motion.png'), fullPage: true });
    await page.getByLabel('桌宠自主小动作', { exact: true }).uncheck();
    await page.getByRole('button', { name: '保存设置', exact: true }).click(); await page.waitForSelector('.widget-stage');
    assert.equal(await page.evaluate(() => window.__themeTest.data.autonomousMotionEnabled), false);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); assert.equal((await debug(page)).waitingTimers, 0);
    await invoke(page, 'open_settings');
    await page.waitForFunction(() => document.querySelector('#salary')?.value === '8800', null, { polling: 50 });
    assert.equal(await page.getByLabel('桌宠自主小动作', { exact: true }).isChecked(), false);
    await page.getByLabel('桌宠自主小动作', { exact: true }).check(); await page.getByRole('button', { name: '保存设置', exact: true }).click(); await ready(page);
    assert.equal(await state(page), null);
    check('Settings/theme navigation unmounts player; toggle saves via existing flow; reduced motion overrides enabled choice');
    for (const [at, expected] of [['2026-10-13T12:30:00+08:00','lunch'], ['2026-10-13T19:00:00+08:00','after'], ['2026-10-18T10:00:00+08:00','rest_day']]) {
      await time(page, at); await page.waitForSelector(`.state-${expected}`); assert.equal((await debug(page)).waitingTimers, 0); assert.equal(await play(page, 'blue-blink'), false);
    }
    await time(page, '2026-10-13T10:00:00+08:00'); await ready(page); await play(page, 'blue-blink');
    await invoke(page, 'set_privacy_mode', { privacyMode: 'hidden' }); assert.equal(await state(page), null); assert.equal((await debug(page)).waitingTimers, 0);
    await invoke(page, 'set_privacy_mode', { privacyMode: 'visible' }); await ready(page);
    await play(page, 'blue-yawn'); await page.clock.runFor(400); await invoke(page, 'save_theme', { selectedThemeId: 'mibao' }); await page.waitForSelector('[data-theme-id="mibao"]'); await ready(page);
    assert.equal(await state(page), null); assert.deepEqual((await debug(page)).actions, ['mibao-ear','mibao-tail']);
    await play(page, 'mibao-tail'); await page.clock.runFor(400); await invoke(page, 'set_window_mode', { windowMode: 'mini' }); await ready(page);
    assert.equal(await state(page), null); assert.deepEqual((await debug(page)).actions, ['mibao-ear']); assert.equal(await play(page, 'mibao-tail'), false);
    check('Lunch/off-work/rest day/privacy blocked; theme/mode switch cancels old frame; tail unavailable in mini');
    await invoke(page, 'set_window_mode', { windowMode: 'full' }); await invoke(page, 'save_theme', { selectedThemeId: 'blue-whale-girl' }); await page.waitForSelector('[data-theme-id="blue-whale-girl"]');
    await save(page, { displayMode: 'collection' });
    await time(page, '2026-10-13T13:59:00+08:00'); await ready(page);
    await play(page, 'blue-blink'); await page.clock.runFor(400);
    await time(page, '2026-10-13T14:00:00+08:00');
    assert.equal(await state(page), null); assert.equal((await debug(page)).allowed, false);
    assert.ok((await page.locator('.chibi-awake').getAttribute('src')).includes('half'));
    await page.clock.runFor(3000); assert.equal((await debug(page)).waitingTimers, 0);
    await time(page, '2026-10-13T18:00:00+08:00'); assert.ok((await page.locator('.chibi-after-work').getAttribute('src')).includes('full')); assert.equal((await debug(page)).waitingTimers, 0);
    const depositPage = await context.newPage();
    await prepare(depositPage, null, { displayMode: 'collection', now: '2026-10-13T09:47:59+08:00' }); await ready(depositPage);
    assert.equal(await play(depositPage, 'blue-yawn'), true);
    await depositPage.clock.runFor(1000); assert.equal(await state(depositPage), null); assert.equal((await debug(depositPage)).allowed, false);
    await depositPage.clock.runFor(2000); await ready(depositPage); await depositPage.close();
    check('Actual blue half/full special images protected; collection node feedback interrupts; matching ordinary collection art allowed');
    // Mibao continues using working base at half progress: allow after deposit feedback.
    await invoke(page, 'save_theme', { selectedThemeId: 'mibao' }); await page.waitForSelector('[data-theme-id="mibao"]'); await time(page, '2026-10-13T14:00:00+08:00'); await page.clock.runFor(2000); await ready(page);
    assert.deepEqual((await debug(page)).actions, ['mibao-ear','mibao-tail']);
    const writes = await page.evaluate(() => window.__themeTest.calls.filter(c => /save_|set_/.test(c.cmd)).length);
    await play(page, 'mibao-ear'); await page.clock.runFor(1400);
    assert.equal(await page.evaluate(() => window.__themeTest.calls.filter(c => /save_|set_/.test(c.cmd)).length), writes);
    check('Mibao ordinary collection pose permitted; animation frames/deadlines cause zero config writes');
    await page.close();
    const disabled = await context.newPage(); await prepare(disabled, null, { autonomousMotionEnabled: false });
    assert.equal((await debug(disabled)).waitingTimers, 0); await disabled.close();
    const broken = await context.newPage(); let requests = 0;
    await broken.route('**/assets/autonomous/blue-blink-*.png', route => { requests++; return route.abort(); });
    await prepare(broken); await ready(broken); assert.deepEqual((await debug(broken)).actions, ['blue-yawn']);
    await broken.clock.runFor(1000000); assert.equal(requests, 2); assert.equal(await broken.locator('.chibi-awake').evaluate(el => el.complete && el.naturalWidth > 0), true);
    await broken.close(); check('Saved false survives fresh mount; failed optional frames keep static pose without infinite retry');
    assert.deepEqual(errors, []); results.passed = true;
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(results, null, 2));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
