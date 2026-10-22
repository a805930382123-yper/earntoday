// Real updater integration in a disposable GitHub Windows runner. Never a user's profile.
import assert from "node:assert/strict";
import { readFile, writeFile, access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { startHttpsFixture } from "./updater-https-fixture.mjs";
import { openNative, pause } from "./native-test-session.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_OS, "Windows");
const ctx = JSON.parse(await readFile("artifacts/update-e2e/context.json", "utf8"));
assert.match(ctx.lowVersion, /^\d+\.\d+\.\d+$/);
const [major, minor, patch] = ctx.lowVersion.split(".").map(Number);
assert.equal(ctx.highVersion, `${major}.${minor}.${patch + 1}-updater-test.${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`);
assert.equal(ctx.tag, `v${ctx.highVersion}`);
const configPath = join(process.env.APPDATA, "earn-today/config.json");
const installed = join(process.env.LOCALAPPDATA, "今天又赚了多少/earn-today.exe");
const exists = p => access(p).then(() => true, () => false);
assert.equal(await exists(configPath), false, "Existing user config found; refusing to run");
assert.equal(await exists(installed), false, "Existing app found; use a fresh runner");
const lowFiles = (await readdir("artifacts/update-e2e/low")).filter(p => p.endsWith("-setup.exe"));
assert.equal(lowFiles.length, 1);
await new Promise((resolveInstall, reject) => {
  const child = spawn(resolve("artifacts/update-e2e/low", lowFiles[0]), ["/S"], { windowsHide: true, stdio: "ignore" });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolveInstall() : reject(new Error(`Low installer exit ${code}`)));
});

