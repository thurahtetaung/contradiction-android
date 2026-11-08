// Read-only by default; an explicitly supplied expression can inspect a test device.
const fs = require('fs');
(async () => {
  const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
  const page = pages.find((page) =>
    page.url.includes('game.contradiction.local'),
  );
  if (!page) throw Error('No connected game WebView');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const expression =
    (process.argv[2] === '--file'
      ? fs.readFileSync(process.argv[3], 'utf8')
      : process.argv[2]) ||
    `JSON.stringify({pane:window.mobileUI?.pane,clockPaused:window.mobileClock?.paused,video:{ready:vplayer.readyState,error:vplayer.error?.message,time:vplayer.currentTime,duration:vplayer.duration,paused:vplayer.paused,width:vplayer.videoWidth},state:{started,abled,toolson},viewport:{width:innerWidth,height:innerHeight}})`;
  socket.onmessage = (event) => {
    const result = JSON.parse(event.data);
    if (result.id === 1) {
      socket.close();
      if (result.error || result.result?.exceptionDetails) {
        console.error(result.error || result.result.exceptionDetails);
        process.exitCode = 1;
      } else console.log(result.result?.result?.value);
    }
  };
  socket.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
