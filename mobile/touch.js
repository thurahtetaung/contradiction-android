/* Touch adapter: keep story/progression in game.js, give menus explicit actions. */
(() => {
  const originalKeys = gokeys;
  const confirmationOps = {6:['Save',1],7:['Save',2],8:['Load',1],9:['Load',2],11:['Reset',0]};
  const panel = document.createElement('section'); panel.id = 'touch-menu'; panel.hidden = true;
  panel.setAttribute('aria-label','Game menu');
  const tabs = document.createElement('nav'); tabs.id = 'touch-tabs';
  ['Options','Game','Chief','Events','Contradictions'].forEach((title,index) => {
    const tab = document.createElement('button'); tab.textContent = title; tab.dataset.tab = index;
    tab.onclick = () => { menpos = index; respos(); render(); }; tabs.appendChild(tab);
  });
  const close = document.createElement('button'); close.textContent = 'Back'; close.id = 'touch-menu-back';
  close.onclick = () => { if (started === 0) closewood(); else hint('Choose Start Game in the Game tab.'); render(); };
  tabs.appendChild(close);
  const rows = document.createElement('div'); rows.id = 'touch-menu-rows';
  panel.append(tabs,rows); document.body.appendChild(panel);
  let dialog = null, menuSignature = '';
  let hintTimer;
  function hint(text) {
    let status = document.getElementById('touch-status');
    if (!status) { status = document.createElement('div'); status.id='touch-status';status.setAttribute('role','status');document.body.appendChild(status); }
    status.textContent=text;status.hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>status.hidden=true,3000);
  }
  // Old controller calibration can assign the same key to several virtual buttons.
  // Repair ambiguous bindings, and use touch help instead of keyboard calibration.
  if (new Set(KY).size !== 8 || KY.some(key=>!Number.isFinite(key))) hardres();
  function clearConfirmation() {
    greenops=greenon=0;topoff('greenover');topon('mensel');keyup();
  }
  function finishDialog(accept) {
    if (!dialog) return;
    const active=dialog;dialog=null;active.element.remove();clearConfirmation();
    if (accept) active.action();
    menuSignature='';render();
  }
  function confirmAction(kind,slot) {
    if (dialog) return;
    clearConfirmation();
    const element=document.createElement('section');element.id='touch-confirm';
    element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');
    const box=document.createElement('div'); const title=document.createElement('h2');
    const text=document.createElement('p');
    title.textContent=kind==='Reset'?'Reset game?':`${kind} Game ${slot}?`;
    text.textContent=kind==='Save'?(localStorage['Save'+slot]?'Replace the progress stored in this slot?':'Save your current progress in this slot?')
      :kind==='Load'?'Replace your current progress with this saved game?':'This starts the story again. Your manual save slots are kept.';
    const accept=document.createElement('button');accept.id='touch-confirm-accept';accept.textContent=kind;accept.onclick=()=>finishDialog(true);
    const cancel=document.createElement('button');cancel.id='touch-confirm-cancel';cancel.textContent='Cancel';cancel.onclick=()=>finishDialog(false);
    box.append(title,text,accept,cancel);element.appendChild(box);document.body.appendChild(element);
    dialog={element,action:()=>{
      if (kind==='Save') {savetype=0;savnews=0;saver('Save'+slot);hint(`Game ${slot} saved`);}
      else if (kind==='Load') loader('Save'+slot);
      else {resetting=1;goload(localStorage.reset);}
    }};
  }
  function captureLegacyConfirmation() {
    const operation=confirmationOps[greenops];
    if (operation) confirmAction(...operation);
  }
  gokeys = function(key) {
    if (dialog) {
      if (key===KY[4]) finishDialog(false);
      else if (key===KY[5]) finishDialog(true);
      return;
    }
    if (toolson===1 && greenops===0 && menpos===0 && menver===4 && key===KY[5]) {
      document.getElementById('mobile-help').click();return;
    }
    originalKeys(key);captureLegacyConfirmation();render();
  };
  function press(index) { keyup();try {gokeys(KY[index]);} finally {keyup();} }
  function activateRow(index) {
    if (dialog || abled!==1 || recalled!==0 || tipon!==0) return;
    menver=index;opos();
    if (menpos===1) {
      if (index===0) startgame();
      else if (index<=2) confirmAction('Save',index);
      else if (index<=4) {
        const slot=index-2;
        if (!localStorage['Save'+slot]) {hint(`No game saved in slot ${slot}`);return;}
        confirmAction('Load',slot);
      } else if (index===5) confirmAction('Reset',0);
    } else if (menpos===0 && index===4) document.getElementById('mobile-help').click();
    else if (menpos===0 && index===6) {if(started===0){saver('game');hint('Progress saved');}else hint('Start the game first.');}
    else press(5);
    render();
  }
  function render() {
    const shown=toolson===1 && greenops===0 && abled===1 && tipon===0 && recalled===0 && started!==1;
    panel.hidden=!shown;
    document.getElementById('menu').classList.toggle('touch-menu-replaced',shown);
    if (!shown) {menuSignature='';return;}
    const source=document.getElementById(ids[menpos]);
    const signature=[menpos,menver,started,source.innerHTML,!!localStorage.Save1,!!localStorage.Save2].join('|');
    if (signature===menuSignature) return;
    menuSignature=signature;
    tabs.querySelectorAll('[data-tab]').forEach(tab=>tab.setAttribute('aria-pressed',Number(tab.dataset.tab)===menpos?'true':'false'));
    rows.replaceChildren();
    const labels=[...source.children].map(child=>child.textContent);
    const count=menpos===1?6:labels.length;
    for(let index=0;index<count;index++) {
      const button=document.createElement('button');button.dataset.row=index;
      button.textContent=labels[index] || '';
      if(menpos===0 && index===4) button.textContent='Touch controls';
      if(menpos===0 && index===6) button.textContent='Save progress';
      button.classList.toggle('selected',index===menver);
      if(menpos===1 && [3,4].includes(index)) button.disabled=!localStorage['Save'+(index-2)];
      button.onclick=()=>activateRow(index);rows.appendChild(button);
    }
    if(count===0) {const empty=document.createElement('p');empty.textContent='Nothing recorded yet.';rows.appendChild(empty);}
  }
  function hit(element,x,y) {
    if(!element)return false;
    const rect=element.getBoundingClientRect();
    if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return false;
    for(let node=element;node && node!==document.body;node=node.parentElement) {
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<0.5)return false;
    }
    return true;
  }
  // The desktop game hides overlapping layers with opacity, so use state and
  // visible rectangles rather than whichever invisible element catches a tap.
  document.addEventListener('click',event=>{
    if(event.target.closest('#mobile-controls,#mobile-message,#touch-menu,#touch-confirm'))return;
    if(dialog)return;
    const {clientX:x,clientY:y}=event;
    if(!hit(document.getElementById('wrap'),x,y))return;
    if(tipon){press(5);return;}
    if(abled!==1||toolson!==0||recalled!==0)return;
    if(exon===1) {
      if(hit(document.querySelector('.lopleft'),x,y))press(0);
      else if(hit(document.querySelector('.lopright'),x,y))press(1);
      return;
    }
    if(mapon===1) {
      if(hit(document.getElementById('maploc1'),x,y)||hit(document.getElementById('maploc2'),x,y))press(5);
      return;
    }
    if(baron===1||invon===1) {
      if(hit(document.querySelector('.itwrap'),x,y)) {
        const images=[...document.querySelectorAll('#itgfx img')];
        const index=images.findIndex(image=>hit(image,x,y));
        if(index>=0 && itco[index]!==undefined) select(itco[index]);
        return;
      }
      if(invon===1 && hit(document.getElementById('repbox'),x,y)) {
        if(askabled===1){press(5);return;}
        const replies=[...document.querySelectorAll('#reptext > div')];
        const index=replies.findIndex(reply=>hit(reply,x,y));
        if(index>=0 && index<repno && canask===1){pren=index;repos();press(5);}
      }
      return;
    }
    const direction=['op_A','op_B','op_C','op_D'].findIndex(id=>hit(document.getElementById(id),x,y));
    if(direction>=0 && arrowops[direction]) {movebut(direction);return;}
    if(hit(document.getElementById('butinv'),x,y))press(6);
  });
  document.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('dragstart',event=>event.preventDefault());
  document.addEventListener('selectstart',event=>event.preventDefault());
  document.addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(event.key)) event.preventDefault();
  },true);
  document.getElementById('mobile-help').addEventListener('click',()=>{
    const message=document.querySelector('#mobile-message p');
    if(message)message.textContent='Tap menu tabs and options directly. Save, Load and Reset have separate confirm and Cancel buttons. Tap scene arrows to move, inventory pictures to select items, and a suspect reply to add it to the contradiction box. The bottom buttons remain available for contextual actions, map navigation and replay.';
  });
  const welcome=document.querySelector('#mobile-message p');
  if(welcome)welcome.textContent='Touch controls: wait for the opening menu, then tap Start Game. Tap scene arrows to move and menu options directly. The bottom buttons handle contextual actions. Tap ? for help.';
  let renderFrame=0;
  function queueRender() {
    if(document.hidden || renderFrame)return;
    renderFrame=requestAnimationFrame(()=>{renderFrame=0;captureLegacyConfirmation();render();});
  }
  // Game functions and their delayed DOM updates invalidate the menu. Observe
  // only original game nodes; observing the new menu would feed back on itself.
  const observer=new MutationObserver(queueRender);
  for(const id of ['menu','tipbox','mainview']) {
    const node=document.getElementById(id);
    if(node)observer.observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style']});
  }
  for(const name of ['openwood','closewood','holdgame','startgame','loadstuff','guideon','selectmem','stoprep','respos','opos']) {
    const original=window[name];
    window[name]=function(...args){const result=original.apply(this,args);queueRender();return result;};
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelAnimationFrame(renderFrame);renderFrame=0;}
    else queueRender();
  });
  render();
})();
