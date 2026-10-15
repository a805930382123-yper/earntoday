const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const { prepare } = require('./verify-themes.cjs');
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
async function main() {
  fs.mkdirSync('docs/ui/privacy-working-browser', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const dpi of [1, 1.25, 1.5, 2]) for (const id of ['blue-whale-girl', 'mibao']) {
      const context = await browser.newContext({ viewport: { width: 260, height: 276 }, deviceScaleFactor: dpi, timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await prepare(page, id); await page.waitForLoadState('networkidle'); await page.waitForTimeout(200);
      const original = await page.evaluate(() => structuredClone(window.__themeTest.data));
      const q = () => page.locator('.privacy-question');
      const amount = () => page.locator('.amount,.mini-amount');
      const geometry = async () => ({ card: await page.locator('.pet-card,.mini-card').boundingBox(), amount: await amount().boundingBox(), pet: await page.locator('.girl-wrap,.mini-pet').boundingBox() });
      const toggle = async hidden => {
        await page.getByRole('button', { name: hidden ? '隐藏收入' : '显示收入', exact: true }).click();
        await page.waitForSelector(hidden ? '.privacy-hidden' : '[data-work-state]:not(.privacy-hidden)');
        await page.clock.runFor(300);
        await page.waitForFunction(expected => { const q = document.querySelector('.privacy-question'); return !q || getComputedStyle(q).visibility === (expected ? 'visible' : 'hidden'); }, hidden);
      };
      const assertHidden = async () => {
        assert.equal((await amount().textContent()).replace(/\s/g, ''), '¥••••••');
        const exposure = await page.locator('[data-work-state]').evaluate(el => el.textContent + [...el.querySelectorAll('*')].flatMap(node => [...node.attributes].filter(a => /title|aria-label|data-money/.test(a.name)).map(a => a.value)).join(' '));
        assert.ok(!/50\.00|150\.00|400\.00|8800/.test(exposure));
        assert.equal(await page.locator('.privacy-caption').count(), 1);
        const working = await page.locator('[data-work-state]').getAttribute('data-work-state') === 'working';
        if (!working) {
          assert.equal(await q().count(), 0, 'Question must be removed outside working');
          assert.equal(await page.locator('.privacy-confused,.pet-has-privacy-art').count(), 0);
          assert.equal(await page.locator('.chibi-privacy').evaluate(el => getComputedStyle(el).opacity), '0');
          if (!await page.locator('.pet-reacting').count()) assert.equal(await page.locator('.chibi-poses').evaluate(el => getComputedStyle(el).transform), 'none');
          return;
        }
        assert.equal(await q().count(), 1);
        assert.equal(await q().getAttribute('aria-hidden'), 'true');
        assert.equal(await q().evaluate(el => getComputedStyle(el).pointerEvents), 'none');
        assert.equal(await q().locator('svg').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
        assert.equal(await q().evaluate(el => getComputedStyle(el).getPropertyValue('--question-color').trim()), id === 'mibao' ? '#eaa148' : '#4b93f1');
        const box = await q().boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 260 && box.y + box.height <= page.viewportSize().height, `Question inside viewport: ${JSON.stringify(box)}`);
        assert.ok(!overlap(box, await amount().boundingBox()));
        for (const button of await page.locator('.icon-btn').all()) assert.ok(!overlap(box, await button.boundingBox()), 'Question cannot overlap controls');
        if (await page.locator('.mini-title').count()) { const title = await page.locator('.mini-title').boundingBox(); assert.ok(!overlap(box, title), `Question cannot overlap title: ${JSON.stringify({ box, title })}`); }
      };
      for (const mode of ['full', 'mini']) {
        if (mode === 'mini') { await page.getByRole('button', { name: '进入迷你模式' }).click(); await page.waitForSelector('.mini-stage'); }
        for (const [time, state, pose] of [['10:00', 'working', '.chibi-awake'], ['12:30', 'lunch', '.chibi-sleeping'], ['19:00', 'after', '.chibi-after-work']]) {
          await page.clock.setFixedTime(new Date(`2026-10-14T${time}:00+08:00`)); await page.clock.runFor(1000);
          await page.waitForSelector(`[data-work-state="${state}"]`);
          const before = await geometry(), source = await page.locator(pose).getAttribute('src');
          const note = state === 'after' && mode === 'full' ? await page.locator('.after-work-note').getAttribute('class') : null;
          await toggle(true); await assertHidden(); assert.deepEqual(await geometry(), before);
          assert.equal(await page.locator(pose).getAttribute('src'), source, 'Keep the original state art');
          assert.equal(await page.locator(pose).evaluate(el => getComputedStyle(el).opacity), state === 'working' ? '0' : '1');
          if (state === 'working') {
            assert.equal(await page.locator('.pet-has-privacy-art').count(), 1);
            assert.equal(await page.locator('.chibi-privacy').evaluate(el => getComputedStyle(el).opacity), '1');
            assert.match(await page.locator('.chibi-privacy').getAttribute('src'), id === 'mibao' ? /mibao\/working-private/ : /chibi-girl-working-private/);
          }
          if (note) assert.equal(await page.locator('.after-work-note').getAttribute('class'), note, 'Privacy does not replay celebration');
          if (dpi === 2) await page.screenshot({ path: `docs/ui/privacy-working-browser/${id}-${mode}-${state}.png`, omitBackground: true, animations: 'disabled' });
          await page.getByRole('button', { name: /桌宠，点击互动/ }).click(); await page.waitForSelector('.chibi-reaction');
          await assertHidden();
          assert.equal(await page.locator('.pet-has-privacy-art').count(), 0, 'Interaction temporarily takes precedence');
          await page.clock.runFor(1500); assert.equal(await page.locator('.chibi-reaction').count(), 0);
          await assertHidden();
          assert.equal(await page.locator(pose).evaluate(el => getComputedStyle(el).opacity), state === 'working' ? '0' : '1');
          await toggle(false); if (state === 'working') assert.equal(await q().evaluate(el => getComputedStyle(el).opacity), '0');
          assert.equal(await page.locator('.privacy-confused').count(), 0);
          assert.equal(await page.locator('.chibi-poses').evaluate(el => getComputedStyle(el).transform), 'none');
          assert.deepEqual(await geometry(), before);
        }
      }
      // Privacy stays selected across time boundaries and during animation priority.
      await toggle(true);
      for (const [time, state] of [['11:59', 'working'], ['12:00', 'lunch'], ['13:00', 'working'], ['18:00', 'after'], ['08:00', 'before']]) {
        await page.clock.setFixedTime(new Date(`2026-10-14T${time}:00+08:00`)); await page.clock.runFor(1000);
        await page.waitForSelector(`[data-work-state="${state}"]`); await assertHidden();
      }
      await page.clock.setFixedTime(new Date('2026-10-14T10:00:00+08:00')); await page.clock.runFor(1000);
      await page.getByRole('button', { name: /桌宠，点击互动/ }).click(); await page.waitForSelector('.chibi-reaction');
      const other = id === 'mibao' ? 'blue-whale-girl' : 'mibao';
      await page.evaluate(theme => { window.__themeTest.data.selectedThemeId = theme; window.__themeTest.emit('theme-updated', theme); }, other);
      await page.waitForSelector(`[data-theme-id="${other}"]`);
      assert.equal(await page.locator('.chibi-reaction').count(), 0);
      assert.equal(await q().evaluate(el => getComputedStyle(el).getPropertyValue('--question-color').trim()), other === 'mibao' ? '#eaa148' : '#4b93f1');
      assert.equal((await amount().textContent()).replace(/\s/g, ''), '¥••••••');
      await page.evaluate(theme => { window.__themeTest.data.selectedThemeId = theme; window.__themeTest.emit('theme-updated', theme); }, id);
      await page.waitForSelector(`[data-theme-id="${id}"]`); await page.clock.runFor(1500); await assertHidden();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await q().evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.equal(await q().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
      assert.equal(await page.locator('.chibi-poses').evaluate(el => getComputedStyle(el).transform), 'none');
      await toggle(false); await toggle(true); await assertHidden();
      await page.getByRole('button', { name: '打开设置' }).click(); await page.waitForSelector('.settings-shell');
      assert.equal(await q().count(), 0);
      await page.getByRole('button', { name: '关闭设置' }).click(); await page.waitForSelector('.mini-stage'); await assertHidden();
      assert.deepEqual(await page.evaluate(() => window.__themeTest.data.settings), original.settings);
      assert.deepEqual(errors, []); await context.close();
      console.log(`PASS privacy question ${id} DPI ${dpi}`);
    }
    for (const id of ['blue-whale-girl', 'mibao']) {
      const context = await browser.newContext({ viewport: { width: 260, height: 276 } });
      const page = await context.newPage();
      await page.route('**/*working-private.png', route => route.abort());
      await prepare(page, id, { privacyMode: 'hidden', holdReads: true });
      await page.evaluate(() => window.__themeTest.releaseReads());
      await page.waitForSelector(`[data-theme-id="${id}"] .state-working`); await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('.theme-root').getAttribute('data-theme-id'), id);
      assert.equal(await page.locator('.pet-has-privacy-art').count(), 0);
      assert.equal(await page.locator('.chibi-awake').evaluate(el => getComputedStyle(el).opacity), '1');
      assert.equal(await page.locator('.privacy-question.is-visible').count(), 1);
      assert.equal((await page.locator('.amount').textContent()).replace(/\s/g, ''), '¥••••••');
      await context.close();
    }
    console.log('PASS: both themes/full+mini/four DPI; working-only confused art/question; original lunch/after art without question; unchanged geometry; no DOM/ARIA salary leak; interaction restore and time boundaries; reduced motion; settings round trip; optional privacy art failure fallback.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
