const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require(path.join(process.argv[2],'playwright'));
const {prepare}=require('./verify-themes.cjs');
const output=path.resolve('docs/ui/collection-characters');fs.mkdirSync(output,{recursive:true});
async function main(){
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const theme of ['blue-whale-girl','mibao'])for(const mode of ['full','mini']){
      const context=await browser.newContext({viewport:{width:260,height:mode==='mini'?108:276},deviceScaleFactor:2,timezoneId:'Asia/Shanghai'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await prepare(page,theme,{displayMode:'collection',windowMode:mode});
      await page.waitForSelector(`[data-theme-id="${theme}"]`);
      const invoke=(cmd,args)=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
      const setTime=async(time,day='2026-10-20')=>{await page.clock.setSystemTime(new Date(`${day}T${time}+08:00`));await page.clock.runFor(1000);};
      const source=selector=>page.locator(selector).getAttribute('src');
      const loaded=()=>page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
      const shot=async name=>{await loaded();await page.screenshot({path:path.join(output,`${theme}-${mode}-${name}.png`),omitBackground:true,animations:'disabled'});};
      const originalWorking=await source('.chibi-awake'),originalFinished=await source('.chibi-after-work'),originalLunch=await source('.chibi-sleeping');
      for(const [time,stage]of [['08:00:00',0],['11:24:00',3],['13:12:00',4],['14:00:00',5],['14:48:00',6],['15:36:00',7],['18:00:00',10]]){
        await setTime(time);await page.waitForSelector(`[data-collection-stage="${stage}"]`);await loaded();
        const src=await source(stage===10?'.chibi-after-work':'.chibi-awake');
        if(theme==='blue-whale-girl'&&(stage===5||stage===10))assert.match(src,new RegExp(`character-${stage===5?'half':'full'}\\.webp`));
        else assert.equal(src,stage===10?originalFinished:originalWorking,'Other stages/themes retain their original art');
        assert.equal(await page.locator('.collection-meter').getAttribute('aria-valuenow'),String(stage));
        assert.deepEqual(await page.evaluate(()=>({width:innerWidth,height:innerHeight})),{width:260,height:mode==='mini'?108:276});
        if(theme==='blue-whale-girl'&&(stage===5||stage===10))await shot(`stage-${stage}`);
      }
      for(const [time,state]of [['12:30:00','lunch'],['14:00:00','working'],['18:00:00','after']]){
        await setTime(time);await page.waitForSelector(`[data-work-state="${state}"]`);
        const stage=state==='after'?10:state==='working'?5:3;
        await page.getByRole('button',{name:'隐私隐藏',exact:true}).click();await page.waitForSelector('.privacy-hidden');
        assert.equal(await source('.chibi-awake'),originalWorking);assert.equal(await source('.chibi-after-work'),originalFinished);
        assert.equal(await source('.chibi-sleeping'),originalLunch);assert.equal(await page.locator('.collection').count(),0);
        assert.equal(await page.locator('.privacy-question').count(),state==='working'?1:0);
        await page.getByRole('button',{name:'恢复展示',exact:true}).click();await page.waitForSelector(`[data-collection-stage="${stage}"]`);
      }
      // A custom lunch can hold stage 5: the sleeping character still wins.
      const settings=await page.evaluate(()=>structuredClone(window.__themeTest.data.settings));
      await invoke('save_settings',{settings:{...settings,lunchStart:'13:00',lunchEnd:'14:00'},displayMode:'collection'});
      await setTime('13:30:00');await page.waitForSelector('.state-lunch');await page.waitForSelector('[data-collection-stage="5"]');
      assert.equal(await source('.chibi-awake'),originalWorking);assert.equal(await source('.chibi-sleeping'),originalLunch);
      await invoke('save_settings',{settings,displayMode:'amount'});
      for(const [time,state]of [['14:00:00','working'],['18:00:00','after']]){
        await setTime(time);await page.waitForSelector(`.state-${state}`);
        assert.equal(await source('.chibi-awake'),originalWorking);assert.equal(await source('.chibi-after-work'),originalFinished);
        assert.equal(await page.locator('.collection').count(),0);assert.equal(await page.locator('.amount,.mini-amount').count(),1);
      }
      await invoke('save_settings',{settings,displayMode:'collection'});await setTime('14:00:00','2026-10-18');await page.waitForSelector('.state-rest_day');
      assert.equal(await source('.chibi-sleeping'),originalLunch);assert.equal(await source('.chibi-awake'),originalWorking);
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: only blue collection stages 5/10 change; stages 0/3/4/6/7, Mibao, full/mini dimensions, lunch at stage 5, privacy/questions, amount working/after and rest-day original art remain unchanged. Screenshots saved.');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
