import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const key = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
assert.ok(key, "Set TAURI_UPDATER_PUBLIC_KEY to the public key contents (never a private key or path)");
const decoded = Buffer.from(key, "base64").toString("utf8").trim().split(/\r?\n/);
assert.match(decoded[0], /^untrusted comment:/, "Invalid Tauri public key");
assert.equal(Buffer.from(decoded[1] ?? "", "base64").length, 42, "Invalid public key length");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const conf = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
assert.equal(pkg.version, conf.version, "package/Tauri versions differ");
assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], pkg.version, "Cargo version differs");
assert.equal(conf.identifier, "com.fishearn.today", "Do not change existing app identity");
assert.equal(conf.productName, "今天又赚了多少", "Do not change NSIS product identity");
assert.equal(conf.bundle.windows.nsis.installMode, "currentUser", "Keep old per-user installation scope");
assert.ok(conf.bundle.targets.includes("nsis"));
await writeFile("src-tauri/tauri.updater.generated.json", JSON.stringify({
  bundle: { createUpdaterArtifacts: true },
  plugins: { updater: { pubkey: key, requireSignedVersion: true } },
}, null, 2));
console.log(`Prepared signed NSIS build configuration for ${pkg.version}; public key configured`);
