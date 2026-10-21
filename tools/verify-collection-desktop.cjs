// Runs the packaged WebView2 app. Uses a controlled WebView clock, not the OS clock.
// Original config bytes are restored after the owned process exits.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(path.join(process.argv[2],'playwright'));
const output=path.resolve('docs/ui/collection-desktop');fs.mkdirSync(output,{recursive:true});
const configPath=path.join(process.env.APPDATA,'earn-today','config.json');
const freePort=()=>new Promise((resolve,reject)=>{const s=require('node:net').createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
const launch=port=>spawn(path.resolve('src-tauri/target/release/earn-today.exe'),[],{windowsHide:true,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`},stdio:'ignore'});
async function connect(app,port){
  for(let n=0;n<80;n++){
    if(app.exitCode!==null)throw new Error(`Owned app exited ${app.exitCode}`);
    try {if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok){const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);if(browser.contexts()[0]?.pages()[0]?.url().startsWith('http://tauri.localhost/'))return browser;await browser.close();}}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error('Packaged WebView2 unavailable');
}
async function stop(app){if(!app)return;app.kill();if(app.exitCode===null&&app.signalCode===null)await new Promise(resolve=>{app.once('exit',resolve);setTimeout(resolve,2000);});}
async function main(){
  const backup=fs.existsSync(configPath)?fs.readFileSync(configPath):null;
  let app,browser,page;
  const invoke=(cmd,args)=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
  const data=()=>invoke('load_data');
  const stage=async n=>{await page.waitForSelector(`[data-collection-stage="${n}"]`);assert.equal(await page.locator('.collection-meter').getAttribute('aria-valuenow'),String(n));if(await page.locator('.widget-stage').count())assert.equal(await page.locator('.collection-cell.is-filled').count(),n);};
  const setTime=async(time,day='2026-10-20')=>{await page.clock.setSystemTime(new Date(`${day}T${time}+08:00`));await page.clock.runFor(1000);};
  const shot=async name=>{await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:path.join(output,name+'.png'),omitBackground:true,animations:'disabled'});};
  const mode=async mode=>{await invoke('set_window_mode',{windowMode:mode});await page.waitForSelector(`[data-window-mode="${mode}"]`);await page.waitForFunction(h=>innerWidth===260&&innerHeight===h,mode==='mini'?108:276);};
  const discreet=async()=>{const text=await page.locator('#root').evaluate(el=>el.textContent+' '+[...el.querySelectorAll('[title],[aria-label]')].map(n=>n.getAttribute('title')+' '+n.getAttribute('aria-label')).join(' '));assert.doesNotMatch(text,/¥|￥|收入|工资|月薪|时薪|日薪|\d+%/);};
  const settings={monthlySalary:8800,workdaysPerMonth:22,workWeekdays:[1,2,3,4,5],workStart:'09:00',workEnd:'18:00',lunchStart:'12:00',lunchEnd:'13:00'};
  try{
    let port=await freePort();app=launch(port);browser=await connect(app,port);page=browser.contexts()[0].pages()[0];
    await page.clock.install({time:new Date('2026-10-20T10:00:00+08:00')});await page.clock.pauseAt(new Date('2026-10-20T10:00:00+08:00'));await page.reload();
    await page.waitForSelector('.settings-shell,[data-work-state]');
    await invoke('save_settings',{settings,displayMode:'amount'});await page.waitForSelector('[data-work-state]');await mode('full');await invoke('set_privacy_mode',{privacyMode:'visible'});
    assert.equal((await data()).displayMode,'amount');assert.equal(await page.locator('.amount').count(),1);
    await page.getByRole('button',{name:'打开设置'}).click();await page.getByLabel('趣味积累',{exact:true}).check();await page.getByRole('button',{name:'保存设置',exact:true}).click();await stage(1);
    assert.equal(JSON.parse(fs.readFileSync(configPath,'utf8')).displayMode,'collection');
    for(const id of ['blue-whale-girl','mibao']){
      await invoke('save_theme',{selectedThemeId:id});await page.waitForSelector(`[data-theme-id="${id}"]`);
      for(const [time,n,name] of [['08:00:00',0,'empty'],['11:24:00',3,'stage-3'],['14:00:00',5,'half'],['18:00:00',10,'full']]){await setTime(time);await stage(n);await discreet();await shot(`${id}-${name}`);}
      await setTime('12:30:00');await stage(3);const held=await page.locator('.collection-vessel').getAttribute('src');await setTime('12:59:00');assert.equal(await page.locator('.collection-vessel').getAttribute('src'),held);await shot(`${id}-lunch`);
      await setTime('14:00:00');await stage(5);
      await page.getByRole('button',{name:/桌宠，点击互动/}).click();await page.waitForSelector('.pet-bubble');await discreet();await page.clock.runFor(1500);
      await page.getByRole('button',{name:'隐私隐藏',exact:true}).click();await page.waitForSelector('.privacy-hidden');assert.equal(await page.locator('.collection,.collection-meter,.collection-count').count(),0);assert.equal(await page.locator('.privacy-question').count(),1);await shot(`${id}-private`);
      await page.getByRole('button',{name:'恢复展示',exact:true}).click();await stage(5);assert.equal(await page.locator('.collection-deposit').count(),0);
      await mode('mini');await stage(5);await discreet();await shot(`${id}-mini-half`);
      for(const [time,n,name] of [['08:00:00',0,'mini-empty'],['18:00:00',10,'mini-full']]){await setTime(time);await stage(n);await shot(`${id}-${name}`);}
      await setTime('14:00:00','2026-10-18');await stage(0);await shot(`${id}-mini-rest`);
      await invoke('set_privacy_mode',{privacyMode:'hidden'});assert.equal(await page.locator('.privacy-question').count(),0);await invoke('set_privacy_mode',{privacyMode:'visible'});await stage(0);
      await mode('full');
    }
    // A true process restart reads Rust's saved display/window/theme/privacy preferences.
    await setTime('14:00:00');await stage(5);await mode('mini');await invoke('set_privacy_mode',{privacyMode:'hidden'});
    await browser.close();browser=null;await stop(app);port=await freePort();app=launch(port);browser=await connect(app,port);page=browser.contexts()[0].pages()[0];
    await page.waitForSelector('.mini-stage.privacy-hidden');assert.equal((await data()).displayMode,'collection');assert.equal((await data()).selectedThemeId,'mibao');assert.equal(await page.locator('.collection').count(),0);
    await page.clock.install({time:new Date('2026-10-20T14:00:00+08:00')});await page.clock.pauseAt(new Date('2026-10-20T14:00:00+08:00'));await page.reload();await page.waitForSelector('.mini-stage.privacy-hidden');
    await page.getByRole('button',{name:'恢复展示',exact:true}).click();await stage(5);assert.equal(await page.locator('.collection-deposit').count(),0);await shot('mibao-mini-restart');
    assert.deepEqual((await data()).settings,settings);
    console.log('PASS Windows WebView2: native atomic save + disk persistence; both themes empty/3/5/10; 260×276 full and 260×108 mini; ten cells and stage copy; lunch hold; rest empty; privacy precedence/question rules; pet interaction; actual process restart restores theme/mode/display/privacy; no historical replay; screenshots from packaged app.');
  }finally{
    if(browser)await browser.close();await stop(app);
    if(backup){fs.writeFileSync(configPath,backup);assert.ok(fs.readFileSync(configPath).equals(backup));}
    else if(fs.existsSync(configPath))fs.unlinkSync(configPath);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
