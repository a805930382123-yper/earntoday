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
      await page.clock.setFixedTime(new Date('2026-10-13T10:00:00+08:00')); await page.clock.runFor(1000);
      const original = await page.evaluate(() => structuredClone(window.__themeTest.data));
      const amount = () => page.locator('.amount,.mini-amount');
      const money = async () => (await amount().textContent()).replace(/[,\s]/g, '');
      const hide = async () => { await page.getByRole('button', { name: '隐藏收入', exact: true }).click(); await page.waitForSelector('.privacy-hidden'); assert.equal(await money(), '¥••••••'); };
      const reveal = async () => { await page.getByRole('button', { name: '显示收入', exact: true }).click(); await page.waitForSelector('[data-work-state]:not(.privacy-hidden)'); };
      const assertPrivate = async () => {
        assert.equal(await money(), '¥••••••');
        const exposure = await page.locator('[data-work-state]').evaluate(el => ({ text: el.textContent, attributes: [...el.querySelectorAll('*')].flatMap(node => [...node.attributes].filter(a => /title|aria-label|value|data-money/.test(a.name)).map(a => a.value)) }));
        assert.ok(!/50\.00|150\.00|400\.00|8800/.test(exposure.text + exposure.attributes.join(' ')), 'No salary in DOM/tooltip/accessibility labels');
      };
      assert.equal(await money(), '¥50.00');
      const fullGeometry = await amount().boundingBox();
      await hide(); await assertPrivate();
      assert.deepEqual(await amount().boundingBox(), fullGeometry, 'Privacy keeps amount height and position');
      await page.clock.setFixedTime(new Date('2026-10-13T11:00:00+08:00')); await page.clock.runFor(1000);
      await reveal(); assert.equal(await money(), '¥100.00', 'Reveal current calculation, not stale cached income');
      await hide();
      if (dpi === 2) await page.screenshot({ path: 'docs/ui/full-privacy-browser.png', animations: 'disabled', omitBackground: true });
      await page.getByRole('button', { name: '进入迷你模式' }).click();
      await page.waitForSelector('.mini-stage'); assert.deepEqual(page.viewportSize(), { width: 260, height: 108 });
      await assertPrivate();
      assert.equal(await page.getByRole('progressbar').count(), 0);
      assert.equal(await page.locator('.progress-times,.after-work-note').count(), 0);
      if (dpi === 2) await page.screenshot({ path: 'docs/ui/mini-blue-private-browser.png', animations: 'disabled', omitBackground: true });
      await reveal();
      const switchTheme = async id => {
        const expectedSalary = await page.evaluate(() => String(window.__themeTest.data.settings.monthlySalary));
        await page.getByRole('button', { name: '打开设置' }).click();
        await page.waitForFunction(value => document.querySelector('#salary')?.value === value, expectedSalary);
        await page.getByRole('button', { name: '皮肤主题', exact: true }).click();
        await page.getByRole('button', { name: id === 'mibao' ? /咪宝/ : /蓝色大肥鱼/ }).click();
        await page.getByRole('button', { name: '使用此主题', exact: true }).click();
        await page.waitForSelector(`[data-theme-id="${id}"]`);
        await page.getByRole('button', { name: '返回工资设置' }).click();
        await page.getByRole('button', { name: '关闭设置' }).click();
        await page.waitForSelector('.mini-stage');
        assert.deepEqual(page.viewportSize(), { width: 260, height: 108 });
      };
      for (const id of ['blue-whale-girl', 'mibao']) {
        if (id === 'mibao') await switchTheme(id);
        for (const [time, state, expected, pose, status] of [['10:00', 'working', '¥50.00', '.chibi-awake', '努力赚钱中'], ['12:30', 'lunch', '¥150.00', '.chibi-sleeping', '午休中'], ['19:00', 'after', '¥400.00', '.chibi-after-work', '已下班']]) {
          await page.clock.setFixedTime(new Date(`2026-10-13T${time}:00+08:00`)); await page.clock.runFor(1000);
          await page.waitForSelector(`.mini-stage.state-${state}`);
          await page.clock.runFor(350);
          assert.equal(await money(), expected);
          assert.ok((await page.locator('.mini-status').textContent()).includes(status));
          await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).opacity === '1', pose);
          assert.equal(await page.locator('.after-work-note').count(), 0);
          for (const name of ['恢复完整模式', '隐藏收入', '打开设置', '隐藏到托盘']) {
            const button = page.getByRole('button', { name, exact: true });
            const bounds = await button.boundingBox();
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 260 && bounds.y >= 0 && bounds.y + bounds.height <= 108);
            assert.ok(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), 'Drag/art cannot cover controls');
          }
          await hide(); await assertPrivate();
          for (const selector of ['.mini-amount > span:last-child', '.mini-work-status', '.mini-status .privacy-caption']) {
            const r = await page.locator(selector).boundingBox();
            assert.ok(r.x >= 120 && r.x + r.width <= 250 && r.y + r.height <= 101, `${selector} fits the private mini card`);
          }
          await page.clock.setFixedTime(new Date(`2026-10-13T${time}:30+08:00`)); await page.clock.runFor(1000);
          await reveal();
          if (state !== 'working') assert.equal(await money(), expected);
          if (dpi === 2) await page.screenshot({ path: `docs/ui/mini-${id}-${state}-browser.png`, animations: 'disabled', omitBackground: true });
        }
      }
      await hide(); await switchTheme('blue-whale-girl'); await assertPrivate();
      // Salary save returns to mini without overwriting either display preference.
      await page.getByRole('button', { name: '打开设置' }).click();
      await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await page.waitForSelector('.mini-stage.privacy-hidden'); await assertPrivate();
      await page.getByRole('button', { name: '恢复完整模式' }).click();
      await page.waitForSelector('.widget-stage.privacy-hidden');
      assert.deepEqual(page.viewportSize(), { width: 260, height: 276 });
      await assertPrivate();
      const stored = await page.evaluate(() => structuredClone(window.__themeTest.data));
      assert.deepEqual(stored.settings, { ...original.settings, workWeekdays: [1,2,3,4,5] });
      assert.deepEqual(stored.position, original.position);
      assert.equal(await page.evaluate(() => window.__themeTest.listenerCount()), 6);
      await page.evaluate(() => { window.__themeTest.failSave = true; });
      await page.getByRole('button', { name: '显示收入', exact: true }).click();
      await page.getByRole('alert').waitFor(); await assertPrivate();
      await page.evaluate(() => { window.__themeTest.failSave = false; });
      await reveal();
      await page.evaluate(() => { window.__themeTest.failSave = true; });
      await hide(); await page.getByRole('alert').waitFor(); await assertPrivate();
      assert.match(await page.getByRole('alert').textContent(), /重启后可能恢复显示/);
      await page.evaluate(() => { window.__themeTest.failSave = false; });
      await reveal();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.chibi-base').first().evaluate(el => getComputedStyle(el).animationName), 'none');
      // Exercise grouped and maximum-valid incomes in the narrower reference layout.
      await page.getByRole('button', { name: '进入迷你模式' }).click();
      await page.waitForSelector('.mini-stage');
      for (const id of ['blue-whale-girl', 'mibao']) {
        if (id === 'mibao') await switchTheme(id);
        for (const salary of [999.99, 1234.56, 12345.67, 1000000000]) {
          await page.evaluate(salary => {
            window.__themeTest.data.settings = { ...window.__themeTest.data.settings, monthlySalary: salary, workdaysPerMonth: 1 };
            window.__themeTest.emit('settings-updated');
          }, salary);
          await page.waitForFunction(salary => document.querySelector('.mini-amount')?.textContent.replace(/[,¥\s]/g, '') === salary.toFixed(2), salary);
          const right = await page.locator('.mini-amount').evaluate(el => {
            const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect().right;
          });
          assert.ok(right <= 250, `Income ${salary} stays within the card at ${dpi * 100}% DPI`);
        }
        await hide();
        await page.getByRole('button', { name: '显示收入', exact: true }).focus();
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        assert.equal(await page.getByRole('button', { name: '显示收入', exact: true }).evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '恢复完整模式', 'Keyboard order matches reference controls');
        await reveal();
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Artificially slow persistence, with a DOM observer catching ANY real amount.
    const context = await browser.newContext({ viewport: { width: 260, height: 108 } });
    const startup = await context.newPage();
    await startup.addInitScript(() => {
      window.__incomeFrames = [];
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('.amount,.mini-amount')) if (!el.classList.contains('masked-amount')) window.__incomeFrames.push(el.textContent);
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await prepare(startup, 'mibao', { windowMode: 'mini', privacyMode: 'hidden', holdReads: true });
    await startup.waitForSelector('.display-loading');
    assert.equal(await startup.locator('.amount,.mini-amount').count(), 0);
    await startup.evaluate(() => window.__themeTest.releaseReads());
    await startup.waitForSelector('.mini-stage.privacy-hidden');
    assert.deepEqual(await startup.evaluate(() => window.__incomeFrames), [], 'No startup income flash');
    assert.equal(await startup.locator('.mini-amount').textContent(), '¥ ••••••');
    const broken = await context.newPage();
    await prepare(broken, null, { configError: '配置读取失败' });
    await broken.waitForSelector('.display-loading');
    assert.equal(await broken.locator('.amount,.mini-amount').count(), 0);
    assert.match(await broken.locator('.display-loading').textContent(), /读取失败/);
    await context.close();
    console.log('PASS reference refinement: both themes/3 states/4 combinations; 100/125/150/200% DPI; maximum-income and private-status layout; visible keyboard focus/order; current-income reveal; lunch/final freeze; no DOM/ARIA/tooltip leak; delayed hidden startup has zero unmasked frames; failed load/save fail closed; controls/theme/salary compatibility; reduced motion.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
