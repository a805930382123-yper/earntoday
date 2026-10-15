const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const screenshotRoot = path.resolve(process.env.EARN_TODAY_SCREENSHOT_DIR || 'docs/ui');
const allowedRoot = path.resolve('docs/ui');
if (screenshotRoot !== allowedRoot && !screenshotRoot.startsWith(allowedRoot + path.sep)) throw new Error('Screenshot directory must stay in docs/ui');
require('node:fs').mkdirSync(screenshotRoot, { recursive: true });
const screenshotPath = name => path.join(screenshotRoot, name);

async function reaction(page, id, state, mode, hidden) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  const money = page.locator('.amount,.mini-amount');
  const before = await money.textContent(), box = await money.boundingBox();
  await page.getByRole('button', { name: /桌宠，点击互动/ }).click();
  try { await page.waitForSelector('.chibi-reaction', { timeout: 3000 }); }
  catch (error) { console.error({ id, state, mode, hidden, bubble: await page.locator('.pet-bubble').count(), active: await page.locator('.chibi-girl').getAttribute('class') }); throw error; }
  const pose = state === 'after' ? 'finished' : state;
  assert.match(await page.locator('.chibi-reaction').getAttribute('src'), new RegExp(`${id === 'mibao' ? 'mibao' : 'bluewhale'}_${pose}_react`));
  await page.waitForFunction(() => document.querySelector('.chibi-reaction')?.complete && document.querySelector('.chibi-reaction')?.naturalWidth > 0);
  assert.equal(await page.locator('.pet-bubble').count(), 1);
  assert.equal(await money.textContent(), before);
  assert.deepEqual(await money.boundingBox(), box);
  if (hidden) assert.equal(before.replace(/\s/g, ''), '¥••••••');
  await page.screenshot({ path: screenshotPath(`interaction-${id}-${mode}-${state}${hidden ? '-private' : ''}-desktop.png`), omitBackground: true, animations: 'disabled' });
  await page.clock.runFor(1500);
  assert.equal(await page.locator('.chibi-reaction,.pet-bubble,.pet-reacting').count(), 0);
}

async function pointer(page, invoke, pid) {
  const scale = await invoke('plugin:window|scale_factor', { label: 'main' });
  const before = await invoke('plugin:window|outer_position', { label: 'main' });
  const hit = await page.getByRole('button', { name: /桌宠，点击互动/ }).boundingBox();
  // Head centre inside opaque art and inside the interaction hit area.
  const x = Math.round(before.x + (hit.x + hit.width * .55) * scale);
  const y = Math.round(before.y + (hit.y + hit.height * .45) * scale);
  await page.evaluate(() => {
    window.__petPointerEvents = [];
    if (window.__petPointerTraceInstalled) return;
    window.__petPointerTraceInstalled = true;
    for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'click']) document.addEventListener(name, e => { if (e.buttons || name !== 'pointermove') window.__petPointerEvents.push({ name, x: e.clientX, y: e.clientY, sx: e.screenX, sy: e.screenY, buttons: e.buttons, target: e.target.className, pointer: e.pointerId, detail: e.detail }); }, true);
  });
  const run = action => new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('tools/verify-pet-pointer.ps1'), '-TaskProcessId', String(pid), '-TaskX', String(x), '-TaskY', String(y), '-Action', action], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)));
  });
  await run('click');
  try { await page.waitForSelector('.chibi-reaction', { timeout: 3000 }); }
  catch (error) { console.error({ before, after: await invoke('plugin:window|outer_position', { label: 'main' }), scale, hit, x, y, events: await page.evaluate(() => window.__petPointerEvents) }); throw error; }
  assert.deepEqual(await invoke('plugin:window|outer_position', { label: 'main' }), before, 'Real click/jitter cannot move the window');
  await page.clock.runFor(1500);
  await run('drag');
  await page.waitForTimeout(100);
  const after = await invoke('plugin:window|outer_position', { label: 'main' });
  assert.notDeepEqual(after, before, `Real pointer drag moves the native window: ${JSON.stringify({ before, after, events: await page.evaluate(() => window.__petPointerEvents) })}`);
  assert.equal(await page.locator('.chibi-reaction,.pet-bubble').count(), 0, 'Real drag cannot trigger a reaction');
  await page.waitForFunction(({ x, y }) => window.__TAURI_INTERNALS__.invoke('load_data').then(data => Math.abs(data.position.x - x) < 1 && Math.abs(data.position.y - y) < 1), { x: after.x / scale, y: after.y / scale });
  await invoke('save_position', { x: before.x / scale, y: before.y / scale });
  await invoke('hide_settings');
  assert.deepEqual(await invoke('plugin:window|outer_position', { label: 'main' }), before);
}
module.exports = { reaction, pointer, screenshotPath };
