/* Cinematic touch presentation. Story and deductions stay in the original engine. */
(() => {
  const $ = (id) => document.getElementById(id),
    later = mobileClock.uiTimeout,
    keys = gokeys;
  let pane = '',
    tab = 'evidence',
    modal = false,
    frame = 0,
    readyOnce = false,
    returnPane = '',
    selectedMap = 4,
    compareLock = false,
    toastTimer,
    ownTranscript = '',
    completedShown = false,
    prologue = null;
  const signatures = new Map();
  const text = (value) => {
    const node = document.createElement('div');
    node.innerHTML = String(value ?? '');
    return node.textContent.trim();
  };
  const el = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  // Skip DOM writes that would not change anything: each write is a mutation
  // record and can force style/layout work even when the value is identical.
  const setHidden = (id, value) => {
    const node = $(id);
    if (node.hidden !== !!value) node.hidden = !!value;
  };
  const setText = (id, value) => {
    const node = $(id);
    if (node.textContent !== value) node.textContent = value;
  };
  const setPressed = (node, on) => {
    const value = on ? 'true' : 'false';
    if (node && node.getAttribute('aria-pressed') !== value)
      node.setAttribute('aria-pressed', value);
  };
  const paths = {
    back: 'M15 5l-7 7 7 7',
    close: 'M6 6l12 12M18 6L6 18',
    play: 'M8 5l11 7-11 7z',
    pause: 'M8 5v14M16 5v14',
    book: 'M12 6C7 3 3 5 3 5v14s5-2 9 1c4-3 9-1 9-1V5s-4-2-9 1zm0 0v14',
    map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15',
    search: 'M16 16l5 5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
    settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
    sound: 'M3 9h4l5-5v16l-5-5H3zm13-2a7 7 0 0 1 0 10',
    cc: 'M3 5h18v14H3zM10 9H7v6h3m7-6h-3v6h3',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    save: 'M5 3h12l4 4v14H3V3zm2 0v7h10V3M7 21v-7h10v7',
    pin: 'M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zm0-15a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    compare: 'M4 5h6v6H4zm10 8h6v6h-6zM13 5h7m-3-3 3 3-3 3',
    phone:
      'M5 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4c0 3-4 3-8 1C7 17 3 11 3 6c0-2 0-3 2-3',
    replay: 'M3 10a9 9 0 1 1 1 7M3 4v6h6',
    help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1',
    case: 'M3 7h7l2-3h9v16H3z',
    exit: 'M10 3H4v18h6m4-15 6 6-6 6m-6-6h12',
  };
  function icon(name) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = `<path d="${paths[name] || paths.case}"/>`;
    return node;
  }
  function button(label, action, name, cls = '') {
    const node = el('button', 'ui-button ' + cls);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    if (name) node.appendChild(icon(name));
    node.appendChild(el('span', '', label));
    node.onclick = () => {
      action();
      invalidate();
    };
    return node;
  }
  function update(id, key, build) {
    if (signatures.get(id) === key) return;
    signatures.set(id, key);
    const host = $(id),
      positions = new Map(
        [...host.querySelectorAll('.scroll')].map((node) => [
          node.className + '|' + (node.dataset.item || ''),
          node.scrollTop,
        ]),
      );
    host.replaceChildren(...build());
    host.querySelectorAll('.scroll').forEach((node) => {
      const top = positions.get(
        node.className + '|' + (node.dataset.item || ''),
      );
      if (top !== undefined) node.scrollTop = top;
    });
  }
  const root = el('main', 'game-ui');
  root.id = 'game-ui';
  root.innerHTML =
    '<header id="scene-header"><div class="scene-location"><span class="eyebrow" id="scene-time"></span><span id="scene-place"></span></div><div id="scene-tools"></div></header><nav id="scene-hotspots" aria-label="Explore"></nav><nav id="scene-routes" aria-label="Available paths"></nav><section id="ui-panel" hidden><header id="panel-header"></header><nav id="panel-tabs"></nav><div id="panel-body"></div></section><section id="ui-home" hidden></section><div id="ui-loading"><img src="gfx/Logo.png" alt="Contradiction"><span class="eyebrow">Preparing your investigation</span></div><div id="ui-dialog" hidden></div><div id="ui-toast" role="status" hidden></div><div id="replay-tools" hidden></div>';
  document.body.appendChild(root);
  function notify(value) {
    $('ui-toast').textContent = text(value);
    $('ui-toast').hidden = false;
    mobileClock.clearUiTimeout(toastTimer);
    toastTimer = later(() => ($('ui-toast').hidden = true), 3500);
  }
  window.mobileNotify = notify;
  const usable = () =>
    started === 0 &&
    abled === 1 &&
    recalled === 0 &&
    pairon === 0 &&
    locNow.length > 0;
  function press(index) {
    keyup();
    try {
      keys(KY[index]);
    } finally {
      keyup();
    }
    invalidate();
  }
  function captions() {
    subon = subon ? 0 : 1;
    vplayer.textTracks[0].mode = subon ? 'showing' : 'hidden';
    localStorage.mobileCaptions = String(subon);
    notify(subon ? 'Captions on' : 'Captions off');
    renderCaptions();
    document
      .querySelectorAll('#game-ui [aria-label="Captions"]')
      .forEach((node) =>
        node.setAttribute('aria-pressed', subon ? 'true' : 'false'),
      );
  }
  if (localStorage.mobileCaptions === '1') {
    subon = 1;
    vplayer.textTracks[0].mode = 'showing';
  }
  // The browser lays cues out against the full-screen <video> element, which is
  // wider than the 16:9 picture on phones, so speaker-side (left/right) cues end
  // up in the letterbox. Draw them ourselves inside the visible picture instead.
  const captionLayer = el('div', 'caption-layer');
  captionLayer.id = 'caption-layer';
  captionLayer.setAttribute('aria-live', 'polite');
  $('vidbox').appendChild(captionLayer);
  function pictureRect() {
    const fill = localStorage.mobileFraming === 'fill';
    const width = fill
        ? Math.max(innerWidth, (innerHeight * 16) / 9)
        : Math.min(innerWidth, (innerHeight * 16) / 9),
      height = (width * 9) / 16;
    const left = Math.max(0, (innerWidth - width) / 2),
      top = Math.max(0, (innerHeight - height) / 2);
    return {
      left,
      top,
      width: Math.min(innerWidth, width),
      height: Math.min(innerHeight, height),
    };
  }
  function renderCaptions() {
    const track = vplayer.textTracks[0];
    const cues =
      track && track.mode === 'showing' ? [...(track.activeCues || [])] : [];
    if (!cues.length) {
      captionLayer.replaceChildren();
      return;
    }
    const pic = pictureRect();
    const css = getComputedStyle(document.documentElement);
    const safeLeft =
        parseFloat(css.getPropertyValue('--android-safe-left')) || 0,
      safeRight = parseFloat(css.getPropertyValue('--android-safe-right')) || 0;
    const inset = Math.max(16, pic.width * 0.04);
    const minX = Math.max(pic.left + inset, safeLeft + 16),
      maxX = Math.min(
        pic.left + pic.width - inset,
        innerWidth - safeRight - 16,
      );
    captionLayer.style.bottom =
      Math.max(14, innerHeight - (pic.top + pic.height) + pic.height * 0.05) +
      'px';
    captionLayer.replaceChildren(
      ...cues.map((cue) => {
        const box = el('div', 'caption-cue');
        const size = Math.min(
          maxX - minX,
          Math.max(260, (pic.width * (cue.size || 50)) / 100),
        );
        const align =
          cue.align === 'left' || cue.align === 'start'
            ? 'left'
            : cue.align === 'right' || cue.align === 'end'
              ? 'right'
              : 'center';
        const x =
          align === 'left'
            ? minX
            : align === 'right'
              ? maxX - size
              : (minX + maxX - size) / 2;
        box.style.left = x + 'px';
        box.style.width = size + 'px';
        box.style.textAlign = align;
        cue.text.split(/\n/).forEach((line, index) => {
          if (index) box.appendChild(el('br'));
          box.appendChild(
            el(
              'span',
              '',
              line.replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' '),
            ),
          );
        });
        return box;
      }),
    );
  }
  vplayer.textTracks[0]?.addEventListener('cuechange', renderCaptions);
  addEventListener('resize', renderCaptions);
  const framing = () => {
    document.documentElement.classList.toggle(
      'fill-film',
      localStorage.mobileFraming === 'fill',
    );
    renderCaptions();
  };
  framing();
  $('scene-tools').append(
    button(
      'Casebook',
      () => {
        tab = 'evidence';
        open('journal');
      },
      'book',
      'icon-only scene-utility',
    ),
    button('Map', () => open('map'), 'map', 'icon-only scene-utility'),
    button('Captions', captions, 'cc', 'icon-only'),
    button('Pause', () => open('home'), 'pause', 'icon-only'),
  );
  function open(next) {
    if (['home', 'settings', 'saves', 'credits', 'help'].includes(next))
      mobilePause('menu');
    if (['inventory', 'map', 'journal'].includes(next) && !usable()) return;
    if (next === 'inventory' && !invon && !baron) press(5);
    if (next === 'map') {
      selectedMap = maploc;
      mapon = 1;
    }
    if (next === 'journal') {
      memup();
      clueup();
    }
    pane = next;
    signatures.clear();
    invalidate();
  }
  function close() {
    if (modal) {
      closeDialog();
      return;
    }
    if (pane === 'call' && ownTranscript) {
      ownTranscript = '';
      pane = 'journal';
      tab = 'chief';
      signatures.clear();
      invalidate();
      return;
    }
    if (['settings', 'saves', 'credits', 'help'].includes(pane)) {
      pane = 'home';
      signatures.clear();
      invalidate();
      return;
    }
    if (pane === 'home' && started !== 0) return;
    if (pane === 'inventory' && !invon && baron) press(5);
    if (pane === 'map') {
      mapon = 0;
      topoff('mapbox');
    }
    pane = '';
    toolson = 0;
    topoff('menu');
    mobileUnpause('menu');
    signatures.clear();
    invalidate();
  }
  function closeDialog() {
    modal = false;
    $('ui-dialog').hidden = true;
    $('ui-dialog').replaceChildren();
  }
  function dialog(title, description, actions) {
    const host = $('ui-dialog');
    host.replaceChildren();
    host.hidden = false;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    const card = el('section', 'dialog-card');
    card.append(
      el('span', 'eyebrow', 'THE INVESTIGATION'),
      el('h2', '', title),
      el('p', '', description),
    );
    const bar = el('div', 'dialog-actions');
    actions.forEach((item, index) =>
      bar.appendChild(
        button(
          item.label,
          () => {
            closeDialog();
            item.action?.();
          },
          item.icon,
          index === 0 ? 'primary' : '',
        ),
      ),
    );
    card.appendChild(bar);
    host.appendChild(card);
    modal = true;
  }
  function confirm(kind, slot) {
    const auto = slot === 'auto',
      key = auto ? 'game' : 'Save' + slot;
    if (auto && kind === 'Save') return;
    const saved = localStorage[key];
    if (kind === 'Load' && !saved) {
      notify('No investigation has been saved here.');
      return;
    }
    dialog(
      kind === 'Reset'
        ? 'Begin a new investigation?'
        : auto
          ? 'Load the autosave?'
          : `${kind === 'Save' && saved ? 'Replace' : kind} investigation ${slot}?`,
      kind === 'Reset'
        ? 'Your current progress will restart. Manual save slots will be kept.'
        : kind === 'Save'
          ? 'Store your current progress in this case file.'
          : 'Your current progress will be replaced by this saved investigation.',
      [
        {
          label: kind === 'Reset' ? 'Begin again' : kind,
          icon: kind === 'Save' ? 'save' : 'play',
          action: () => {
            if (kind === 'Save') {
              savetype = 0;
              savnews = 0;
              saver('Save' + slot);
              notify('Investigation saved.');
            } else {
              pane = '';
              toolson = greenops = greenon = 0;
              if (kind === 'Reset') {
                thend = 0;
                completedShown = false;
                topoff('credits');
                resetting = 1;
                goload(localStorage.reset);
                saver('game');
                playPrologue(() => mobileUnpause('menu'));
              } else {
                mobileUnpause('menu');
                loader(key);
              }
            }
          },
        },
        { label: 'Cancel', icon: 'close' },
      ],
    );
  }
  function begin() {
    if (started === 1 || vplayer.readyState < 2) return;
    if (started === 2 && !localStorage.game) {
      playPrologue(beginStory);
      return;
    }
    beginStory();
  }
  function beginStory() {
    pane = '';
    toolson = greenops = greenon = 0;
    mobileUnpause('menu');
    if (thend === 4) keys(KY[5]);
    else if (started === 2) startgame();
    else closewood();
    invalidate();
  }
  function playPrologue(after) {
    if (prologue) return;
    mobilePause('menu');
    const index = vidMoves.indexOf('prologue');
    if (index < 0) {
      after?.();
      return;
    }
    prologue = {
      after,
      time: vplayer.currentTime,
      volume: vplayer.volume,
      opacity: $('mainview').style.opacity,
      end: vidMoves[index + 2] + vidMoves[index + 1],
    };
    const session = prologue;
    pane = '';
    // Freeze the story engine and reuse the original video/decoder for the film.
    $('mainview').style.opacity = '1';
    vplayer.volume = 1;
    vplayer.currentTime = vidMoves[index + 2];
    vplayer.play();
    const controls = el('section', 'prologue-controls');
    controls.id = 'prologue-controls';
    controls.append(
      el('span', 'eyebrow', 'PROLOGUE'),
      prologueTools(),
      button('Skip prologue', finishPrologue, 'arrow', 'quiet'),
    );
    root.appendChild(controls);
    invalidate();
    function frameEnd() {
      if (prologue !== session) return;
      if (vplayer.currentTime >= prologue.end - 1 / 24) {
        finishPrologue();
        return;
      }
      if (vplayer.requestVideoFrameCallback)
        vplayer.requestVideoFrameCallback(frameEnd);
    }
    if (vplayer.requestVideoFrameCallback)
      vplayer.requestVideoFrameCallback(frameEnd);
  }
  function prologueTools() {
    const tools = el('div', 'prologue-tools');
    const cc = button('Captions', captions, 'cc', 'icon-only');
    cc.setAttribute('aria-pressed', subon ? 'true' : 'false');
    tools.append(
      cc,
      button('Pause prologue', pausePrologue, 'pause', 'icon-only'),
    );
    return tools;
  }
  function finishPrologue() {
    if (!prologue) return;
    const active = prologue;
    prologue = null;
    vplayer.pause();
    vplayer.currentTime = active.time;
    vplayer.volume = active.volume;
    $('mainview').style.opacity = active.opacity;
    $('prologue-controls')?.remove();
    closeDialog();
    signatures.clear();
    pane = active.after ? '' : 'home';
    active.after?.();
    invalidate();
  }
  function pausePrologue() {
    if (!prologue) return;
    vplayer.pause();
    dialog(
      'Prologue paused',
      'Continue watching or go straight to the investigation.',
      [
        {
          label: 'Continue watching',
          icon: 'play',
          action: () => vplayer.play(),
        },
        { label: 'Skip prologue', icon: 'arrow', action: finishPrologue },
      ],
    );
  }
  vplayer.addEventListener('timeupdate', () => {
    if (
      prologue &&
      !vplayer.requestVideoFrameCallback &&
      vplayer.currentTime >= prologue.end - 0.05
    )
      finishPrologue();
  });
  const resumeMedia = mobileResume;
  window.mobileResume = () => {
    resumeMedia();
    if (prologue && !modal) vplayer.play();
  };
  function heading(title, description) {
    const node = el('div', 'section-heading');
    node.appendChild(el('h2', '', title));
    if (description) node.appendChild(el('p', 'muted', description));
    return node;
  }
  const itemName = (id) => text(itemList[12 * id + 8]);
  function picture(id) {
    const node = el('img', 'evidence-art');
    node.src = 'gfx/items/pix_' + itemList[12 * id + 10] + '.png';
    node.alt = '';
    node.draggable = false;
    return node;
  }
  const activeItem = () => (itco.includes(curq) ? curq : itco[0]);
  function chooseItem(id) {
    if (!usable()) return;
    iton = 99;
    select(id);
    invalidate();
  }
  function statements(id, character) {
    const record = repsList[id],
      offset = 39 * (character - 2);
    return Array.from({ length: 9 }, (_, index) => ({
      index,
      label: text(record[offset + 2 + 4 * index]),
      flag: record[offset + 3 + 4 * index],
    })).filter((row) => row.label && [1, 2].includes(row.flag));
  }
  function addStatement(index) {
    if (!usable() || compareLock || askabled || canask !== 1) return;
    const candidate = creps.indexOf(index);
    if (candidate < 0) return;
    compareLock = true;
    pren = candidate;
    pairit();
    later(() => {
      compareLock = false;
      invalidate();
    }, 450);
    later(() => {
      if (!pairon && pair.every((value) => value === '') && abled === 1)
        notify('Those statements are consistent. Try another pair.');
      invalidate();
    }, 1700);
  }
  function evidenceList(interview) {
    const list = el('div', 'evidence-list scroll');
    list.setAttribute('aria-label', 'Evidence');
    [...itco].reverse().forEach((id) => {
      const row = button(
        itemName(id),
        () => chooseItem(id),
        null,
        'evidence-choice',
      );
      row.prepend(picture(id));
      row.dataset.item = id;
      row.classList.toggle('chosen', activeItem() === id);
      row.setAttribute('aria-pressed', activeItem() === id ? 'true' : 'false');
      if (interview)
        row.appendChild(
          el(
            'small',
            'item-state',
            itemList[12 * id + curchar - 1] === 1 ? 'Discussed' : 'Ask about',
          ),
        );
      list.appendChild(row);
    });
    return list;
  }
  function itemDetail(interview) {
    const id = activeItem(),
      detail = el('article', 'item-detail scroll');
    detail.dataset.item = id;
    if (id === undefined) {
      detail.appendChild(
        el('p', 'empty-state', 'Your collected evidence will appear here.'),
      );
      return detail;
    }
    const hero = el('div', 'evidence-heading');
    hero.append(
      picture(id),
      heading(itemName(id), text(itemList[12 * id + 11])),
    );
    detail.appendChild(hero);
    if (interview) {
      if (itemList[12 * id + curchar - 1] !== 1) {
        const allowed = askabled === 1 && itemList[12 * id + 7] !== 2;
        detail.appendChild(
          el(
            'p',
            'muted',
            allowed
              ? 'Find out what ' + names[curchar - 2] + ' knows about this.'
              : text($('repinfo').textContent) ||
                  'There is nothing to ask about this.',
          ),
        );
        const askButton = button(
          'Ask about this',
          () => {
            if (usable() && askabled === 1) ask();
          },
          'sound',
          'primary',
        );
        askButton.id = 'ask-question';
        askButton.disabled = !allowed || !usable();
        detail.appendChild(askButton);
      } else {
        const head = el('div', 'statement-heading');
        head.append(
          el('span', 'eyebrow', 'RECORDED STATEMENTS'),
          button(
            'Replay answer',
            () => {
              if (usable()) {
                returnPane = 'interview';
                replay();
              }
            },
            'replay',
            'quiet',
          ),
        );
        detail.appendChild(head);
        const list = el('div', 'statements');
        statements(id, curchar).forEach((statement) => {
          const row = button(
            statement.label,
            () => addStatement(statement.index),
            'compare',
            'statement',
          );
          row.dataset.reply = statement.index;
          row.disabled = statement.flag === 2 || !usable() || compareLock;
          row.classList.toggle('resolved', statement.flag === 2);
          list.appendChild(row);
        });
        if (!list.children.length)
          list.appendChild(
            el(
              'p',
              'muted',
              text($('repinfo').textContent) ||
                'No statement has been recorded about this.',
            ),
          );
        detail.appendChild(list);
      }
    } else {
      const use = button(
        'Use this item here',
        () => {
          if (usable()) {
            pane = '';
            tryuse(id);
            baron = 0;
            topoff('topbar');
          }
        },
        'search',
        'primary',
      );
      use.disabled = itemList[12 * id + 7] !== 0 || !usable();
      detail.appendChild(use);
      let any = false;
      for (let character = 2; character <= 7; character++)
        if (itemList[12 * id + character - 1] === 1) {
          const notes = statements(id, character);
          if (notes.length) {
            any = true;
            detail.appendChild(el('h3', 'witness-label', names[character - 2]));
            notes.forEach((note) =>
              detail.appendChild(el('p', 'recorded-note', note.label)),
            );
          }
        }
      if (!any)
        detail.appendChild(
          el(
            'p',
            'muted',
            'Witness statements about this evidence will be recorded here.',
          ),
        );
    }
    return detail;
  }
  function comparison() {
    const tray = el('aside', 'compare-tray');
    tray.appendChild(el('span', 'eyebrow', 'FIND THE CONTRADICTION'));
    const slots = el('div', 'compare-slots');
    [0, 1].forEach((index) => {
      const slot = el('div', 'compare-slot' + (pair[index] ? ' filled' : ''));
      slot.append(
        el('span', 'slot-number', String(index + 1).padStart(2, '0')),
        el(
          'p',
          '',
          pair[index]
            ? text($(index ? 'conBt' : 'conAt').textContent)
            : index
              ? 'Add a conflicting statement'
              : 'Choose a recorded statement',
        ),
      );
      slots.appendChild(slot);
    });
    tray.appendChild(slots);
    const reset = button(
      'Clear comparison',
      () => {
        if (!pairon) {
          pair = ['', ''];
          words('conAt', '');
          words('conBt', '');
        }
      },
      'close',
      'quiet',
    );
    reset.disabled = pairon === 1 || !pair[0];
    tray.appendChild(reset);
    return tray;
  }
  const mapNames = [
    'West end',
    'Farm entrance',
    'West lane',
    'Village centre',
    'North junction',
    'Woods lane',
    'Woods entrance',
    'Woodland junction',
    'North woods',
    'Atlas entrance',
  ];
  function buildMap() {
    const layout = el('div', 'map-layout'),
      art = el('div', 'map-art'),
      image = el('img');
    image.src = 'gfx/Map.jpg';
    image.alt = 'Original map of Edenton';
    art.appendChild(image);
    mapNames.forEach((name, index) => {
      const mark = button(
        name,
        () => {
          selectedMap = index + 1;
        },
        'pin',
        'map-pin icon-only',
      );
      mark.style.left = mapins[4 * index + 3] + '%';
      mark.style.top = mapins[4 * index + 2] + '%';
      mark.dataset.destination = index + 1;
      mark.classList.toggle('current', maploc === index + 1);
      mark.classList.toggle('chosen', selectedMap === index + 1);
      art.appendChild(mark);
    });
    const list = el('div', 'map-destinations scroll');
    mapNames.forEach((name, index) => {
      const row = button(
        name,
        () => (selectedMap = index + 1),
        'pin',
        'destination',
      );
      row.classList.toggle('chosen', selectedMap === index + 1);
      if (maploc === index + 1)
        row.appendChild(el('small', '', 'You are here'));
      list.appendChild(row);
    });
    const side = el('div', 'map-sidebar');
    side.appendChild(list);
    const go = button(
      'Travel to ' + mapNames[selectedMap - 1],
      () => {
        if (usable() && selectedMap !== maploc) {
          pane = '';
          mapon = 1;
          mapmove(selectedMap);
        }
      },
      'arrow',
      'primary',
    );
    go.id = 'travel';
    go.disabled = selectedMap === maploc || !usable();
    side.appendChild(go);
    layout.append(art, side);
    return [layout];
  }
  function savedAgo(when) {
    if (!when) return '';
    const minutes = Math.round((Date.now() - when) / 60000);
    if (minutes < 1) return 'Saved just now';
    if (minutes < 60) return 'Saved ' + minutes + ' min ago';
    const hours = Math.round(minutes / 60);
    if (hours < 24) return 'Saved ' + hours + ' hr ago';
    return 'Saved ' + new Date(when).toLocaleDateString();
  }
  function saveSummary(info) {
    return (
      'Friday, ' +
      (info.time === 12 ? 'midnight' : 'after ' + info.time + 'pm') +
      ' · ' +
      info.progress +
      '% solved'
    );
  }
  function buildSaves() {
    const layout = el('div', 'save-grid');
    {
      let info;
      try {
        info = JSON.parse(localStorage['mobile.saveInfo.game'] || 'null');
      } catch {}
      const exists = !!localStorage.game,
        card = el('article', 'save-card autosave-card');
      card.append(
        el('span', 'eyebrow', 'AUTOSAVE'),
        el(
          'h2',
          '',
          exists ? info?.location || 'Start of the hour' : 'No autosave yet',
        ),
        el(
          'p',
          'muted',
          exists
            ? info
              ? saveSummary(info)
              : 'Your latest progress'
            : 'Saved automatically as you investigate.',
        ),
      );
      if (exists && info?.updated)
        card.appendChild(el('p', 'save-time', savedAgo(info.updated)));
      const actions = el('div', 'card-actions'),
        load = button('Load', () => confirm('Load', 'auto'), 'play', 'primary');
      load.dataset.load = 'auto';
      load.disabled = !exists;
      actions.append(load);
      card.appendChild(actions);
      layout.appendChild(card);
    }
    [1, 2].forEach((slot) => {
      let info;
      try {
        info = JSON.parse(
          localStorage['mobile.saveInfo.Save' + slot] || 'null',
        );
      } catch {}
      const exists = !!localStorage['Save' + slot],
        card = el('article', 'save-card');
      card.append(
        el('span', 'eyebrow', 'CASE FILE ' + String(slot).padStart(2, '0')),
        el(
          'h2',
          '',
          exists ? info?.location || 'Saved investigation' : 'Empty case file',
        ),
        el(
          'p',
          'muted',
          exists
            ? info
              ? saveSummary(info)
              : 'A previously saved investigation'
            : 'Keep a separate record of your progress here.',
        ),
      );
      if (exists && info?.updated)
        card.appendChild(el('p', 'save-time', savedAgo(info.updated)));
      const actions = el('div', 'card-actions'),
        save = button(
          exists ? 'Replace' : 'Save here',
          () => confirm('Save', slot),
          'save',
        ),
        load = button('Load', () => confirm('Load', slot), 'play', 'primary');
      save.dataset.save = slot;
      load.dataset.load = slot;
      save.disabled = started !== 0;
      load.disabled = !exists;
      actions.append(save, load);
      card.appendChild(actions);
      layout.appendChild(card);
    });
    return [layout];
  }
  function buildSettings() {
    const body = el('div', 'settings-layout scroll');
    function setting(title, description, control) {
      const row = el('div', 'setting-row');
      row.append(heading(title, description), control);
      body.appendChild(row);
    }
    setting(
      'Captions',
      'English dialogue captions',
      button(subon ? 'On' : 'Off', captions, 'cc'),
    );
    setting(
      'Film framing',
      'Original keeps the whole image. Fill crops the edges to fit the display.',
      button(
        localStorage.mobileFraming === 'fill'
          ? 'Fill display'
          : 'Original frame',
        () => {
          localStorage.mobileFraming =
            localStorage.mobileFraming === 'fill' ? 'original' : 'fill';
          framing();
        },
        'case',
      ),
    );
    const volume = el('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '10';
    volume.step = '1';
    volume.value = avmus;
    volume.setAttribute('aria-label', 'Music volume');
    volume.oninput = () => {
      avmus = Number(volume.value);
      musit();
    };
    setting('Music volume', 'Dialogue volume is unchanged.', volume);
    setting(
      'Video library',
      'The imported original is stored on this device.',
      button('Import again', () => window.AndroidGame?.importVideo(), 'case'),
    );
    return [body];
  }
  function buildJournal() {
    if (tab === 'evidence') {
      const layout = el('div', 'evidence-layout');
      layout.append(evidenceList(false), itemDetail(false));
      return [layout];
    }
    const list = el('div', 'journal-list scroll');
    if (tab === 'chief') {
      list.appendChild(
        heading(
          'A word with the Chief',
          'Consult your notes or listen to an earlier call.',
        ),
      );
      list.appendChild(
        button(
          'What should I investigate next?',
          () => {
            nextip();
            dialog(
              'Notes on the investigation',
              text($('greenovertext').textContent),
              [{ label: 'Back', icon: 'back' }],
            );
          },
          'help',
          'journal-entry',
        ),
      );
      cluelist.forEach((clue, index) =>
        list.appendChild(
          button(
            'Chief call ' + (cluke - index),
            () => {
              const message = text(clues[6 * clue + 5]);
              dialog('Chief call ' + (cluke - index), message, [
                {
                  label: 'Listen',
                  icon: 'sound',
                  action: () => {
                    tvol = dipvol;
                    acom.src = 'sound/C' + (clue + 1) + '.mp3';
                    const source = acom.src;
                    acom.play();
                    acom.addEventListener(
                      'ended',
                      () => {
                        if (acom.src === source) tvol = fullvol;
                      },
                      { once: true },
                    );
                    ownTranscript = text(
                      $('ch' + (clue + 1))?.textContent || message,
                    );
                    pane = 'call';
                  },
                },
                { label: 'Back', icon: 'back' },
              ]);
            },
            'phone',
            'journal-entry',
          ),
        ),
      );
    } else {
      const captures = tab === 'events' ? memcap : concap;
      list.appendChild(
        heading(
          tab === 'events' ? 'Events on record' : 'Contradictions uncovered',
          'Revisit a recorded moment in the investigation.',
        ),
      );
      captures.forEach((capture, index) =>
        list.appendChild(
          button(
            text(memScenes[4 * capture + 2]),
            () => {
              menpos = tab === 'events' ? 3 : 4;
              menver = index;
              returnPane = 'journal';
              pane = '';
              selectmem();
            },
            'replay',
            'journal-entry',
          ),
        ),
      );
      if (!captures.length)
        list.appendChild(
          el('p', 'empty-state', 'No moments have been recorded here yet.'),
        );
    }
    return [list];
  }
  function renderHome() {
    update(
      'ui-home',
      [started, !!localStorage.game, timenow, progper, thend].join('|'),
      () => {
        const brand = el('div', 'home-brand'),
          logo = el('img');
        logo.src = 'gfx/Logo.png';
        logo.alt = 'Contradiction';
        brand.append(logo, el('p', 'home-tagline', 'SPOT THE LIAR'));
        const menu = el('div', 'home-menu'),
          resume = started === 0 || !!localStorage.game,
          primary = button(
            thend === 4
              ? 'Return to Edenton'
              : resume
                ? 'Continue investigation'
                : 'Begin investigation',
            begin,
            'play',
            'primary home-primary',
          );
        primary.id = 'begin-investigation';
        menu.append(
          primary,
          button('Case files', () => open('saves'), 'save'),
          button('Settings', () => open('settings'), 'settings'),
          button('How to investigate', () => open('help'), 'help'),
        );
        const footer = el('div', 'home-footer');
        footer.append(
          button('Credits', () => open('credits'), null, 'quiet'),
          button('Watch prologue', () => playPrologue(), 'play', 'quiet'),
          button('New investigation', () => confirm('Reset', 0), null, 'quiet'),
        );
        if (started === 0)
          footer.appendChild(
            button(
              'Save & exit',
              () => {
                saver('game');
                window.AndroidGame?.exitGame();
              },
              'exit',
              'quiet',
            ),
          );
        const brief = el('aside', 'home-brief');
        brief.append(
          el('span', 'eyebrow', 'EDENTON · FRIDAY'),
          el('h2', '', thend === 4 ? 'Case closed.' : 'A village of secrets.'),
          el(
            'p',
            '',
            thend === 4
              ? 'The truth is on record. Revisit Edenton, or begin a new investigation.'
              : 'A young woman is dead. Everyone has a story. Someone is lying.',
          ),
          el('span', 'case-rule', 'AN INVESTIGATION BY INSPECTOR JENKS'),
        );
        return [brand, menu, brief, footer];
      },
    );
  }
  function leaveInterview() {
    if (!usable()) return;
    pane = '';
    press(4);
    if (exon === 1)
      dialog('Which way?', 'Choose where to continue your investigation.', [
        {
          label: text($('lopleft').textContent) || 'Leave to the left',
          action: () => press(0),
          icon: 'arrow',
        },
        {
          label: text($('lopright').textContent) || 'Leave to the right',
          action: () => press(1),
          icon: 'arrow',
        },
        {
          label: 'Stay here',
          action: () => {
            exon = 0;
            topoff('exitop');
            pane = 'interview';
          },
          icon: 'back',
        },
      ]);
  }
  function transcript() {
    if (ownTranscript) return ownTranscript;
    if (!subon) return '';
    return [...document.querySelectorAll('#wrap > div')]
      .filter(
        (node) =>
          /^ch\d+$/.test(node.id) &&
          Number(getComputedStyle(node).opacity) > 0.5,
      )
      .map((node) => text(node.textContent))
      .join('\n\n');
  }
  function renderPanel() {
    let title = '',
      kicker = '',
      key = '',
      build;
    const interview = pane === 'interview';
    if (pane === 'inventory' || interview) {
      title = interview ? names[curchar - 2] || 'Witness' : 'Evidence';
      kicker = interview
        ? 'INTERVIEW / ' + text($('place').textContent)
        : 'THE CASEBOOK';
      key = JSON.stringify([
        itco,
        curq,
        curchar,
        abled,
        askabled,
        canask,
        pair,
        pairon,
        compareLock,
        itemList,
        repsList[activeItem()]?.slice(
          39 * (curchar - 2),
          39 * (curchar - 2) + 39,
        ),
        $('repinfo').textContent,
        $('conAt').textContent,
        $('conBt').textContent,
      ]);
      build = () => {
        const layout = el(
          'div',
          'evidence-layout' + (interview ? ' interview-layout' : ''),
        );
        layout.append(evidenceList(interview), itemDetail(interview));
        if (interview) layout.appendChild(comparison());
        return [layout];
      };
    } else if (pane === 'map') {
      title = 'Edenton';
      kicker = 'THE VILLAGE & SURROUNDING WOODS';
      key = [selectedMap, maploc, intercept, abled].join('|');
      build = buildMap;
    } else if (pane === 'saves') {
      title = 'Case files';
      kicker = 'YOUR INVESTIGATION';
      key = [
        localStorage.Save1,
        localStorage.Save2,
        localStorage['mobile.saveInfo.game'],
        started,
        Math.floor(Date.now() / 60000),
      ].join('|');
      build = buildSaves;
    } else if (pane === 'settings') {
      title = 'Settings';
      kicker = 'MAKE YOURSELF AT HOME';
      key = [subon, localStorage.mobileFraming].join('|');
      build = buildSettings;
    } else if (pane === 'journal') {
      title = 'Casebook';
      kicker = 'INSPECTOR JENKS';
      key = JSON.stringify([
        tab,
        itco,
        curq,
        memcap,
        concap,
        cluelist,
        itemList,
      ]);
      build = buildJournal;
    } else if (pane === 'help') {
      title = 'How to investigate';
      kicker = 'FOLLOW THE EVIDENCE';
      key = 'help';
      build = () => {
        const copy = el('article', 'help-copy scroll');
        [
          [
            'Explore',
            'Tap a destination to move around Edenton. Search a location for evidence, or use the map to travel.',
          ],
          [
            'Ask questions',
            'Choose evidence in an interview and ask the witness about it. Their statements are recorded automatically.',
          ],
          [
            'Spot the lie',
            'Add two conflicting statements to the comparison. Statements can concern different evidence from the same witness.',
          ],
          [
            'Keep your notes',
            'The casebook contains evidence, recorded events, contradictions and advice from the Chief. Progress saves when you leave the app.',
          ],
        ].forEach(([a, b]) => copy.appendChild(heading(a, b)));
        return [copy];
      };
    } else if (pane === 'credits') {
      title = 'The people behind the mystery';
      kicker = 'CONTRADICTION';
      key = 'credits';
      build = () => {
        const copy = el('article', 'credits-copy scroll'),
          image = el('img');
        image.src = 'gfx/Splash169.jpg';
        image.alt = 'Original Contradiction production credits';
        image.style.width = '100%';
        copy.append(
          el('h2', '', 'Created by Tim Follin'),
          el('p', '', 'Starring Rupert Booth, Paul Darrow and John Guilor'),
          image,
          el(
            'p',
            '',
            'Production by Pneuma Films. Original story, art, music and film remain the work of their original creators.',
          ),
        );
        return [copy];
      };
    } else if (pane === 'call') {
      title = 'Conversation with the Chief';
      kicker = 'CALL TRANSCRIPT';
      key = transcript();
      build = () => [el('article', 'transcript scroll', transcript())];
    } else return;
    update('panel-header', pane + '|' + title, () => {
      const group = el('div', 'panel-heading');
      group.append(el('span', 'eyebrow', kicker), el('h1', '', title));
      return [
        button(
          interview ? 'Leave' : 'Back',
          interview ? leaveInterview : close,
          'back',
          'back-button',
        ),
        group,
        ...(interview
          ? [button('Pause', () => open('home'), 'pause', 'icon-only')]
          : []),
      ];
    });
    update('panel-tabs', pane === 'journal' ? tab : '', () =>
      pane === 'journal'
        ? ['evidence', 'events', 'contradictions', 'chief'].map((name) => {
            const node = button(
              name[0].toUpperCase() + name.slice(1),
              () => {
                tab = name;
                signatures.clear();
              },
              null,
              'tab',
            );
            node.classList.toggle('chosen', name === tab);
            return node;
          })
        : [],
    );
    $('ui-panel').classList.toggle('has-tabs', pane === 'journal');
    update('panel-body', pane + '|' + key, build);
  }
  function render() {
    root.classList.toggle('playing-prologue', !!prologue);
    if (prologue) {
      setHidden('ui-home', true);
      setHidden('ui-panel', true);
      setHidden('ui-loading', true);
      return;
    }
    if (tipon) {
      tipon = 0;
      tip = 8;
      topoff('tipbox');
    }
    const ready =
      vplayer.readyState >= 2 && started !== 1 && (readyOnce || abled === 1);
    setHidden('ui-loading', ready);
    if (ready && !readyOnce) {
      readyOnce = true;
      open('home');
      return;
    }
    if (thend === 4 && !completedShown) {
      completedShown = true;
      open('home');
      return;
    }
    if (!pane && usable() && invon === 1) pane = 'interview';
    if (pane === 'interview' && invon === 0) pane = '';
    if (recalled) {
      if (pane) {
        returnPane = pane;
        pane = '';
      }
    } else if (returnPane) {
      pane = returnPane;
      returnPane = '';
      signatures.clear();
    }
    setHidden(
      'ui-panel',
      !pane || pane === 'home' || (pane === 'interview' && abled === 0),
    );
    setHidden('ui-home', pane !== 'home' || !ready);
    root.classList.toggle('in-film', !usable() || !!recalled || thend > 0);
    root.classList.toggle(
      'has-panel',
      !$('ui-panel').hidden || !$('ui-home').hidden,
    );
    root.classList.toggle('interviewing', pane === 'interview');
    setText('scene-time', text($('thetime').textContent) || 'FRIDAY · EDENTON');
    setText('scene-place', text($('place').textContent) || 'The investigation');
    setPressed(
      $('scene-tools').querySelector('[aria-label="Captions"]'),
      subon,
    );
    if (pane === 'home') renderHome();
    else if (pane) renderPanel();
    update(
      'scene-routes',
      JSON.stringify([
        arrowops,
        locon,
        options,
        abled,
        invon,
        pane,
        innerWidth,
        innerHeight,
        localStorage.mobileFraming,
        document.documentElement.style.getPropertyValue('--android-safe-left'),
        document.documentElement.style.getPropertyValue('--android-safe-right'),
      ]),
      () =>
        !usable() || invon || pane
          ? []
          : arrowops
              .map((route, index) => {
                if (!route) return null;
                const label =
                  text($('opt_' + ['A', 'B', 'C', 'D'][index]).textContent) ||
                  'Continue';
                const node = button(
                  label,
                  () => {
                    if (usable()) movebut(index);
                  },
                  null,
                  'route-marker',
                );
                node.dataset.route = index;
                const base = options + 9 + 6 * index;
                const art = el('img');
                art.src = 'gfx/arrows/D' + (locList[base + 2] || 0) + '.png';
                art.alt = '';
                node.prepend(art);
                const offsets = [
                  [0.09, 0.06],
                  [0.09, 0.24],
                  [0.033, 0.09],
                  [0.187, 0.09],
                ];
                const fill = localStorage.mobileFraming === 'fill';
                const width = fill
                    ? Math.max(innerWidth, (innerHeight * 16) / 9)
                    : Math.min(innerWidth, (innerHeight * 16) / 9),
                  height = (width * 9) / 16;
                const x =
                  (innerWidth - width) / 2 +
                  ((Number(locList[base + 3]) || 0) / 1024 +
                    offsets[index][0]) *
                    width;
                const y =
                  (innerHeight - height) / 2 +
                  ((Number(locList[base + 4]) || 0) / 576 + offsets[index][1]) *
                    height;
                const safe = getComputedStyle(document.documentElement);
                const left =
                    parseFloat(safe.getPropertyValue('--android-safe-left')) ||
                    0,
                  right =
                    parseFloat(safe.getPropertyValue('--android-safe-right')) ||
                    0;
                node.style.left =
                  Math.max(40 + left, Math.min(innerWidth - 40 - right, x)) +
                  'px';
                node.style.top =
                  Math.max(72, Math.min(innerHeight - 100, y)) + 'px';
                return node;
              })
              .filter(Boolean),
    );
    update(
      'scene-hotspots',
      [
        usable(),
        invest,
        curchar,
        pane,
        innerWidth,
        innerHeight,
        localStorage.mobileFraming,
        signatures.get('scene-routes'),
      ].join('|'),
      () => {
        if (pane || !usable() || invest !== 1 || curchar !== 0) return [];
        const search = button(
          'Search',
          () => {
            if (usable() && invest === 1) investigate();
          },
          null,
          'route-marker search-hotspot',
        );
        const art = el('img');
        art.src = 'gfx/arrows/I.png';
        art.alt = '';
        search.prepend(art);
        const width =
            localStorage.mobileFraming === 'fill'
              ? Math.max(innerWidth, (innerHeight * 16) / 9)
              : Math.min(innerWidth, (innerHeight * 16) / 9),
          height = (width * 9) / 16;
        // Original corner spot, nudged clear of any route arrow it would cover.
        const half = 36,
          gap = 8,
          minY = 76 + half,
          maxY = innerHeight - 44;
        let x = Math.max(
            44,
            Math.min(innerWidth - 52, (innerWidth - width) / 2 + width * 0.905),
          ),
          y = Math.max(
            minY,
            Math.min(maxY, (innerHeight - height) / 2 + height * 0.86),
          );
        const routes = [...$('scene-routes').children].map((node) =>
          node.getBoundingClientRect(),
        );
        const hit = () =>
          routes.find(
            (r) =>
              x + half + gap > r.left &&
              x - half - gap < r.right &&
              y + half + gap > r.top &&
              y - half - gap < r.bottom,
          );
        for (let tries = 0, r; tries < 6 && (r = hit()); tries++) {
          const above = r.top - gap - half;
          if (above >= minY) y = above;
          else x = Math.max(44, r.left - gap - half);
        }
        search.style.left = x + 'px';
        search.style.top = y + 'px';
        return [search];
      },
    );
    setHidden('replay-tools', recalled !== 2);
    update('replay-tools', recalled === 2 ? 'replay' : '', () =>
      recalled === 2
        ? [button('Return to investigation', () => stoprep(), 'back', 'quiet')]
        : [],
    );
    const call = transcript();
    if (
      call &&
      pane !== 'call' &&
      !$('scene-tools').querySelector('[data-transcript]')
    ) {
      const node = button(
        'Read call',
        () => {
          pane = 'call';
        },
        'phone',
      );
      node.dataset.transcript = 'true';
      $('scene-tools').prepend(node);
    }
    if (!call) $('scene-tools').querySelector('[data-transcript]')?.remove();
  }
  function invalidate() {
    if (document.hidden || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
      autosaveSoon();
    });
  }
  // Autosave while playing: shortly after anything changes, once the scene has
  // settled (not walking, answering, replaying, in the prologue or a dialog).
  // The original only wrote this slot on quit; Android also saves on pause.
  let autosaveTimer = 0;
  function autosaveSoon() {
    if (autosaveTimer) return;
    autosaveTimer = setTimeout(() => {
      autosaveTimer = 0;
      if (
        started !== 0 ||
        abled !== 1 ||
        locon !== 0 ||
        recalled ||
        prologue ||
        modal ||
        thend > 0 ||
        document.hidden ||
        !currentScene()
      )
        return;
      const quiet = savnews;
      savnews = 0;
      try {
        saver('game');
      } finally {
        savnews = quiet;
      }
    }, 2500);
  }
  // Our own caption overlay lives inside #wrap; its updates never need a re-render.
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !captionLayer.contains(record.target)))
      invalidate();
  });
  observer.observe($('wrap'), {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style'],
  });
  for (const name of [
    'words',
    'topon',
    'topoff',
    'openwood',
    'closewood',
    'holdgame',
    'startgame',
    'loadstuff',
    'select',
    'selectmem',
    'stoprep',
    'moveloc',
    'ask',
    'getreps',
    'replies',
    'pairit',
    'repon',
    'repoff',
    'newevent',
    'evshow',
    'music',
    'timeup',
  ]) {
    const original = window[name];
    window[name] = function (...args) {
      const result = original.apply(this, args);
      invalidate();
      return result;
    };
  }
  const oldNews = news;
  news = function (message) {
    const result = oldNews(message);
    notify(message);
    invalidate();
    return result;
  };
  // Location memory. The original save format has no position: loading always
  // starts the current hour at a fixed spot. We note the exact location beside
  // each save (keyed by a fingerprint of the save data, so it only applies to
  // that exact save) and, on load, arrive there instead without replaying any
  // story scene. Saves stay byte-identical and compatible with the PC game.
  const fingerprint = (data) => {
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++)
      hash = Math.imul(hash ^ data.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(36) + ':' + data.length;
  };
  let resumeScene = null,
    loadingSlot = null,
    placeSettled = true;
  const oldLoader = loader;
  loader = function (slot) {
    loadingSlot = slot;
    try {
      return oldLoader.apply(this, arguments);
    } finally {
      loadingSlot = null;
    }
  };
  const currentScene = () =>
    placeSettled && started === 0 && !recalled && options >= 0
      ? locList[options]
      : null;
  const oldSaver = saver;
  saver = function (slot) {
    const result = oldSaver(slot);
    if (localStorage[slot]) {
      const key = 'mobile.saveInfo.' + slot,
        scene = slot === 'reset' ? null : currentScene(),
        save = fingerprint(localStorage[slot]);
      let previous = null;
      try {
        previous = JSON.parse(localStorage[key] || 'null');
      } catch {}
      if (!previous || previous.save !== save || previous.scene !== scene)
        localStorage[key] = JSON.stringify({
          location: text(newname || $('place').textContent),
          time: timenow,
          progress: progper,
          updated: Date.now(),
          scene,
          save,
        });
    }
    // An autosave must not schedule another render -> autosave cycle.
    if (slot !== 'game') invalidate();
    return result;
  };
  const oldLoad = loadstuff;
  loadstuff = function (data) {
    resumeScene = null;
    placeSettled = false;
    if (resetting !== 1 && typeof data === 'string') {
      const print = fingerprint(data);
      // The slot being loaded wins; another slot only counts if its data matches.
      const slots = ['game', 'Save1', 'Save2'];
      if (slots.includes(loadingSlot))
        slots.unshift(...slots.splice(slots.indexOf(loadingSlot), 1));
      for (const slot of slots) {
        try {
          const info = JSON.parse(
            localStorage['mobile.saveInfo.' + slot] || 'null',
          );
          if (info && info.scene && info.save === print) {
            resumeScene = info.scene;
            break;
          }
        } catch {}
      }
    }
    return oldLoad.apply(this, arguments);
  };
  const oldMove = moveloc;
  moveloc = function (index) {
    const target = resumeScene;
    resumeScene = null;
    const at = target === null ? -1 : locList.indexOf(target);
    // Only intercept the load's own "start of the hour" move.
    if (
      at < 0 ||
      at % 33 !== 0 ||
      index !== 0 ||
      arrowops[0] !== timeStarts[timenow - 5]
    ) {
      try {
        return oldMove.apply(this, arguments);
      } finally {
        placeSettled = true;
      }
    }
    // Borrow scene slot 0 for one synchronous call: a scene with no comment,
    // event or music cue whose clip is the location's own idle loop.
    const loop = locList[at + 3 + locList[at + 2]];
    const borrowed = sceneList.slice(0, 11);
    const visit = ['MOBILE RESUME', 0, loop, target, '', '', 1, '', 0, 0, ''];
    for (let i = 0; i < 11; i++) sceneList[i] = visit[i];
    arrowops[0] = 'MOBILE RESUME';
    try {
      return oldMove.call(this, 0);
    } finally {
      for (let i = 0; i < 11; i++) sceneList[i] = borrowed[i];
      placeSettled = true;
    }
  };
  guideon = function () {
    tipon = 0;
    tip = 8;
    topoff('tipbox');
    invalidate();
  };
  gokeys = function (key) {
    if (modal) {
      if (key === KY[4] || key === 27) closeDialog();
      return;
    }
    if (key === KY[4] || key === 27) {
      mobileBack();
      return;
    }
    if (key === 67) {
      captions();
      return;
    }
    if (!pane) keys(key);
    invalidate();
  };
  window.mobileBack = () => {
    if (modal) {
      closeDialog();
      if (prologue) vplayer.play();
      return true;
    }
    if (prologue) {
      pausePrologue();
      return true;
    }
    if (recalled === 2) {
      stoprep();
      return true;
    }
    if (pane === 'interview') {
      leaveInterview();
      return true;
    }
    if (pane) {
      if (pane === 'home' && started !== 0) return false;
      close();
      return true;
    }
    open('home');
    return true;
  };
  window.mobileUI = {
    open,
    close,
    invalidate,
    get pane() {
      return pane;
    },
  };
  if (new Set(KY).size !== 8 || KY.some((key) => !Number.isFinite(key)))
    hardres();
  for (const event of ['contextmenu', 'selectstart', 'dragstart'])
    document.addEventListener(event, (event) => event.preventDefault());
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Enter',
          ' ',
        ].includes(event.key)
      )
        event.preventDefault();
    },
    true,
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else invalidate();
  });
  ['loadeddata', 'playing', 'pause', 'seeked', 'error'].forEach((event) =>
    vplayer.addEventListener(event, invalidate),
  );
  render();
})();
