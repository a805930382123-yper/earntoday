// Deterministic renderer acceptance; bridge state and time are synthetic.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const { prepare } = require('./verify-themes.cjs');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const theme of ['blue-whale-girl', 'mibao']) for (const mode of ['full', 'mini']) {
      const context = await browser.newContext({ viewport: { width: 260, height: mode === 'mini' ? 108 : 276 }, timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await prepare(page, theme, { windowMode: mode, privacyMode: 'hidden', displayMode: 'collection' });
      const invoke = (cmd, args) => page.evaluate(({ cmd, args }) => window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
      const visible = expected => page.waitForFunction(value => document.documentElement.dataset.windowVisible === String(value), expected);
      await visible(true);
      await page.getByRole('button', { name: '打开设置', exact: true }).click();
      await page.getByLabel('月薪（元）').fill('23456.78');
      await page.getByLabel('每月工作天数').fill('19');
      await page.getByRole('radio', { name: '趣味积累' }).check();
      await invoke('hide_main'); await visible(false);
      // No visibilitychange is dispatched: this exercises the native event alone.
      assert.equal(await page.locator('.settings-portrait-image').evaluate(el => getComputedStyle(el).animationName), 'none');
      await invoke('toggle_main_visibility'); await visible(true);
      assert.deepEqual(page.viewportSize(), { width: 400, height: 600 });
      assert.equal(await page.getByLabel('月薪（元）').inputValue(), '23456.78');
      assert.equal(await page.getByLabel('每月工作天数').inputValue(), '19');
      assert.equal(await page.getByRole('radio', { name: '趣味积累' }).isChecked(), true);
      await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
      await invoke('hide_main'); await invoke('toggle_main_visibility'); await visible(true);
      await page.getByRole('button', { name: '返回工资设置' }).click();
      assert.equal(await page.getByLabel('月薪（元）').inputValue(), '23456.78');
      await page.getByRole('checkbox', { name: '启用全局快捷键' }).uncheck();
      await page.getByText('快捷键已停用', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: '启用全局快捷键' }).check();
      await page.getByText('快捷键已启用', { exact: true }).waitFor();
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
      await page.waitForSelector(`[data-window-mode="${mode}"].privacy-hidden`);
      await invoke('set_privacy_mode', { privacyMode: 'visible' });
      await page.waitForSelector('.collection');
      // Positive control: an ordinary live boundary still produces one deposit.
      await page.clock.setSystemTime(new Date('2026-10-13T10:35:58+08:00'));
      await page.clock.runFor(1000);
      await page.clock.runFor(1000);
      await page.waitForSelector('.collection-deposit');
      await invoke('hide_main'); await visible(false);
      assert.equal(await page.locator('.collection-deposit').count(), 0);
      await invoke('toggle_main_visibility'); await visible(true);
      assert.equal(await page.locator('.collection-deposit').count(), 0);
      const before = await page.evaluate(() => structuredClone(window.__themeTest.data));
      // Cancel a live reaction, freeze the renderer clock while hidden, and cross lunch.
      await page.getByRole('button', { name: /桌宠，点击互动/ }).click();
      await page.waitForSelector('.pet-bubble');
      await invoke('hide_main'); await visible(false);
      assert.equal(await page.locator('.pet-bubble').count(), 0);
      const frozen = await page.locator('[data-work-state]').getAttribute('data-work-state');
      await page.clock.setSystemTime(new Date('2026-10-13T12:30:00+08:00'));
      await page.clock.runFor(5000);
      assert.equal(await page.locator('[data-work-state]').getAttribute('data-work-state'), frozen);
      await invoke('toggle_main_visibility'); await visible(true);
      await page.waitForSelector('.state-lunch');
      assert.equal(await page.locator('.collection-deposit,.pet-bubble,.note-enter').count(), 0);
      // Resume a full jar after work without replaying collection or celebration.
      await invoke('hide_main'); await visible(false);
      await page.clock.setSystemTime(new Date('2026-10-13T19:00:00+08:00'));
      await page.clock.runFor(5000);
      await invoke('toggle_main_visibility'); await visible(true);
      await page.waitForSelector('.state-after');
      assert.equal(await page.locator('.collection-deposit,.pet-bubble,.note-enter').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__themeTest.data), before);
      // Ignore an old query/event arriving after a newer native hide/show sequence.
      await page.evaluate(() => window.__themeTest.emit('main-visibility', { visible: false, revision: 0 }));
      await visible(true);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.chibi-after-work').evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.deepEqual(errors, []);
      console.log(`PASS ${theme}/${mode}: draft, theme view, shortcut switch, native visibility, cancellation, lunch/after-work resume, no replay, preferences, stale events, reduced motion`);
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
