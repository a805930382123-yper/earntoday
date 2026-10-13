const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const { prepare } = require('./verify-themes.cjs');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const dpi of [1, 1.25, 1.5, 2]) {
      for (const theme of ['blue-whale-girl', 'mibao']) {
        console.log(`START interaction ${theme} DPI ${dpi}`);
        const context = await browser.newContext({ viewport: { width: 260, height: 276 }, deviceScaleFactor: dpi, timezoneId: 'Asia/Shanghai' });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await prepare(page, theme);
        await page.waitForLoadState('networkidle');
        // Resource completion precedes optional decoding; allow the local decode.
        await page.waitForTimeout(200);
        const original = await page.evaluate(() => structuredClone(window.__themeTest.data));
        const target = () => page.getByRole('button', { name: /桌宠，点击互动/ });
        const reaction = () => page.locator('.chibi-reaction');
        const amount = () => page.locator('.amount,.mini-amount');
        const setTime = async (time, state, advance = 1000) => {
          await page.clock.setFixedTime(new Date(`2026-10-13T${time}:00+08:00`)); await page.clock.runFor(advance);
          await page.waitForSelector(`[data-work-state="${state}"]`);
        };
        const privacy = async hidden => {
          await page.getByRole('button', { name: hidden ? '隐藏收入' : '显示收入', exact: true }).click();
          await page.waitForSelector(hidden ? '.privacy-hidden' : '[data-work-state]:not(.privacy-hidden)');
        };
        for (const mode of ['full', 'mini']) {
          if (mode === 'mini') { await page.getByRole('button', { name: '进入迷你模式' }).click(); await page.waitForSelector('.mini-stage'); }
          for (const [time, state, pose] of [['10:00', 'working', 'working'], ['12:30', 'lunch', 'lunch'], ['19:00', 'after', 'finished']]) {
            await setTime(time, state);
            for (const hidden of [false, true]) {
              console.log(`CHECK ${mode}/${state}/${hidden ? 'private' : 'visible'}`);
              if (hidden) await privacy(true);
              const money = await amount().textContent(), moneyBox = await amount().boundingBox();
              const cardBox = await page.locator('.pet-card,.mini-card').boundingBox();
              const note = state === 'after' && mode === 'full' ? await page.locator('.after-work-note').getAttribute('class') : null;
              await target().click();
              await page.waitForSelector(`[data-reaction-pose="${pose}"] .chibi-reaction`);
              assert.match(await reaction().getAttribute('src'), new RegExp(`${theme === 'mibao' ? 'mibao' : 'bluewhale'}_${pose}_react`));
              assert.ok(await reaction().evaluate(el => el.complete && el.naturalWidth >= 1000 && el.naturalHeight > 0));
              assert.equal(await page.locator('.pet-bubble').count(), 1);
              const bubble = await page.locator('.pet-bubble').boundingBox();
              assert.ok(bubble.x >= 0 && bubble.y >= 0 && bubble.x + bubble.width <= 260 && bubble.y + bubble.height <= (mode === 'mini' ? 108 : 276));
              assert.ok(bubble.y + bubble.height <= moneyBox.y || bubble.y >= moneyBox.y + moneyBox.height, 'Bubble cannot cover income');
              if (hidden) {
                assert.equal(money.replace(/\s/g, ''), '¥••••••');
                assert.ok(!/50\.00|150\.00|400\.00|8800/.test(await page.locator('[data-work-state]').textContent()));
                assert.equal(await page.locator('.privacy-caption').count(), 1);
              }
              assert.deepEqual(await amount().boundingBox(), moneyBox);
              assert.deepEqual(await page.locator('.pet-card,.mini-card').boundingBox(), cardBox);
              assert.equal(await amount().textContent(), money);
              if (state === 'after' && mode === 'full') assert.equal(await page.locator('.after-work-note').getAttribute('class'), note, 'Interaction does not replay daily celebration');
              await target().click(); await target().click();
              assert.equal(await reaction().count(), 1);
              assert.equal(await page.locator('.pet-bubble').count(), 1);
              if (dpi === 2 && !hidden) await page.screenshot({ path: `docs/ui/interaction-${theme}-${mode}-${state}-browser.png`, omitBackground: true, animations: 'disabled' });
              await page.clock.runFor(state === 'lunch' ? 1000 : 1200);
              assert.equal(await reaction().count(), 0);
              assert.equal(await page.locator('.pet-bubble').count(), 0);
              assert.equal(await page.locator('.pet-reacting').count(), 0);
              await target().click(); assert.equal(await reaction().count(), 0, 'Cooldown blocks immediate replay');
              await page.clock.runFor(state === 'lunch' ? 500 : 300);
              await target().click(); assert.equal(await reaction().count(), 1, 'Cooldown expires without a queue');
              await page.clock.runFor(1500);
              if (hidden) await privacy(false);
            }
          }
        }
        // A dragging gesture must call the native bridge once and never react.
        console.log('CHECK pointer / transition cleanup');
        await setTime('10:00', 'working');
        const hit = await target().boundingBox();
        await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2); await page.mouse.down();
        await page.mouse.move(hit.x + hit.width / 2 + 15, hit.y + hit.height / 2 + 8, { steps: 5 });
        await page.mouse.up();
        assert.equal(await reaction().count(), 0);
        assert.equal(await page.evaluate(() => window.__themeTest.calls.filter(c => c.cmd === 'plugin:window|start_dragging').length), 1);
        await page.waitForFunction(() => window.__themeTest.calls.some(c => c.cmd === 'save_position'));
        // Keyboard activation, pointer cancellation and reduced motion.
        await target().focus(); await page.keyboard.press('Enter'); assert.equal(await reaction().count(), 1);
        await page.clock.runFor(1500);
        await target().hover(); await page.mouse.down();
        await target().dispatchEvent('pointercancel', { pointerId: 1, bubbles: true }); await page.mouse.up();
        assert.equal(await reaction().count(), 0);
        await page.emulateMedia({ reducedMotion: 'reduce' }); await target().focus(); await page.keyboard.press('Space');
        assert.equal(await reaction().count(), 1);
        assert.equal(await page.locator('.pet-reacting .chibi-poses').evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.clock.runFor(1500);
        // Work state outranks reaction; no timer can restore the old picture.
        await setTime('11:59', 'working'); await page.clock.runFor(900); await target().click();
        await setTime('12:00', 'lunch', 100); assert.equal(await reaction().count(), 0);
        assert.equal(await page.locator('.pet-bubble').count(), 0);
        await page.clock.runFor(2000);
        assert.equal(await page.locator('.chibi-sleeping').evaluate(el => getComputedStyle(el).opacity), '1');
        await page.clock.runFor(900); await target().click(); await setTime('13:00', 'working', 100); assert.equal(await reaction().count(), 0);
        await page.clock.runFor(900); await target().click(); await setTime('18:00', 'after', 100); assert.equal(await reaction().count(), 0);
        // Layout and settings unmounts cancel transient feedback.
        await target().click(); await page.getByRole('button', { name: '恢复完整模式' }).click();
        await page.waitForSelector('.widget-stage'); assert.equal(await reaction().count(), 0);
        await target().click(); await page.getByRole('button', { name: '打开设置' }).click();
        await page.waitForSelector('.settings-shell'); assert.equal(await page.locator('.pet-hit-area,.pet-bubble,.chibi-reaction').count(), 0);
        await page.getByRole('button', { name: '关闭设置' }).click(); await page.waitForSelector('.widget-stage');
        assert.equal(await reaction().count(), 0);
        // Swap themes directly through the actual subscription during a reaction.
        await target().click();
        const other = theme === 'mibao' ? 'blue-whale-girl' : 'mibao';
        await page.evaluate(id => { window.__themeTest.data.selectedThemeId = id; window.__themeTest.emit('theme-updated', id); }, other);
        await page.waitForSelector(`[data-theme-id="${other}"]`); assert.equal(await reaction().count(), 0);
        await page.clock.runFor(2000); assert.equal(await reaction().count(), 0);
        assert.equal(await page.evaluate(() => window.__themeTest.listenerCount()), 6);
        const stored = await page.evaluate(() => structuredClone(window.__themeTest.data));
        assert.deepEqual(stored.settings, original.settings);
        await setTime('08:00', 'before'); assert.equal(await target().count(), 0);
        await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+08:00')); await page.clock.runFor(1000);
        await page.waitForSelector('.state-weekend'); assert.equal(await target().count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
        console.log(`PASS interaction ${theme} DPI ${dpi}`);
      }
    }
    // A failed optional image must not change the selected theme or show a broken image.
    const context = await browser.newContext({ viewport: { width: 260, height: 276 } });
    const broken = await context.newPage();
    await broken.route('**/*_react*.png', route => route.abort());
    await prepare(broken, 'mibao'); await broken.waitForTimeout(200);
    await broken.getByRole('button', { name: /桌宠，点击互动/ }).click();
    assert.equal(await broken.locator('.chibi-reaction').count(), 0);
    assert.equal(await broken.locator('.pet-bubble').count(), 1);
    assert.equal(await broken.locator('.theme-root').getAttribute('data-theme-id'), 'mibao');
    assert.equal(await broken.locator('.chibi-awake').evaluate(el => getComputedStyle(el).opacity), '1');
    await broken.clock.runFor(1500); assert.equal(await broken.locator('.pet-bubble').count(), 0);
    await context.close();
    console.log('PASS V1.2: six decoded assets; both themes/three states/full+mini/visible+private; four DPI; auto restore/cooldown; bubble geometry/no income leaks; stable salary/card; native-drag dispatch without click; keyboard/cancel/reduced motion; state/theme/layout/unmount priority; unsupported states; failed optional art fallback; listener cleanup.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
