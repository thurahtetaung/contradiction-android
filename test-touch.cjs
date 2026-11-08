const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
let playwright;
try {
  playwright = require('playwright-core');
} catch {
  playwright = require('../../.tools/package');
}
const { chromium } = playwright;
const assets = path.join(__dirname, 'app/src/main/assets/game');
const gameRoot =
  process.env.CONTRADICTION_GAME_DIR || path.resolve(__dirname, '../Windows');
const movie = path.join(gameRoot, 'gfx/MCMV.mp4');
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
};
const server = http.createServer((req, res) => {
  const name =
    decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1) ||
    'index.html';
  const file = name === 'gfx/MCMV.mp4' ? movie : path.join(assets, name);
  if (!file.startsWith(assets) && file !== movie) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  const length = fs.statSync(file).size;
  let start = 0,
    end = length - 1,
    status = 200;
  if (req.headers.range) {
    const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range);
    if (match) {
      start = Number(match[1]);
      end = match[2] ? Math.min(end, Number(match[2])) : end;
      status = 206;
    }
  }
  res.setHeader(
    'Content-Type',
    types[path.extname(file)] || 'application/octet-stream',
  );
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  if (status === 206)
    res.setHeader('Content-Range', `bytes ${start}-${end}/${length}`);
  res.writeHead(status);
  const stream = fs.createReadStream(file, { start, end });
  stream.pipe(res);
  res.on('close', () => stream.destroy());
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browserPath =
    process.env.CHROME_PATH ||
    (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined);
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      hasTouch: true,
      isMobile: true,
    });
    if (process.argv.includes('--profile'))
      await context.addInitScript(() => {
        window.profileCounts = { animationFrames: 0, menuPolls: 0 };
        const frame = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) =>
          frame((time) => {
            profileCounts.animationFrames++;
            callback(time);
          });
        const interval = setInterval.bind(window);
        window.setInterval = (callback, delay, ...args) =>
          interval(
            (...values) => {
              if (delay === 100) profileCounts.menuPolls++;
              callback(...values);
            },
            delay,
            ...args,
          );
      });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => typeof mobileUI === 'object' && vplayer.readyState >= 2,
    );
    await page.locator('#ui-home').waitFor({ state: 'visible' });
    if (process.argv.includes('--profile')) {
      await page.waitForTimeout(1500);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const before = await cdp.send('Performance.getMetrics');
      await page.evaluate(() => {
        profileCounts.animationFrames = profileCounts.menuPolls = 0;
      });
      await page.waitForTimeout(3000);
      const after = await cdp.send('Performance.getMetrics');
      const metric = (data, name) =>
        data.metrics.find((item) => item.name === name).value;
      const counts = await page.evaluate(() => ({
        ...profileCounts,
        filter: getComputedStyle(document.getElementById('vidbox')).filter,
        videoWidth: vplayer.videoWidth,
        videoHeight: vplayer.videoHeight,
      }));
      const report = {
        fixture:
          'Paused cinematic title screen in desktop headless Chromium; 3-second sample; not a phone power measurement',
        ...counts,
        taskMilliseconds:
          Math.round(
            (metric(after, 'TaskDuration') - metric(before, 'TaskDuration')) *
              10000,
          ) / 10,
      };
      const output = process.argv[process.argv.indexOf('--profile') + 1];
      if (output) {
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
      }
      console.log(JSON.stringify(report));
    } else {
      await runModernTests(page);
      await runLocationMemoryTests(
        browser,
        `http://127.0.0.1:${server.address().port}/`,
        errors,
      );
    }
    assert.deepEqual(errors, [], 'No uncaught page errors');
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.closeAllConnections();
  server.close();
  process.exitCode = 1;
});
async function runModernTests(page) {
  const pass = (label) => console.log('PASS: ' + label);
  const screenshot = async (name) => {
    if (process.argv.includes('--screenshots')) {
      fs.mkdirSync(path.join(__dirname, 'analysis/screens'), {
        recursive: true,
      });
      await page.screenshot({
        path: path.join(__dirname, 'analysis/screens', name + '.png'),
      });
    }
  };
  for (const size of [
    { width: 960, height: 540 },
    { width: 832, height: 384 },
    { width: 676, height: 320 },
  ]) {
    await page.setViewportSize(size);
    assert.equal(
      await page.evaluate(() => {
        const menu = document
            .querySelector('.home-menu')
            .getBoundingClientRect(),
          footer = document
            .querySelector('.home-footer')
            .getBoundingClientRect();
        return menu.bottom <= footer.top;
      }),
      true,
    );
  }
  pass('Title layout stays clear of its footer across three landscape sizes');
  await page.setViewportSize({ width: 832, height: 384 });
  await screenshot('home');
  assert.equal(await page.locator('#mobile-controls').count(), 0);
  assert.equal(
    await page.evaluate(() => {
      const r = document.getElementById('wrap').getBoundingClientRect();
      return r.width === innerWidth && r.height === innerHeight;
    }),
    true,
  );
  assert.equal(
    await page.evaluate(() => mobileClock.paused && vplayer.paused),
    true,
  );
  pass('Fullscreen title screen has no keyboard strip and pauses the engine');
  await page.getByRole('button', { name: 'Settings', exact: true }).tap();
  await page.getByRole('button', { name: 'Off', exact: true }).tap();
  assert.equal(await page.evaluate(() => subon), 1);
  await page.getByRole('button', { name: 'Original frame', exact: true }).tap();
  assert.equal(
    await page.evaluate(() => getComputedStyle(vplayer).objectFit),
    'cover',
  );
  await page.getByRole('button', { name: 'Fill display', exact: true }).tap();
  assert.equal(
    await page.evaluate(() => getComputedStyle(vplayer).objectFit),
    'contain',
  );
  await screenshot('settings');
  await page.getByRole('button', { name: 'Back', exact: true }).tap();
  await page
    .getByRole('button', { name: 'Begin investigation', exact: true })
    .tap();
  await page
    .getByRole('button', { name: 'Skip prologue', exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => mobileClock.paused), true);
  await page.waitForFunction(
    () =>
      vplayer.currentTime >= 18 && vplayer.currentTime < 21 && !vplayer.paused,
  );
  const prologueCC = page
    .locator('#prologue-controls')
    .getByRole('button', { name: 'Captions', exact: true });
  const ccWasOn = await page.evaluate(() => subon === 1);
  await prologueCC.tap();
  assert.equal(
    await prologueCC.getAttribute('aria-pressed'),
    ccWasOn ? 'false' : 'true',
  );
  if (ccWasOn) await prologueCC.tap();
  await page.waitForFunction(
    () =>
      vplayer.textTracks[0].mode === 'showing' &&
      [...(vplayer.textTracks[0].activeCues || [])].some((cue) =>
        cue.text.startsWith('My name is Jenks'),
      ),
  );
  await page.getByRole('button', { name: 'Pause prologue', exact: true }).tap();
  assert.equal(await page.evaluate(() => vplayer.paused), true);
  await page
    .getByRole('button', { name: 'Continue watching', exact: true })
    .tap();
  await screenshot('prologue-captions');
  pass('Prologue shows narration captions with a working CC toggle');
  await page.evaluate(() => {
    const index = vidMoves.indexOf('prologue');
    vplayer.currentTime = vidMoves[index + 2] + vidMoves[index + 1] - 0.25;
  });
  await page.waitForFunction(
    () => started === 0 && !document.getElementById('prologue-controls'),
  );
  pass(
    'Fresh investigations play the original prologue and advance automatically at its end',
  );
  assert.equal(await page.evaluate(() => started), 0);
  await page.evaluate(() => {
    mobileUI.open('home');
    window.timerFired = 0;
    setTimeout(() => timerFired++, 300);
  });
  const stoppedTime = await page.evaluate(() => vplayer.currentTime);
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(() => timerFired), 0);
  assert(
    Math.abs((await page.evaluate(() => vplayer.currentTime)) - stoppedTime) <
      0.1,
  );
  await page
    .getByRole('button', { name: 'Continue investigation', exact: true })
    .tap();
  await page.waitForFunction(() => timerFired === 1);
  pass('Pause holds media and delayed story callbacks; continue resumes them');
  await page.waitForFunction(
    () => started === 0 && abled === 1 && recalled === 0 && locNow.length > 0,
    {},
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    tipon = 0;
    tip = 8;
    mobileUI.invalidate();
  });
  await screenshot('exploration');
  assert.equal(await page.locator('#scene-actions').count(), 0);
  await page.evaluate(() => {
    window.priorInvest = invest;
    invest = 0;
    mobileUI.invalidate();
  });
  await page.waitForFunction(
    () => !document.querySelector('#scene-hotspots button'),
  );
  await page.evaluate(() => {
    invest = 1;
    window.searchCalls = 0;
    window.originalInvestigate = investigate;
    investigate = () => searchCalls++;
    mobileUI.invalidate();
  });
  await page
    .locator('#scene-hotspots')
    .getByRole('button', { name: 'Search', exact: true })
    .tap();
  assert.equal(await page.evaluate(() => searchCalls), 1);
  await page.evaluate(() => {
    invest = priorInvest;
    investigate = originalInvestigate;
    mobileUI.invalidate();
  });
  pass(
    'Search is a contextual original-art hotspot; Casebook and Map use top icons with no bottom bar',
  );
  await page
    .locator('#scene-tools')
    .getByRole('button', { name: 'Casebook', exact: true })
    .tap();
  await page.locator('[data-item="0"]').tap();
  assert.equal(await page.evaluate(() => curq), 0);
  await page.locator('.item-detail[data-item="0"]').waitFor();
  await screenshot('evidence');
  assert.equal(
    await page
      .getByRole('button', { name: 'Use this item here', exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'Back', exact: true }).tap();
  pass(
    'Evidence uses original item art and descriptions with direct selection',
  );
  await page
    .locator('#scene-tools')
    .getByRole('button', { name: 'Pause', exact: true })
    .tap();
  await page.getByRole('button', { name: 'Case files', exact: true }).tap();
  await page.evaluate(() => {
    window.savedCalls = [];
    const original = saver;
    saver = (slot) => {
      savedCalls.push(slot);
      return original(slot);
    };
  });
  await page.locator('[data-save="1"]').tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .tap();
  assert.deepEqual(await page.evaluate(() => savedCalls), []);
  await page.locator('[data-save="1"]').tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Save', exact: true })
    .tap();
  assert.deepEqual(await page.evaluate(() => savedCalls), ['Save1']);
  await page.locator('[data-save="2"]').tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Save', exact: true })
    .tap();
  assert.deepEqual(await page.evaluate(() => savedCalls), ['Save1', 'Save2']);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage['mobile.saveInfo.Save1']).time,
    ),
    5,
  );
  await screenshot('saves');
  await page.locator('[data-load="1"]').tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .tap();
  await page.locator('[data-load="1"]').tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Load', exact: true })
    .tap();
  await page.waitForFunction(
    () =>
      mobileUI.pane === '' &&
      !mobileClock.paused &&
      started === 0 &&
      abled === 1,
  );
  pass(
    'Save/Cancel are separate; both slots preserve original save data and metadata',
  );
  await page
    .locator('#scene-tools')
    .getByRole('button', { name: 'Casebook', exact: true })
    .tap();
  await page
    .locator('#panel-tabs')
    .getByRole('button', { name: 'Chief', exact: true })
    .tap();
  await page
    .getByRole('button', {
      name: 'What should I investigate next?',
      exact: true,
    })
    .tap();
  assert((await page.locator('#ui-dialog p').textContent()).length > 20);
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Back', exact: true })
    .tap();
  await page
    .locator('#panel-header')
    .getByRole('button', { name: 'Back', exact: true })
    .tap();
  await page
    .locator('#scene-tools')
    .getByRole('button', { name: 'Map', exact: true })
    .tap();
  await screenshot('map');
  await page.evaluate(() => {
    window.travelCalls = [];
    const original = mapmove;
    mapmove = (target) => {
      travelCalls.push(target);
      return original(target);
    };
  });
  await page.locator('[data-destination="2"]').tap();
  await page.locator('#travel').tap();
  assert.deepEqual(await page.evaluate(() => travelCalls), [2]);
  await page.waitForTimeout(1000);
  pass(
    'Casebook advice and original-art map route through the original engine',
  );
  // Fixture for interviews: real evidence, statement records and deduction rules.
  await page.evaluate(() => {
    clearInterval(vidInt);
    mapon = toolson = tipon = exon = recalled = 0;
    abled = 1;
    invon = baron = 1;
    curchar = simon;
    iton = 99;
    select(kate);
    mobileUI.open('interview');
    window.askedCalls = 0;
    const original = ask;
    ask = () => {
      askedCalls++;
      return original();
    };
  });
  await page.getByRole('button', { name: 'Ask about this', exact: true }).tap();
  assert.equal(await page.evaluate(() => askedCalls), 1);
  assert.equal(await page.evaluate(() => itemList[12 * kate + simon - 1]), 1);
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    abled = 1;
    tipon = recalled = 0;
    repagain = 0;
    iton = 99;
    select(kate);
    mobileUI.invalidate();
  });
  await screenshot('interview');
  pass(
    'Interview asks the selected evidence question through the story engine',
  );
  const deduction = await page.evaluate(() => {
    const witness = traps[6],
      offset = 39 * (witness - 2),
      matches = [0, 1].map((n) => {
        for (let id = 0; id < repsList.length; id++)
          for (let index = 0; index < 9; index++)
            if (repsList[id][offset + 2 + 4 * index] === traps[n])
              return { id, index };
        return { id: -1, index: -1 };
      }),
      first = matches[0].id,
      second = matches[1].id;
    const indexes = [first, second].map((id, n) => {
      if (!itco.includes(id)) {
        itco.push(id);
        itemList[12 * id] = itco.length;
      }
      itemList[12 * id + witness - 1] = 1;
      const record = repsList[id],
        offset = 39 * (witness - 2);
      let found = -1;
      for (let index = 0; index < 9; index++)
        if (record[offset + 2 + 4 * index] === traps[n]) {
          record[offset + 3 + 4 * index] = 1;
          found = index;
          break;
        }
      return found;
    });
    curchar = witness;
    abled = 1;
    invon = baron = 1;
    toolson = mapon = tipon = exon = recalled = 0;
    pairon = 0;
    pair = ['', ''];
    iton = 99;
    select(first);
    mobileUI.open('interview');
    return { first, second, indexes };
  });
  assert(deduction.indexes.every((index) => index >= 0));
  await page.locator(`[data-reply="${deduction.indexes[0]}"]`).tap();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => pair[0] === traps[0]), true);
  await page.locator(`[data-item="${deduction.second}"]`).tap();
  await page.locator(`[data-reply="${deduction.indexes[1]}"]`).tap();
  assert.equal(await page.evaluate(() => traps[4]), 1);
  assert.equal(await page.evaluate(() => abled), 0);
  pass(
    'Cross-evidence statement comparison triggers the original valid contradiction',
  );
  await page.evaluate(() => {
    mobileSuspend();
    mobileSuspend();
  });
  assert.equal(
    await page.evaluate(
      () =>
        mobileClock.paused &&
        vplayer.paused &&
        localStorage.game.endsWith('END'),
    ),
    true,
  );
  pass('Backgrounding pauses once and persists a compatible resume save');
  await page.evaluate(() => {
    mobileResume();
    mobileUI.open('home');
  });
  await page
    .getByRole('button', { name: 'New investigation', exact: true })
    .tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .tap();
  assert.equal(await page.evaluate(() => traps[4]), 1);
  await page
    .getByRole('button', { name: 'New investigation', exact: true })
    .tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Begin again', exact: true })
    .tap();
  assert.equal(await page.evaluate(() => traps[4]), 0);
  await page
    .getByRole('button', { name: 'Skip prologue', exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => mobileClock.paused), true);
  await page.getByRole('button', { name: 'Skip prologue', exact: true }).tap();
  await page.waitForFunction(() => !mobileClock.paused);
  assert.equal(
    await page.evaluate(
      () =>
        localStorage.Save1.endsWith('END') &&
        localStorage.Save2.endsWith('END'),
    ),
    true,
  );
  pass(
    'New investigation resets story state only after confirmation and retains manual saves',
  );
  await page.evaluate(() => mobileUI.open('home'));
  const savedBeforeReplay = await page.evaluate(() => localStorage.Save1);
  await page.getByRole('button', { name: 'Watch prologue', exact: true }).tap();
  await page.waitForFunction(
    () =>
      vplayer.currentTime >= 18 && vplayer.currentTime < 22 && !vplayer.paused,
  );
  await page.evaluate(() => mobileSuspend());
  assert.equal(await page.evaluate(() => vplayer.paused), true);
  await page.evaluate(() => mobileResume());
  await page.waitForFunction(() => !vplayer.paused);
  await page.getByRole('button', { name: 'Skip prologue', exact: true }).tap();
  await page.locator('#ui-home').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(() => localStorage.Save1),
    savedBeforeReplay,
  );
  assert.equal(
    await page.evaluate(() => mobileClock.paused && vplayer.paused),
    true,
  );
  pass(
    'Prologue replay survives background/resume, returns to title and preserves saves',
  );
  assert.equal(
    await page.evaluate(() => {
      const event = new Event('contextmenu', {
        cancelable: true,
        bubbles: true,
      });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    true,
  );
  pass('Long-press context menus remain suppressed');
  // Speaker-side cues (align:left/right) must sit inside the 16:9 picture, not
  // against the edges of a wider phone screen.
  for (const [time, side, prefix] of [
    [345.5, 'right', 'I really'],
    [348.5, 'left', 'It IS'],
    [344, 'center', "[Rebecca's voice]"],
  ]) {
    await page.evaluate((t) => {
      vplayer.textTracks[0].mode = 'showing';
      vplayer.pause();
      vplayer.currentTime = t;
    }, time);
    await page.waitForFunction(
      (p) =>
        document
          .querySelector('#caption-layer .caption-cue')
          ?.textContent.startsWith(p),
      prefix,
    );
    const box = await page.evaluate(() => {
      const cue = document.querySelector('#caption-layer .caption-cue');
      const r = cue.getBoundingClientRect();
      const width = Math.min(innerWidth, (innerHeight * 16) / 9);
      const left = (innerWidth - width) / 2;
      return {
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        picLeft: left,
        picRight: left + width,
        align: cue.style.textAlign,
        height: innerHeight,
      };
    });
    assert.equal(box.align, side);
    assert.ok(box.left >= box.picLeft + 8, JSON.stringify(box));
    assert.ok(box.right <= box.picRight - 8, JSON.stringify(box));
    assert.ok(box.bottom <= box.height - 8, JSON.stringify(box));
    if (side !== 'center') {
      await page.evaluate(
        () => (
          (document.getElementById('game-ui').style.visibility = 'hidden'),
          (mainview.dataset.o = mainview.style.opacity),
          (mainview.style.opacity = '1')
        ),
      );
      await screenshot('caption-' + side);
      await page.evaluate(
        () => (
          (document.getElementById('game-ui').style.visibility = ''),
          (mainview.style.opacity = mainview.dataset.o)
        ),
      );
    }
  }
  pass('Dialogue captions keep speaker sides inside the visible picture');
}

async function runLocationMemoryTests(browser, url, errors) {
  const context = await browser.newContext({
    viewport: { width: 832, height: 384 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const ready = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => typeof mobileUI === 'object' && vplayer.readyState >= 2,
    );
    await page.locator('#ui-home').waitFor({ state: 'visible' });
  };
  const settled = () =>
    page.waitForFunction(
      () =>
        started === 0 &&
        abled === 1 &&
        locon === 0 &&
        !!document.querySelector('#scene-routes button'),
      null,
      { timeout: 60000 },
    );
  const where = () =>
    page.evaluate(() => ({
      scene: locList[options],
      place: document.getElementById('scene-place').textContent,
    }));
  await ready();
  await page.locator('#begin-investigation').tap();
  await page.getByRole('button', { name: 'Skip prologue', exact: true }).tap();
  await settled();
  const start = await where();
  // Walk somewhere other than the hour's starting spot.
  await page
    .locator('#scene-routes button')
    .filter({ hasText: 'North Lane' })
    .tap();
  await page.waitForFunction(
    (scene) => locList[options] !== scene,
    start.scene,
  );
  await settled();
  const away = await where();
  assert.notEqual(away.scene, start.scene);
  // The autosave catches up on its own while playing (no backgrounding).
  await page.waitForFunction(
    (scene) =>
      JSON.parse(localStorage['mobile.saveInfo.game'] || 'null')?.scene ===
      scene,
    away.scene,
    { timeout: 10000 },
  );
  const autosave = await page.evaluate(() => localStorage.game);
  await page.evaluate(() => saver('Save1'));
  // Case files: the autosave card is load-only and shows when it was saved.
  await page
    .locator('#scene-tools')
    .getByRole('button', { name: 'Pause', exact: true })
    .tap();
  await page.getByRole('button', { name: 'Case files', exact: true }).tap();
  const autoCard = page.locator('.autosave-card');
  assert.equal(await autoCard.locator('[data-save]').count(), 0);
  assert.equal(await autoCard.locator('[data-load="auto"]').isEnabled(), true);
  assert.match(
    await autoCard.textContent(),
    /AUTOSAVE.*North Road Junction.*Saved just now/s,
  );
  await page
    .locator('#panel-header')
    .getByRole('button', { name: 'Back', exact: true })
    .tap()
    .catch(() => {});
  // Relaunch: "Continue investigation" returns to the same spot.
  await ready();
  await page.locator('#begin-investigation').tap();
  await settled();
  assert.deepEqual(await where(), away);
  assert.equal(await page.evaluate(() => localStorage.game), autosave);
  // Loading a case file also returns to where it was saved.
  await page
    .locator('#scene-tools')
    .getByRole('button', { name: 'Pause', exact: true })
    .tap();
  await page.getByRole('button', { name: 'Case files', exact: true }).tap();
  await page.locator('[data-load="1"]').tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Load', exact: true })
    .tap();
  await page.waitForFunction(() => locon === 1 || abled === 0);
  await settled();
  assert.deepEqual(await where(), away);
  // A save without a matching location note keeps the original behaviour.
  await page.evaluate(() => {
    for (const slot of ['game', 'Save1', 'Save2']) {
      const key = 'mobile.saveInfo.' + slot;
      if (!localStorage[key]) continue;
      const info = JSON.parse(localStorage[key]);
      info.save = 'stale';
      localStorage[key] = JSON.stringify(info);
    }
  });
  await page
    .locator('#scene-tools')
    .getByRole('button', { name: 'Pause', exact: true })
    .tap();
  await page.getByRole('button', { name: 'Case files', exact: true }).tap();
  await page.locator('[data-load="1"]').tap();
  await page
    .locator('#ui-dialog')
    .getByRole('button', { name: 'Load', exact: true })
    .tap();
  await page.waitForFunction(() => locon === 1 || abled === 0);
  await settled();
  assert.equal((await where()).place, start.place);
  // Replayed events: the return button stays top-left, clear of captions.
  await page.evaluate(() => {
    recalled = 2;
    mobileUI.invalidate();
  });
  const back = page.getByRole('button', {
    name: 'Return to investigation',
    exact: true,
  });
  await back.waitFor();
  const box = await back.boundingBox();
  const captionTop = await page.evaluate(() => innerHeight * 0.75);
  assert.ok(box.y + box.height < 80 && box.x < 120, JSON.stringify(box));
  assert.ok(box.y + box.height < captionTop);
  await page.evaluate(() => {
    recalled = 0;
    mobileUI.invalidate();
  });
  await context.close();
  console.log(
    'PASS: ' +
      'Continue and Load return to the saved location; unmatched saves use the original hour start',
  );
}