const powershell = (script, extra = {}) => {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, encoding: "utf8", env: { ...process.env, EARN_TEST_EXE: installed, ...extra } });
  assert.equal(result.status, 0, result.stderr || "Windows test operation failed");
  return result.stdout.trim();
};
const productVersion = () => powershell("(Get-Item -LiteralPath $env:EARN_TEST_EXE).VersionInfo.ProductVersion");
const stopInstalledCopies = () => powershell("Get-Process | Where-Object { $_.ProcessName -eq 'earn-today' -and $_.Path -eq $env:EARN_TEST_EXE } | Stop-Process -Force");
const runningCopies = () => JSON.parse(powershell("@{count=@(Get-Process 'earn-today' -ErrorAction SilentlyContinue | Where-Object Path -eq $env:EARN_TEST_EXE).Count} | ConvertTo-Json -Compress")).count;
const config = async () => JSON.parse(await readFile(configPath, "utf8"));
const preferenceKeys = ["settings", "selectedThemeId", "windowMode", "privacyMode", "displayMode", "fullPosition", "positionScale", "fullPositionScale"];
const preferences = data => Object.fromEntries(preferenceKeys.map(k => [k, data[k]]));
const safeInvoke = (app, command, args = {}, timeoutMs = 45000) => app.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)},${JSON.stringify(args)}).then(value=>({ok:true,value}),error=>({ok:false,error:String(error)}))`, timeoutMs);
const showSettings = async app => {
  // WebView's first paint precedes the asynchronous frontend event subscription.
  // Re-send the ordinary open command until the real settings DOM is ready.
  for (let i = 0; i < 80; i++) {
    await app.invoke("open_settings");
    if (await app.evaluate("Boolean(document.querySelector('[aria-label=\"应用更新\"]'))")) return;
    await pause(250);
  }
  throw new Error(`Settings did not open: ${await app.evaluate("document.body.textContent.slice(-2000)")}`);
};
let app; let baseline; let fixture; const passed = []; const observedPhases = [];
const recordPass = name => { passed.push(name); console.log(`PASS ${name}`); };
const assertPreserved = async () => assert.deepEqual(preferences(await config()), preferences(baseline), "User preferences changed after update failure/restart");
const normal = JSON.parse(await readFile("release-assets/latest.json", "utf8"));
const publishManifest = async (data, label) => {
  // Only negative cases use the local trusted HTTPS fixture through a per-process proxy.
  // The real GitHub prerelease metadata is immutable and is used for the actual UI upgrade.
  fixture.setManifest(data);
  console.log(`Fixture: ${label}`);
};
const waitCheck = async (predicate, label) => {
  let last;
  for (let i = 0; i < 24; i++) {
    const result = await safeInvoke(app, "check_update");
    last = result;
    if (predicate(result)) return result;
    if (i % 12 === 0) console.log(`Waiting for ${label}: ${JSON.stringify(result)}`);
    await pause(2500);
  }
  throw new Error(`Test manifest did not reach expected state: ${label}; last=${JSON.stringify(last)}`);
};
try {
  assert.equal(productVersion(), ctx.lowVersion);
  app = await openNative(installed);
  await app.invoke("save_settings", { settings: { monthlySalary: 22123.75, workdaysPerMonth: 19, workWeekdays: [1, 3, 4, 6], workStart: "07:55", workEnd: "18:35", lunchStart: "11:45", lunchEnd: "12:55" }, displayMode: "collection" });
  await app.invoke("save_theme", { selectedThemeId: "mibao" });
  await app.invoke("set_privacy_mode", { privacyMode: "hidden" });
  await app.invoke("set_window_mode", { windowMode: "mini" });
  await app.invoke("open_settings"); await pause(1800);
  baseline = await config();
  await app.stop();

  // Real Rust request through an unreachable per-process proxy: no system network changes.
  app = await openNative(installed, { HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" });
  await waitCheck(r => !r.ok && r.error.includes("无法连接"), "unreachable network");
  await assertPreserved(); recordPass("native-network-unavailable-proxy"); await app.stop();

  // The disposable runner trusts only this run's fixture certificate. Production TLS
  // checks remain enabled. CONNECT forwards this app's requests to the fixture server;
  // no system proxy/DNS changes and no interception of other processes take place.
  const pfx = await readFile(process.env.E2E_TLS_PFX);
  const payload = await readFile(join("release-assets", (await readdir("release-assets")).find(p => p.endsWith("-setup.exe"))));
  fixture = await startHttpsFixture({ pfx, passphrase: process.env.E2E_TLS_PASSWORD, payload });
  const proxyUrl = fixture.proxyUrl;
  await publishManifest("{invalid-json", "invalid source");
  app = await openNative(installed, { HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, ALL_PROXY: proxyUrl, NO_PROXY: "" });
  await pause(1800);

  await publishManifest("{invalid-json", "invalid source");
  await waitCheck(r => !r.ok && r.error.includes("无法连接"), "invalid source");
  await assertPreserved(); recordPass("unusable-update-source");
  for (const version of [ctx.lowVersion, "0.2.0"]) {
    await publishManifest({ ...normal, version }, `no update ${version}`);
    await waitCheck(r => r.ok && r.value === null, `no update ${version}`);
    await assertPreserved();
  }
  recordPass("same-version-and-downgrade-rejected");

  const bad = structuredClone(normal); bad.notes = "e2e-wrong-signature";
  const originalSignature = bad.platforms["windows-x86_64"].signature;
  const signatureText = Buffer.from(originalSignature, "base64").toString("utf8").split(/\r?\n/);
  const signatureBytes = Buffer.from(signatureText[1], "base64"); signatureBytes[20] ^= 1;
  signatureText[1] = signatureBytes.toString("base64");
  bad.platforms["windows-x86_64"].signature = Buffer.from(signatureText.join("\n")).toString("base64");
  await publishManifest(bad, "wrong signature");
  await waitCheck(r => r.ok && r.value?.notes === bad.notes, "wrong signature marker");
  const rejected = await safeInvoke(app, "install_update", {}, 120000);
  assert.ok(!rejected.ok && rejected.error.includes("签名"), "Invalid signature was not rejected");
  assert.equal(productVersion(), ctx.lowVersion); assert.equal(app.child.exitCode, null);
  await assertPreserved(); recordPass("real-installer-signature-rejected");

  // Disconnect after real HTTPS body bytes arrive and before Content-Length is met.
  const interrupted = structuredClone(normal); interrupted.notes = "e2e-disconnected-download";
  interrupted.platforms["windows-x86_64"].url += "?interrupted=1";
  await publishManifest(interrupted, "interrupted download");
  await waitCheck(r => r.ok && r.value?.notes === interrupted.notes, "interrupted download marker");
  const incomplete = await safeInvoke(app, "install_update", {}, 120000);
  assert.ok(fixture.chunksSent > 0, "HTTPS transfer never started; not a download-interruption test");
  assert.ok(!incomplete.ok && incomplete.error.includes("下载"));
  assert.equal(productVersion(), ctx.lowVersion); assert.equal(app.child.exitCode, null);
  await assertPreserved(); recordPass("real-https-download-interruption");
  await app.stop();
  await fixture.stop(); fixture = undefined;

  // Fresh process without the fixture proxy: real GitHub HTTPS metadata + installer.
  app = await openNative(installed);
  await showSettings(app);
  const click = async text => {
    for (let i = 0; i < 80; i++) {
      if (await app.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)return false;b.click();return true})()`)) return true;
      await pause(500);
    }
    throw new Error(`UI button unavailable: ${text}; ${await app.evaluate("document.body.textContent.slice(-2000)")}`);
  };
  const waitText = async text => { for (let i = 0; i < 80; i++) { if (await app.evaluate(`document.body.textContent.includes(${JSON.stringify(text)})`)) return; await pause(500); } throw new Error(`UI missing: ${text}`); };
  assert.ok(await click("检查更新")); await waitText(`发现新版本 ${ctx.highVersion}`);
  assert.ok(await click("稍后再说")); await pause(800);
  assert.equal(productVersion(), ctx.lowVersion); assert.equal(app.child.exitCode, null);
  await assertPreserved(); recordPass("real-ui-later-does-not-install");
  assert.ok(await click("检查更新")); await waitText(`发现新版本 ${ctx.highVersion}`);
  app.on("Runtime.bindingCalled", event => { if (event.name === "__e2ePhase") observedPhases.push(event.payload); });
  await app.send("Runtime.enable"); await app.send("Runtime.addBinding", { name: "__e2ePhase" });
  await app.evaluate("window.__TAURI__.event.listen('update-progress',e=>window.__e2ePhase(e.payload.phase))");
  // Native exits intentionally, so do not await the install IPC promise itself.
  assert.ok(await click("立即更新"));
  for (let i = 0; i < 240; i++) {
    if (app.child.exitCode !== null) {
      try { if (productVersion() === ctx.highVersion && runningCopies() > 0) break; } catch { /* NSIS may briefly replace the executable. */ }
    }
    await pause(1000);
  }
  assert.equal(app.child.exitCode, 0, "Updater did not cleanly exit the old app");
  assert.equal(productVersion(), ctx.highVersion, "Updater did not replace installed executable");
  assert.ok(runningCopies() > 0, "NSIS did not restart the upgraded application");
  assert.ok(observedPhases.includes("downloading"), "Native download progress did not reach the WebView");
  await assertPreserved(); recordPass("real-ui-download-install-and-auto-restart");
  await app.stop(); stopInstalledCopies(); await pause(500);
  app = await openNative(installed); await showSettings(app); await pause(1800);
  assert.ok(await app.evaluate(`document.body.textContent.includes(${JSON.stringify(ctx.highVersion)})`), "Upgraded embedded frontend version incorrect");
  await assertPreserved();
  const backups = await app.invoke("list_config_backups");
  assert.ok(backups.some(b => b.restorable && b.appVersion === ctx.lowVersion && b.id.startsWith("checkpoint-")), "Missing verified pre-update backup");
  await waitCheck(r => r.ok && r.value === null, "upgraded current version");
  recordPass("new-version-first-start-and-checkpoint-preserved");
  const goodBytes = await readFile(configPath, "utf8");
  await app.stop(); await writeFile(configPath, "{broken");
  app = await openNative(installed);
  const broken = await safeInvoke(app, "save_theme", { selectedThemeId: "blue-whale-girl" });
  assert.equal(broken.ok, false); assert.equal(await readFile(configPath, "utf8"), "{broken");
  const checkpoint = backups.find(b => b.restorable && b.id.startsWith("checkpoint-"));
  await app.invoke("restore_config_backup", { id: checkpoint.id });
  await assertPreserved(); recordPass("corrupt-config-kept-and-explicitly-restored");
  await app.stop();
  const legacy = JSON.parse(goodBytes); delete legacy.displayMode; delete legacy.settings.workWeekdays;
  await writeFile(configPath, JSON.stringify(legacy)); app = await openNative(installed);
  const loaded = await app.invoke("load_data");
  assert.equal(loaded.settings.monthlySalary, baseline.settings.monthlySalary);
  assert.deepEqual(loaded.settings.workWeekdays, [1, 2, 3, 4, 5]); assert.equal(loaded.displayMode, "amount");
  recordPass("missing-and-legacy-fields-preserved");
  await app.stop(); await writeFile(configPath, goodBytes);
  const result = { passed: true, lowVersion: ctx.lowVersion, highVersion: ctx.highVersion, tests: passed, progressPhases: [...new Set(observedPhases)], productionLatestChanged: false };
  await writeFile("artifacts/update-e2e/result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await app?.stop(); await fixture?.stop();
  stopInstalledCopies();
}
