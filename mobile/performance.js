/* Preserve media and story timing. Schedule UI animation only while it moves. */
(() => {
  let inventoryFrame = 0;
  function animateInventory() {
    inventoryFrame = 0;
    if (document.hidden) return;
    const target = 20 * ipos;
    if (ikpos > target) ikpos -= (ikpos - target) / 4;
    if (ikpos < target) ikpos += (target - ikpos) / 4;
    if (Math.round(4 * ikpos) / 4 === target) ikpos = target;
    document.getElementById('itgfx').style.left = ikpos + '%';
    if (ikpos !== target)
      inventoryFrame = requestAnimationFrame(animateInventory);
  }
  function wakeInventory() {
    if (document.documentElement.classList.contains('modern-ui')) return;
    if (!document.hidden && !inventoryFrame && ikpos !== 20 * ipos)
      inventoryFrame = requestAnimationFrame(animateInventory);
  }
  // The desktop function has one startup frame already queued. Its next lookup
  // reaches this scheduler, so the old perpetual loop ends without a source patch.
  gfxan = wakeInventory;
  const originalSelect = select;
  select = function (...args) {
    const result = originalSelect.apply(this, args);
    wakeInventory();
    return result;
  };
  const originalKeys = gokeys;
  gokeys = function (...args) {
    const result = originalKeys.apply(this, args);
    wakeInventory();
    return result;
  };
  const originalSaturation = satit;
  function removeNeutralFilter() {
    if (avcal[2 * avsat] === 1 && avcal[2 * avsat + 1] === 1)
      document.getElementById('vidbox').style.webkitFilter = 'none';
  }
  satit = function (...args) {
    const result = originalSaturation.apply(this, args);
    removeNeutralFilter();
    return result;
  };
  removeNeutralFilter();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(inventoryFrame);
      inventoryFrame = 0;
    } else wakeInventory();
  });
  wakeInventory();
})();
