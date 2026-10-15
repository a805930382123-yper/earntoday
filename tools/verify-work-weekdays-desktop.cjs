// Real packaged app and disk persistence. Only the WebView clock is controlled.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const root = path.resolve('docs/ui/work-weekdays-desktop');
fs.mkdirSync(root, { recursive: true });
const labels = ['周日','周一','周二','周三','周四','周五','周六'];
const freePort = () => new Promise((resolve,reject) => { const s=require('node:net').createServer(); s.on('error',reject); s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));}); });
const launch = port => spawn(path.resolve('src-tauri/target/release/earn-today.exe'),[],{windowsHide:true,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`},stdio:'ignore'});
async function connect(app, port) {
  for(let n=0;n<40;n++) {
    if(app.exitCode!==null) throw new Error(`App exited ${app.exitCode}`);
    try { if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { const b=await chromium.connectOverCDP(`http://127.0.0.1:${port}`); if(b.contexts()[0]?.pages()[0]?.url().startsWith('http://tauri.localhost/'))return b; await b.close(); } } catch {}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Packaged WebView unavailable');
}
async function stop(app) { app.kill(); if(app.exitCode===null&&app.signalCode===null)await new Promise(resolve=>{app.once('exit',resolve);setTimeout(resolve,2000);}); }
async function main() {
  let port=await freePort(), app=launch(port), browser, page, original;
  const invoke=(cmd,args)=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
  const load=()=>invoke('load_data');
  const amount=()=>page.locator('.amount,.mini-amount');
  const money=async()=>(await amount().textContent()).replace(/[,\s]/g,'');
  const screenshot=async name=>{await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(root,name+'.png'),omitBackground:true,animations:'disabled'});};
  const open=async()=>{await page.getByRole('button',{name:'打开设置'}).click();await page.waitForSelector('.work-weekdays');assert.equal(await page.evaluate(()=>innerHeight),600);};
  const select=async days=>{for(let day=0;day<7;day++){const b=page.getByRole('button',{name:labels[day],exact:true});if((await b.getAttribute('aria-pressed')==='true')!==days.includes(day))await b.click();}};
  const save=async()=>{await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.waitForSelector('[data-work-state]');};
  const setSchedule=async days=>{await open();await select(days);await save();const s=(await load()).settings;assert.deepEqual(s,{...original.settings,workWeekdays:days});const disk=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'earn-today','config.json'),'utf8'));assert.deepEqual(disk.settings,s);};
  const setTime=async(date,state)=>{await page.clock.setFixedTime(new Date(date));await page.clock.runFor(1000);await page.waitForSelector(`[data-work-state="${state}"]`);};
  const setPrivate=async hidden=>{const c=await page.locator('[data-work-state]').getAttribute('class');if(c.includes('privacy-hidden')!==hidden)await page.getByRole('button',{name:hidden?'隐藏收入':'显示收入',exact:true}).click();await page.waitForSelector(hidden?'.privacy-hidden':'[data-work-state]:not(.privacy-hidden)');};
  const setMode=async mode=>{if(await page.locator('[data-window-mode]').getAttribute('data-window-mode')!==mode)await page.getByRole('button',{name:mode==='mini'?'进入迷你模式':'恢复完整模式',exact:true}).click();await page.waitForSelector(`[data-window-mode="${mode}"]`);await page.waitForFunction(h=>innerHeight===h&&innerWidth===260,mode==='mini'?108:276);};
  const choose=async id=>{await open();await page.getByRole('button',{name:'皮肤主题',exact:true}).click();await page.getByRole('button',{name:id==='mibao'?/咪宝/:/蓝色大肥鱼/}).click();if(await page.locator('.theme-root').getAttribute('data-theme-id')!==id)await page.getByRole('button',{name:'使用此主题',exact:true}).click();await page.waitForSelector(`[data-theme-id="${id}"]`);await page.getByRole('button',{name:'返回工资设置'}).click();await page.getByRole('button',{name:'关闭设置'}).click();await page.waitForSelector('[data-work-state]');};
  const rest=async hidden=>{
    await page.waitForSelector('.state-rest_day');assert.equal(await money(),hidden?'¥••••••':'¥0.00');assert.match(await page.locator('.status-text,.mini-status').textContent(),/今天休息/);
    assert.equal(await page.locator('.privacy-question,.privacy-confused,.pet-has-privacy-art,.after-work-note,.progress-times,[role="progressbar"],.pet-hit-area').count(),0);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.chibi-sleeping')).opacity==='1');
  };
  try {
    browser=await connect(app,port);page=browser.contexts()[0].pages()[0];await page.waitForSelector('[data-work-state]');original=await load();assert.ok(original.settings);
    const mins=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
    const work=Math.floor((mins(original.settings.workStart)+mins(original.settings.lunchStart))/2),lunch=Math.floor((mins(original.settings.lunchStart)+mins(original.settings.lunchEnd))/2),end=mins(original.settings.workEnd);
    const date=(day,t)=>new Date(2026,9,day,Math.floor(t/60),t%60);
    await page.clock.install({time:date(13,work)});await page.clock.pauseAt(date(13,work));await page.reload();await page.waitForSelector('[data-work-state]');await setMode('full');await setPrivate(false);
    // Validate an empty selection in both the real form and native command.
    await open();await select([]);await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.getByRole('alert').filter({hasText:/至少选择/}).waitFor();assert.deepEqual((await load()).settings,original.settings);
    const rejected=await page.evaluate(async settings=>{try{await window.__TAURI_INTERNALS__.invoke('save_settings',{settings:{...settings,workWeekdays:[]}});return false;}catch{return true;}},original.settings);assert.equal(rejected,true);
    await page.getByRole('button',{name:'关闭设置'}).click();await page.waitForSelector('[data-work-state]');
    await setSchedule([1,2,3,4,5,6,0]);await page.waitForSelector('.state-working');const baseline=await money();assert.notEqual(baseline,'¥0.00');
    await setSchedule([0]);await rest(false);await open();assert.equal(await page.getByRole('button',{name:'周日',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByLabel('每月工作天数').inputValue(),String(original.settings.workdaysPerMonth));
    const saveBox=await page.getByRole('button',{name:'保存设置',exact:true}).boundingBox();assert.ok(saveBox.y+saveBox.height<=600);await screenshot('settings-work-weekdays');await page.getByRole('button',{name:'关闭设置'}).click();
    await setTime(date(18,work),'working');assert.equal(await money(),baseline,'Sunday restored current-time income');
    await setTime(date(18,lunch),'lunch');const paused=await money();await page.clock.setFixedTime(new Date(date(18,lunch).getTime()+60000));await page.clock.runFor(1000);assert.equal(await money(),paused);
    await setTime(date(18,end),'after');assert.equal(await money(),`¥${(original.settings.monthlySalary/original.settings.workdaysPerMonth).toFixed(2)}`);
    await setTime(date(14,work),'rest_day');
    for(const id of ['blue-whale-girl','mibao']) {
      await choose(id);
      for(const mode of ['full','mini']) {
        await setMode(mode);
        for(const hidden of [false,true]){await setPrivate(hidden);await rest(hidden);await screenshot(`rest-${id}-${mode}${hidden?'-private':''}`);}
      }
      assert.deepEqual((await load()).settings,{...original.settings,workWeekdays:[0]});
    }
    await setPrivate(false);await setSchedule([1,2,3,4,5]);await page.waitForSelector('.state-working');assert.equal(await money(),baseline);
    await setTime(date(16,23*60+59),'after');await setTime(date(17,0),'rest_day');await rest(false);await setTime(date(18,23*60+59),'rest_day');await setTime(date(19,work),'working');assert.equal(await money(),baseline);
    // Leave a distinctive saved schedule across a real process restart, then restore it.
    await setSchedule([0]);await setMode('mini');await setPrivate(true);await choose('mibao');await browser.close();browser=null;await stop(app);
    port=await freePort();app=launch(port);browser=await connect(app,port);page=browser.contexts()[0].pages()[0];await page.waitForSelector('.mini-stage.privacy-hidden');assert.deepEqual((await load()).settings,{...original.settings,workWeekdays:[0]});
    await page.clock.install({time:date(14,work)});await page.clock.pauseAt(date(14,work));await page.reload();await rest(true);await page.waitForSelector('[data-theme-id="mibao"]');await screenshot('rest-mibao-mini-private-restart');
    console.log('PASS Windows weekdays: real form and native empty rejection; disk save/reopen; unchanged wages; Sunday work/lunch/after; immediate add/remove today; two skins/modes/privacy/rest art/no-question/no-celebration; midnight; process restart restores weekly schedule; 400x600 settings and screenshots.');
  } finally {
    if(browser&&page&&original){try{if(await page.locator('.settings-shell').count())await invoke('hide_settings');await invoke('save_settings',{settings:original.settings});await page.waitForSelector('[data-work-state]');await invoke('set_window_mode',{windowMode:'full'});if(original.windowMode==='mini'&&original.fullPosition){await invoke('save_position',original.fullPosition);await invoke('hide_settings');}await invoke('set_window_mode',{windowMode:original.windowMode||'full'});await invoke('set_privacy_mode',{privacyMode:original.privacyMode||'visible'});await invoke('save_theme',{selectedThemeId:original.selectedThemeId||'blue-whale-girl'});if(original.position){await invoke('save_position',original.position);await invoke('hide_settings');}assert.deepEqual((await load()).settings,original.settings);}catch(error){console.error('Restore failed:',error);process.exitCode=1;}}
    if(browser)await browser.close();await stop(app);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
