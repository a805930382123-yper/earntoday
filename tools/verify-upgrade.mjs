// Destructive installer integration test: fresh GitHub Windows runner ONLY.
// Never run against a developer's real profile; existing user data is a hard stop.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { openNative, pause } from "./native-test-session.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true", "Run only in an isolated GitHub Actions runner");
assert.equal(process.env.RUNNER_OS, "Windows");
const [oldInstaller, newInstaller] = process.argv.slice(2).map(p => resolve(p));
assert.ok(oldInstaller && newInstaller);
const configPath = join(process.env.APPDATA, "earn-today/config.json");
const installed = join(process.env.LOCALAPPDATA, "今天又赚了多少/earn-today.exe");
const exists = p => access(p).then(() => true, () => false);
assert.equal(await exists(configPath), false, "Existing configuration found; refusing to touch it");
assert.equal(await exists(installed), false, "Existing installation found; use a fresh runner");
const oldBytes = await readFile(oldInstaller);
assert.equal(createHash("sha256").update(oldBytes).digest("hex"), "78386390e755b6eac3e878dc4ab5552fe5ffd7067e9809a2b2816769330c640c");
assert.ok(oldBytes.includes(Buffer.from("NullsoftInst")), "Old file is not the expected NSIS installer");
const install = installer => new Promise((resolveInstall, reject) => {
  const p = spawn(installer, ["/S"], { windowsHide: true, stdio: "ignore" });
  const timer = setTimeout(() => { p.kill(); reject(new Error("Installer timed out")); }, 180000);
  p.on("error", reject); p.on("exit", c => { clearTimeout(timer); c === 0 ? resolveInstall() : reject(new Error(`Installer exit ${c}`)); });
});
await install(oldInstaller);
let app = await openNative(installed);
let before;
try {
  await app.invoke("save_settings", { settings: { monthlySalary: 16789.25, workdaysPerMonth: 21, workWeekdays: [0, 2, 4, 6], workStart: "08:25", workEnd: "19:15", lunchStart: "12:15", lunchEnd: "13:25" } });
  await app.invoke("save_theme", { selectedThemeId: "mibao" });
  await app.invoke("set_privacy_mode", { privacyMode: "hidden" });
  await app.invoke("set_window_mode", { windowMode: "mini" });
  await pause(800);
  before = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(before.settings.monthlySalary, 16789.25);
  assert.equal(before.windowMode, "mini"); assert.equal(before.privacyMode, "hidden");
  await mkdir("artifacts/upgrade-test", { recursive: true });
  await copyFile(configPath, "artifacts/upgrade-test/old-synthetic-config.json");
} finally { await app.stop(); }
await install(newInstaller);
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const audit = spawnSync("powershell.exe", ["-NoProfile", "-Command", `
  $v = (Get-Item -LiteralPath $env:EARN_TEST_EXE).VersionInfo.ProductVersion
  $entries = @(Get-ChildItem 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall' | Get-ItemProperty | Where-Object DisplayName -eq '今天又赚了多少')
  @{version=$v; uninstallEntries=$entries.Count} | ConvertTo-Json -Compress
`], { encoding: "utf8", windowsHide: true, env: { ...process.env, EARN_TEST_EXE: installed } });
assert.equal(audit.status, 0, "Cannot inspect installed app identity");
const identity = JSON.parse(audit.stdout.trim());
assert.equal(identity.version, pkg.version, "Installed executable version did not change");
assert.equal(identity.uninstallEntries, 1, "Expected one per-user installation entry");
// Installation itself must leave all original fields untouched.
assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), before);
app = await openNative(installed);
try {
  const loaded = await app.invoke("load_data");
  for (const [key, value] of Object.entries(before)) assert.deepEqual(loaded[key], value, `Lost original field: ${key}`);
  assert.equal(loaded.displayMode, "amount", "Missing new field should receive its own default");
  assert.ok(!loaded.configError);
  await app.invoke("save_settings", { settings: loaded.settings, displayMode: "collection" });
  await app.invoke("create_config_backup");
  const backups = await app.invoke("list_config_backups");
  assert.ok(backups.some(b => b.restorable));
  await pause(500);
  const healthy = await app.evaluate("[...document.images].every(i => i.complete && i.naturalWidth > 0)");
  assert.ok(healthy, "Upgraded character assets did not load");
  console.log(JSON.stringify({ oldVersion: "0.2.0", newVersion: identity.version, installerOverwritePassed: true, uninstallEntries: identity.uninstallEntries, retainedOriginalFieldCount: Object.keys(before).length, newFieldDefaultPassed: true, backupPassed: true, imagesLoaded: true }));
} finally { await app.stop(); }
