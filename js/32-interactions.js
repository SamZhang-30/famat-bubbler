/* Shared accessible surfaces, fixed-width digit inputs, backups and reset. */
(function(){
  let activeModal=null;
  const returnFocus=new WeakMap();
  function visibleModals(){return [...document.querySelectorAll('.modalBack')].filter(e=>e.style.display==='flex');}
  function syncDialogs(){
    const opened=visibleModals();
    const next=opened.at(-1)||null;
    if(next===activeModal) return;
    const previous=activeModal;
    if(next && !returnFocus.has(next)) returnFocus.set(next,document.activeElement);
    activeModal=next;
    for(const child of document.body.children){
      if(child.tagName==='SCRIPT')continue;
      child.inert=!!next && child!==next;
    }
    if(next){
      const dialog=next.querySelector('.modal');
      const title=dialog.querySelector('.modalTitle');
      if(title){if(!title.id)title.id=next.id+'Title';dialog.setAttribute('aria-labelledby',title.id);}
      const opener=previous&&!opened.includes(previous)?returnFocus.get(previous):null;
      const focus=(opener&&next.contains(opener)?opener:null)||dialog.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)') || dialog;
      focus.focus({preventScroll:true});
    }else if(previous){
      const target=returnFocus.get(previous);returnFocus.delete(previous);
      if(target?.isConnected)target.focus({preventScroll:true});
    }
    if(previous && !opened.includes(previous))returnFocus.delete(previous);
  }
  document.addEventListener('keydown',ev=>{
    const modal=visibleModals().at(-1);if(!modal)return;
    if(ev.key==='Tab'){
      const focus=[...modal.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex="0"]')].filter(e=>!e.disabled&&!e.inert&&e.getClientRects().length);
      if(!focus.length){ev.preventDefault();modal.querySelector('.modal').focus();return;}
      const i=focus.indexOf(document.activeElement);
      if(i<0 || (ev.shiftKey&&i===0) || (!ev.shiftKey&&i===focus.length-1)){
        ev.preventDefault();focus[ev.shiftKey?focus.length-1:0].focus({preventScroll:true});
      }
      return;
    }
    if(ev.key==='Escape'){
      ev.preventDefault();ev.stopImmediatePropagation();
      const close=modal.querySelector('.modalTop [data-action^="close"]');
      if(close)close.click();else modal.style.display='none';return;
    }
    const typing=ev.target?.matches('input,textarea,select,[contenteditable="true"]');
    if(!typing && ev.key!=='Escape' && (/^[ax0-9/]$/i.test(ev.key) || ((ev.ctrlKey||ev.metaKey)&&/^[zy]$/i.test(ev.key)))){
      ev.preventDefault();ev.stopImmediatePropagation();
    }
  },true);
  new MutationObserver(syncDialogs).observe(document.body,{subtree:true,attributes:true,attributeFilter:['style']});

  function digitInput(input){
    if(input.closest('.digitSlots') || input.closest('.idField') || !/^#+$/.test(input.placeholder))return;
    const digits=input.placeholder.length;
    const wrap=document.createElement('span');wrap.className='digitSlots';
    wrap.style.setProperty('--digits',digits);
    if(input.style.width)input.style.width='100%';
    if(input.classList.contains('topicCodeInput'))wrap.classList.add('topicCodeSlots');
    if(input.classList.contains('divTestIdInput'))wrap.classList.add('divisionCodeSlots');
    input.before(wrap);wrap.append(input);
    const ghost=document.createElement('span');ghost.className='digitGhost';ghost.setAttribute('aria-hidden','true');wrap.append(ghost);
    input.placeholder='';input.dataset.digitSlots=String(digits);
    function paint(){const n=Math.min(digits,input.value.length);markIncomplete(input);ghost.innerHTML=`<span class="ghostTyped">${'0'.repeat(n)}</span><span>${'#'.repeat(digits-n)}</span>`;}
    input.addEventListener('input',paint);input.addEventListener('change',paint);paint();
  }
  function markIncomplete(input){
    const bad=!!input.value && !new RegExp("^\\d{"+input.dataset.digitSlots+"}$").test(input.value);
    input.dataset.incomplete=bad?"1":"0";input.setAttribute("aria-invalid",String(bad));
  }
  function enhanceInputs(root=document){
    root.querySelectorAll('input[placeholder]').forEach(digitInput);
    root.querySelectorAll('.digitSlots input').forEach(input=>{
      markIncomplete(input);
      const ghost=input.nextElementSibling;if(!ghost)return;
      const n=Math.min(Number(input.dataset.digitSlots),input.value.length);
      const html=`<span class="ghostTyped">${'0'.repeat(n)}</span><span>${'#'.repeat(Number(input.dataset.digitSlots)-n)}</span>`;
      if(ghost.innerHTML!==html)ghost.innerHTML=html;
    });
  }
  let enhancementQueued=false;
  new MutationObserver(records=>{
    if(!records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1 && !n.closest?.('.digitGhost'))))return;
    if(enhancementQueued)return;enhancementQueued=true;
    queueMicrotask(()=>{enhancementQueued=false;enhanceInputs();});
  }).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',()=>queueMicrotask(()=>enhanceInputs()));
  document.addEventListener('DOMContentLoaded',()=>{enhanceInputs();syncDialogs();if(window.FBStorageVolatile){window.FBStore.failed=true;storageNotice('Storage unavailable. Download a backup before closing.');}});

  // A positioned popup leaves the permission-slip textarea and Apply button in place.
  const advanced=document.getElementById('slipAdvanced');
  window.addEventListener('resize',()=>{advanced.open=false;});
  advanced.addEventListener('toggle',()=>{
    const panel=advanced.querySelector('.advBody'),button=advanced.querySelector('summary');
    button.setAttribute('aria-expanded',String(advanced.open));button.setAttribute('aria-haspopup','dialog');
    if(!advanced.open)return;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Permission slip format');
    const r=button.getBoundingClientRect();const width=Math.min(340,innerWidth-24);
    panel.style.width=width+'px';panel.style.left=Math.max(12,Math.min(r.right-width,innerWidth-width-12))+'px';
    panel.style.top=Math.max(12,Math.min(r.bottom+8,innerHeight-panel.offsetHeight-16))+'px';
  });

  let resetTimer;
  function disarmWorkspaceReset(){const button=document.querySelector('[data-action="resetEverything"]');clearTimeout(resetTimer);button.dataset.armed='0';button.textContent='Confirm';}
  document.addEventListener('click',ev=>{if(!ev.target.closest('[data-action="resetEverything"]'))disarmWorkspaceReset();},true);
  function clearRestoredWorkspaceControls(){
    // Reload can restore form controls independently of localStorage. Clear every
    // workspace-owned control before reset so stale setup values cannot reappear.
    const blankIds=['enrollment','filter','delimiter','school','schoolId4','addSchoolId4',
      'nativeAddFirst','nativeAddLast','nativeStudent3'];
    blankIds.forEach(id=>{const el=document.getElementById(id);if(el){el.value='';el.dataset.committed='';}});
    const filename=document.getElementById('filename');if(filename)filename.value='BubbledAnswerSheet';
    const font=document.getElementById('pdfFont');if(font)font.value='Helvetica';
    const family=document.getElementById('pdfFontFamily');if(family)family.value='Helvetica';
    const teamSize=document.getElementById('customTeamSizeInput');if(teamSize)teamSize.value='';
    document.querySelectorAll('#division input[data-divlabel], #division input[data-divtestid]')
      .forEach(input=>{input.value='';input.removeAttribute('data-assumed');});
    document.querySelectorAll('#bubbles input[type="checkbox"]').forEach(input=>{input.checked=true;});
    const topicOn=document.getElementById('topicTestsEnabled');if(topicOn)topicOn.checked=false;
    const prefix=document.getElementById('topicPrefixEnabled');if(prefix)prefix.checked=true;
    const tbd=document.getElementById('topicTbdEnabled');if(tbd)tbd.checked=true;
    document.querySelectorAll('#topicTestsBox input[type="text"], #topicTestsBox input[type="number"]')
      .forEach(input=>{input.value='';});
    const division=document.getElementById('nativeAddDivision');if(division)division.value='1';
  }
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')disarmWorkspaceReset();},true);
  function downloadJson(data,name){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  document.addEventListener('click',ev=>{
    const button=ev.target.closest('[data-action]');if(!button)return;
    switch(button.dataset.action){
      case 'importKeepSchool':readEnrollment({schoolChoice:'keep'});break;
      case 'importUseSchool':readEnrollment({schoolChoice:'use'});break;
      case 'loadLatestWorkspace':{
        currentConflict=false;const state=loadCurrent();undoStack.length=0;redoStack.length=0;
        if(!state){resettingWorkspace=true;location.reload();break;}
        applyFullSnapshot(state,{persist:false});persistUndoState();storageNotice('Loaded the latest workspace');syncSticky();break;
      }
      case 'keepThisWorkspace':currentRevision=savedRevision();currentConflict=false;saveCurrentNow();persistUndoState();break;
      case 'exportWorkspace':downloadJson({format:'famat-bubbler-backup',version:1,state:getFullSnapshot(),preferences:window.FBPrefs.all(),drafts:loadDraftSlots(),rosters:loadSlots()},'FAMAT-Bubbler-backup.json');break;
      case 'importWorkspace':document.getElementById('workspaceFile').click();break;
      case 'resetEverything':{
        if(button.dataset.armed!=='1'){
          button.dataset.armed='1';button.textContent='Confirm (press again)';
          clearTimeout(resetTimer);resetTimer=setTimeout(()=>{button.dataset.armed='0';button.textContent='Confirm';},6000);return;
        }
        clearTimeout(saveCurrentTimer);resettingWorkspace=true;
        const preserve=new Set([DRAFT_SLOT_KEY,ENROLLMENT_SLOT_KEY]);let ok=true;
        for(const key of Object.keys(localStorage))if(key.startsWith('famatbubbler.')&&!preserve.has(key))ok=window.FBStore.remove(key)&&ok;
        if(ok){
          clearRestoredWorkspaceControls();
          location.reload();
        }else{resettingWorkspace=false;toast('Reset could not finish. Browser storage is unavailable.');}
        break;
      }
      case 'closePdfPreview':document.getElementById('pdfPreviewBack').style.display='none';break;
      case 'downloadPreview':{
        const a=document.createElement('a');a.href=window.FBPdfPreview.url;a.download=window.FBPdfPreview.filename;a.click();break;
      }
      case 'openStudentDetails':openStudentDetails(Number(button.dataset.rowid));break;
      case 'closeStudentDetails':document.getElementById('studentDetailsBack').style.display='none';break;
    }
  });
  document.getElementById('workspaceFile').addEventListener('change',async ev=>{
    try{
      const file=ev.target.files[0];if(!file)return;
      const backup=JSON.parse(await file.text());
      if(backup.format!=='famat-bubbler-backup'||backup.version!==1||!Array.isArray(backup.state?.students))throw new Error('Choose a FAMAT Bubbler backup file.');
      const ids=backup.state.students.map(s=>s.rowId);
      if(ids.some(id=>!Number.isInteger(id)||id<=0)||new Set(ids).size!==ids.length)throw new Error('This backup contains invalid student rows.');
      if(currentConflict)throw new Error('Resolve the other tab conflict before restoring a backup.');
      const all=document.getElementById('restoreSavedData').checked;
      if(all){
        const validState=s=>s&&Array.isArray(s.students)&&s.students.every(r=>r&&Number.isInteger(r.rowId)&&r.rowId>0&&typeof r.id8==='string');
        if(!Array.isArray(backup.drafts)||backup.drafts.length!==DRAFT_SLOT_COUNT||backup.drafts.some(s=>!s||typeof s.name!=='string'||(s.state!==null&&!validState(s.state)))||!Array.isArray(backup.rosters)||backup.rosters.length!==SLOT_COUNT||backup.rosters.some(s=>!s||typeof s.name!=='string'||typeof s.text!=='string')||!backup.preferences||typeof backup.preferences!=='object'||Array.isArray(backup.preferences))throw new Error('The backup is missing valid preferences or saved slots. Uncheck the replacement option to restore only the workspace.');
      }
      const previous=getFullSnapshot();applyFullSnapshot(backup.state);
      if(all){
        const ok=saveDraftSlots(backup.drafts)&&saveSlots(backup.rosters)&&window.FBStore.set('famatbubbler.prefs.v1',JSON.stringify(backup.preferences));
        if(!ok){renderDraftSlots();renderSlots();throw new Error('Storage failed during restoration. Some saved data may have changed. Keep the backup and retry when storage is available.');}
        undoStack.length=0;redoStack.length=0;persistUndoState();location.reload();return;
      }
      pushUndo({type:'single',label:'Restore workspace backup',diff:{type:'fullSnapshot',prev:previous,next:getFullSnapshot()}});
      toast('Workspace restored. Existing saved slots and preferences were kept.','undo');
    }catch(e){toast('Could not restore: '+e.message);}finally{ev.target.value='';}
  });
  document.addEventListener('keydown',ev=>{
    const grip=ev.target.closest?.('[data-grip]');if(!grip||!ev.altKey||!['ArrowUp','ArrowDown'].includes(ev.key))return;
    ev.preventDefault();const rid=Number(grip.dataset.grip),order=getPageOrder();const index=order.indexOf(rid);
    const target=order[index+(ev.key==='ArrowUp'?-1:1)];if(!target)return;
    const before=listOrderState();if(moveRowsInPageOrder([rid],target,ev.key==='ArrowDown'))commitHandOrder(before,'Move a row');
    rowEl.get(rid)?.querySelector('[data-grip]')?.focus({preventScroll:true});
  });
  // Conventional tab navigation, without turning every tab into another tab stop.
  document.querySelectorAll('.tabStrip').forEach(strip=>{
    const sync=()=>strip.querySelectorAll('[role="tab"]').forEach(tab=>{tab.tabIndex=tab.getAttribute('aria-selected')==='true'?0:-1;tab.setAttribute('aria-controls',tab.dataset.tab);});
    strip.addEventListener('click',()=>queueMicrotask(sync));sync();
    strip.addEventListener('keydown',ev=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;
      const tabs=[...strip.querySelectorAll('[role="tab"]')],i=tabs.indexOf(ev.target);if(i<0)return;
      ev.preventDefault();const n=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[n].click();tabs[n].focus();sync();
    });
  });
})();

