// Own the local server and browser check in one run; clean up on completion.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const modules = process.argv[2];
const pause = ms => new Promise(r => setTimeout(r, ms));
let server;
async function main() {
  try { await fetch('http://127.0.0.1:5178', { signal: AbortSignal.timeout(1000) }); }
  catch {
    const log = fs.openSync('docs/autonomous-integration/vite.log', 'w');
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5178'], { windowsHide: true, stdio: ['ignore',log,log] });
    for (let n = 0; ; n++) { try { await fetch('http://127.0.0.1:5178'); break; } catch { if (n > 1200) throw new Error('Vite unavailable'); if (server.exitCode !== null) throw new Error('Vite exited; see vite.log'); await pause(100); } }
  }
  const scripts = process.argv.includes('--regression') ? ['tools/verify-themes.cjs', 'tools/verify-mibao.cjs'] : ['tools/verify-autonomous.cjs'];
  for (const script of scripts) {
    const test = spawn(process.execPath, [path.resolve(script), modules], { windowsHide: true, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { test.on('error', reject); test.on('exit', resolve); });
    if (code !== 0) { process.exitCode = code ?? 1; break; }
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server?.kill());
