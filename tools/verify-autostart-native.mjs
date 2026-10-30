import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openNative, pause } from "./native-test-session.mjs";

assert.equal(process.platform, "win32");
const executable = resolve("src-tauri/target/debug/earn-today.exe");
assert.ok((await readFile(executable)).includes(Buffer.from("isolated-test requires EARN_TODAY_TEST_ROOT")));
const base = {
  settings: { monthlySalary: 8800, workdaysPerMonth: 22, workWeekdays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
  selectedThemeId: "mibao", windowMode: "mini", privacyMode: "hidden", displayMode: "collection", autonomousMotionEnabled: true,
};
const profile = async data => {
  const root = await mkdtemp(join(tmpdir(), "earn-autostart-"));
  await writeFile(join(root, ".earn-today-test-profile"), "synthetic native acceptance");
  await mkdir(join(root, "earn-today"));
  await writeFile(join(root, "earn-today/config.json"), JSON.stringify(data));
  return root;
};
const env = root => ({ EARN_TODAY_TEST_ROOT: root, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" });
const wait = async (check, name) => {
  for (let i = 0; i < 80; i++) { if (await check()) return; await pause(100); }
  throw new Error(`Timed out: ${name}`);
};
let app;
try {
  const trayRoot = await profile({ ...base, autostartBehavior: "tray" });
  app = await openNative(executable, env(trayRoot), ["--autostart"]);
  assert.equal((await app.invoke("get_main_visibility")).visible, false);
  await wait(async () => await app.evaluate("document.querySelector('.theme-root')?.dataset.themeId") === "mibao", "tray theme preload");
  assert.equal(await app.evaluate("document.documentElement.dataset.windowVisible"), "false");
  await app.invoke("toggle_main_visibility");
  await wait(async () => (await app.invoke("get_main_visibility")).visible, "tray restore");
  assert.equal(await app.evaluate("document.querySelector('[data-work-state]')?.getAttribute('data-window-mode')"), "mini");
  assert.equal(await app.evaluate("document.querySelector('.theme-root')?.dataset.themeId"), "mibao");
  await app.stop(); app = null;

  const manualRoot = await profile({ ...base, autostartBehavior: "tray" });
  app = await openNative(executable, env(manualRoot));
  await wait(async () => (await app.invoke("get_main_visibility")).visible, "manual startup");
  await app.stop(); app = null;

  const widgetRoot = await profile({ ...base, autostartBehavior: "widget" });
  app = await openNative(executable, env(widgetRoot), ["--autostart"]);
  await wait(async () => (await app.invoke("get_main_visibility")).visible, "quiet widget startup");
  assert.equal(await app.evaluate("document.querySelector('.theme-root')?.dataset.themeId"), "mibao");
  assert.equal(await app.evaluate("document.querySelector('[data-work-state]')?.getAttribute('data-window-mode')"), "mini");
  await app.stop(); app = null;

  const invalidRoot = await profile({ ...base, settings: null, autostartBehavior: "widget" });
  app = await openNative(executable, env(invalidRoot), ["--autostart"]);
  assert.equal((await app.invoke("get_main_visibility")).visible, false);
  await app.invoke("open_settings");
  await wait(async () => app.evaluate("!!document.querySelector('.settings-shell')"), "first-run settings");
  console.log("PASS native autostart: tray hidden, tray restore, manual visible, widget ready, first-run hidden until settings");
} finally {
  await app?.stop();
}