function pdfFontFamilies(){
  return {
    Courier: [['Courier','Regular'],['CourierBold','Bold'],['CourierOblique','Oblique'],['CourierBoldOblique','Bold Oblique']],
    Helvetica: [['Helvetica','Regular'],['HelveticaBold','Bold'],['HelveticaOblique','Oblique'],['HelveticaBoldOblique','Bold Oblique']],
    RobotoCondensed: [['RobotoCondensed','Regular'],['RobotoCondensedBold','Bold']],
    TimesRoman: [['TimesRoman','Regular'],['TimesRomanBold','Bold'],['TimesRomanItalic','Italic'],['TimesRomanBoldItalic','Bold Italic']],
  };
}
function syncPdfFontPicker(key){
  const families = pdfFontFamilies();
  const family = Object.keys(families).find(name => families[name].some(([value]) => value === key)) || 'Helvetica';
  document.getElementById('pdfFontFamily').value = family;
  const variants = document.getElementById('pdfFont');
  variants.replaceChildren(...families[family].map(([value,label]) => new Option(label,value)));
  variants.value = families[family].some(([value]) => value === key) ? key : family;
}
document.getElementById('pdfFontFamily').addEventListener('change', event => {
  const variants = document.getElementById('pdfFont');
  const previousStyle = variants.selectedOptions[0]?.textContent;
  const choices = pdfFontFamilies()[event.target.value];
  const next = choices.find(([,label]) => label === previousStyle) || choices[0];
  syncPdfFontPicker(next[0]);
  variants.dispatchEvent(new Event('change', {bubbles:true}));
});
syncPdfFontPicker(document.getElementById('pdfFont').value);

