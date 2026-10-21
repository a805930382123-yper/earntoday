const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.join(process.argv[2], 'playwright'));
const { prepare } = require('./verify-themes.cjs');
const output = path.resolve('docs/ui/collection-browser');
fs.mkdirSync(output,{recursive:true});
async function main() {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    for (const id of ['blue-whale-girl','mibao']) {
      const context = await browser.newContext({viewport:{width:260,height:276},deviceScaleFactor:2,timezoneId:'Asia/Shanghai'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await prepare(page,id);
      const invoke=(cmd,args)=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
      const data=()=>page.evaluate(()=>structuredClone(window.__themeTest.data));
      const setTime=async(time,day='2026-10-20')=>{await page.clock.setSystemTime(new Date(`${day}T${time}+08:00`));await page.clock.runFor(1000);};
      const stage=async n=>{
        await page.waitForSelector(`[data-collection-stage="${n}"]`);
        assert.equal(await page.locator('.collection-meter').getAttribute('aria-valuenow'),String(n));
        assert.match(await page.locator('.collection-count').textContent(),new RegExp(`${n}/10$`));
        if(await page.locator('.mini-stage').count()) assert.equal(await page.locator('.collection-meter-icon').count(),1);
        else {assert.equal(await page.locator('.collection-cell').count(),10);assert.equal(await page.locator('.collection-cell.is-filled').count(),n);}
      };
      const shot=async name=>{await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:path.join(output,`${id}-${name}.png`),omitBackground:true,animations:'disabled'});};
      const assertDiscreet=async()=>{
        const content=await page.locator('#root').evaluate(el=>el.textContent+' '+[...el.querySelectorAll('[title],[aria-label]')].map(n=>n.getAttribute('title')+' '+n.getAttribute('aria-label')).join(' '));
        assert.doesNotMatch(content,/¥|￥|今天已.*赚|工资|月薪|日薪|时薪|收入|\d+%/);
        assert.equal(await page.locator('.amount,.mini-amount,.money-label,.progress-percent').count(),0);
      };
      assert.equal((await data()).displayMode,'amount');
      assert.equal(await page.locator('.amount').count(),1);
      await page.getByRole('button',{name:'打开设置'}).click();
      await page.getByLabel('趣味积累',{exact:true}).check();
      assert.equal((await data()).displayMode,'amount','draft does not save immediately');
      await shot('settings');
      const layout=await page.locator('.settings-shell').evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight,card:el.firstElementChild.getBoundingClientRect().toJSON(),save:el.querySelector('.primary-btn').getBoundingClientRect().toJSON()}));
      assert.ok(layout.scroll<=layout.client,`settings fit in 400×600: ${JSON.stringify(layout)}`);
      await page.getByRole('button',{name:'保存设置',exact:true}).click();
      await page.waitForSelector('.collection-mode');
      const original=(await data()).settings;
      await page.evaluate(()=>{window.__deposits=0;new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1&&(n.matches('.collection-deposit')||n.querySelector('.collection-deposit')))window.__deposits++;}).observe(document.getElementById('root'),{childList:true,subtree:true});});
      for(const [time,n,name] of [['08:00:00',0,'empty'],['11:24:00',3,'stage-3'],['14:00:00',5,'half'],['18:00:00',10,'full']]) {
        await setTime(time);await stage(n);await assertDiscreet();await shot(name);
      }
      assert.equal(await page.evaluate(()=>window.__deposits),0,'large time jumps never replay');
      await setTime('09:47:58');await stage(0);await page.clock.runFor(1000);await stage(1);
      assert.equal(await page.evaluate(()=>window.__deposits),1,'one normal boundary deposits once');
      assert.equal(await page.locator('.collection-copy').textContent(),id==='mibao'?'小鱼干 +1！':'饭饭 +1！');
      await page.clock.runFor(1000);await page.locator('.collection-deposit').waitFor({state:'detached'});
      await page.locator('.collection-feedback-lifetime').waitFor({state:'detached'});
      assert.equal(await page.locator('.collection-copy').textContent(),id==='mibao'?'喵！小鱼干慢慢变多啦！':'饭饭一点点变多啦～');
      assert.equal(await page.evaluate(()=>window.__deposits),1);
      await setTime('12:00:00');await stage(3);await setTime('12:59:00');await stage(3);assert.equal(await page.locator('.collection-deposit').count(),0);
      assert.match(await page.locator('.chibi-sleeping').getAttribute('src'),id==='mibao'?/mibao\/lunch/:/sleeping/);
      await shot('lunch');
      await setTime('14:00:00');await stage(5);
      await page.getByRole('button',{name:'隐私隐藏',exact:true}).click();
      await page.waitForSelector('.privacy-hidden');assert.equal(await page.locator('.collection').count(),0);
      assert.equal(await page.locator('.privacy-question').count(),1);await shot('private');
      await page.getByRole('button',{name:'恢复展示',exact:true}).click();await stage(5);await assertDiscreet();
      await page.getByRole('button',{name:/桌宠，点击互动/}).click();await assertDiscreet();await page.clock.runFor(1500);
      await page.getByRole('button',{name:'进入迷你模式'}).click();await page.waitForSelector('.mini-stage');await stage(5);await assertDiscreet();await shot('mini-half');
      for(const [time,n,name] of [['08:00:00',0,'mini-empty'],['18:00:00',10,'mini-full']]) {await setTime(time);await stage(n);await shot(name);}
      await setTime('14:00:00','2026-10-18');await stage(0);assert.equal(await page.locator('.privacy-question').count(),0);await shot('mini-rest');
      await page.getByRole('button',{name:'隐私隐藏',exact:true}).click();await page.waitForSelector('.privacy-hidden');assert.equal(await page.locator('.privacy-question').count(),0);
      await page.getByRole('button',{name:'恢复展示',exact:true}).click();await stage(0);
      await page.getByRole('button',{name:'恢复完整模式'}).click();
      await setTime('14:00:00');await stage(5);
      await invoke('save_theme',{selectedThemeId:id==='mibao'?'blue-whale-girl':'mibao'});
      await page.waitForSelector(`[data-theme-id="${id==='mibao'?'blue-whale-girl':'mibao'}"]`);await stage(5);
      assert.equal(await page.locator('.collection-deposit').count(),0);assert.deepEqual((await data()).settings,original);
      await page.getByRole('button',{name:'打开设置'}).click();await page.getByLabel('上班时间',{exact:true}).fill('08:00');await page.getByRole('button',{name:'保存设置',exact:true}).click();await stage(5);assert.equal(await page.locator('.collection-deposit').count(),0);
      await page.getByRole('button',{name:'打开设置'}).click();await page.getByLabel('实时金额',{exact:true}).check();await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.waitForSelector('.amount');
      assert.ok(Math.abs(Number((await page.locator('.amount').textContent()).replace(/[¥,]/g,''))-222.22)<.1,'amount still uses the original effective work calculation');
      assert.deepEqual(errors,[]);await context.close();
    }
    const context=await browser.newContext({viewport:{width:260,height:108},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
    const page=await context.newPage();await prepare(page,'mibao',{displayMode:'collection',windowMode:'mini'});
    await page.clock.setSystemTime(new Date('2026-10-20T09:47:59+08:00'));await page.clock.runFor(1000);await page.clock.runFor(1000);
    assert.equal(await page.locator('.collection-deposit').count(),0);
      console.log('PASS: both themes / 11-stage source art / 10 themed cells and mini icon+count / stage copy + one-second deposit feedback / empty-3-half-full / full-mini / default + draft + save / discreet DOM and tooltips / single-boundary animation / lunch-rest-after / privacy priority + question / click interaction / theme + settings change / time jump / reduced motion; actual browser screenshots saved.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
