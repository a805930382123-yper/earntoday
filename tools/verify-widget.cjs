// Runs the real app with a test-only Tauri bridge and controllable browser clock.
// No simulation hooks are included in the shipped UI, and no OS time/config is changed.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.argv[2] ? path.join(process.argv[2], 'playwright') : 'playwright');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 260, height: 276 }, deviceScaleFactor: Number(process.argv[3] || 3), timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  const errors = [];
  // Exercise the same viewport changes as the single native WebView: settings
  // expands to 400x600; returning restores 260x276 before the view event arrives.
  await page.exposeFunction('__resizeTestWindow', (width, height) => page.setViewportSize({ width, height }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  await page.addInitScript(() => {
    const callbacks = new Map();
    const listeners = new Map();
    let id = 0;
    const settings = { monthlySalary: 8800, workdaysPerMonth: 22, workStart: '09:00', workEnd: '18:00', lunchStart: '12:00', lunchEnd: '13:00' };
    window.__widgetTest = {
      settings, calls: [],
      emit(event) {
        for (const listener of listeners.values()) if (listener.event === event) callbacks.get(listener.handler)?.({ event, id: listener.id, payload: null });
      },
      listenerCount: () => listeners.size,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, eventId) => listeners.delete(eventId) };
    window.__TAURI_INTERNALS__ = {
      currentWindow: { label: 'main' },
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback(callback) { callbacks.set(++id, callback); return id; },
      unregisterCallback: callbackId => callbacks.delete(callbackId),
      async invoke(cmd, args) {
        window.__widgetTest.calls.push(cmd);
        if (cmd === 'load_data') return { settings: { ...settings }, position: null };
        if (cmd === 'plugin:event|listen') { const eventId = ++id; listeners.set(eventId, { ...args, id: eventId }); return eventId; }
        if (cmd === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
        if (cmd === 'open_settings') { await window.__resizeTestWindow(400, 600); window.__widgetTest.emit('open-settings'); return; }
        if (cmd === 'hide_settings') { await window.__resizeTestWindow(260, 276); window.__widgetTest.emit('show-main'); return; }
        if (cmd === 'hide_main') return;
        throw new Error(`Unexpected bridge command: ${cmd}`);
      },
    };
  });
  await page.clock.install({ time: new Date('2026-10-12T11:59:59+08:00') });
  await page.clock.pauseAt(new Date('2026-10-12T11:59:59+08:00'));
  await page.goto('http://127.0.0.1:5178');
  await page.waitForSelector('.state-working');
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  const snapshot = async () => ({
    state: await page.locator('.widget-stage').getAttribute('data-work-state'),
    money: (await page.locator('.amount').textContent()).replace(/\s/g, ''),
    progress: await page.locator('.progress-fill').getAttribute('style'),
    worked: await page.locator('.time-value').first().textContent(),
    remaining: await page.locator('.time-value').last().textContent(),
    card: await page.locator('.pet-card').boundingBox(),
    amount: await page.locator('.amount').boundingBox(),
  });
  const before = await snapshot();
  assert.deepEqual(before.card, { x: 10, y: 97, width: 240, height: 140 });
  const girl = await page.locator('.girl-wrap').boundingBox();
  assert.equal(girl.y, 30);
  assert.equal(girl.width, 180.5);
  assert.equal(before.money, '¥149.99');
  await page.screenshot({ path: 'docs/ui/widget-working.png', omitBackground: true, animations: 'disabled' });
  await page.clock.runFor(1000);
  const start = await snapshot();
  assert.equal(start.state, 'lunch');
  assert.equal(start.money, '¥150.00');
  await page.clock.runFor(30 * 60 * 1000);
  const middle = await snapshot();
  assert.equal(middle.money, start.money);
  assert.equal(middle.worked, start.worked);
  assert.equal(middle.progress, start.progress);
  assert.notEqual(middle.remaining, start.remaining);
  assert.deepEqual(middle.card, before.card);
  assert.deepEqual(middle.amount, before.amount);
  assert.equal(await page.locator('.chibi-sleeping').evaluate(el => getComputedStyle(el).opacity), '1');
  await page.screenshot({ path: 'docs/ui/widget-lunch.png', omitBackground: true, animations: 'disabled' });
  await page.clock.runFor(29 * 60 * 1000 + 59000);
  assert.equal((await snapshot()).state, 'lunch');
  assert.equal((await snapshot()).money, '¥150.00');
  await page.clock.runFor(1000);
  assert.equal((await snapshot()).state, 'working');
  assert.equal((await snapshot()).money, '¥150.00');
  await page.clock.runFor(1000);
  assert.equal((await snapshot()).money, '¥150.01');

  // A fresh page in lunch must directly show sleep without a preceding work session.
  await page.clock.setSystemTime(new Date('2026-10-12T12:30:00+08:00'));
  await page.reload();
  await page.waitForSelector('.state-lunch');
  assert.equal((await snapshot()).money, '¥150.00');
  await page.evaluate(() => { Object.assign(window.__widgetTest.settings, { lunchStart: '12:45', lunchEnd: '13:45' }); window.__widgetTest.emit('settings-updated'); });
  await page.waitForSelector('.state-working');
  assert.equal((await snapshot()).money, '¥175.00');

  // Verify real button hit testing: the transparent drag/art layers cannot cover them.
  const layoutBeforeSettings = await snapshot();
  for (let round = 0; round < 5; round++) {
    await page.getByRole('button', { name: '打开设置' }).click();
    await page.waitForSelector('.settings-shell');
    assert.deepEqual(page.viewportSize(), { width: 400, height: 600 });
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.waitForSelector('.widget-stage');
    assert.deepEqual(page.viewportSize(), { width: 260, height: 276 });
    const returned = await snapshot();
    assert.deepEqual(returned.card, layoutBeforeSettings.card);
    assert.deepEqual(returned.amount, layoutBeforeSettings.amount);
    assert.equal(returned.money, layoutBeforeSettings.money);
    assert.equal((await page.locator('.girl-wrap').boundingBox()).width, 180.5);
    assert.equal(await page.evaluate(() => window.__widgetTest.listenerCount()), 6);
  }
  await page.screenshot({ path: 'docs/ui/widget-settings-return.png', omitBackground: true, animations: 'disabled' });
  await page.reload();
  await page.waitForSelector('.state-lunch');
  assert.deepEqual((await snapshot()).card, before.card);
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.waitForSelector('.settings-shell');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.waitForSelector('.state-lunch');
  assert.deepEqual((await snapshot()).card, before.card);
  await page.getByRole('button', { name: '隐藏到托盘' }).click();
  assert.ok(await page.evaluate(() => window.__widgetTest.calls.includes('hide_main')));
  assert.equal(await page.evaluate(() => window.__widgetTest.listenerCount()), 6);

  // Reach the exact off-work boundary without changing the operating system clock.
  await page.clock.setSystemTime(new Date('2026-10-12T17:59:58+08:00'));
  await page.clock.runFor(1000);
  assert.equal((await snapshot()).state, 'working');
  assert.equal((await snapshot()).money, '¥399.99');
  await page.clock.runFor(1000);
  await page.waitForSelector('.state-after .note-enter');
  const completed = await snapshot();
  assert.equal(completed.money, '¥400.00');
  assert.equal(completed.worked, '8h 0m');
  assert.deepEqual(completed.card, before.card);
  assert.deepEqual(completed.amount, before.amount);
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
  assert.equal(await page.locator('.progress-percent').textContent(), '100%');
  assert.equal(await page.locator('.off-work-label').textContent(), '已下班');
  assert.equal(await page.locator('.completion-badge .status-text').textContent(), '今日打工完成');
  assert.equal(await page.locator('.after-work-note span').first().textContent(), '下班！又是美好的一天');
  assert.ok(!(await page.locator('.pet-card').textContent()).includes('距离下班'));
  await page.screenshot({ path: 'docs/ui/widget-after-work.png', omitBackground: true, animations: 'disabled' });
  assert.equal(await page.locator('.chibi-after-work').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await page.locator('.chibi-awake').evaluate(el => getComputedStyle(el).opacity), '0');
  const note = await page.locator('.after-work-note').boundingBox();
  assert.ok(note.x >= 0 && note.x + note.width <= 260 && note.y >= completed.card.y + completed.card.height && note.y + note.height <= 276);
  const fullBar = await page.getByRole('progressbar').boundingBox();
  assert.equal((await page.locator('.progress-fill').boundingBox()).width, fullBar.width);
  await page.clock.runFor(60 * 60 * 1000);
  assert.equal((await snapshot()).money, completed.money);
  assert.equal((await snapshot()).worked, completed.worked);
  assert.equal((await snapshot()).progress, completed.progress);
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.waitForSelector('.state-after');
  assert.equal(await page.locator('.note-enter').count(), 0, 'Settings return must not repeat the celebration');
  assert.deepEqual((await snapshot()).card, before.card);

  // A fresh app loaded after work uses calculated final income directly.
  await page.reload();
  await page.waitForSelector('.state-after');
  assert.equal((await snapshot()).money, '¥400.00');
  await page.evaluate(() => { Object.assign(window.__widgetTest.settings, { workEnd: '20:00' }); window.__widgetTest.emit('settings-updated'); });
  await page.waitForSelector('.state-working');
  assert.equal(await page.locator('.after-work-note').count(), 0);
  await page.evaluate(() => { Object.assign(window.__widgetTest.settings, { workEnd: '18:00' }); window.__widgetTest.emit('settings-updated'); });
  await page.waitForSelector('.state-after');
  assert.equal((await snapshot()).money, '¥400.00');
  assert.equal(await page.locator('.note-enter').count(), 0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.after-work-note').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.chibi-base').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await page.locator('.sleep-symbols').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  const bounds = await page.locator('.widget-stage').boundingBox();
  assert.equal(bounds.width, 260);
  assert.equal(bounds.height, 276);
  await page.clock.setSystemTime(new Date('2026-10-12T23:59:59+08:00'));
  await page.clock.runFor(1000);
  assert.equal((await snapshot()).state, 'before');
  assert.equal((await snapshot()).money, '¥0.00');
  assert.equal(await page.locator('.after-work-note').count(), 0);
  await page.clock.setSystemTime(new Date('2026-10-17T19:00:00+08:00'));
  await page.clock.runFor(1000);
  assert.equal((await snapshot()).state, 'rest_day');
  assert.equal((await snapshot()).money, '¥0.00');
  assert.equal(await page.locator('.after-work-note').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: original card geometry; lunch pause/resume; exact off-work boundary/final income/full progress; cold restart; changed end time; midnight/weekend; once-only note/no clipping; settings round trips/buttons; reduced motion. DPI:', process.argv[3] || 3);
  await browser.close();
}
main().catch(error => { console.error(error); process.exit(1); });
