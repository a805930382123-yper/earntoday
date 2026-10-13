// Exercise real packaged WebView, Rust persistence and process restart.
// Never change salary fields or OS clock; restore the user's theme afterward.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const launch = port => spawn(path.resolve('src-tauri/target/release/earn-today.exe'), [], { windowsHide: true, env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` }, stdio: 'ignore' });
async function connect(app, port) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (app.exitCode !== null) throw new Error(`App exited: ${app.exitCode}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('WebView endpoint unavailable');
}
async function stop(app) {
  app.kill();
  if (app.exitCode === null && app.signalCode === null) await new Promise(resolve => { app.once('exit', resolve); setTimeout(resolve, 2000); });
}
async function main() {
  let app = launch(9225), browser, page, original;
  try {
    browser = await connect(app, 9225); page = browser.contexts()[0].pages()[0];
    await page.waitForSelector('.widget-stage');
    assert.ok(page.url().startsWith('http://tauri.localhost/'));
    const load = () => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('load_data'));
    original = await load();
    assert.ok(original.settings);
    const originalId = original.selectedThemeId || 'blue-whale-girl';
    await page.waitForSelector(`[data-theme-id="${originalId}"]`);
    await page.clock.install({ time: new Date('2026-10-13T10:00:00+08:00') });
    await page.clock.pauseAt(new Date('2026-10-13T10:00:00+08:00'));
    const info = async () => ({ money: await page.locator('.amount').textContent(), progress: await page.getByRole('progressbar').getAttribute('aria-valuenow'), state: await page.locator('.widget-stage').getAttribute('data-work-state'), card: await page.locator('.pet-card').boundingBox(), amount: await page.locator('.amount').boundingBox(), girl: await page.locator('.girl-wrap').boundingBox() });
    const choose = async (id, screenshot = false) => {
      await page.getByRole('button', { name: '打开设置' }).click();
      await page.waitForFunction(() => innerWidth === 400 && innerHeight === 600 && document.querySelector('#salary')?.value);
      await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
      assert.equal(await page.locator('.theme-option').count(), 2);
      await page.getByRole('button', { name: id === 'mibao' ? /咪宝/ : /蓝色大肥鱼/ }).click();
      const current = await page.locator('.theme-root').getAttribute('data-theme-id');
      if (current !== id) await page.getByRole('button', { name: '使用此主题', exact: true }).click();
      await page.waitForSelector(`[data-theme-id="${id}"]`);
      await page.clock.runFor(400);
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
      assert.ok(await page.locator('.settings-shell').evaluate(el => el.scrollHeight <= el.clientHeight));
      if (screenshot) await page.screenshot({ path: 'docs/ui/mibao-picker-desktop.png', omitBackground: true, animations: 'disabled' });
      await page.getByRole('button', { name: '返回工资设置' }).click();
      assert.equal(await page.locator('form input').count(), 6);
      assert.equal(await page.getByLabel('月薪（元）').inputValue(), String(original.settings.monthlySalary));
      assert.ok(await page.locator('.settings-shell').evaluate(el => el.scrollHeight <= el.clientHeight));
      if (id === 'mibao') assert.match(await page.locator('.settings-portrait-image').getAttribute('src'), /settings-.*\.png/);
      if (screenshot) await page.screenshot({ path: 'docs/ui/mibao-settings-desktop.png', omitBackground: true, animations: 'disabled' });
      await page.getByRole('button', { name: '关闭设置' }).click();
      await page.waitForFunction(() => innerWidth === 260 && innerHeight === 276 && document.querySelector('.widget-stage'));
      const stored = await load();
      assert.equal(stored.selectedThemeId, id);
      assert.deepEqual(stored.settings, original.settings);
      assert.deepEqual(stored.position, original.position);
    };
    const minutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const workTime = Math.floor((minutes(original.settings.workStart) + minutes(original.settings.lunchStart)) / 2);
    const lunchTime = Math.floor((minutes(original.settings.lunchStart) + minutes(original.settings.lunchEnd)) / 2);
    const afterTime = minutes(original.settings.workEnd);
    for (const [state, t, pose] of [['working', workTime, '.chibi-awake'], ['lunch', lunchTime, '.chibi-sleeping'], ['after', afterTime, '.chibi-after-work']]) {
      await page.clock.setFixedTime(new Date(2026, 9, 13, Math.floor(t / 60), t % 60)); await page.clock.runFor(1000);
      await page.waitForSelector(`.state-${state}`);
      await choose('blue-whale-girl');
      const before = await info();
      const blueSrc = await page.locator(pose).getAttribute('src');
      const blueProgress = await page.locator('.progress-fill').evaluate(el => getComputedStyle(el).backgroundImage);
      await choose('mibao', state === 'working');
      assert.deepEqual(await info(), before);
      assert.notEqual(await page.locator(pose).getAttribute('src'), blueSrc);
      assert.notEqual(await page.locator('.progress-fill').evaluate(el => getComputedStyle(el).backgroundImage), blueProgress);
      assert.deepEqual(before.card, { x: 10, y: 97, width: 240, height: 140 });
      if (state === 'lunch') assert.equal(await page.locator('.status-text').textContent(), '午休中');
      if (state === 'after') {
        assert.equal(before.progress, '100');
        assert.equal(before.money.replace(/[¥,\s]/g, ''), (original.settings.monthlySalary / original.settings.workdaysPerMonth).toFixed(2));
      }
      await page.screenshot({ path: `docs/ui/mibao-${state}-desktop.png`, omitBackground: true, animations: 'disabled' });
      await choose('blue-whale-girl');
      assert.deepEqual(await info(), before);
      assert.equal(await page.locator(pose).getAttribute('src'), blueSrc);
    }
    await choose('mibao');
    const persisted = await load();
    await browser.close(); browser = null; await stop(app);
    app = launch(9226); browser = await connect(app, 9226); page = browser.contexts()[0].pages()[0];
    await page.waitForSelector('[data-theme-id="mibao"]');
    await page.waitForSelector('.widget-stage');
    assert.deepEqual(await load(), persisted, 'Real process restart restores Mibao and original salary/position');
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('save_theme', { selectedThemeId: id }), originalId);
    await page.waitForSelector(`[data-theme-id="${originalId}"]`);
    const restored = await load();
    assert.deepEqual(restored.settings, original.settings);
    assert.deepEqual(restored.position, original.position);
    assert.equal(restored.selectedThemeId, originalId);
    console.log('PASS packaged Mibao: embedded offline assets; two formal themes; four poses; real picker/save; working/lunch/after bidirectional switch; salary/progress/card preserved; full settings; actual process restart restores Mibao; original user theme restored.');
  } finally {
    if (page && browser && original) {
      try { await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('save_theme', { selectedThemeId: id }), original.selectedThemeId || 'blue-whale-girl'); } catch {}
    }
    if (browser) await browser.close(); await stop(app);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
