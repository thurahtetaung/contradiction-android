/* Desktop platform adapter. Steam is unavailable; the game uses its own local saves. */
window.require = function (name) {
  if (name === 'nw.gui') return {
    Window: {get: () => ({enterFullscreen() {}, leaveFullscreen() {}, show() {}, focus() {},
      on(event, fn) { window.addEventListener(event, fn); }})},
    Clipboard: {get: () => ({get: () => '', set() {}})}
  };
  if (name === './greenworks') return {initAPI: () => false};
  throw new Error('Unsupported desktop module: ' + name);
};
// Older game code ignores play() promises. Surface real media failures separately.
const originalPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  // Already playing media needs no second decoder/playback request. Changing a
  // source resets readyState, so newly loaded clips still follow the normal path.
  if (!this.paused && !this.ended && this.readyState >= 2) return Promise.resolve();
  const result = originalPlay.call(this);
  if (result) result.catch(error => {
    if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') console.error(error);
  });
  return result;
};
