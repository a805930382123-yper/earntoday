// Exercise the unchanged form behavior with the real UI and a test-only bridge.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.argv[2] ? path.join(process.argv[2], 'playwright') : 'playwright');

async function prepare(page) {
  await page.exposeFunction('__resizeTestWindow', (width, height) => page.setViewportSize({ width, height }));
  await page.addInitScript(() => {
    const callbacks = new Map();
    const listeners = new Map();
    let id = 0;
    let settings = { monthlySalary: 8800, workdaysPerMonth: 22, workStart: '09:00', workEnd: '18:00', lunchStart: '12:00', lunchEnd: '13:00' };
    const emit = event => { for (const listener of listeners.values()) if (listener.event === event) callbacks.get(listener.handler)?.({ event, id: listener.id, payload: null }); };
    window.__settingsTest = { saved: null };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, eventId) => listeners.delete(eventId) };
    window.__TAURI_INTERNALS__ = {
      currentWindow: { label: 'settings' },
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback(callback) { callbacks.set(++id, callback); return id; },
      unregisterCallback: callbackId => callbacks.delete(callbackId),
      async invoke(cmd, args) {
        if (cmd === 'load_data') return { settings: { ...settings }, position: null };
        if (cmd === 'plugin:event|listen') { const eventId = ++id; listeners.set(eventId, { ...args, id: eventId }); return eventId; }
        if (cmd === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
        if (cmd === 'open_settings') { await window.__resizeTestWindow(400, 600); emit('open-settings'); return; }
        if (cmd === 'hide_settings') { await window.__resizeTestWindow(260, 276); emit('show-main'); return; }
        if (cmd === 'save_settings') {
          settings = { ...args.settings };
          window.__settingsTest.saved = settings;
          await window.__resizeTestWindow(260, 276);
          emit('show-main'); emit('settings-updated'); return;
        }
        throw new Error(`Unexpected bridge command: ${cmd}`);
      },
    };
  });
  await page.goto('http://127.0.0.1:5178');
  await page.waitForSelector('.settings-portrait-image');
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
}

async function checkLayout(page) {
  assert.equal(await page.locator('form input').count(), 6);
  const portrait = await page.locator('.settings-portrait').boundingBox();
  assert.equal(portrait.width, 170);
  assert.equal(portrait.height, 116);
  const title = await page.locator('.settings-head h1').boundingBox();
  assert.ok(portrait.y + portrait.height <= title.y, 'Character overlaps title');
  const save = await page.getByRole('button', { name: '保存设置' }).boundingBox();
  assert.ok(save.y + save.height <= 600, 'Save button is clipped');
  assert.equal(await page.locator('.settings-shell').evaluate(el => el.scrollHeight <= el.clientHeight), true, 'Normal form should fit without scrolling');
  const close = await page.getByRole('button', { name: '关闭设置' }).boundingBox();
  const closeIsTopmost = await page.evaluate(({ x, y, width, height }) => document.elementFromPoint(x + width / 2, y + height / 2)?.closest('button')?.getAttribute('aria-label') === '关闭设置', close);
  assert.ok(closeIsTopmost, 'Close button is covered');
}

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 400, height: 600 }, deviceScaleFactor: 2, timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
    await prepare(page);
    await page.screenshot({ path: 'docs/ui/settings-a-browser.png', omitBackground: true, animations: 'disabled' });
    await checkLayout(page);
    assert.ok((await page.locator('.subtitle').textContent()).includes('按新设置重新计算'));
    assert.ok((await page.locator('.preview').textContent()).includes('400.00'));
    assert.ok((await page.locator('.preview').textContent()).includes('50.00'));
    await page.screenshot({ path: 'docs/ui/settings-a-browser.png', omitBackground: true, animations: 'disabled' });

    await page.getByLabel('月薪（元）').fill('0');
    await page.getByRole('button', { name: '保存设置' }).click();
    await page.getByText('月薪必须大于 0', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__settingsTest.saved), null);
    await page.getByLabel('月薪（元）').fill('10000');
    await page.getByLabel('每月工作天数').fill('20');
    await page.getByLabel('上班时间', { exact: true }).fill('09:30');
    await page.getByLabel('下班时间', { exact: true }).fill('18:30');
    await page.getByLabel('午休开始', { exact: true }).fill('12:30');
    await page.getByLabel('午休结束', { exact: true }).fill('14:00');
    assert.ok((await page.locator('.work-hours-hint').textContent()).includes('7.5'));
    assert.ok((await page.locator('.preview').textContent()).includes('500.00'));
    assert.ok((await page.locator('.preview').textContent()).includes('66.67'));
    await page.getByRole('button', { name: '保存设置' }).click();
    await page.waitForSelector('.widget-stage');
    assert.deepEqual(await page.evaluate(() => window.__settingsTest.saved), { monthlySalary: 10000, workdaysPerMonth: 20, workWeekdays: [1,2,3,4,5], workStart: '09:30', workEnd: '18:30', lunchStart: '12:30', lunchEnd: '14:00' });
    await page.getByRole('button', { name: '打开设置' }).click();
    await page.waitForSelector('.settings-shell');
    assert.equal(await page.getByLabel('月薪（元）').inputValue(), '10000');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.settings-portrait-image').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.waitForSelector('.widget-stage');
    assert.deepEqual(errors, []);
    await context.close();

    for (const scale of [1, 1.25, 1.5]) {
      const dpiContext = await browser.newContext({ viewport: { width: 400, height: 600 }, deviceScaleFactor: scale });
      const dpiPage = await dpiContext.newPage();
      await prepare(dpiPage);
      await checkLayout(dpiPage);
      await dpiContext.close();
    }
    console.log('PASS: full portrait, six fields, live salary/hour previews, validation, save payload/reload, close hit testing, 100/125/150/200% DPI, reduced motion, unchanged 400x600 window.');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
