import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function openNative(executable, launchEnv = {}) {
  const port = await new Promise(resolve => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const port = server.address().port; server.close(() => resolve(port));
    });
  });
  const appEnv = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`, ...launchEnv };
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]) delete appEnv[name];
  const child = spawn(executable, [], { windowsHide: true, stdio: "ignore", env: appEnv });
  let launchError; child.on("error", error => { launchError = error; });
  let socket; let sequence = 0; const pending = new Map(); const eventHandlers = new Map();
  const stop = async () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("Session closed")); }
    pending.clear(); socket?.close(); if (child.exitCode === null) child.kill();
    await pause(500);
  };
  try {
    let target;
    for (let i = 0; i < 160; i++) {
      if (launchError) throw launchError;
      assert.equal(child.exitCode, null, "Native app exited during startup");
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(750) })).json()).find(t => t.type === "page"); } catch {}
      if (target) break; await pause(250);
    }
    assert.ok(target, "Native WebView did not start");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP timeout")), 10000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", event => {
      const msg = JSON.parse(String(event.data));
      if (msg.method) { eventHandlers.get(msg.method)?.(msg.params); return; }
      const request = pending.get(msg.id);
      if (!request) return; pending.delete(msg.id); clearTimeout(request.timer);
      if (msg.error) request.reject(new Error(msg.error.message)); else request.resolve(msg.result);
    });
    const send = (method, params, timeoutMs = 15000) => new Promise((resolve, reject) => {
      const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression, timeoutMs) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
      assert.ok(!result.exceptionDetails, result.exceptionDetails?.text ?? "Native invocation failed");
      return result.result.value;
    };
    for (let i = 0; i < 80; i++) {
      if (await evaluate("Boolean(window.__TAURI_INTERNALS__ && document.querySelector('#root')?.children.length)")) break;
      await pause(100);
    }
    return { child, stop, evaluate, send, on: (method, callback) => eventHandlers.set(method, callback), invoke: (cmd, args = {}, timeoutMs) => evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`, timeoutMs) };
  } catch (error) { await stop(); throw error; }
}
