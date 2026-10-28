import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const out = 'docs/autonomous-integration';
const lock = JSON.parse(await readFile(join(out,'approved-lock.json'),'utf8'));
for (const frame of lock.resources) {
  for (const path of [frame.runtime, frame.approvedSource]) {
    const bytes = await readFile(path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), frame.sha256, path);
    assert.equal(bytes.length, frame.bytes);
  }
}
const files = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => entry.isDirectory() ? files(join(directory,entry.name)) : [join(directory,entry.name)]))).flat();
const built = await files('dist');
const distAfterBytes = (await Promise.all(built.map(async file => (await stat(file)).size))).reduce((a,b) => a+b, 0);
const js = (await Promise.all(built.filter(p => p.endsWith('.js')).map(p => readFile(p,'utf8')))).join('\n');
assert.ok(!/__autonomousDebug|action-preview|dev\/repaired/.test(js), 'DEV preview/debug must not ship');
const report = { runtimePngCount: lock.resources.length, runtimePngBytes: lock.resourceBytes, runtimePngMiB: lock.resourceBytes/1048576, distBeforeBytes: lock.distBeforeBytes, distAfterBytes, distDeltaBytes: distAfterBytes-lock.distBeforeBytes, devPreviewAndDebugAbsent: true, approvedHashesUnchanged: true };
await writeFile(join(out, 'resources.json'), JSON.stringify(report,null,2));
console.log(report);
