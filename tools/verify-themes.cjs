// The internal test skin exists only in Vite DEV and is driven by this bridge.
// Real UI, real assets; no salary/config/OS-time changes in the user's app.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.argv[2], 'playwright'));

async function prepare(page, themeId = null, display = {}) {
  await page.exposeFunction('__resizeThemeWindow', (width, height) => page.setViewportSize({ width, height }));
  await page.addInitScript(({ initialTheme, display }) => {
    const callbacks = new Map(), listeners = new Map(); let id = 0;
    const data = { settings: { monthlySalary: 8800, workdaysPerMonth: 22, workStart: '09:00', workEnd: '18:00', lunchStart: '12:00', lunchEnd: '13:00' }, position: { x: 100, y: 200 }, selectedThemeId: initialTheme, windowMode: display.windowMode || 'full', privacyMode: display.privacyMode || 'visible', displayMode: display.displayMode || 'amount', configError: display.configError };
    const emit = (event, payload = null) => { for (const listener of listeners.values()) if (listener.event === event) callbacks.get(listener.handler)?.({ event, id: listener.id, payload }); };
    let visibility = { visible: true, revision: 0 }, settingsOpen = false;
    let shortcut = { enabled: true, registered: true, error: null };
    window.__themeTest = { data, calls: [], failSave: false, emit, listenerCount: () => listeners.size };
    let release;
    const readGate = display.holdReads ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    window.__themeTest.releaseReads = () => release?.();
    const preferences = () => ({ windowMode: data.windowMode, privacyMode: data.privacyMode, displayMode: data.displayMode });
    const resizeMain = () => window.__resizeThemeWindow(260, data.windowMode === 'mini' ? 108 : 276);
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, eventId) => listeners.delete(eventId) };
    window.__TAURI_INTERNALS__ = {
      currentWindow: { label: 'main' }, metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback(fn) { callbacks.set(++id, fn); return id; }, unregisterCallback: callback => callbacks.delete(callback),
      async invoke(cmd, args) {
        window.__themeTest.calls.push({ cmd, args });
        if (cmd === 'get_main_visibility') return { ...visibility };
        if (cmd === 'get_shortcut_status') return { ...shortcut };
        if (cmd === 'set_shortcut_enabled') { shortcut = { enabled: args.enabled, registered: args.enabled, error: null }; return { ...shortcut }; }
        if (cmd === 'toggle_main_visibility' || cmd === 'hide_main') {
          visibility = { visible: cmd === 'hide_main' ? false : !visibility.visible, revision: visibility.revision + 1 };
          emit('main-visibility', visibility); return;
        }
        if (cmd === 'load_data') { await readGate; return JSON.parse(JSON.stringify(data)); }
        if (cmd === 'plugin:event|listen') { const eventId = ++id; listeners.set(eventId, { ...args, id: eventId }); return eventId; }
        if (cmd === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
        if (cmd === 'open_settings') { if (!settingsOpen) { settingsOpen = true; await window.__resizeThemeWindow(400, 600); emit('open-settings'); } return; }
        if (cmd === 'hide_settings') { settingsOpen = false; await resizeMain(); emit('show-main'); return; }
        if (cmd === 'plugin:window|start_dragging') return;
        if (cmd === 'plugin:window|outer_position') return { ...data.position };
        if (cmd === 'plugin:window|scale_factor') return 1;
        if (cmd === 'save_position') { data.position = { x: args.x, y: args.y }; return; }
        if (cmd === 'set_window_mode' || cmd === 'set_privacy_mode') {
          if (window.__themeTest.failSave) throw new Error('模拟磁盘写入失败');
          if (cmd === 'set_window_mode') { data.windowMode = args.windowMode; await resizeMain(); }
          else data.privacyMode = args.privacyMode;
          emit('display-updated', preferences()); return preferences();
        }
        if (cmd === 'save_theme') {
          if (window.__themeTest.failSave) throw new Error('模拟磁盘写入失败');
          data.selectedThemeId = args.selectedThemeId; emit('theme-updated', data.selectedThemeId); return;
        }
        if (cmd === 'save_settings') { if (window.__themeTest.failSave) throw new Error('模拟磁盘写入失败'); settingsOpen = false; data.settings = { ...args.settings }; if(args.displayMode) data.displayMode = args.displayMode; data.configError = null; emit('display-updated', preferences()); await resizeMain(); emit('settings-updated'); return; }
        throw new Error(`Unexpected command ${cmd}`);
      },
    };
  }, { initialTheme: themeId, display });
  await page.clock.install({ time: new Date('2026-10-13T10:00:00+08:00') });
  await page.clock.pauseAt(new Date('2026-10-13T10:00:00+08:00'));
  await page.goto('http://127.0.0.1:5178');
  if (display.holdReads || display.configError) return;
  await page.waitForSelector('.state-working');
  await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 260, height: 276 }, deviceScaleFactor: 2, timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await prepare(page);
    const theme = async () => page.locator('.theme-root').getAttribute('data-theme-id');
    const data = async () => page.evaluate(() => JSON.parse(JSON.stringify(window.__themeTest.data)));
    const snapshot = async () => ({ state: await page.locator('.widget-stage').getAttribute('data-work-state'), money: await page.locator('.amount').textContent(), progress: await page.getByRole('progressbar').getAttribute('aria-valuenow'), card: await page.locator('.pet-card').boundingBox(), girl: await page.locator('.girl-wrap').boundingBox(), amount: await page.locator('.amount').boundingBox() });
    const initialData = await data();
    assert.equal(await theme(), 'blue-whale-girl');
    await page.screenshot({ path: 'docs/ui/themes-blue-working.png', animations: 'disabled', omitBackground: true });

    for (const [time, state, selector] of [['10:00:00', 'working', '.chibi-awake'], ['12:30:00', 'lunch', '.chibi-sleeping'], ['19:00:00', 'after', '.chibi-after-work']]) {
      await page.clock.setSystemTime(new Date(`2026-10-13T${time}+08:00`)); await page.clock.runFor(1000);
      await page.waitForSelector(`.state-${state}`);
      const before = await snapshot();
      const blueProgress = await page.locator('.progress-fill').evaluate(el => getComputedStyle(el).backgroundImage);
      await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('save_theme', { selectedThemeId: 'test-theme' }));
      await page.waitForSelector('[data-theme-id="test-theme"]');
      assert.deepEqual(await snapshot(), before, 'Visual changes must not touch money/state/geometry');
      assert.ok((await page.locator(selector).getAttribute('src')).includes(`skin-test=${state === 'after' ? 'finished' : state}`));
      assert.notEqual(await page.locator('.progress-fill').evaluate(el => getComputedStyle(el).backgroundImage), blueProgress);
      assert.equal((await data()).settings.monthlySalary, 8800);
      assert.deepEqual((await data()).position, initialData.position);
      if (state === 'after') assert.equal(await page.locator('.note-heart').textContent(), '✦');
      await page.screenshot({ path: `docs/ui/themes-test-${state}.png`, animations: 'disabled', omitBackground: true });
      await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('save_theme', { selectedThemeId: 'blue-whale-girl' }));
      await page.waitForSelector('[data-theme-id="blue-whale-girl"]');
      assert.deepEqual(await snapshot(), before);
    }

    // Native persistence is covered separately; simulate a new load from saved data.
    await page.evaluate(() => { window.__themeTest.data.selectedThemeId = 'test-theme'; window.__themeTest.emit('theme-updated', 'test-theme'); });
    await page.waitForSelector('[data-theme-id="test-theme"]');
    await page.getByRole('button', { name: '打开设置' }).click();
    await page.waitForSelector('.settings-portrait-image');
    assert.ok((await page.locator('.settings-portrait-image').getAttribute('src')).includes('skin-test=settings'));
    await page.screenshot({ path: 'docs/ui/themes-test-settings.png', animations: 'disabled', omitBackground: true });
    await page.getByLabel('月薪（元）').fill('9900');
    await page.getByLabel('午休开始', { exact: true }).fill('12:15');
    await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
    await page.waitForSelector('.theme-picker');
    assert.equal(await page.locator('.theme-option').count(), 2, 'Only blue and Mibao appear in public list');
    assert.equal(await page.locator('.theme-state-previews img').count(), 3);
    await page.getByRole('button', { name: /蓝色大肥鱼/ }).click();
    assert.equal(await theme(), 'test-theme', 'Selecting a preview cannot apply a skin');
    assert.equal((await data()).selectedThemeId, 'test-theme');
    assert.equal(await page.getByRole('button', { name: '使用此主题', exact: true }).isEnabled(), true);
    await page.evaluate(() => { window.__themeTest.failSave = true; });
    await page.getByRole('button', { name: '使用此主题', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await theme(), 'test-theme');
    await page.evaluate(() => { window.__themeTest.failSave = false; });
    await page.getByRole('button', { name: '使用此主题', exact: true }).click();
    await page.waitForSelector('[data-theme-id="blue-whale-girl"]');
    assert.deepEqual((await data()).settings, initialData.settings, 'Theme save must not save the draft');
    assert.equal(await page.getByRole('button', { name: '当前使用', exact: true }).isDisabled(), true);
    assert.ok(await page.locator('.settings-shell').evaluate(el => el.scrollHeight <= el.clientHeight), 'Theme page must fit the native 400x600 window');
    await page.screenshot({ path: 'docs/ui/themes-picker.png', animations: 'disabled', omitBackground: true });
    await page.getByRole('button', { name: '返回工资设置' }).click();
    assert.equal(await page.getByLabel('月薪（元）').inputValue(), '9900');
    assert.equal(await page.getByLabel('午休开始', { exact: true }).inputValue(), '12:15');
    await page.screenshot({ path: 'docs/ui/themes-blue-settings.png', animations: 'disabled', omitBackground: true });
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await page.waitForSelector('.widget-stage');
    assert.equal((await data()).selectedThemeId, 'blue-whale-girl');
    assert.equal((await data()).settings.monthlySalary, 9900);
    assert.equal(await page.evaluate(() => window.__themeTest.listenerCount()), 6);
    assert.deepEqual(errors, []);

    // Each fresh page is a fresh resource cache, enabling actual load failures.
    for (const [id, expectId, broken] of [['test-theme', 'test-theme', false], ['missing-theme', 'blue-whale-girl', false], ['test-theme', 'blue-whale-girl', true]]) {
      const fresh = await context.newPage();
      if (broken) await fresh.route('**/*skin-test*', route => route.abort());
      await prepare(fresh, id);
      await fresh.getByRole('button', { name: '打开设置' }).click();
      if (id === 'missing-theme' || broken) await fresh.locator('.theme-notice').waitFor();
      await fresh.waitForSelector(`[data-theme-id="${expectId}"]`);
      await fresh.waitForFunction(() => document.querySelector('#salary')?.value === '8800');
      assert.equal(await fresh.getByLabel('月薪（元）').inputValue(), '8800');
      await fresh.close();
    }
    // A malformed registry entry is rejected before rendering any missing pose.
    assert.equal(await page.evaluate(async () => {
      const catalog = await import('/src/themes/catalog.ts');
      const test = catalog.resolveTheme('test-theme');
      const original = test.characters.settings;
      delete test.characters.settings;
      const fallback = catalog.resolveTheme('test-theme').id;
      test.characters.settings = original;
      return fallback;
    }), 'blue-whale-girl');
    await context.close();
    console.log('PASS: default and internal skins; four assets/color/decoration; working/lunch/after income and geometry unchanged; preview vs apply; disk failure; draft preservation; independent saving; restart/invalid ID/broken assets; listener cleanup; public list excludes test skin.');
  } finally { await browser.close(); }
}
module.exports = { prepare };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
