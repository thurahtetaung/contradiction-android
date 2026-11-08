(() => {
  const controls = document.createElement('nav');
  controls.id = 'mobile-controls'; controls.setAttribute('aria-label', 'Game controller');
  controls.innerHTML = '<div class="control-group">' +
    [[0,'◀'],[2,'▲'],[3,'▼'],[1,'▶']].map(([k,t]) => `<button data-key="${k}" aria-label="${['Left','Right','Up','Down'][k]}">${t}</button>`).join('') +
    '</div><div class="control-group"><button data-key="4">A<small>Menu / Back</small></button><button data-key="5">Enter<small>Select / Items</small></button><button data-key="6">S<small>Use / Search</small></button><button data-key="7">D<small>Map / Replay</small></button></div>' +
    '<div class="control-group"><button id="mobile-captions" aria-label="Toggle captions">CC</button><button id="mobile-help" aria-label="Controls help">?</button></div>';
  document.body.appendChild(controls);
  let held = null;
  controls.addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-key]');
    if (!button || held !== null) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    held = event.pointerId; gokeys(KY[Number(button.dataset.key)]);
  });
  function release(event) { if (held === event.pointerId) { held = null; keyup(); } }
  controls.addEventListener('pointerup', release); controls.addEventListener('pointercancel', release);
  controls.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => { held = null; keyup(); });
  document.getElementById('mobile-captions').onclick = () => { gokeys(67); keyup(); };
  function message(text) {
    if (document.getElementById('mobile-message')) return;
    const box = document.createElement('div'); box.id = 'mobile-message'; box.setAttribute('role','dialog');
    const p = document.createElement('p'); p.textContent = text; box.appendChild(p);
    const close = document.createElement('button'); close.textContent = 'Continue'; close.onclick = () => box.remove();
    box.appendChild(close); document.body.appendChild(box);
  }
  document.getElementById('mobile-help').onclick = () => message('Use arrows to move or highlight menu options. Enter selects, opens items, and asks questions. A opens the menu or goes back. S searches or uses an item. D opens the map or replays an answer. Labels match the game’s instructions; actions depend on context. At the opening menu, tap Enter on Start Game. Android Back offers Save and exit.');
  function fit() {
    const height = Math.max(100, innerHeight - controls.offsetHeight);
    winh = height; winw = Math.min(innerWidth, height * 16 / 9);
    seth = winw * 9 / 16; vm = mvm = winw / 1024; fixit();
    document.getElementById('wrap').style.left = ((innerWidth - winw) / 2) + 'px';
  }
  gofull = gosmall = fit;
  window.addEventListener('resize', fit); fit();
  // canplaythrough is not dependable with a multi-hour, externally stored video.
  vplayer.addEventListener('loadeddata', () => { if (started === 1) turnoff('splash'); });
  vplayer.addEventListener('error', () => message('Video playback failed. Use Android Back → Import video again and select the original MCMV.mp4.'));
  const playing = [];
  let suspended = false;
  window.mobileSuspend = () => {
    if (suspended) return;
    suspended = true;
    if (started === 0) saver('game');
    held = null; keyup(); playing.length = 0;
    document.querySelectorAll('video,audio').forEach(media => { if (!media.paused) playing.push(media); media.pause(); });
  };
  window.mobileResume = () => { suspended = false; playing.splice(0).forEach(media => media.play()); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) mobileSuspend(); else mobileResume(); });
  words('meninfo', 'Touch controller below · ? for help · CC for captions · Android Back to save and exit');
  message('Android prototype: wait for the opening logo, then tap Enter on Start Game. Tap ? for controls. A opens the menu during play. Saves stay on this device.');
})();
