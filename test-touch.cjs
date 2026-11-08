const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
let playwright;
try { playwright = require('playwright-core'); } catch { playwright = require('../../.tools/package'); }
const {chromium} = playwright;
const assets = path.join(__dirname, 'app/src/main/assets/game');
const gameRoot=process.env.CONTRADICTION_GAME_DIR || path.resolve(__dirname,'../Windows');
const movie = path.join(gameRoot, 'gfx/MCMV.mp4');
const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.mp4':'video/mp4','.vtt':'text/vtt'};
const server = http.createServer((req,res) => {
  const name = decodeURIComponent(new URL(req.url,'http://local').pathname).slice(1) || 'index.html';
  const file = name === 'gfx/MCMV.mp4' ? movie : path.join(assets,name);
  if (!file.startsWith(assets) && file !== movie) {res.writeHead(403).end();return;}
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404).end();return;}
  const length = fs.statSync(file).size;
  let start=0,end=length-1,status=200;
  if (req.headers.range) {
    const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range);
    if (match) {start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;status=206;}
  }
  res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Accept-Ranges','bytes'); res.setHeader('Content-Length',end-start+1);
  if (status===206) res.setHeader('Content-Range',`bytes ${start}-${end}/${length}`);
  res.writeHead(status);
  const stream=fs.createReadStream(file,{start,end}); stream.pipe(res); res.on('close',()=>stream.destroy());
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browserPath=process.env.CHROME_PATH || (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);
  const browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  try {
    const context=await browser.newContext({viewport:{width:960,height:540},hasTouch:true,isMobile:true});
    if (process.argv.includes('--profile')) await context.addInitScript(()=>{
      window.profileCounts={animationFrames:0,menuPolls:0};
      const frame=requestAnimationFrame.bind(window);
      window.requestAnimationFrame=callback=>frame(time=>{profileCounts.animationFrames++;callback(time)});
      const interval=setInterval.bind(window);
      window.setInterval=(callback,delay,...args)=>interval((...values)=>{if(delay===100)profileCounts.menuPolls++;callback(...values)},delay,...args);
    });
    const page=await context.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof gokeys==='function' && typeof mobileSuspend==='function');
    await page.evaluate(()=>{
      document.getElementById('mobile-message')?.remove();
      clearInterval(vidInt); started=2;abled=1;toolson=1;tipon=0;recalled=0;greenon=greenops=0;menpos=1;respos();
    });
    if (process.argv.includes('--profile')) {
      await page.waitForTimeout(1500);
      const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
      const before=await cdp.send('Performance.getMetrics');
      await page.evaluate(()=>{profileCounts.animationFrames=profileCounts.menuPolls=0});
      await page.waitForTimeout(3000);
      const after=await cdp.send('Performance.getMetrics');
      const metric=(data,name)=>data.metrics.find(item=>item.name===name).value;
      const counts=await page.evaluate(()=>({...profileCounts,filter:getComputedStyle(document.getElementById('vidbox')).filter,videoWidth:vplayer.videoWidth,videoHeight:vplayer.videoHeight}));
      const report={fixture:'Idle menu with original video playing in desktop headless Chromium; 3-second sample; not a phone power measurement',...counts,taskMilliseconds:Math.round((metric(after,'TaskDuration')-metric(before,'TaskDuration'))*10000)/10};
      const output=process.argv[process.argv.indexOf('--profile')+1];
      if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')}
      console.log(JSON.stringify(report));
    } else if (process.argv.includes('--baseline')) {
      await page.locator('[data-key="3"]').tap();
      await page.locator('[data-key="5"]').tap();
      assert.equal(await page.evaluate(()=>greenops),6);
      await page.locator('[data-key="0"]').tap();
      assert.deepEqual(await page.evaluate(()=>[greenops,menver]),[0,1]);
      await page.locator('[data-key="5"]').tap();
      assert.equal(await page.evaluate(()=>greenops),6);
      console.log('REPRODUCED: arrow dismisses confirmation but leaves Save Game 1 selected; Enter opens it again.');
    } else {
      await runTouchTests(page);
    }
    assert.deepEqual(errors,[], 'No uncaught page errors');
  } finally {await browser.close();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1});
