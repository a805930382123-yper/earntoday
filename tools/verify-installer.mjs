// Verify an installed production app without changing its salary settings.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const [installedArg, builtArg] = process.argv.slice(2);
assert.ok(installedArg && builtArg, "Usage: node tools/verify-installer.mjs <installed.exe> <built.exe>");
const installed = resolve(installedArg);
const built = resolve(builtArg);
assert.notEqual(installed, built, "Verify the installed copy, not the build output");
const hash = async path => createHash("sha256").update(await readFile(path)).digest("hex");
// Tauri embeds NSS in the installer copy and restores UNK in the build output.
// Permit only that three-byte packaging marker; verify every other byte by hash.
const packagedHash = async path => {
  const bytes = await readFile(path);
  const marker = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
  const offset = bytes.indexOf(marker);
  if (offset >= 0) {
    assert.equal(bytes.indexOf(marker, offset + 1), -1, "Expected one unpatched Tauri bundle marker");
    bytes.write("NSS", offset + marker.length - 3, 3, "ascii");
  }
  return createHash("sha256").update(bytes).digest("hex");
};
assert.equal(await hash(installed), await packagedHash(built), "Installed executable differs from bundled executable");

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(error => error ? reject(error) : resolvePort(address.port));
  });
});
const app = spawn(installed, [], {
  cwd: dirname(installed),
  windowsHide: true,
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
  },
});
let launchError;
app.on("error", error => { launchError = error; });
let ws;
const pending = new Map();
let sequence = 0;
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
try {
  let target;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (launchError) throw launchError;
    assert.equal(app.exitCode, null, "Installed app exited before loading");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) target = (await response.json()).find(page => page.type === "page" && page.url.startsWith("http://tauri.localhost/"));
    } catch {}
    if (target) break;
    await pause(250);
  }
  assert.ok(target, "Installed app did not open its embedded production page");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    const timer = setTimeout(() => reject(new Error("WebView connection timed out")), 10000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolveOpen(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WebView connection failed")); }, { once: true });
  });
  ws.addEventListener("message", event => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params) => new Promise((resolveRequest, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 10000);
    pending.set(id, { resolve: resolveRequest, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  let snapshot;
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await send("Runtime.evaluate", {
      expression: `JSON.stringify({
        url: location.href,
        ready: document.readyState,
        rendered: Boolean(document.querySelector('#root')?.children.length),
        bridge: Boolean(window.__TAURI_INTERNALS__),
        images: [...document.images].map(image => ({loaded: image.complete && image.naturalWidth > 0, src: image.currentSrc || image.src}))
      })`,
      returnByValue: true,
    });
    assert.ok(!result.exceptionDetails, "Installed page inspection failed");
    snapshot = JSON.parse(result.result.value);
    if (snapshot.rendered && snapshot.bridge && snapshot.images.length && snapshot.images.every(image => image.loaded)) break;
    await pause(250);
  }
  assert.ok(snapshot.rendered && snapshot.bridge, "Installed React UI or native bridge did not load");
  assert.ok(snapshot.images.length > 0 && snapshot.images.every(image => image.loaded), "Installed character assets failed to load");
  assert.ok(snapshot.images.every(image => image.src.startsWith("http://tauri.localhost/") || image.src.startsWith("data:")), "Installed image depends on a remote or development server");
  console.log(JSON.stringify({ passed: true, page: snapshot.url, decodedImages: snapshot.images.length, installedExeSha256: await hash(installed) }));
} finally {
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  if (ws && ws.readyState < WebSocket.CLOSING) ws.close();
  if (app.exitCode === null) app.kill();
  if (app.exitCode === null) await Promise.race([new Promise(resolveExit => app.once("exit", resolveExit)), pause(3000)]);
}