function syncFilenameWidth(){
  const input = document.getElementById('filename');
  if(!input) return;
  document.getElementById('filenameMeasure').textContent = input.value;
  const notice = document.getElementById('filenameNormalized');
  const downloadName = safePdfFilename(input.value);
  notice.hidden = downloadName === input.value + '.pdf';
  notice.textContent = notice.hidden ? '' : 'Downloads as: ' + downloadName;
}
function filterFilenameInput(event){
  if(event.isComposing) return;
  const input = event.target;
  const start = input.selectionStart, end = input.selectionEnd;
  const value = input.value;
  const filtered = filterFilenameCharacters(value);
  if(filtered !== value){
    input.value = filtered;
    input.setSelectionRange(filterFilenameCharacters(value.slice(0,start)).length,
      filterFilenameCharacters(value.slice(0,end)).length);
  }
  syncFilenameWidth();
}
document.getElementById('filename').addEventListener('input', filterFilenameInput);
document.getElementById('filename').addEventListener('compositionend', filterFilenameInput);
document.getElementById('filename').addEventListener('blur', event => {
  const input = event.target;
  const normalized = safePdfFilename(input.value).slice(0,-4);
  if(input.value !== normalized){
    input.value = normalized;
    input.dispatchEvent(new Event('input', {bubbles:true}));
  }
});
document.querySelector('.filenameWrap').addEventListener('click', () => document.getElementById('filename').focus());
syncFilenameWidth();
document.fonts.ready.then(syncFilenameWidth);

