const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const out = path.resolve('docs/action-repair');
const repair = JSON.parse(fs.readFileSync(path.resolve('src/dev/repaired/manifest.json'), 'utf8'));

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.method() !== 'GET') writes.push(r.url()); });
    await page.goto('http://127.0.0.1:5173/action-preview.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => document.querySelectorAll('.play-once:enabled').length === 7);
    assert.equal(await page.locator('.sample').count(), 7);
    const initialStorage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    const geometry = [];
    for (const sample of await page.locator('.sample').all()) {
      const id = await sample.getAttribute('data-sample');
      const mini = id.endsWith('mini');
      const viewport = await sample.locator('.sample-viewport').boundingBox();
      assert.equal(viewport.width, 260);
      assert.equal(viewport.height, mini ? 108 : 276);
      const character = await sample.locator('.chibi-girl').boundingBox();
      assert.equal(character.width, mini ? 200 : 180.5);
      const images = await sample.locator('.preview-action-frame').evaluateAll(els => els.map(el => ({
        width: el.naturalWidth, height: el.naturalHeight, cssWidth: getComputedStyle(el).width,
        left: getComputedStyle(el).left, top: getComputedStyle(el).top, transform: getComputedStyle(el).transform,
        animation: getComputedStyle(el).animationName, transition: getComputedStyle(el).transitionDuration,
      })));
      const action = id.replace(/-(full|mini)$/, '');
      assert.ok(images.every(i => i.width === repair.actions[action].size[0] && i.height === repair.actions[action].size[1] && i.transform === 'none' && i.animation === 'none' && i.transition === '0s'), JSON.stringify({ action, images, expected: repair.actions[action].size }));
      assert.equal(images.length, repair.actions[action].states.length, 'Only unique local frames, not duplicated return states');
      for (const image of images) assert.deepEqual(image, images[0]);
      const original = sample.locator('.preview-original');
      const originalGeometry = await original.boundingBox();
      for (const image of await sample.locator('.preview-action-frame').all()) {
        assert.deepEqual(await image.boundingBox(), originalGeometry, 'Exact original image container');
        assert.deepEqual(await image.evaluate(el => ({ fit: getComputedStyle(el).objectFit, position: getComputedStyle(el).objectPosition, mask: getComputedStyle(el).maskImage })), await original.evaluate(el => ({ fit: getComputedStyle(el).objectFit, position: getComputedStyle(el).objectPosition, mask: getComputedStyle(el).maskImage })));
      }
      geometry.push({ id, viewport, character, images: images[0] });
    }
    for (const sample of await page.locator('.sample').all()) {
      const id = await sample.getAttribute('data-sample');
      const data = repair.actions[id.replace(/-(full|mini)$/, '')];
      const timing = data.timing;
      await sample.locator('.play-once').click();
      assert.equal(await sample.getAttribute('data-active-frame'), '0');
      assert.equal(await sample.getAttribute('data-active-key'), 'static');
      await page.clock.runFor(360);
      for (let step = 1; step < data.sequence.length - 1; step++) {
        assert.equal(await sample.getAttribute('data-active-frame'), String(step));
        assert.equal(await sample.getAttribute('data-active-key'), data.sequence[step]);
        await page.clock.runFor(timing[step-1]);
      }
      assert.equal(await sample.getAttribute('data-active-frame'), '0');
      assert.equal(await sample.getAttribute('data-active-key'), 'static');
      assert.ok((await sample.locator('.preview-original').getAttribute('src')).includes(id.startsWith('blue') ? 'chibi-girl-top.png' : '/mibao/working.png'));
      await page.clock.runFor(360);
      assert.equal(await sample.getAttribute('data-playing'), 'false');
    }
    assert.equal(await page.locator('.sample[data-active-frame="0"]').count(), 7);
    assert.equal(await page.locator('.sample[data-playing="false"]').count(), 7);
    await page.clock.runFor(10000);
    assert.equal(await page.locator('.sample[data-active-frame="0"]').count(), 7, 'No automatic replay');
    // User interruption clears pending timers and leaves the chosen frame visible.
    const first = page.locator('.sample').first();
    await first.locator('.play-once').click();
    await page.clock.runFor(380);
    await first.locator('[data-step="2"]').click();
    await page.clock.runFor(2000);
    assert.equal(await first.getAttribute('data-active-frame'), '2');
    await first.locator('[data-step="0"]').click();
    await page.screenshot({ path: path.join(out, 'overview-static.png'), fullPage: true });
    for (const sample of await page.locator('.sample').all()) {
      const id = await sample.getAttribute('data-sample');
      await sample.locator(`[data-step="${id.startsWith('mibao-') ? 3 : 2}"]`).click();
    }
    await page.screenshot({ path: path.join(out, 'overview-action.png'), fullPage: true });
    await page.getByLabel('接触线与锚点').check();
    await page.getByLabel('允许变化区域').check();
    await page.getByRole('combobox').selectOption('dark');
    await page.screenshot({ path: path.join(out, 'overview-dark-guides.png'), fullPage: true });
    await page.getByRole('combobox').selectOption('light');
    await page.screenshot({ path: path.join(out, 'overview-light-guides.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), initialStorage);
    fs.writeFileSync(path.join(out, 'browser-checks.json'), JSON.stringify({ errors, writes, geometry, checks: 'PASS: 7 actual-size samples; exact original start/end URLs; unique local frames share original geometry, object-fit and mask; all playback keys checked; no autoplay; interruption cancels timers; no storage writes.' }, null, 2));
    // Capture actual button playback with a real-time browser clock, at 100% CSS scale.
    await page.clock.resume();
    await page.getByLabel('接触线与锚点').uncheck();
    await page.getByLabel('允许变化区域').uncheck();
    await page.getByRole('combobox').selectOption('checker');
    const captures = path.resolve('artifacts/action-repair-capture'); fs.mkdirSync(captures, { recursive: true });
    const panels = await page.locator('.action-panel').all();
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      for (const sample of await panel.locator('.sample').all()) await sample.locator('[data-step="0"]').click();
      await panel.scrollIntoViewIfNeeded();
      await panel.screenshot({ path: path.join(captures, `${i}-00.png`) });
      for (const button of await panel.locator('.play-once').all()) await button.click();
      for (let tick = 1; tick <= 14; tick++) {
        await page.waitForTimeout(115);
        await panel.screenshot({ path: path.join(captures, `${i}-${String(tick).padStart(2, '0')}.png`) });
      }
    }
    await page.locator('.difference-evidence summary').first().click();
    await page.locator('.difference-evidence').first().scrollIntoViewIfNeeded();
    await page.locator('.difference-evidence img').first().evaluate(async image => { await image.decode(); });
    await page.locator('.difference-evidence').first().screenshot({ path: path.join(out, 'browser-difference-panel.png') });
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Mobile fits without shrinking actual samples');
    await page.screenshot({ path: path.join(out, 'mobile-actual-size.png') });
    await context.close();
    console.log('PASS: seven actual-size samples, full playback, hard-cut return, manual controls, no autoplay or persistence; browser captures saved.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
