(() => {
  document.documentElement.classList.add('modern-ui');
  function fit() {
    winw = innerWidth;
    winh = innerHeight;
    seth = winh;
    vm = mvm = winw / 1024;
    fixit();
    document.getElementById('wrap').style.left = '0px';
  }
  gofull = gosmall = fit;
  window.addEventListener('resize', fit);
  fit();
  const reasons = new Set(),
    playing = new Set();
  window.mobileForgetMedia = (media) => playing.delete(media);
  window.mobilePause = (reason) => {
    if (reasons.has(reason)) return;
    if (!reasons.size) {
      playing.clear();
    }
    document.querySelectorAll('video,audio').forEach((media) => {
      if (!media.paused) playing.add(media);
      media.pause();
    });
    mobileClock.pause();
    reasons.add(reason);
  };
  window.mobileUnpause = (reason) => {
    reasons.delete(reason);
    if (!reasons.size) {
      mobileClock.resume();
      for (const media of playing) media.play();
      playing.clear();
    }
  };
  window.mobileSuspend = () => {
    if (started === 0) saver('game');
    mobilePause('background');
  };
  window.mobileResume = () => mobileUnpause('background');
  document.addEventListener('visibilitychange', () =>
    document.hidden ? mobileSuspend() : mobileResume(),
  );
  vplayer.addEventListener('loadeddata', () => {
    if (started === 1) {
      vplayer.currentTime = 12;
      holdgame();
      turnoff('splash');
    }
  });
  vplayer.addEventListener('error', () =>
    window.mobileNotify?.(
      'The video could not be played. Import the original again from Settings.',
    ),
  );
})();
