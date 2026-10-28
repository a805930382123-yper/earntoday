const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const { prepare } = require('./verify-themes.cjs');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const dpi of [1, 1.25, 1.5, 2]) {
      const context = await browser.newContext({ viewport: { width: 260, height: 276 }, deviceScaleFactor: dpi, timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await prepare(page);
      const initialListenerCount = await page.evaluate(() => window.__themeTest.listenerCount());
      const initialData = await page.evaluate(() => structuredClone(window.__themeTest.data));
      const info = async () => ({ money: await page.locator('.amount').textContent(), progress: await page.getByRole('progressbar').getAttribute('aria-valuenow'), state: await page.locator('.widget-stage').getAttribute('data-work-state'), card: await page.locator('.pet-card').boundingBox(), amount: await page.locator('.amount').boundingBox(), girl: await page.locator('.girl-wrap').boundingBox() });
      const choose = async id => {
        await page.getByRole('button', { name: '打开设置' }).click();
        await page.waitForFunction(() => document.querySelector('#salary')?.value === '8800', null, { polling: 50 });
        await page.getByLabel('月薪（元）').fill('9900');
        await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
        assert.equal(await page.locator('.theme-option').count(), 2);
        await page.getByRole('button', { name: id === 'mibao' ? /咪宝/ : /蓝色大肥鱼/ }).click();
        assert.notEqual(await page.locator('.theme-root').getAttribute('data-theme-id'), id, 'Preview is not apply');
        const expectedPreview = id === 'mibao' ? /\/mibao\// : /chibi-girl/;
        for (const img of await page.locator('.theme-preview img').all()) assert.match(await img.getAttribute('src'), expectedPreview);
        const fit = await page.locator('.settings-shell').evaluate(el => ({ scroll: el.scrollHeight, height: el.clientHeight, card: document.querySelector('.theme-picker-card').getBoundingClientRect().toJSON() }));
        if (fit.scroll > fit.height) await page.screenshot({ path: 'docs/ui/mibao-picker-overflow.png', animations: 'disabled', omitBackground: true });
        assert.ok(fit.scroll <= fit.height, JSON.stringify(fit));
        const apply = await page.getByRole('button', { name: '使用此主题', exact: true }).boundingBox();
        assert.ok(apply.y + apply.height <= 600, 'Apply is visible');
        await page.getByRole('button', { name: '使用此主题', exact: true }).click();
        await page.waitForSelector(`[data-theme-id="${id}"]`);
        await page.clock.runFor(400);
        if (dpi === 2 && id === 'mibao') await page.screenshot({ path: 'docs/ui/mibao-picker.png', animations: 'disabled', omitBackground: true });
        await page.getByRole('button', { name: '返回工资设置' }).click();
        assert.equal(await page.getByLabel('月薪（元）').inputValue(), '9900', 'Draft preserved');
        assert.equal(await page.locator('form input:not([type="checkbox"]):not([type="radio"])').count(), 6);
        assert.equal(await page.getByLabel('桌宠自主小动作', { exact: true }).count(), 1);
        assert.match(await page.locator('.settings-portrait-image').getAttribute('src'), expectedPreview);
        assert.ok(await page.locator('.settings-shell').evaluate(el => el.scrollWidth <= el.clientWidth), 'Settings must not overflow horizontally');
        await page.getByRole('button', { name: '保存设置', exact: true }).scrollIntoViewIfNeeded();
        const save = await page.getByRole('button', { name: '保存设置', exact: true }).boundingBox();
        assert.ok(save.y + save.height <= 600);
        if (dpi === 2 && id === 'mibao') await page.screenshot({ path: 'docs/ui/mibao-settings.png', animations: 'disabled', omitBackground: true });
        await page.getByRole('button', { name: '关闭设置' }).click();
        await page.waitForSelector('.widget-stage');
        const data = await page.evaluate(() => structuredClone(window.__themeTest.data));
        assert.deepEqual(data.settings, initialData.settings);
        assert.deepEqual(data.position, initialData.position);
        assert.equal(data.selectedThemeId, id);
      };
      for (const [time, state, pose] of [['10:00:00', 'working', '.chibi-awake'], ['12:30:00', 'lunch', '.chibi-sleeping'], ['19:00:00', 'after', '.chibi-after-work']]) {
        await page.clock.setFixedTime(new Date(`2026-10-13T${time}+08:00`)); await page.clock.runFor(1000);
        await page.waitForSelector(`.state-${state}`);
        const original = await info();
        const blue = await page.locator('.progress-fill').evaluate(el => getComputedStyle(el).backgroundImage);
        await choose('mibao');
        assert.deepEqual(await info(), original, 'Salary, progress, state, shared geometry unchanged');
        assert.match(await page.locator(pose).getAttribute('src'), /\/mibao\//);
        assert.equal(await page.locator(pose).evaluate(el => getComputedStyle(el).maskImage), 'none', 'Cat paws do not fade');
        assert.notEqual(await page.locator('.progress-fill').evaluate(el => getComputedStyle(el).backgroundImage), blue);
        assert.equal(await page.locator('.theme-card-accent').count(), 1);
        if (state === 'lunch') {
          assert.equal(await page.locator('.status-text').textContent(), '午休中');
          await page.clock.setFixedTime(new Date('2026-10-13T12:31:00+08:00'));
          await page.clock.runFor(60000);
          assert.deepEqual(await info(), original, 'Lunch pay/progress paused');
        }
        if (state === 'after') {
          assert.equal(original.progress, '100');
          assert.equal(await page.locator('.note-heart').textContent(), '🐾');
          await page.clock.setFixedTime(new Date('2026-10-13T19:01:00+08:00'));
          await page.clock.runFor(60000);
          assert.deepEqual(await info(), original, 'Final salary frozen');
        }
        if (dpi === 2) await page.screenshot({ path: `docs/ui/mibao-${state}.png`, animations: 'disabled', omitBackground: true });
        await choose('blue-whale-girl');
        assert.deepEqual(await info(), original);
        assert.equal(await page.locator('.theme-card-accent').count(), 0);
        assert.equal(await page.locator('.progress-fill').evaluate(el => getComputedStyle(el).backgroundImage), blue);
      }
      assert.equal(await page.evaluate(() => window.__themeTest.listenerCount()), initialListenerCount, 'Repeated theme/settings visits must not leak listeners');
      assert.deepEqual(errors, []);
      const fresh = await context.newPage();
      await prepare(fresh, 'mibao');
      await fresh.waitForSelector('[data-theme-id="mibao"]');
      await fresh.getByRole('button', { name: '打开设置' }).click();
      assert.match(await fresh.locator('.settings-portrait-image').getAttribute('src'), /\/mibao\/settings/);
      await context.close();
    }
    console.log('PASS Mibao: four poses, real picker/apply, bidirectional switch in 3 states, income/progress/geometry unchanged, lunch/final freeze, draft/data preservation, restored theme, full UI at 100/125/150/200% DPI; no page errors.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
