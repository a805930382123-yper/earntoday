// Regression against the packaged Tauri EXE's real WebView and Rust window commands.
// Debugging is enabled only on this test child. Fields are not edited; the save
// check resaves their current values and asserts stored data remains identical.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { chromium } = require(process.argv[2] ? path.join(process.argv[2], 'playwright') : 'playwright');

async function main() {
  const launch = (port = 9223) => spawn(path.resolve('src-tauri/target/release/earn-today.exe'), [], {
    windowsHide: true,
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` },
    stdio: 'ignore',
  });
  let app = launch();
  let browser;
  try {
    const endpoint = 'http://127.0.0.1:9223';
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (app.exitCode !== null) throw new Error(`Desktop app exited with ${app.exitCode}`);
      try { ready = (await fetch(`${endpoint}/json/version`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'WebView debugging endpoint did not become ready');
    browser = await chromium.connectOverCDP(endpoint);
    const pages = browser.contexts().flatMap(context => context.pages());
    assert.equal(pages.length, 1, 'Expected one native WebView');
    const page = pages[0];
    await page.waitForSelector('.widget-stage');
    assert.ok(page.url().startsWith('http://tauri.localhost/'));
    const storedBefore = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('load_data'));
    const snapshot = async () => ({
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
      card: await page.locator('.pet-card').boundingBox(),
      girl: await page.locator('.girl-wrap').boundingBox(),
      amount: await page.locator('.amount').boundingBox(),
    });
    const initial = await snapshot();
    assert.deepEqual(initial.viewport, { width: 260, height: 276 });
    assert.deepEqual(initial.card, { x: 10, y: 97, width: 240, height: 140 });
    assert.equal(initial.girl.width, 180.5);
    // Control only this WebView clock. OS time and stored salary settings stay intact.
    await page.clock.install({ time: new Date('2026-10-12T21:00:00+08:00') });
    await page.clock.pauseAt(new Date('2026-10-12T21:00:00+08:00'));
    await page.clock.runFor(1000);
    // Use 23:59 if this user's configured work end is later than 21:00.
    await page.clock.setSystemTime(new Date('2026-10-12T23:59:00+08:00'));
    await page.clock.runFor(1000);
    await page.waitForSelector('.state-after');
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
    const finalMoney = await page.locator('.amount').textContent();
    const expected = (storedBefore.settings.monthlySalary / storedBefore.settings.workdaysPerMonth).toFixed(2);
    assert.equal(finalMoney.replace(/[¥,\s]/g, ''), expected);
    const note = await page.locator('.after-work-note').boundingBox();
    assert.ok(note.y + note.height <= 276 && note.x >= 0 && note.x + note.width <= 260);
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: 'docs/ui/widget-after-work-desktop.png', omitBackground: true, animations: 'disabled' });
    const after = await snapshot();
    const positionBeforeTheme = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position', { label: 'main' }));
    await page.evaluate(() => { window.__widgetBeforeTheme = document.querySelector('.widget-stage'); return window.__TAURI_INTERNALS__.invoke('save_theme', { selectedThemeId: 'blue-whale-girl' }); });
    assert.deepEqual(await snapshot(), after);
    assert.ok(await page.evaluate(() => window.__widgetBeforeTheme === document.querySelector('.widget-stage')));
    assert.deepEqual(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|outer_position', { label: 'main' })), positionBeforeTheme);
    const storedWithTheme = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('load_data'));
    assert.equal(storedWithTheme.selectedThemeId, 'blue-whale-girl');
    assert.deepEqual(storedWithTheme.settings, storedBefore.settings);
    assert.deepEqual(storedWithTheme.position, storedBefore.position);
    await page.clock.runFor(5000);
    assert.equal(await page.locator('.amount').textContent(), finalMoney);
    for (let round = 0; round < 5; round++) {
      await page.getByRole('button', { name: '打开设置' }).click();
      await page.waitForSelector('.settings-shell');
      await page.waitForFunction(() => innerWidth === 400 && innerHeight === 600);
      if (round === 0) {
        await page.waitForFunction(() => {
          const image = document.querySelector('.settings-portrait-image');
          return image?.complete && image.naturalWidth > 0;
        });
        assert.equal(await page.locator('form input').count(), 6);
        assert.equal(await page.locator('.settings-shell').evaluate(el => el.scrollHeight <= el.clientHeight), true);
        const save = await page.getByRole('button', { name: '保存设置' }).boundingBox();
        assert.ok(save.y + save.height <= 600, 'Native save button is clipped');
        await page.screenshot({ path: 'docs/ui/settings-a-desktop.png', omitBackground: true, animations: 'disabled' });
        await page.screenshot({ path: 'docs/ui/themes-settings-desktop.png', omitBackground: true, animations: 'disabled' });
        const salary = await page.getByLabel('月薪（元）').inputValue();
        await page.getByLabel('月薪（元）').fill(String(Number(salary) + 1));
        await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
        await page.waitForSelector('.theme-picker');
        assert.equal(await page.locator('.theme-option').count(), 2);
        assert.equal(await page.locator('.theme-state-previews img').count(), 3);
        assert.ok(await page.getByRole('button', { name: '当前使用', exact: true }).isDisabled());
        assert.ok(await page.locator('.settings-shell').evaluate(el => el.scrollHeight <= el.clientHeight));
        await page.screenshot({ path: 'docs/ui/themes-picker-desktop.png', omitBackground: true, animations: 'disabled' });
        await page.getByRole('button', { name: '返回工资设置' }).click();
        assert.equal(await page.getByLabel('月薪（元）').inputValue(), String(Number(salary) + 1));
        await page.getByLabel('月薪（元）').fill(salary);
      }
      await page.getByRole('button', { name: round === 4 ? '保存设置' : '关闭设置' }).click();
      await page.waitForSelector('.widget-stage');
      await page.waitForFunction(() => innerWidth === 260 && innerHeight === 276);
      assert.deepEqual(await snapshot(), after);
      assert.equal(await page.locator('.note-enter').count(), 0);
    }
    assert.deepEqual(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('load_data')), storedWithTheme);
    await page.screenshot({ path: 'docs/ui/widget-desktop-return.png', omitBackground: true, animations: 'disabled' });
    const toMinutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
    for (const [state, start, end] of [
      ['working', storedBefore.settings.workStart, storedBefore.settings.lunchStart],
      ['lunch', storedBefore.settings.lunchStart, storedBefore.settings.lunchEnd],
    ]) {
      const middle = Math.floor((toMinutes(start) + toMinutes(end)) / 2);
      await page.clock.setSystemTime(new Date(2026, 9, 12, Math.floor(middle / 60), middle % 60, 0));
      await page.clock.runFor(1000);
      await page.waitForSelector(`.state-${state}`);
      await page.screenshot({ path: `docs/ui/widget-${state}-desktop.png`, omitBackground: true, animations: 'disabled' });
      assert.deepEqual((await snapshot()).card, initial.card);
    }
    const onTop = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_always_on_top', { label: 'main' }));
    assert.equal(onTop, true);
    await page.getByRole('button', { name: '隐藏到托盘' }).click();
    assert.equal(await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })), false);
    const bundle = fs.readdirSync('dist/assets').filter(name => name.endsWith('.js')).map(name => fs.readFileSync(path.join('dist/assets', name), 'utf8')).join('\n');
    assert.ok(!bundle.includes('主题切换测试') && !bundle.includes('skin-test='), 'Internal theme must be removed from production assets');
    await browser.close(); browser = null;
    app.kill();
    if (app.exitCode === null && app.signalCode === null) await new Promise(resolve => { app.once('exit', resolve); setTimeout(resolve, 2000); });
    // A distinct child-only port avoids reconnecting to the exiting old WebView.
    app = launch(9224);
    const restartEndpoint = 'http://127.0.0.1:9224';
    let restarted;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { const result = await fetch(`${restartEndpoint}/json/version`); if (result.ok) { restarted = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(restarted);
    browser = await chromium.connectOverCDP(restartEndpoint);
    const restartPage = browser.contexts()[0].pages()[0];
    await restartPage.waitForSelector('.widget-stage');
    await restartPage.waitForSelector('[data-theme-id="blue-whale-girl"]');
    assert.deepEqual(await restartPage.evaluate(() => window.__TAURI_INTERNALS__.invoke('load_data')), storedWithTheme);
    console.log('PASS: packaged EXE offline; theme persistence and real process restart; same window/position; picker/draft preservation; 4 real assets; internal skin absent from production; independent theme/salary saves; settings round trips; working/lunch/after; always-on-top/hide.');
  } finally {
    if (browser) await browser.close();
    app.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
