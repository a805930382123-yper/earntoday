// Promote already tested, immutable signed assets; never rebuild during publication.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { verifySignature } from "./prepare-release.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true");
const repo = process.env.GITHUB_REPOSITORY;
assert.match(repo, /^[\w.-]+\/[\w.-]+$/);
assert.ok(process.env.GH_TOKEN);
for (const key of ["CANDIDATE_RUN", "VALIDATION_RUN"]) assert.match(process.env[key], /^\d+$/);
assert.ok(["draft", "stable"].includes(process.env.PUBLISH_MODE));
const api = async (route, method = "GET", body, binary = false) => {
  const response = await fetch(`https://api.github.com/repos/${repo}/${route}`, {
    method, headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: binary ? "application/octet-stream" : "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000),
  });
  assert.ok(response.ok, `GitHub ${method} ${route}: HTTP ${response.status}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
};
const [candidate, validation] = await Promise.all([
  api(`actions/runs/${process.env.CANDIDATE_RUN}`), api(`actions/runs/${process.env.VALIDATION_RUN}`),
]);
for (const run of [candidate, validation]) {
  assert.equal(run.conclusion, "success", "An acceptance workflow has not passed");
  assert.equal(run.head_repository.full_name, repo); assert.equal(run.head_branch, "main");
}
assert.equal(candidate.path, ".github/workflows/release.yml");
assert.equal(validation.path, ".github/workflows/validate-update-e2e.yml");
// These are the only non-product changes permitted between tested builds and publication.
const isEvidenceOnly = path => path === "README.md" || path === "docs/updater.md" ||
  /^\.github\/workflows\/(validate-update-e2e|promote-candidate)\.yml$/.test(path) ||
  /^tools\/(native-test-session|prepare-update-e2e|verify-update-e2e|updater-https-fixture|promote-candidate)\.mjs$/.test(path);
for (const head of [validation.head_sha, process.env.GITHUB_SHA]) {
  const comparison = await api(`compare/${candidate.head_sha}...${head}`);
  assert.ok(["ahead", "identical"].includes(comparison.status), "Candidate is not an ancestor of the verified source");
  assert.ok(comparison.files.length < 300, "Comparison may be truncated");
  assert.ok(comparison.files.every(f => isEvidenceOnly(f.filename) && (!f.previous_filename || isEvidenceOnly(f.previous_filename))), "Product changed since the candidate was built; rebuild and revalidate");
}
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const result = JSON.parse(await readFile("artifacts/update-e2e/result.json", "utf8"));
assert.equal(result.passed, true); assert.equal(result.lowVersion, pkg.version);
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
const [major, minor, patch] = pkg.version.split(".").map(Number);
assert.equal(result.highVersion, `${major}.${minor}.${patch + 1}-updater-test.${validation.id}.${validation.run_attempt}`);
assert.equal(result.productionLatestChanged, false);
for (const test of ["native-network-unavailable-proxy", "unusable-update-source", "same-version-and-downgrade-rejected", "real-installer-signature-rejected", "real-https-download-interruption", "real-ui-later-does-not-install", "real-ui-download-install-and-auto-restart", "new-version-first-start-and-checkpoint-preserved", "corrupt-config-kept-and-explicitly-restored", "missing-and-legacy-fields-preserved"]) {
  assert.ok(result.tests.includes(test), `Missing real acceptance evidence: ${test}`);
}
const name = `EarnToday_${pkg.version}_x64-setup.exe`;
const names = [name, `${name}.sig`, `${name}.sha256`, "latest.json", "release-notes.md"].sort();
assert.deepEqual((await readdir("release-assets")).sort(), names, "Unexpected/missing candidate asset");
const files = new Map(await Promise.all(names.map(async n => [n, await readFile(`release-assets/${n}`)])));
const signature = files.get(`${name}.sig`).toString("utf8").trim();
verifySignature(files.get(name), signature, process.env.TAURI_UPDATER_PUBLIC_KEY, pkg.version);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(files.get(`${name}.sha256`).toString("utf8").trim(), `${digest(files.get(name))}  ${name}`);
const metadata = JSON.parse(files.get("latest.json").toString("utf8"));
assert.equal(metadata.version, pkg.version);
assert.deepEqual(Object.keys(metadata.platforms), ["windows-x86_64"]);
assert.equal(metadata.platforms["windows-x86_64"].signature, signature);
assert.equal(metadata.platforms["windows-x86_64"].url, `https://github.com/${repo}/releases/download/v${pkg.version}/${name}`);
assert.equal(metadata.notes, files.get("release-notes.md").toString("utf8"));

const tag = `v${pkg.version}`;
const releaseCommit = process.env.GITHUB_SHA;
assert.match(releaseCommit, /^[a-f0-9]{40}$/);
const existing = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` }, signal: AbortSignal.timeout(30000) });
assert.equal(existing.status, 404, "Release already exists or cannot be checked; refusing replacement");
const created = spawnSync("gh", ["release", "create", tag, ...names.map(n => `release-assets/${n}`), "--repo", repo, "--target", releaseCommit, "--title", `今天又赚了多少 ${tag}`, "--notes-file", "release-assets/release-notes.md", "--draft", "--latest=false"], { encoding: "utf8", windowsHide: true });
assert.equal(created.status, 0, `Cannot create release draft: ${created.stderr}`);
let release = await api(`releases/tags/${tag}`);
assert.equal(release.draft, true); assert.equal(release.target_commitish, releaseCommit);
assert.deepEqual(release.assets.map(a => a.name).sort(), names);
for (const asset of release.assets) {
  const downloaded = await api(`releases/assets/${asset.id}`, "GET", undefined, true);
  assert.equal(digest(downloaded), digest(files.get(asset.name)), `Uploaded bytes differ: ${asset.name}`);
}
console.log(`Verified all five uploaded assets against candidate run ${candidate.id}; no rebuild performed.`);
if (process.env.PUBLISH_MODE === "stable") {
  release = await api(`releases/${release.id}`, "PATCH", { draft: false, prerelease: false, make_latest: "true" });
  const latest = await api("releases/latest"); assert.equal(latest.id, release.id);
  let available = false;
  for (let i = 0; i < 24; i++) {
    try {
      const response = await fetch(`https://github.com/${repo}/releases/latest/download/latest.json`, { signal: AbortSignal.timeout(15000) });
      if (response.ok && digest(Buffer.from(await response.arrayBuffer())) === digest(files.get("latest.json"))) { available = true; break; }
    } catch { /* Public CDN can briefly lag the publish request. */ }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  assert.ok(available, "Release published but the public latest.json could not be verified; inspect CDN availability");
}
console.log(JSON.stringify({ version: pkg.version, mode: process.env.PUBLISH_MODE, url: release.html_url, candidateRun: candidate.id, validationRun: validation.id, buildCommit: candidate.head_sha, releaseCommit, installerSha256: digest(files.get(name)) }));
