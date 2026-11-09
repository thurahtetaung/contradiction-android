const fs = require('fs');
const path = require('path');
const source = process.env.CONTRADICTION_GAME_DIR
  ? path.resolve(process.env.CONTRADICTION_GAME_DIR)
  : path.resolve(__dirname, '../Windows');
const dest = path.join(__dirname, 'app/src/main/assets/game');
fs.mkdirSync(dest, { recursive: true });
for (const obsolete of ['mobile.js', 'touch.js']) {
  const file = path.join(dest, obsolete);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
for (const name of ['gfx', 'sound'])
  fs.cpSync(path.join(source, name), path.join(dest, name), {
    recursive: true,
    filter: (file) => !file.endsWith('.mp4') && !file.endsWith('.DS_Store'),
  });
fs.copyFileSync(path.join(source, 'game.js'), path.join(dest, 'game.js'));
// The original subtitles skip the narrated prologue; merge in our transcription.
{
  const original = fs.readFileSync(path.join(source, 'sub.vtt'), 'utf8');
  const prologue = fs
    .readFileSync(
      path.join(__dirname, 'mobile', 'prologue-captions.vtt'),
      'utf8',
    )
    .split(/\r?\n\r?\n/)
    .filter((part) => part.includes('-->'))
    .join('\n\n');
  const split = original.search(/\r?\n\r?\n/);
  fs.writeFileSync(
    path.join(dest, 'sub.vtt'),
    original.slice(0, split) + '\n\n' + prologue + original.slice(split),
  );
}
let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
html = html
  .replaceAll('gfx/arrows/Tips', 'gfx/Tips')
  .replaceAll('sound/menu.mp3', 'sound/menuon.mp3');
html = html.replace('<head>', '<head><link rel="icon" href="data:,">');
html = html.replace(
  '<title>',
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><link rel="stylesheet" href="mobile.css"><title>',
);
html = html.replace(
  'id="vplayer" autoplay=',
  'id="vplayer" playsinline preload="auto" autoplay=',
);
html = html.replace(
  '<script src="game.js"',
  '<script src="platform.js"></script><script src="game.js"',
);
html = html.replace(
  '</body>',
  '<script src="lifecycle.js"></script><script src="performance.js"></script><script src="chief-timings.js"></script><script src="game-ui.js"></script></body>',
);
fs.writeFileSync(
  path.join(dest, 'chief-timings.js'),
  'window.mobileChiefTimings=' +
    fs.readFileSync(path.join(__dirname, 'mobile/chief-timings.json'), 'utf8') +
    ';',
);
fs.writeFileSync(path.join(dest, 'index.html'), html);
for (const name of [
  'platform.js',
  'lifecycle.js',
  'mobile.css',
  'performance.js',
  'game-ui.js',
])
  fs.copyFileSync(path.join(__dirname, 'mobile', name), path.join(dest, name));
const index = fs
  .readdirSync(dest, { recursive: true })
  .filter((name) => fs.statSync(path.join(dest, name)).isFile())
  .map((name) => {
    const normalized = name.replaceAll('\\', '/');
    return normalized.toLowerCase() + '=' + normalized;
  })
  .join('\n');
fs.writeFileSync(path.join(dest, '../asset-index.properties'), index);
console.log(
  'Prepared mobile assets (video is imported separately by the app).',
);
