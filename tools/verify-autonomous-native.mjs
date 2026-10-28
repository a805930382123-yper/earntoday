// Windows acceptance with a marked disposable profile. Never reads/writes the user's configuration.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { openNative, pause } from './native-test-session.mjs';
const exe = resolve('src-tauri/target/debug/earn-today.exe');
assert.ok((await readFile(exe)).includes(Buffer.from('isolated-test requires EARN_TODAY_TEST_ROOT')), 'Only --features isolated-test binary is accepted');
const root = await mkdtemp(join(tmpdir(), 'earn-autonomous-'));
await writeFile(join(root, '.earn-today-test-profile'), 'autonomous integration synthetic fixture');
await mkdir(join(root, 'earn-today'));
const file = join(root, 'earn-today/config.json');
const fixture = { settings: { monthlySalary: 8800, workdaysPerMonth: 22, workWeekdays: [0,1,2,3,4,5,6], workStart: '00:00', workEnd: '23:59', lunchStart: '23:57', lunchEnd: '23:58', futureZero: 0 }, selectedThemeId: 'mibao', windowMode: 'full', privacyMode: 'visible', displayMode: 'amount', shortcutEnabled: false, futureRoot: { keep: true } };
await writeFile(file, JSON.stringify(fixture));
const report = { environment: 'Windows native Tauri debug isolated-test / embedded production frontend / WebView2 / actual OS clock', profile: root, checks: [], samples: [] };
const check = async label => { report.checks.push(label); console.log('PASS native:', label); await writeFile('docs/autonomous-integration/native-results.json', JSON.stringify(report, null, 2)); };
const helper = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('tools/autonomous-native-helper.ps1')], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
const lines = [], pending = [], input = createInterface({ input: helper.stdout });
input.on('line', line => { const next = pending.shift(); if (next) next(line); else lines.push(line); });
helper.stderr.on('data', d => process.stderr.write(d));
const nextLine = () => lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('helper timeout')), 30000); pending.push(line => { clearTimeout(timer); resolve(line); }); });
const op = async command => { helper.stdin.write(`${command}\n`); const line = await nextLine(); assert.ok(!line.startsWith('ERROR'), line); return line; };
let app;
const env = { EARN_TODAY_TEST_ROOT: root, HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9', NO_PROXY: '' };
const wait = async (check, label, timeout = 12000) => { const start = Date.now(); while (Date.now() - start < timeout) { if (await check()) return; await pause(100); } throw new Error(`Timeout: ${label}`); };
const read = async () => JSON.parse(await readFile(file, 'utf8'));
const ready = () => wait(() => app.evaluate("!!document.querySelector('.autonomous-ready')"), 'motion ready');
const save = async enabled => { const data = await app.invoke('load_data'); await app.invoke('save_settings', { settings: data.settings, autonomousMotionEnabled: enabled }); };
const metrics = async () => {
  const native = JSON.parse(await op(`metrics:${app.child.pid}`));
  const values = Object.fromEntries((await app.send('Performance.getMetrics')).metrics.map(m => [m.name,m.value]));
  return { ...native, jsHeapUsed: values.JSHeapUsedSize, taskSeconds: values.TaskDuration, scriptSeconds: values.ScriptDuration };
};
const sample = async (enabled, shown) => {
  await save(enabled); if (shown) { if (!(await app.invoke('get_main_visibility')).visible) await app.invoke('toggle_main_visibility'); } else await app.invoke('hide_main');
  await pause(1500); const before = await metrics(); await pause(5000); const after = await metrics();
  const seconds = (after.sampledAt - before.sampledAt) / 1000;
  report.samples.push({ enabled, shown, before, after, elapsedSeconds: seconds, processCpuOneCorePercent: 100 * (after.cpuSeconds - before.cpuSeconds) / seconds,
    endWorkingSetMiB: after.workingSetBytes / 1048576, jsTaskMilliseconds: 1000 * (after.taskSeconds - before.taskSeconds), scriptMilliseconds: 1000 * (after.scriptSeconds - before.scriptSeconds) });
  console.log(`Measured: enabled=${enabled} shown=${shown}`);
};
try {
  assert.equal(await nextLine(), 'READY');
  app = await openNative(exe, env); await ready();
  assert.equal(await app.evaluate('Boolean(window.__autonomousDebug)'), false);
  assert.equal((await app.invoke('load_data')).autonomousMotionEnabled, true);
  await app.send('Performance.enable');
  await app.evaluate(`(() => { window.__visibilityEvents = []; const handler = window.__TAURI_INTERNALS__.transformCallback(e => window.__visibilityEvents.push(e.payload)); return window.__TAURI_INTERNALS__.invoke('plugin:event|listen', {event:'main-visibility',target:{kind:'Any'},handler}); })()`);
  await op(`minimize:${app.child.pid}`);
  await wait(() => app.evaluate('window.__visibilityEvents.some(e => !e.visible)'), 'native minimize event');
  assert.equal((await app.invoke('get_main_visibility')).visible, false);
  await op(`restore-inactive:${app.child.pid}`);
  await wait(() => app.evaluate('window.__visibilityEvents.at(-1)?.visible === true'), 'native restore event'); await ready();
  const unfocused = JSON.parse(await op(`snapshot:${app.child.pid}`)); report.unfocusedSnapshot = unfocused;
  assert.equal(unfocused.minimized, false); assert.equal(unfocused.visible, true);
  await check('Native minimize and restore events synchronize visibility; initialization queries real state; production has no debug API');
  // Warm one theme's approved art before same-process on/off comparisons. No GC forced.
  for (const [enabled, shown] of [[true,true],[false,true],[true,false],[false,false]]) await sample(enabled,shown);
  await check('Same-process enabled/disabled × shown/hidden resource observations captured (5-second windows, warm caches)');
  // A real low-frequency action, with only its allowed random choice controlled through CDP.
  await app.invoke('toggle_main_visibility');
  await app.evaluate(`(() => { Math.random = () => 0; window.__autonomousStarts = []; new MutationObserver(() => { const el = document.querySelector('.chibi-girl'); if (el?.dataset.autonomousAction && !window.__lastAuto) window.__autonomousStarts.push({id:el.dataset.autonomousAction,at:Date.now()}); window.__lastAuto = el?.dataset.autonomousAction; }).observe(document.querySelector('#root'), {attributes:true,subtree:true,attributeFilter:['data-autonomous-action']}); })()`);
  await save(true); await ready(); const enabledAt = Date.now();
  await pause(1500); assert.equal(await app.evaluate('window.__autonomousStarts.length'), 0);
  console.log('Waiting for an actual 30-second native autonomous action…');
  await wait(() => app.evaluate('window.__autonomousStarts.length > 0'), 'actual native action', 37000);
  report.nativeAutomatic = { enabledAt, starts: await app.evaluate('window.__autonomousStarts') };
  assert.equal(report.nativeAutomatic.starts[0].id, 'mibao-ear');
  await pause(1500); assert.equal(await app.evaluate("Boolean(document.querySelector('.chibi-autonomous'))"), false);
  const capture = await app.send('Page.captureScreenshot', { format: 'png' });
  await writeFile('docs/autonomous-integration/native-static.png', Buffer.from(capture.data, 'base64'));
  const bytes = await readFile(file, 'utf8'); await app.invoke('hide_main'); await pause(250); assert.equal(await readFile(file,'utf8'), bytes);
  await app.invoke('toggle_main_visibility'); await pause(1000); assert.equal(await app.evaluate('window.__autonomousStarts.length'), 1);
  await check('Real native ear action after random wait, correct static return; hiding writes no config; restoring does not catch up');
  await save(false);
  const saved = await read(); assert.equal(saved.autonomousMotionEnabled, false); assert.deepEqual(saved.settings, fixture.settings); assert.deepEqual(saved.futureRoot, fixture.futureRoot);
  await app.stop(); app = await openNative(exe, env);
  assert.equal((await app.invoke('load_data')).autonomousMotionEnabled, false);
  assert.equal(await app.evaluate("Boolean(document.querySelector('.autonomous-ready'))"), false);
  await check('Disabled preference survives real process restart; salary, weekdays, theme, mode and future fields preserved');
  report.passed = true;
} finally {
  await writeFile('docs/autonomous-integration/native-results.json', JSON.stringify(report, null, 2));
  await app?.stop(); helper.stdin.end(); helper.kill(); input.close();
}
