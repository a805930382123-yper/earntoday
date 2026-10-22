import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Verify Minisign's payload signature AND its global signature/trusted version.
// This is an extra release gate; installation still uses the official Tauri verifier.
export function verifySignature(payload, encodedSignature, encodedKey, version) {
  const keyLines = Buffer.from(encodedKey.trim(), "base64").toString("utf8").trim().split(/\r?\n/);
  const key = Buffer.from(keyLines[1] ?? "", "base64");
  const lines = Buffer.from(encodedSignature.trim(), "base64").toString("utf8").trim().split(/\r?\n/);
  const sig = Buffer.from(lines[1] ?? "", "base64");
  assert.equal(key.length, 42); assert.equal(sig.length, 74);
  assert.equal(key.subarray(0, 2).toString("ascii"), "Ed", "Invalid public key algorithm");
  assert.deepEqual(key.subarray(2, 10), sig.subarray(2, 10), "Signature key ID mismatch");
  assert.ok(lines[2]?.startsWith("trusted comment: "), "Missing trusted comment");
  const comment = lines[2].slice("trusted comment: ".length);
  assert.ok(comment.split("\t").includes(`version:${version}`), "Signed version differs from release version");
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key.subarray(10)]), format: "der", type: "spki" });
  const algorithm = sig.subarray(0, 2).toString("ascii");
  assert.equal(algorithm, "ED", "Updater artifacts must use prehashed Minisign signatures");
  const data = createHash("blake2b512").update(payload).digest();
  assert.ok(verify(null, data, publicKey, sig.subarray(10)), "Installer signature is invalid");
  assert.ok(verify(null, Buffer.concat([sig.subarray(10), Buffer.from(comment)]), publicKey, Buffer.from(lines[3] ?? "", "base64")), "Trusted comment signature is invalid");
}

export async function prepareRelease() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const repo = process.env.GITHUB_REPOSITORY ?? "a805930382123-yper/earntoday";
  assert.match(repo, /^[\w.-]+\/[\w.-]+$/);
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
  const dir = "src-tauri/target/release/bundle/nsis";
  const installers = (await readdir(dir)).filter(n => n.endsWith("-setup.exe") && n.includes(`_${pkg.version}_`));
  assert.equal(installers.length, 1, "Expected one current-version NSIS installer");
  const installer = join(dir, installers[0]);
  const bytes = await readFile(installer);
  const signature = (await readFile(`${installer}.sig`, "utf8")).trim();
  assert.ok(process.env.TAURI_UPDATER_PUBLIC_KEY, "Public key is required");
  verifySignature(bytes, signature, process.env.TAURI_UPDATER_PUBLIC_KEY, pkg.version);
  const asset = `EarnToday_${pkg.version}_x64-setup.exe`;
  const notes = await readFile(`docs/releases/${pkg.version}.md`, "utf8");
  await mkdir("release-assets", { recursive: true });
  await copyFile(installer, join("release-assets", asset));
  await writeFile(join("release-assets", `${asset}.sig`), signature);
  await writeFile(join("release-assets", `${asset}.sha256`), `${createHash("sha256").update(bytes).digest("hex")}  ${asset}\n`);
  await writeFile("release-assets/latest.json", JSON.stringify({ version: pkg.version, notes, pub_date: new Date().toISOString(),
    platforms: { "windows-x86_64": { signature, url: `https://github.com/${repo}/releases/download/v${pkg.version}/${asset}` } },
  }, null, 2));
  await writeFile("release-assets/release-notes.md", notes);
  console.log(`Verified installer + trusted version; generated signed release assets for v${pkg.version}`);
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prepare-release.mjs")) await prepareRelease();
