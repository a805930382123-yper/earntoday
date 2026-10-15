const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const { prepare } = require('./verify-themes.cjs');
const labels = ['周日','周一','周二','周三','周四','周五','周六'];
async function select(page, days) {
  for (let day = 0; day < 7; day++) {
    const button = page.getByRole('button', { name: labels[day], exact: true });
    if ((await button.getAttribute('aria-pressed') === 'true') !== days.includes(day)) await button.click();
  }
}
async function main() {
  fs.mkdirSync('docs/ui/work-weekdays-browser', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const dpi of [1,1.25,1.5,2]) for (const id of ['blue-whale-girl','mibao']) {
      const context = await browser.newContext({ viewport: { width: 260, height: 276 }, deviceScaleFactor: dpi, timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await prepare(page, id); await page.waitForLoadState('networkidle');
      const original = await page.evaluate(() => structuredClone(window.__themeTest.data.settings));
      const stored = () => page.evaluate(() => structuredClone(window.__themeTest.data.settings));
      const amount = () => page.locator('.amount,.mini-amount');
      const open = async () => { await page.getByRole('button', { name: '打开设置' }).click(); await page.waitForSelector('.work-weekdays'); };
      const save = async () => { await page.getByRole('button', { name: '保存设置', exact: true }).click(); await page.waitForSelector('[data-work-state]'); };
      const setTime = async (date, state) => { await page.clock.setFixedTime(new Date(`${date}+08:00`)); await page.clock.runFor(1000); await page.waitForSelector(`[data-work-state="${state}"]`); };
      const privateMode = async hidden => {
        const current = await page.locator('[data-work-state]').getAttribute('class');
        if (current.includes('privacy-hidden') !== hidden) await page.getByRole('button', { name: hidden ? '隐藏收入' : '显示收入', exact: true }).click();
        await page.waitForSelector(hidden ? '.privacy-hidden' : '[data-work-state]:not(.privacy-hidden)');
      };
      const assertRest = async hidden => {
        assert.equal(await page.locator('[data-work-state]').getAttribute('data-work-state'), 'rest_day');
        assert.equal((await amount().textContent()).replace(/\s/g,''), hidden ? '¥••••••' : '¥0.00');
        assert.match(await page.locator('.status-text,.mini-status').textContent(), /今天休息/);
        assert.equal(await page.locator('.privacy-question,.privacy-confused,.pet-has-privacy-art,.after-work-note,[role="progressbar"],.progress-times,.pet-hit-area').count(), 0);
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.chibi-sleeping')).opacity === '1');
        assert.match(await page.locator('.chibi-sleeping').getAttribute('src'), id === 'mibao' ? /mibao\/lunch/ : /chibi-girl-sleeping/);
      };
      await open();
      assert.equal(await page.locator('form input').count(), 6);
      assert.equal(await page.locator('.weekday-options [aria-pressed="true"]').count(), 5);
      assert.equal(await page.getByRole('button', { name: '周日', exact: true }).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', { name: '单休', exact: true }).click();
      assert.equal(await page.locator('.weekday-options [aria-pressed="true"]').count(), 6);
      assert.equal(await page.getByLabel('每月工作天数').inputValue(), '22');
      assert.match(await page.locator('.preview').textContent(), /400\.00/);
      await page.getByRole('button', { name: '双休', exact: true }).click();
      assert.equal(await page.locator('.weekday-options [aria-pressed="true"]').count(), 5);
      await select(page, []); await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: /至少选择/ }).waitFor();
      assert.deepEqual(await stored(), original);
      const sunday = page.getByRole('button', { name: '周日', exact: true });
      await sunday.focus(); await page.keyboard.press('Space'); assert.equal(await sunday.getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: '关闭设置' }).click(); await page.waitForSelector('.state-working');
      assert.deepEqual(await stored(), original, 'Unsaved weekday edits must be discarded');
      await open(); await select(page, [0]); await save();
      await page.waitForSelector('.state-rest_day'); await assertRest(false);
      assert.deepEqual((await stored()).workWeekdays, [0]);
      await setTime('2026-10-18T10:00:00', 'working');
      assert.equal((await amount().textContent()).replace(/\s/g,''), '¥50.00');
      await setTime('2026-10-18T12:30:00', 'lunch');
      assert.equal((await amount().textContent()).replace(/\s/g,''), '¥150.00');
      await setTime('2026-10-18T19:00:00', 'after');
      assert.equal((await amount().textContent()).replace(/\s/g,''), '¥400.00');
      await setTime('2026-10-17T14:00:00', 'rest_day');
      await open(); await select(page, [2,4,6]);
      assert.equal(await page.getByLabel('每月工作天数').inputValue(), '22');
      assert.match(await page.locator('.preview').textContent(), /50\.00/);
      const saveBox = await page.getByRole('button', { name: '保存设置', exact: true }).boundingBox();
      assert.ok(saveBox.y + saveBox.height <= 600, `Save remains visible: ${JSON.stringify(saveBox)}`);
      assert.ok(await page.locator('.settings-shell').evaluate(el => el.scrollHeight <= el.clientHeight), 'Standard form fits without scrolling');
      if (dpi === 2) await page.screenshot({ path: `docs/ui/work-weekdays-browser/settings-${id}.png`, omitBackground: true, animations: 'disabled' });
      await save(); await page.waitForSelector('.state-working');
      assert.equal((await amount().textContent()).replace(/\s/g,''), '¥200.00', 'Adding today restores current income, not a fresh counter');
      await open(); await select(page, [2,4]); await save(); await page.waitForSelector('.state-rest_day'); await assertRest(false);
      await setTime('2026-10-14T10:00:00', 'rest_day');
      const saved = await stored();
      assert.deepEqual(saved, { ...original, workWeekdays: [2,4] });
      for (const mode of ['full','mini']) {
        if (mode === 'mini') { await page.getByRole('button', { name: '进入迷你模式' }).click(); await page.waitForSelector('.mini-stage'); }
        for (const hidden of [false,true]) {
          await privateMode(hidden); await assertRest(hidden);
          if (dpi === 2) await page.screenshot({ path: `docs/ui/work-weekdays-browser/rest-${id}-${mode}${hidden ? '-private' : ''}.png`, omitBackground: true, animations: 'disabled' });
        }
      }
      await open(); assert.equal(await page.locator('.weekday-options [aria-pressed="true"]').count(), 2);
      await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
      const other = id === 'mibao' ? 'blue-whale-girl' : 'mibao';
      await page.getByRole('button', { name: other === 'mibao' ? /咪宝/ : /蓝色大肥鱼/ }).click();
      await page.getByRole('button', { name: '使用此主题', exact: true }).click();
      await page.getByRole('button', { name: '返回工资设置' }).click();
      assert.equal(await page.locator('.weekday-options [aria-pressed="true"]').count(), 2);
      await page.getByRole('button', { name: '关闭设置' }).click(); await page.waitForSelector('.mini-stage');
      assert.deepEqual(await stored(), saved);
      assert.equal(await page.locator('[data-work-state]').getAttribute('data-work-state'), 'rest_day');
      assert.equal(await page.locator('.privacy-question').count(), 0);
      await privateMode(false);
      await open(); await page.getByRole('button', { name: '双休', exact: true }).click(); await save();
      await setTime('2026-10-16T23:59:59', 'after');
      await setTime('2026-10-17T00:00:00', 'rest_day');
      await setTime('2026-10-18T23:59:59', 'rest_day');
      await setTime('2026-10-19T09:00:00', 'working');
      await setTime('2026-10-19T14:00:00', 'working'); // wake/time jump, same existing ticker
      assert.equal((await amount().textContent()).replace(/\s/g,''), '¥200.00');
      assert.deepEqual(errors, []); await context.close(); console.log(`PASS weekdays ${id} DPI ${dpi}`);
    }
    console.log('PASS weekdays: legacy/default, presets, empty rejection, Sunday-only, arbitrary selection, unchanged monthly divisor, save/cancel/reopen, immediate current-day recalculation, rest art/no-progress/no-question/no-celebration, both modes/privacy/themes, midnight/time jumps, 4 DPI.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
