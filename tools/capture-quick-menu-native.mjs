import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openNative, pause } from "./native-test-session.mjs";

const run = promisify(execFile);
const python = "C:\\Users\\David.chen\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const helper = resolve("tools/quick-menu-capture.py");
const executable = resolve("src-tauri/target/debug/earn-today.exe");
assert.ok((await readFile(executable)).includes(Buffer.from("isolated-test requires EARN_TODAY_TEST_ROOT")));
const root = await mkdtemp(join(tmpdir(), "earn-menu-"));
await writeFile(join(root, ".earn-today-test-profile"), "synthetic native menu acceptance");
await mkdir(join(root, "earn-today"));
await writeFile(join(root, "earn-today/config.json"), JSON.stringify({
  settings: { monthlySalary: 8800, workdaysPerMonth: 22, workWeekdays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
  selectedThemeId: "blue-whale-girl", windowMode: "full", privacyMode: "hidden", displayMode: "amount", autonomousMotionEnabled: true,
}));
const output = resolve("artifacts/quick-menu");
await mkdir(output, { recursive: true });
const control = (...args) => run(python, [helper, ...args.map(String)]);
let app;
const menuCount = async () => Number((await control("menu-visible", app.child.pid)).stdout.trim());
const waitMenu = async count => {
  for (let i = 0; i < 50; i++) {
    const current = await menuCount();
    if (count ? current >= count : current === 0) return;
    await pause(100);
  }
  throw new Error(`Native menu count did not reach ${count}`);
};
const popupWidget = async (selector, x, y) => {
  await control("cursor", x, y);
  await app.evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
  await waitMenu(1);
  await pause(300);
};
const popupTray = async () => {
  await control("cursor", 1800, 1100);
  await control("tray-right", app.child.pid);
  await waitMenu(1);
  await pause(300);
};
const choose = async (x, y) => {
  await control("click", x, y);
  await waitMenu(0);
  await pause(200);
};
const capture = async (name, x, y, width, height) => {
  await pause(250);
  await control("capture", join(output, name), x, y, width, height);
  await control("escape");
  await pause(100);
  if (await menuCount()) await control("escape");
  await waitMenu(0);
};
try {
  app = await openNative(executable, { EARN_TODAY_TEST_ROOT: root, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" });
  const screen = await app.evaluate("({ x: window.screenX, y: window.screenY })");
  await popupWidget(".widget-stage", screen.x + 100, screen.y + 100);
  await capture("widget-menu.png", screen.x + 90, screen.y + 90, 220, 235);
  assert.equal(await app.evaluate("!!document.querySelector('.pet-reacting')"), false, "right click must not trigger pet interaction");

  await popupWidget(".widget-stage", screen.x + 100, screen.y + 100);
  await choose(screen.x + 150, screen.y + 180);
  assert.equal((await app.invoke("load_data")).privacyMode, "visible", "widget menu click should update privacy");
  await popupWidget(".widget-stage", screen.x + 100, screen.y + 100);
  await choose(screen.x + 150, screen.y + 180);
  assert.equal((await app.invoke("load_data")).privacyMode, "hidden");
  await popupWidget(".widget-stage", screen.x + 100, screen.y + 100);
  await control("cursor", screen.x + 170, screen.y + 115);
  await waitMenu(2);
  await capture("widget-display-submenu.png", screen.x + 90, screen.y + 90, 350, 235);
  await popupWidget(".widget-stage", screen.x + 100, screen.y + 100);
  await control("cursor", screen.x + 170, screen.y + 115);
  await waitMenu(2);
  await choose(screen.x + 350, screen.y + 135);
  assert.equal((await app.invoke("load_data")).displayMode, "collection", "display submenu should persist collection");
  assert.equal((await app.invoke("load_data")).privacyMode, "hidden", "display submenu must keep privacy");
  await popupWidget(".widget-stage", screen.x + 100, screen.y + 100);
  await control("cursor", screen.x + 170, screen.y + 135);
  await waitMenu(2);
  await choose(screen.x + 350, screen.y + 155);
  assert.equal((await app.invoke("load_data")).windowMode, "mini", "size submenu should switch to mini");
  const miniScreen = await app.evaluate("({ x: window.screenX, y: window.screenY })");
  await popupWidget(".mini-stage", miniScreen.x + 80, miniScreen.y + 80);
  await capture("mini-menu.png", miniScreen.x + 70, miniScreen.y + 70, 220, 235);
  assert.equal(await app.evaluate("!!document.querySelector('.pet-reacting')"), false, "mini right click must not trigger pet interaction");
  await popupWidget(".mini-stage", miniScreen.x + 80, miniScreen.y + 80);
  await control("cursor", miniScreen.x + 150, miniScreen.y + 137);
  await pause(400);
  await waitMenu(2);
  await capture("mini-theme-submenu.png", miniScreen.x + 70, miniScreen.y + 70, 350, 235);
  await popupWidget(".mini-stage", miniScreen.x + 80, miniScreen.y + 80);
  await control("cursor", miniScreen.x + 150, miniScreen.y + 137);
  await pause(400);
  await waitMenu(2);
  await choose(miniScreen.x + 340, miniScreen.y + 159);
  assert.equal((await app.invoke("load_data")).selectedThemeId, "mibao", "theme submenu should switch to Mibao");
  assert.equal((await app.invoke("load_data")).privacyMode, "hidden");
  await popupWidget(".mini-stage", miniScreen.x + 80, miniScreen.y + 80);
  await capture("mibao-mini-menu.png", miniScreen.x + 70, miniScreen.y + 70, 220, 235);
  await popupWidget(".mini-stage", miniScreen.x + 80, miniScreen.y + 80);
  await choose(miniScreen.x + 150, miniScreen.y + 181);
  assert.equal((await app.invoke("load_data")).autonomousMotionEnabled, false, "motion menu should update existing preference");
  await app.invoke("set_window_mode", { windowMode: "full" });
  const mibaoScreen = await app.evaluate("({ x: window.screenX, y: window.screenY })");
  await popupWidget(".widget-stage", mibaoScreen.x + 100, mibaoScreen.y + 100);
  await capture("mibao-full-menu.png", mibaoScreen.x + 90, mibaoScreen.y + 90, 220, 235);

  await popupTray();
  await capture("tray-menu.png", 1715, 890, 205, 220);

  await popupTray();
  await choose(1760, 1033);
  assert.equal((await app.invoke("get_main_visibility")).visible, false, "tray hide should keep app running");
  await popupTray();
  await control("cursor", 1760, 914);
  await pause(400);
  await waitMenu(2);
  await capture("tray-hidden-display-submenu.png", 1590, 890, 330, 220);
  await popupTray();
  await control("cursor", 1760, 914);
  await pause(400);
  await waitMenu(2);
  await choose(1640, 914);
  assert.equal((await app.invoke("load_data")).displayMode, "amount", "hidden tray selection should persist");
  assert.equal((await app.invoke("load_data")).privacyMode, "hidden", "hidden tray selection must keep privacy");
  assert.equal((await app.invoke("get_main_visibility")).visible, false, "hidden tray selection must not show window");
  await popupTray();
  await choose(1760, 1033);
  assert.equal((await app.invoke("get_main_visibility")).visible, true, "tray show should restore app");

  await app.invoke("open_settings");
  await pause(300);
  await app.evaluate("(() => { const el = document.querySelector('#salary'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '24680.12'); el.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await popupTray();
  await capture("tray-settings-disabled.png", 1715, 890, 205, 220);
  await popupTray();
  await control("click", 1760, 914);
  await control("escape");
  await waitMenu(0);
  assert.equal((await app.invoke("load_data")).displayMode, "amount", "disabled display group must not change config");
  await popupTray();
  await choose(1760, 979);
  assert.equal((await app.invoke("load_data")).privacyMode, "visible", "privacy remains available in settings");
  assert.equal(await app.evaluate("document.querySelector('#salary').value"), "24680.12", "privacy must preserve draft");
  assert.equal((await app.invoke("load_data")).settings.monthlySalary, 8800, "privacy must not save draft");
  await popupTray();
  await choose(1760, 1054);
  assert.equal(await app.evaluate("document.querySelector('#salary').value"), "24680.12", "reopening settings must keep draft");
  await popupTray();
  await control("click", 1760, 1086);
  for (let i = 0; i < 20 && app.child.exitCode === null; i++) await pause(100);
  assert.equal(app.child.exitCode, 0, "tray quit must terminate app");
  console.log(output);
} finally {
  await app?.stop();
}

const trayRoot = await mkdtemp(join(tmpdir(), "earn-menu-autostart-"));
await writeFile(join(trayRoot, ".earn-today-test-profile"), "synthetic autostart tray acceptance");
await mkdir(join(trayRoot, "earn-today"));
await writeFile(join(trayRoot, "earn-today/config.json"), JSON.stringify({
  settings: { monthlySalary: 8800, workdaysPerMonth: 22, workWeekdays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
  selectedThemeId: "mibao", windowMode: "mini", privacyMode: "hidden", displayMode: "collection", autostartBehavior: "tray",
}));
try {
  app = await openNative(executable, { EARN_TODAY_TEST_ROOT: trayRoot, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" }, ["--autostart"]);
  assert.equal((await app.invoke("get_main_visibility")).visible, false, "tray autostart begins hidden");
  await popupTray();
  await control("capture", join(output, "autostart-tray-menu.png"), 1715, 890, 205, 220);
  await choose(1760, 979);
  assert.equal((await app.invoke("load_data")).privacyMode, "visible", "tray menu works before widget shown");
  assert.equal((await app.invoke("get_main_visibility")).visible, false, "tray preference must not show window");
  await popupTray();
  await choose(1760, 1033);
  assert.equal((await app.invoke("get_main_visibility")).visible, true, "tray show restores auto-started app");
  console.log("PASS native quick menus, drafts, hidden tray, quit and autostart tray");
  console.log(output);
} finally {
  await app?.stop();
}
