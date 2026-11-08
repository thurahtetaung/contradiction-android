// Read or exercise the emulator WebView through an adb-forwarded devtools socket.
const fs = require('fs');
(async () => {
  const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
  const socket = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {socket.onopen=resolve;socket.onerror=reject});
  let id = 0; const pending = new Map();
  socket.onmessage = event => {const data=JSON.parse(event.data); if(pending.has(data.id)) { pending.get(data.id)(data);pending.delete(data.id); }};
  async function evaluate(expression) {
    const key=++id; const answer=new Promise(resolve=>pending.set(key,resolve));
    socket.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));
    const result=await answer;
    if(result.result?.exceptionDetails) throw Error(JSON.stringify(result.result.exceptionDetails));
    return result.result?.result?.value;
  }
  async function call(method,params) {
    const key=++id; const answer=new Promise(resolve=>pending.set(key,resolve));
    socket.send(JSON.stringify({id:key,method,params}));
    const result=await answer; if(result.error) throw Error(JSON.stringify(result.error)); return result;
  }
  if (process.argv[2] === '--smoke') {
    function assert(ok, text) { if (!ok) throw Error(text); console.log('PASS: ' + text); }
    await evaluate("document.querySelector('#mobile-message button')?.click()");
    assert(await evaluate('vplayer.readyState >= 2 && vplayer.videoWidth === 1280'), 'Original video decoded on Android');
    async function tap(selector) {
      const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
      await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await tap('[data-key="5"]');
    await new Promise(r=>setTimeout(r,5500));
    assert(await evaluate('started === 0'), 'Touch Enter starts the game');
    await tap('#mobile-captions');
    assert(await evaluate('subon === 1 && vplayer.textTracks[0].mode === "showing"'), 'Touch CC enables subtitles');
    const ranged=await evaluate(`(async()=>{const r=await fetch(vplayer.currentSrc,{headers:{Range:'bytes=2300000000-2300000031'}});return {status:r.status,bytes:[...new Uint8Array(await r.arrayBuffer())]}})()`);
    const original=fs.openSync(require('path').join(__dirname,'../Windows/gfx/MCMV.mp4'),'r');
    const expected=Buffer.alloc(32);fs.readSync(original,expected,0,32,2300000000);fs.closeSync(original);
    assert(ranged.status===206 && Buffer.from(ranged.bytes).equals(expected), 'Reads past 2 GiB match original video');
    const seek=await evaluate(`new Promise((resolve,reject)=>{clearInterval(vidInt);const timeout=setTimeout(()=>reject(Error('Seek timeout')),15000);vplayer.addEventListener('seeked',()=>{clearTimeout(timeout);resolve(vplayer.currentTime)},{once:true});vplayer.currentTime=11000;vplayer.play()})`);
    assert(Math.abs(seek-11000)<2, 'Video seeks to a distant scene');
    assert(await evaluate(`(()=>{saver('Save1');return localStorage.Save1?.endsWith('END')})()`), 'Manual local save created');
    assert(await evaluate(`(()=>{mobileSuspend();mobileSuspend();return localStorage.game?.endsWith('END') && vplayer.paused})()`), 'Background saves and pauses media');
    await evaluate('mobileResume();loader("Save1")');
    await new Promise(r=>setTimeout(r,1500));
    assert(await evaluate('started === 0 && document.getElementById("place").textContent.length > 0'), 'Saved game loads into a location');
    socket.close(); return;
  }
  const expression = (process.argv[2] === '--file' ? fs.readFileSync(process.argv[3],'utf8') : process.argv[2]) || `JSON.stringify({video:{ready:vplayer.readyState,error:vplayer.error?.message,time:vplayer.currentTime,duration:vplayer.duration,paused:vplayer.paused,width:vplayer.videoWidth},state:{started,abled,toolson,menpos,menver},splash:getComputedStyle(document.getElementById('splash')).display,controls:document.querySelectorAll('[data-key]').length})`;
  console.log(await evaluate(expression));
  socket.close();
})().catch(e=>{console.error(e);process.exit(1)});
