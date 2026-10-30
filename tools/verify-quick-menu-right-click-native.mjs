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
const output = resolve("artifacts/quick-menu");
await mkdir(output, { recursive: true });
const control = (...args) => run(python, [helper, ...args.map(String)]);

for (const theme of ["blue-whale-girl", "mibao"]) for (const mode of ["full", "mini"]) {
  const root = await mkdtemp(join(tmpdir(), "earn-menu-right-"));
  await writeFile(join(root, ".earn-today-test-profile"), "synthetic native right-click acceptance");
  await mkdir(join(root, "earn-today"));
  await writeFile(join(root, "earn-today/config.json"), JSON.stringify({
    settings: { monthlySalary: 8800, workdaysPerMonth: 22, workWeekdays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
    selectedThemeId: theme, windowMode: mode, privacyMode: "hidden", displayMode: "collection",
  }));
  let app;
  try {
    app = await openNative(executable, { EARN_TODAY_TEST_ROOT: root, HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "" });
    const selector = mode === "full" ? ".widget-stage" : ".mini-stage";
    for (let i = 0; i < 40 && !(await app.evaluate(`!!document.querySelector('${selector}')`)); i++) await pause(100);
    assert.equal((await app.invoke("get_main_visibility")).visible, true);
    const screen = await app.evaluate("({ x: window.screenX, y: window.screenY })");
    await control("right-click", screen.x + (mode === "full" ? 100 : 80), screen.y + (mode === "full" ? 100 : 80));
    let open = false;
    for (let i = 0; i < 40; i++) {
      open = Number((await control("menu-visible", app.child.pid)).stdout.trim()) > 0;
      if (open) break;
      await pause(100);
    }
    assert.ok(open, `Real right-click did not open ${theme}/${mode} menu`);
    await control("capture", join(output, `${theme}-${mode}-real-right-click.png`), screen.x + (mode === "full" ? 90 : 70), screen.y + (mode === "full" ? 90 : 70), 220, 235);
    console.log(`PASS native physical right-click ${theme}/${mode}`);
  } finally {
    await app?.stop();
  }
}
