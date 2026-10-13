// Real packaged Windows window and config; no salary/OS clock changes.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const pet = require('./pet-desktop-checks.cjs');
const freePort = () => new Promise((resolve, reject) => {
  const server = require('node:net').createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const launch = port => spawn(path.resolve('src-tauri/target/release/earn-today.exe'), [], { windowsHide: true, env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` }, stdio: 'ignore' });
async function connect(app, port) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (app.exitCode !== null) throw new Error(`App exited: ${app.exitCode}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) {
        const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        if (browser.contexts()[0]?.pages()[0]?.url().startsWith('http://tauri.localhost/')) return browser;
        await browser.close();
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('WebView endpoint unavailable');
}
async function stop(app) {
  app.kill();
  if (app.exitCode === null && app.signalCode === null) await new Promise(resolve => { app.once('exit', resolve); setTimeout(resolve, 2000); });
}
async function main() {
  const firstPort = await freePort();
  let app = launch(firstPort), browser, page, original;
  const invoke = (cmd, args) => page.evaluate(({ cmd, args }) => window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
  const load = () => invoke('load_data');
  const mode = async () => page.locator('[data-window-mode]').getAttribute('data-window-mode');
  const nativeSize = async () => {
    const size = await invoke('plugin:window|inner_size', { label: 'main' });
    const scale = await invoke('plugin:window|scale_factor', { label: 'main' });
    return { width: Math.round(size.width / scale), height: Math.round(size.height / scale) };
  };
  const setMode = async desired => {
    if (await mode() !== desired) await page.getByRole('button', { name: desired === 'mini' ? '进入迷你模式' : '恢复完整模式', exact: true }).click();
    await page.waitForSelector(`[data-window-mode="${desired}"]`);
    await page.waitForFunction(height => innerHeight === height && innerWidth === 260, desired === 'mini' ? 108 : 276);
    assert.deepEqual(await nativeSize(), { width: 260, height: desired === 'mini' ? 108 : 276 });
  };
  const setPrivate = async hidden => {
    const isHidden = (await page.locator('[data-window-mode]').getAttribute('class')).includes('privacy-hidden');
    if (isHidden !== hidden) await page.getByRole('button', { name: hidden ? '隐藏收入' : '显示收入', exact: true }).click();
    await page.waitForSelector(hidden ? '[data-window-mode].privacy-hidden' : '[data-window-mode]:not(.privacy-hidden)');
  };
  const amount = () => page.locator('.amount,.mini-amount');
  const money = async () => (await amount().textContent()).replace(/[,\s]/g, '');
  const choose = async id => {
    await page.getByRole('button', { name: '打开设置' }).click();
    await page.waitForFunction(() => innerWidth === 400 && innerHeight === 600 && document.querySelector('#salary')?.value);
    await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
    await page.getByRole('button', { name: id === 'mibao' ? /咪宝/ : /蓝色大肥鱼/ }).click();
    if (await page.locator('.theme-root').getAttribute('data-theme-id') !== id) await page.getByRole('button', { name: '使用此主题', exact: true }).click();
    await page.waitForSelector(`[data-theme-id="${id}"]`);
    await page.getByRole('button', { name: '返回工资设置' }).click();
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.waitForSelector('[data-window-mode]');
  };
  try {
    browser = await connect(app, firstPort); page = browser.contexts()[0].pages()[0];
    await page.waitForSelector('[data-window-mode]');
    assert.ok(page.url().startsWith('http://tauri.localhost/'));
    original = await load(); assert.ok(original.settings);
    await page.clock.install({ time: new Date('2026-10-13T10:00:00+08:00') });
    await page.clock.pauseAt(new Date('2026-10-13T10:00:00+08:00'));
    // Restart renderer timers under the controlled clock, as in browser tests.
    await page.reload(); await page.waitForSelector('[data-window-mode]');
    await setMode('full'); await setPrivate(false);
    const anchor = await invoke('plugin:window|outer_position', { label: 'main' });
    const toMinutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const work = Math.floor((toMinutes(original.settings.workStart) + toMinutes(original.settings.lunchStart)) / 2);
    const lunch = Math.floor((toMinutes(original.settings.lunchStart) + toMinutes(original.settings.lunchEnd)) / 2);
    const after = toMinutes(original.settings.workEnd);
    for (const id of ['blue-whale-girl', 'mibao']) {
      await choose(id);
      for (const [state, t] of [['working', work], ['lunch', lunch], ['after', after]]) {
        console.log(`CHECK Windows ${id}/${state}`);
        await page.clock.setFixedTime(new Date(2026, 9, 13, Math.floor(t / 60), t % 60)); await page.clock.runFor(1000);
        await setMode('full'); await setPrivate(false);
        await page.waitForSelector(`.widget-stage.state-${state}`);
        const income = await money();
        const fullCard = await page.locator('.pet-card').boundingBox();
        assert.deepEqual(fullCard, { x: 10, y: 97, width: 240, height: 140 });
        await pet.reaction(page, id, state, 'full', false);
        await setPrivate(true);
        assert.equal(await money(), '¥••••••');
        await pet.reaction(page, id, state, 'full', true);
        if (state === 'working' && id === 'blue-whale-girl') await page.screenshot({ path: 'docs/ui/full-privacy-desktop.png', omitBackground: true, animations: 'disabled' });
        await setMode('mini');
        assert.equal(await money(), '¥••••••');
        await pet.reaction(page, id, state, 'mini', true);
        assert.equal(await page.locator('.progress-times,.after-work-note').count(), 0);
        await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
        const pose = state === 'lunch' ? '.chibi-sleeping' : state === 'after' ? '.chibi-after-work' : '.chibi-awake';
        await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).opacity === '1', pose);
        if (state === 'lunch' && id === 'mibao') await page.screenshot({ path: 'docs/ui/mini-privacy-desktop.png', omitBackground: true, animations: 'disabled' });
        if (state === 'working' && id === 'blue-whale-girl') await page.screenshot({ path: 'docs/ui/mini-blue-private-desktop.png', omitBackground: true, animations: 'disabled' });
        await setPrivate(false); assert.equal(await money(), income);
        await pet.reaction(page, id, state, 'mini', false);
        if (state === 'working' && id === 'mibao') await pet.pointer(page, invoke, app.pid);
        await page.screenshot({ path: `docs/ui/mini-${id}-${state}-desktop.png`, omitBackground: true, animations: 'disabled' });
        if (state === 'working') await page.screenshot({ path: `docs/ui/mini-${id}-desktop.png`, omitBackground: true, animations: 'disabled' });
        if (state === 'after') {
          assert.match(await page.locator('.mini-work-status').textContent(), /^已下班/);
          assert.equal(income, `¥${(original.settings.monthlySalary / original.settings.workdaysPerMonth).toFixed(2)}`);
        }
        assert.equal(await invoke('plugin:window|is_always_on_top', { label: 'main' }), true);
        await setMode('full');
        if (state === 'working' && id === 'mibao') await pet.pointer(page, invoke, app.pid);
        assert.equal(await money(), income);
        assert.deepEqual(await invoke('plugin:window|outer_position', { label: 'main' }), anchor, 'Mode restore retains full-window anchor');
      }
    }
    await setMode('mini'); await setPrivate(true);
    await choose('blue-whale-girl'); assert.equal(await mode(), 'mini'); assert.equal(await money(), '¥••••••');
    await choose('mibao'); assert.equal(await mode(), 'mini'); assert.equal(await money(), '¥••••••');
    await page.getByRole('button', { name: '打开设置' }).click();
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.waitForSelector('.mini-stage.privacy-hidden');
    assert.deepEqual((await load()).settings, original.settings);
    assert.deepEqual(await nativeSize(), { width: 260, height: 108 });
    // Exercise actual native reposition and moved-event persistence, then clamp.
    const scale = await invoke('plugin:window|scale_factor', { label: 'main' });
    const moveMonitor = await invoke('plugin:window|current_monitor', { label: 'main' });
    const moveSize = await invoke('plugin:window|outer_size', { label: 'main' });
    const moveArea = moveMonitor.workArea;
    const movedTarget = { x: Math.max(moveArea.position.x, Math.min(anchor.x + 24, moveArea.position.x + moveArea.size.width - moveSize.width)), y: Math.max(moveArea.position.y, Math.min(anchor.y + 24, moveArea.position.y + moveArea.size.height - moveSize.height)) };
    await invoke('save_position', { x: (anchor.x + 24) / scale, y: (anchor.y + 24) / scale });
    await invoke('hide_settings');
    assert.deepEqual(await invoke('plugin:window|outer_position', { label: 'main' }), movedTarget);
    await invoke('save_position', { x: 99999, y: 99999 }); await invoke('hide_settings');
    const actualPosition = await invoke('plugin:window|outer_position', { label: 'main' });
    const monitor = await invoke('plugin:window|current_monitor', { label: 'main' });
    const physicalSize = await invoke('plugin:window|outer_size', { label: 'main' });
    assert.ok(actualPosition.x >= monitor.workArea.position.x && actualPosition.x + physicalSize.width <= monitor.workArea.position.x + monitor.workArea.size.width);
    assert.ok(actualPosition.y >= monitor.workArea.position.y && actualPosition.y + physicalSize.height <= monitor.workArea.position.y + monitor.workArea.size.height);
    await setMode('full');
    assert.deepEqual(await invoke('plugin:window|outer_position', { label: 'main' }), anchor);
    await setMode('mini');
    await page.getByRole('button', { name: '隐藏到托盘' }).click();
    assert.equal(await invoke('plugin:window|is_visible', { label: 'main' }), false);
    await invoke('hide_settings'); await page.waitForSelector('.mini-stage.privacy-hidden');
    assert.equal(await invoke('plugin:window|is_visible', { label: 'main' }), true);
    const persisted = await load();
    assert.equal(persisted.windowMode, 'mini'); assert.equal(persisted.privacyMode, 'hidden'); assert.equal(persisted.selectedThemeId, 'mibao');
    await browser.close(); browser = null; await stop(app);
    const nextPort = await freePort();
    app = launch(nextPort); browser = await connect(app, nextPort); page = browser.contexts()[0].pages()[0];
    await page.waitForSelector('.mini-stage.privacy-hidden');
    await page.waitForSelector('[data-theme-id="mibao"]');
    assert.deepEqual(await nativeSize(), { width: 260, height: 108 });
    assert.equal(await money(), '¥••••••');
    const restored = await load();
    assert.equal(restored.privacyMode, 'hidden'); assert.equal(restored.windowMode, 'mini');
    assert.deepEqual(restored.settings, original.settings);
    // Observe a real WebView reload from first DOM mutations for startup leaks.
    await page.addInitScript(() => {
      window.__unmaskedFrames = [];
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('.amount,.mini-amount')) if (!el.classList.contains('masked-amount')) window.__unmaskedFrames.push(el.textContent);
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await page.reload(); await page.waitForSelector('.mini-stage.privacy-hidden');
    assert.deepEqual(await page.evaluate(() => window.__unmaskedFrames), []);
    assert.equal(browser.contexts()[0].pages().length, 1);
    console.log('PASS Windows V1.2: both skins/three reactions/full+mini/visible+private; decoded art/auto restore; real physical click+jitter/drag in both modes with position persistence and no false reactions; V1.1 resize/anchor/privacy/theme/settings/restart checks.');
  } finally {
    if (browser && page && original) {
      try {
        if (await page.locator('.settings-shell').count()) await invoke('hide_settings');
        await page.waitForSelector('[data-window-mode]');
        await invoke('set_window_mode', { windowMode: 'full' });
        if (original.windowMode === 'mini' && original.fullPosition) { await invoke('save_position', original.fullPosition); await invoke('hide_settings'); }
        await invoke('set_window_mode', { windowMode: original.windowMode || 'full' });
        await invoke('set_privacy_mode', { privacyMode: original.privacyMode || 'visible' });
        await invoke('save_theme', { selectedThemeId: original.selectedThemeId || 'blue-whale-girl' });
        if (original.position) { await invoke('save_position', original.position); await invoke('hide_settings'); }
      } catch (error) { console.error('Restore failed:', error); process.exitCode = 1; }
    }
    if (browser) await browser.close(); await stop(app);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
