// Change versions/endpoints only in a disposable Windows CI checkout.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
assert.equal(process.env.GITHUB_ACTIONS, "true");
const phase = process.argv[2];
assert.ok(["low", "high", "save-low"].includes(phase));
const version = `0.3.1-updater-test.${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
const repo = process.env.GITHUB_REPOSITORY;
assert.match(repo, /^[\w.-]+\/[\w.-]+$/);
if (phase === "save-low") {
  await mkdir("artifacts/update-e2e/low", { recursive: true });
  for (const name of await readdir("src-tauri/target/release/bundle/nsis")) {
    if (name.includes("_0.3.0_") && (name.endsWith(".exe") || name.endsWith(".sig"))) {
      await copyFile(join("src-tauri/target/release/bundle/nsis", name), join("artifacts/update-e2e/low", name));
    }
  }
} else {
  if (phase === "high") {
    for (const file of ["package.json", "package-lock.json", "src-tauri/tauri.conf.json"]) {
      const data = JSON.parse(await readFile(file, "utf8")); data.version = version;
      if (data.packages?.[""]) data.packages[""].version = version;
      await writeFile(file, JSON.stringify(data, null, 2) + "\n");
    }
    const cargoPath = "src-tauri/Cargo.toml";
    await writeFile(cargoPath, (await readFile(cargoPath, "utf8")).replace(/^version = "0\.3\.0"/m, `version = "${version}"`));
    const lockPath = "src-tauri/Cargo.lock";
    const lock = await readFile(lockPath, "utf8");
    assert.match(lock, /name = "earn-today"\r?\nversion = "0\.3\.0"/);
    await writeFile(lockPath, lock.replace(/(name = "earn-today"\r?\nversion = ")0\.3\.0(")/, `$1${version}$2`));
    await writeFile(`docs/releases/${version}.md`, "仅用于隔离环境的应用内升级验收，请勿分发。\n");
  }
  const result = spawnSync(process.execPath, ["tools/prepare-updater.mjs"], { stdio: "inherit" });
  assert.equal(result.status, 0);
  const path = "src-tauri/tauri.updater.generated.json";
  const generated = JSON.parse(await readFile(path, "utf8"));
  generated.plugins.updater.endpoints = [`https://github.com/${repo}/releases/download/v${version}/latest.json`];
  await writeFile(path, JSON.stringify(generated, null, 2));
  if (phase === "low") {
    await mkdir("artifacts/update-e2e", { recursive: true });
    await writeFile("artifacts/update-e2e/context.json", JSON.stringify({ lowVersion: "0.3.0", highVersion: version, tag: `v${version}` }));
  }
}
