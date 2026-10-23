// Core Windows smoke checks only: hotkey, draft restore, conflict/tray recovery.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { openNative, pause } from "./native-test-session.mjs";

assert.equal(process.platform, "win32");
const executable = resolve(process.argv.slice(2).find(arg => !arg.startsWith("--")) || "src-tauri/target/debug/earn-today.exe");
assert.ok((await readFile(executable)).includes(Buffer.from("isolated-test requires EARN_TODAY_TEST_ROOT")), "Refusing ordinary binary: build with --features isolated-test first");
const roots = [];
const fixture = {
  settings: { monthlySalary: 8800, workdaysPerMonth: 22, workWeekdays: [1,2,3,4,5], workStart: "09:00", workEnd: "18:00", lunchStart: "12:00", lunchEnd: "13:00", futureZero: 0, futureFalse: false },
  selectedThemeId: "mibao", windowMode: "full", privacyMode: "hidden", displayMode: "collection", futureRoot: { keep: true }, shortcutEnabled: true,
};
const profile = async () => {
  const root = await mkdtemp(join(tmpdir(), "earn-visibility-")); roots.push(root);
  await writeFile(join(root, ".earn-today-test-profile"), "synthetic native acceptance");
  await mkdir(join(root, "earn-today"));
  await writeFile(join(root, "earn-today/config.json"), JSON.stringify(fixture));
  return root;
};
const helper = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("tools/visibility-native-helper.ps1")], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
const lines = [], pending = [];
const input = createInterface({ input: helper.stdout });
input.on("line", line => { const next = pending.shift(); if (next) next(line); else lines.push(line); });
const nextLine = () => lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Native helper timeout")), 30000);
  pending.push(line => { clearTimeout(timer); resolve(line); });
});
helper.stderr.on("data", data => process.stderr.write(data));
const operation = async command => {
  helper.stdin.write(`${command}\n`);
  const result = await nextLine(); assert.ok(!result.startsWith("ERROR"), result); return result;
};
let app, second;
const wait = async (check, label) => {
  for (let i = 0; i < 80; i++) { if (await check()) return; await pause(100); }
  throw new Error(`Timed out: ${label}`);
};
const env = root => ({ EARN_TODAY_TEST_ROOT: root, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" });
try {
  assert.equal(await nextLine(), "READY");
  const root = await profile();
  app = await openNative(executable, env(root));
  const readConfig = () => readFile(join(root, "earn-today/config.json"), "utf8");
  const snapshot = async () => JSON.parse(await operation(`snapshot:${app.child.pid}`));
  const visible = async expected => wait(async () => (await app.invoke("get_main_visibility")).visible === expected, `visibility ${expected}`);
  await wait(async () => app.evaluate("!!document.querySelector('[data-work-state]')"), "widget");
  assert.equal((await app.invoke("get_shortcut_status")).registered, true, "Test chord already occupied; no synthetic keys were sent");
  if (!process.argv.includes("--conflict-only")) {
    await pause(300);
    const before = await snapshot();
    const disk = await readConfig();
    await operation("repeat"); await visible(false);
    assert.equal((await snapshot()).visible, false);
    const hiddenRevision = (await app.invoke("get_main_visibility")).revision;
    await pause(300);
    assert.equal((await app.invoke("get_main_visibility")).revision, hiddenRevision, "Release/repeat must not toggle again");
    await operation("press"); await visible(true);
    assert.deepEqual(await snapshot(), before, "Restore must preserve geometry");
    assert.equal(await readConfig(), disk, "Visibility must not rewrite config");
    assert.equal((await app.invoke("load_data")).privacyMode, "hidden");
    console.log("PASS native shortcut: press, hold/release, restore geometry, privacy/config preserved");
  // Keep both the settings component and its theme subview mounted through native hide/show.
  await app.invoke("open_settings");
  await wait(async () => app.evaluate("document.querySelector('#salary')?.value === '8800'"), "settings ready");
  await app.evaluate(`(() => { const el = document.querySelector('#salary'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '24680.12'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const settingsGeometry = await snapshot();
  const settingsDisk = await readConfig();
  await operation(`close:${app.child.pid}`); await visible(false);
  await operation(`tray:${app.child.pid}`); await visible(true);
  assert.deepEqual(await snapshot(), settingsGeometry);
  assert.equal(await app.evaluate("document.querySelector('#salary').value"), "24680.12");
  assert.equal(await readConfig(), settingsDisk);
  await app.evaluate(`document.querySelector('[aria-label="皮肤主题"]').click()`);
  await wait(async () => app.evaluate("!!document.querySelector('.theme-picker')"), "theme picker");
  await operation("press"); await visible(false);
  await operation("press"); await visible(true);
  await app.invoke("open_settings"); // Repeated tray Settings must not reset/recenter the current view.
  assert.ok(await app.evaluate("!!document.querySelector('.theme-picker')"));
  await app.evaluate(`document.querySelector('[aria-label="返回工资设置"]').click()`);
  assert.equal(await app.evaluate("document.querySelector('#salary').value"), "24680.12");
  console.log("PASS native settings/theme view: WM_CLOSE, tray callback and hotkey restore, draft, geometry and disk bytes preserved");
  }
  // A second temporary profile deterministically exercises OS-level registration conflict.
  second = await openNative(executable, env(await profile()));
  const conflict = await second.invoke("get_shortcut_status");
  assert.equal(conflict.registered, false); assert.match(conflict.error, /注册失败/);
  await app.invoke("set_shortcut_enabled", { enabled: false });
  assert.equal(JSON.parse(await readConfig()).shortcutEnabled, false);
  assert.equal((await second.invoke("set_shortcut_enabled", { enabled: true })).registered, true);
  // Exercise conflict on the original app whose established tray callback is
  // used above; the second instance only reserves the key like another app.
  const primaryConflict = await app.invoke("set_shortcut_enabled", { enabled: true });
  assert.equal(primaryConflict.registered, false); assert.match(primaryConflict.error, /注册失败/);
  await app.invoke("hide_main");
  await wait(async () => {
    if ((await app.invoke("get_main_visibility")).visible) return true;
    await operation(`tray:${app.child.pid}`);
    return false;
  }, "tray recovery during conflict");
  await second.invoke("set_shortcut_enabled", { enabled: false });
  assert.equal((await app.invoke("set_shortcut_enabled", { enabled: true })).registered, true);
  await second.stop(); second = null;
  const data = await app.invoke("load_data");
  assert.deepEqual(data.settings, fixture.settings);
  assert.deepEqual(data.futureRoot, fixture.futureRoot);
  console.log("PASS native conflict, tray recovery and retry; salary and preferences preserved");
  console.log(`Synthetic test profiles retained for inspection: ${roots.join(', ')}`);
} finally {
  await second?.stop(); await app?.stop(); helper.stdin.end(); helper.kill(); input.close();
}