function showPdfPreview(url,filename,warning){
  if(window.FBPdfPreview?.url)URL.revokeObjectURL(window.FBPdfPreview.url);
  window.FBPdfPreview={url,filename};
  const back=document.getElementById('pdfPreviewBack');
  const warningEl=document.getElementById('pdfPreviewWarning');
  warningEl.textContent=warning;
  warningEl.hidden=!warning;
  document.getElementById('pdfPreviewFrame').src=url;
  back.style.display='flex';
}
function openStudentDetails(rid){
  const s=getStudent(rid);if(!s)return;
  const back=document.getElementById('studentDetailsBack'),host=document.getElementById('studentDetailsBody');
  host.innerHTML=`<p>Roster level: ${escAttr(ROSTER_DIVISIONS[Number(s.id8[7])]||'Incomplete')} · Competition division: ${escAttr(divName(s.division))}</p>`;
  for(const field of ['first','last']){
    const label=document.createElement('label');label.className='field';label.textContent=field==='first'?'First Name':'Last Name';
    const input=document.createElement('input');input.value=s[field];
    input.addEventListener('change',()=>{const next=sanitizeFieldText(input.value);input.value=next;const prev=s[field];nameIndexDel(rid,s);s[field]=next;nameIndexAdd(rid,s);pushUndo({type:'single',label:'Edit name',diff:{type:'editName',rowId:rid,field,prev,next}});rerenderRow(rid);syncAllCountersAndSummaries();syncSticky();});
    label.append(input);host.append(label);
  }
  const idLabel=document.createElement('label');idLabel.className='field';idLabel.textContent='FAMAT ID';
  const id=document.createElement('input');id.value=s.id8;id.maxLength=8;id.placeholder='########';id.inputMode='numeric';id.addEventListener('change',()=>{setIdRaw(rid,id.value);id.value=getStudent(rid).id8;syncAllCountersAndSummaries();syncSticky();});idLabel.append(id);host.append(idLabel);
  const include=document.createElement('button');include.type='button';include.textContent=s.included?'Remove from PDF':'Add to PDF';include.addEventListener('click',()=>{toggleInclude(rid);syncAllCountersAndSummaries();syncSticky();openStudentDetails(rid);});host.append(include);
  back.style.display='flex';
}
