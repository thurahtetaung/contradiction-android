// Read-only 10-second foreground WebView measurement via adb-forwarded CDP.
const fs=require('fs');
(async()=>{
  const pages=await(await fetch('http://127.0.0.1:9223/json')).json();
  const page=pages.find(page=>page.url.includes('game.contradiction.local'));
  if(!page)throw Error('Open the game before profiling');
  const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  let id=0;const pending=new Map();
  socket.onmessage=event=>{const result=JSON.parse(event.data);if(pending.has(result.id)){pending.get(result.id)(result);pending.delete(result.id)}};
  async function call(method,params={}){const key=++id;const reply=new Promise(resolve=>pending.set(key,resolve));socket.send(JSON.stringify({id:key,method,params}));const result=await reply;if(result.error)throw Error(JSON.stringify(result.error));return result.result}
  async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value}
  await evaluate(`(()=>{
    if(window.phoneProfileStop)phoneProfileStop();
    window.phoneProfile={animationFrames:0,menuAttributeWrites:0};
    const original=requestAnimationFrame;
    const measured=callback=>original.call(window,time=>{phoneProfile.animationFrames++;callback(time)});
    window.requestAnimationFrame=measured;
    const observer=new MutationObserver(records=>phoneProfile.menuAttributeWrites+=records.length);
    const menu=document.getElementById('touch-menu');
    if(menu)observer.observe(menu,{attributes:true,attributeFilter:['hidden']});
    window.phoneProfileStop=()=>{if(requestAnimationFrame===measured)requestAnimationFrame=original;observer.disconnect();delete window.phoneProfileStop};
  })()`);
  await call('Performance.enable');
  const before=await call('Performance.getMetrics');
  const playbackBefore=await evaluate('({frames:vplayer.getVideoPlaybackQuality().totalVideoFrames,dropped:vplayer.getVideoPlaybackQuality().droppedVideoFrames})');
  console.log('Measuring foreground playback for 10 seconds...');
  await new Promise(resolve=>setTimeout(resolve,10000));
  const after=await call('Performance.getMetrics');
  const state=await evaluate(`({counts:phoneProfile,filter:getComputedStyle(document.getElementById('vidbox')).filter,video:{width:vplayer.videoWidth,height:vplayer.videoHeight,paused:vplayer.paused,frames:vplayer.getVideoPlaybackQuality().totalVideoFrames,dropped:vplayer.getVideoPlaybackQuality().droppedVideoFrames},state:{started,toolson,baron},appVersion:${JSON.stringify(process.argv[2]||'unknown')}})`);
  await evaluate('phoneProfileStop()');socket.close();
  const metric=(data,name)=>data.metrics.find(item=>item.name===name).value;
  const report={...state,seconds:10,jsTaskMilliseconds:Math.round((metric(after,'TaskDuration')-metric(before,'TaskDuration'))*10000)/10,videoFramesDuringSample:state.video.frames-playbackBefore.frames,droppedFramesDuringSample:state.video.dropped-playbackBefore.dropped,limitations:'Single short S25+ sample while USB charging; CPU work counters are not energy or temperature measurements.'};
  console.log(JSON.stringify(report));
  if(process.argv[3]){fs.mkdirSync(require('path').dirname(process.argv[3]),{recursive:true});fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n')}
})().catch(error=>{console.error(error);process.exitCode=1});