async function runTouchTests(page) {
  const pass=text=>console.log('PASS: '+text);
  await page.locator('#touch-menu').waitFor({state:'visible'});
  await page.evaluate(()=>{
    window.testSaves=[]; const save=saver;
    saver=function(slot){testSaves.push(slot);return save(slot)};
  });
  const row=index=>page.locator(`#touch-menu-rows [data-row="${index}"]`);
  await row(1).tap();
  assert.equal(await page.locator('#touch-confirm h2').textContent(),'Save Game 1?');
  // A tap aimed at an underlying control must be absorbed by the modal.
  const behind=await page.locator('[data-key="5"]').boundingBox();
  await page.touchscreen.tap(behind.x+behind.width/2,behind.y+behind.height/2);
  assert.deepEqual(await page.evaluate(()=>testSaves),[]);
  await page.locator('#touch-confirm-cancel').tap();
  assert.equal(await page.locator('#touch-confirm').count(),0);
  await page.locator('[data-tab="0"]').tap();
  await page.locator('[data-tab="1"]').tap();
  assert.equal(await page.locator('#touch-confirm').count(),0);
  assert.deepEqual(await page.evaluate(()=>testSaves),[]);
  pass('Cancel and unrelated taps never save or reopen Save Game 1');
  await row(1).tap();await page.locator('#touch-confirm-accept').tap();
  assert.deepEqual(await page.evaluate(()=>testSaves),['Save1']);
  assert.equal(await page.evaluate(()=>localStorage.Save1.endsWith('END')),true);
  assert.equal(await row(3).isEnabled(),true);
  pass('Save Game 1 writes once and enables its Load button');
  await row(2).tap();await page.locator('#touch-confirm-cancel').tap();
  assert.equal(await page.evaluate(()=>localStorage.Save2===undefined),true);
  await row(2).tap();await page.locator('#touch-confirm-accept').tap();
  assert.deepEqual(await page.evaluate(()=>testSaves),['Save1','Save2']);
  pass('Save Game 2 is independent; Cancel keeps the slot unchanged');
  await row(1).tap();await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>testSaves),['Save1','Save2','Save1']);
  assert.equal(await page.locator('#touch-confirm').count(),0);
  pass('Keyboard fallback confirms once without activating the focused button twice');
  await row(5).tap();await page.locator('#touch-confirm-cancel').tap();
  assert.equal(await page.evaluate(()=>resetting),0);
  pass('Cancel reset preserves progress');
  await page.locator('[data-tab="0"]').tap();
  await row(4).tap();
  assert.equal(await page.evaluate(()=>greenops),0);
  assert.equal(await page.evaluate(()=>new Set(KY).size),8);
  await page.locator('#mobile-message button').tap();
  pass('Touch controls help cannot overwrite keyboard bindings');
  await page.locator('[data-tab="1"]').tap();
  await page.evaluate(()=>{menver=1;opos();gokeys(KY[5]);keyup()});
  assert.equal(await page.locator('#touch-confirm h2').textContent(),'Save Game 1?');
  await page.locator('#touch-confirm-cancel').tap();
  assert.equal(await page.evaluate(()=>greenops),0);
  pass('Legacy controller path also uses the new confirmation');
  await row(3).tap();await page.locator('#touch-confirm-cancel').tap();
  assert.equal(await page.evaluate(()=>started),2);
  // Exercise touch Start with real story functions, then dismiss the tutorial.
  await row(0).tap();
  assert.equal(await page.evaluate(()=>started),0);
  await page.waitForTimeout(5500);
  await page.evaluate(()=>{tipon=0;tip=8;abled=1;topoff('tipbox')});
  pass('Touch Start enters the story');
  await page.evaluate(()=>{openwood();menpos=1;respos();window.testLoads=[];const load=loader;loader=slot=>{testLoads.push(slot);load(slot)}});
  await page.locator('#touch-menu').waitFor({state:'visible'});
  await row(3).tap();await page.locator('#touch-confirm-accept').tap();
  await page.waitForTimeout(1600);
  assert.deepEqual(await page.evaluate(()=>testLoads),['Save1']);
  assert.deepEqual(await page.evaluate(()=>[toolson,greenops]),[0,0]);
  assert.equal(await page.locator('#touch-confirm').count(),0);
  pass('Load confirmation loads its chosen slot and leaves the menu');
  // Probe hit testing through the original invisible overlapping desktop layers.
  await page.evaluate(()=>{
    window.testMoves=[];movebut=index=>testMoves.push(index);
    toolson=baron=invon=mapon=0;abled=1;arrowops[0]='test scene';
    const node=document.getElementById('op_A');node.style.cssText='position:absolute;left:20%;top:30%;width:20%;height:20%;opacity:1';
    topon('mainview');topon('paths');
  });
  await page.locator('#touch-menu').waitFor({state:'hidden'});
  await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('paths')).opacity)>0.9);
  const arrow=await page.locator('#op_A').boundingBox();
  await page.touchscreen.tap(arrow.x+arrow.width/2,arrow.y+arrow.height/2);
  assert.deepEqual(await page.evaluate(()=>testMoves),[0]);
  await page.evaluate(()=>{abled=0});
  await page.touchscreen.tap(arrow.x+arrow.width/2,arrow.y+arrow.height/2);
  assert.deepEqual(await page.evaluate(()=>testMoves),[0]);
  pass('Scene taps respect direction and busy state');
  await page.evaluate(()=>{
    abled=1;baron=1;topon('topbar');topon('itgfx');
    document.getElementById('itgfx').style.left='0%';window.testItems=[];select=item=>testItems.push(item);
  });
  await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('topbar')).opacity)>0.9);
  const item=await page.locator('#itgfx img').first().boundingBox();
  await page.touchscreen.tap(item.x+item.width/2,item.y+item.height/2);
  assert.equal(await page.evaluate(()=>testItems[0]===itco[0]),true);
  pass('Inventory pictures select their own item');
  await page.evaluate(()=>{
    invon=baron=1;curchar=simon;abled=1;toolson=mapon=tipon=exon=0;canask=1;askabled=0;repno=2;reptot=3;prenon=1;
    window.testPairs=[];pairit=()=>testPairs.push(pren);
    const text=document.getElementById('reptext');text.style.top='0%';text.innerHTML='<div style="position:absolute;top:6.5%;width:100%;height:10%">First reply</div><div style="position:absolute;top:16.5%;width:100%;height:10%">Second reply</div>';
    topon('botbar');topon('repbox');topon('reptext');
  });
  await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('reptext')).opacity)>0.9 && Number(getComputedStyle(document.getElementById('botbar')).opacity)>0.9);
  const reply=await page.locator('#reptext > div').nth(1).boundingBox();
  await page.touchscreen.tap(reply.x+reply.width/2,reply.y+reply.height/2);
  assert.deepEqual(await page.evaluate(()=>testPairs),[1]);
  pass('Tapping a suspect reply selects the correct contradiction candidate');
  assert.equal(await page.evaluate(()=>{const e=new Event('contextmenu',{cancelable:true,bubbles:true});document.body.dispatchEvent(e);return e.defaultPrevented}),true);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).userSelect),'none');
  pass('Text selection and context menus are suppressed');
  await page.evaluate(()=>{
    toolson=1;greenops=greenon=0;tipon=recalled=0;abled=1;menpos=3;respos();
    document.getElementById('scenetext').innerHTML=Array.from({length:24},(_,index)=>`<div>Recorded event ${index+1}</div>`).join('');
  });
  await page.locator('#touch-menu').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('#touch-menu-rows button').length===24);
  const list=await page.locator('#touch-menu-rows').boundingBox();
  const session=await page.context().newCDPSession(page);
  const x=list.x+list.width/2;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:list.y+list.height-20,id:2}]});
  for(let step=1;step<=8;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:list.y+list.height-20-step*25,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.getElementById('touch-menu-rows').scrollTop>20);
  pass('Long event menus scroll with a finger gesture');
  await page.evaluate(()=>{localStorage.keys='037'.repeat(8)});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof mobileSuspend==='function' && document.getElementById('touch-menu'));
  assert.equal(await page.evaluate(()=>new Set(KY).size),8);
  assert.equal(await page.evaluate(()=>!!localStorage.Save1 && !!localStorage.Save2),true);
  pass('Ambiguous virtual bindings repair on restart while save slots persist');
  await page.waitForFunction(()=>itco.length>=2);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('vidbox')).filter),'none');
  await page.evaluate(()=>{avsat=4;satit()});
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.getElementById('vidbox')).filter),'none');
  await page.evaluate(()=>{avsat=5;satit();select(itco[0])});
  await page.waitForFunction(()=>ikpos===20*ipos);
  assert.equal(await page.evaluate(()=>parseFloat(document.getElementById('itgfx').style.left)===20*ipos),true);
  await page.evaluate(()=>{
    window.inventoryIdleFrames=0;window.savedFrame=requestAnimationFrame;
    window.requestAnimationFrame=callback=>savedFrame(time=>{if(callback.name==='animateInventory')inventoryIdleFrames++;callback(time)});
  });
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>inventoryIdleFrames),0);
  await page.evaluate(()=>requestAnimationFrame=savedFrame);
  pass('Inventory animation settles and stops; neutral filter skips GPU work while colour controls still work');
}
