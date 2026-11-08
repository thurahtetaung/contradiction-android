/* Desktop platform adapter. Steam is unavailable; the game uses its own local saves. */
// Pause story timers with remaining delays; UI timers use the native clock.
(() => {
  const timeout = window.setTimeout.bind(window),
    cancel = window.clearTimeout.bind(window);
  const timers = new Map();
  let sequence = 0,
    paused = false;
  function arm(record) {
    record.due = performance.now() + record.remaining;
    record.native = timeout(() => {
      if (!timers.has(record.id)) return;
      if (!record.repeat) timers.delete(record.id);
      else record.remaining = record.delay;
      try {
        if (typeof record.callback === 'function')
          record.callback(...record.args);
        else window.eval(record.callback);
      } finally {
        if (record.repeat && timers.has(record.id) && !paused) {
          record.remaining = Math.max(
            0,
            record.due + record.delay - performance.now(),
          );
          arm(record);
        }
      }
    }, record.remaining);
  }
  function create(callback, delay, args, repeat) {
    const record = {
      id: ++sequence,
      callback,
      args,
      repeat,
      delay: Math.max(0, Number(delay) || 0),
      remaining: Math.max(0, Number(delay) || 0),
      native: 0,
    };
    timers.set(record.id, record);
    if (!paused) arm(record);
    return record.id;
  }
  window.setTimeout = (callback, delay, ...args) =>
    create(callback, delay, args, false);
  window.setInterval = (callback, delay, ...args) =>
    create(callback, delay, args, true);
  window.clearTimeout = window.clearInterval = (id) => {
    const record = timers.get(id);
    if (record) {
      cancel(record.native);
      timers.delete(id);
    }
  };
  window.mobileClock = {
    uiTimeout: timeout,
    clearUiTimeout: cancel,
    pause() {
      if (paused) return;
      paused = true;
      for (const record of timers.values()) {
        record.remaining = Math.max(0, record.due - performance.now());
        cancel(record.native);
      }
    },
    resume() {
      if (!paused) return;
      paused = false;
      for (const record of timers.values()) arm(record);
    },
    get paused() {
      return paused;
    },
  };
})();
window.require = function (name) {
  if (name === 'nw.gui')
    return {
      Window: {
        get: () => ({
          enterFullscreen() {},
          leaveFullscreen() {},
          show() {},
          focus() {},
          on(event, fn) {
            window.addEventListener(event, fn);
          },
        }),
      },
      Clipboard: { get: () => ({ get: () => '', set() {} }) },
    };
  if (name === './greenworks') return { initAPI: () => false };
  throw new Error('Unsupported desktop module: ' + name);
};
// Older game code ignores play() promises. Surface real media failures separately.
const originalPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  // Already playing media needs no second decoder/playback request. Changing a
  // source resets readyState, so newly loaded clips still follow the normal path.
  if (!this.paused && !this.ended && this.readyState >= 2)
    return Promise.resolve();
  const result = originalPlay.call(this);
  if (result)
    result.catch((error) => {
      if (error.name !== 'AbortError' && error.name !== 'NotAllowedError')
        console.error(error);
    });
  return result;
};
