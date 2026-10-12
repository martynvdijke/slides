/* audience app.js — Midnight Auditorium — vanilla, XSS-safe, classList-forward */
(function(){
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function toast(msg, kind){
    kind = kind || 'ok';
    var root=document.getElementById('toast-root');
    if(!root) return;
    var t=document.createElement('div');
    t.className='toast '+kind;
    var icon=document.createElement('span');
    icon.className='toast-icon';
    icon.setAttribute('aria-hidden','true');
    icon.innerHTML = kind==='ok' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v5"/><path d="M12 16h.01"/></svg>';
    var txt=document.createElement('span'); txt.textContent=msg;
    t.appendChild(icon); t.appendChild(txt);
    root.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transform='translateY(8px)'; t.style.transition='all .3s'; }, 2400);
    setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2800);
  }
  function getCode(){
    var p=location.pathname;
    var m=p.match(/\/e\/([^\/\?#]+)/);
    if(m) return decodeURIComponent(m[1]);
    var m2=p.match(/\/live\/([^\/\?#]+)/);
    if(m2) return decodeURIComponent(m2[1]);
    var q=new URLSearchParams(location.search).get('code');
    return q || '';
  }
  var code=getCode();
  function esc(s){ return String(s||''); }
  var stateCache={};
  var sessionExpired=false;
  var spectatorMode=false;
  var rejoinUrl='/e/'+encodeURIComponent(code);
  // --- waiting-room roster (audience compact) ---
  var participantsData={count:0, participants:[]};
  function renderAudienceRoster(){
    var c=document.getElementById('audience-roster');
    if(!c) return;
    c.textContent='';
    var count=participantsData && typeof participantsData.count==='number' ? participantsData.count : (participantsData.participants?participantsData.participants.length:0);
    var list=(participantsData && Array.isArray(participantsData.participants))?participantsData.participants:[];
    var pill=document.createElement('div');
    pill.id='audience-roster-count';
    pill.className='pill live';
    pill.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-weight:700;font-size:.82rem;background:var(--accent);color:#fff;border:none';
    pill.textContent = count===0 ? 'No one has joined yet' : (count===1 ? '1 waiting' : count+' waiting');
    c.appendChild(pill);
    if(!list.length) return;
    var chips=document.createElement('div'); chips.id='audience-roster-chips';
    chips.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;max-height:160px;overflow:auto;padding:2px';
    var cap=40;
    var vis=list.slice(0,cap);
    vis.forEach(function(p){
      var chip=document.createElement('span');
      chip.style.cssText='display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10);font-weight:600;font-size:.80rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#E8EAF4';
      if(p.color){ chip.style.borderColor=p.color+'55'; chip.style.background=p.color+'14'; }
      var em=document.createElement('span'); em.textContent=p.emoji||'🙂'; em.style.fontSize='0.95rem';
      var nm=document.createElement('span'); nm.textContent=String(p.name||'Anonymous'); nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis';
      chip.appendChild(em); chip.appendChild(nm); chips.appendChild(chip);
    });
    c.appendChild(chips);
    if(list.length>cap){
      var more=document.createElement('div'); more.style.cssText='color:var(--muted);font-size:.78rem;margin-top:6px;font-weight:600'; more.textContent='+'+(list.length-cap)+' more';
      c.appendChild(more);
    }
  }
  function fetchParticipants(){
    if(!code) return;
    fetch('/api/events/'+encodeURIComponent(code)+'/participants',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      participantsData={count:j.count||0, participants:Array.isArray(j.participants)?j.participants:[]};
      renderAudienceRoster();
    }).catch(function(){});
  }
  // --- feature gating ---
  var FEATURE_MAP={feature_live:'live',feature_qa:'qa',feature_slides:'slides',feature_feedback:'feedback',feature_leaderboard:'leaderboard'};
  function isFeatureEnabled(evt, featKey){
    if(!evt || evt[featKey]===undefined || evt[featKey]===null) return true;
    return !!evt[featKey];
  }
  function applyFeatureGating(evt){
    if(!evt) return;
    var hasAnyFlag = ['feature_live','feature_qa','feature_slides','feature_feedback','feature_leaderboard'].some(function(k){ return evt[k]!==undefined && evt[k]!==null; });
    if(!hasAnyFlag) return;
    var firstEnabled=null;
    Object.keys(FEATURE_MAP).forEach(function(fk){
      var tabName=FEATURE_MAP[fk];
      var enabled=isFeatureEnabled(evt,fk);
      var tabBtn=document.querySelector('.tab[data-tab="'+tabName+'"]');
      var panel=document.getElementById('panel-'+tabName);
      if(!enabled){
        if(tabBtn){ tabBtn.style.display='none'; tabBtn.setAttribute('aria-hidden','true'); }
        if(panel){ panel.classList.add('hidden'); panel.style.display='none'; }
      } else {
        if(!firstEnabled) firstEnabled=tabName;
        if(tabBtn){ tabBtn.style.display=''; tabBtn.removeAttribute('aria-hidden'); }
        if(panel){ panel.style.display=''; /* keep hidden state managed by selectTab */ }
        // panel hidden will be controlled by selectTab; just ensure not forced hidden
      }
    });
    // if currently selected tab is disabled, switch to first enabled
    var cur=document.querySelector('.tab[aria-selected="true"]');
    var curName=cur?cur.getAttribute('data-tab'):null;
    var curEnabled=curName? isFeatureEnabled(evt, Object.keys(FEATURE_MAP).find(function(k){return FEATURE_MAP[k]===curName})):true;
    if(curName && !curEnabled){
      var target=firstEnabled;
      // also check localStorage saved tab
      try{
        var saved=localStorage.getItem('meetup_tab');
        if(saved && FEATURE_MAP[Object.keys(FEATURE_MAP).find(function(k){return FEATURE_MAP[k]===saved})]!==undefined){
          // find fk for saved
          var fkSaved=Object.keys(FEATURE_MAP).find(function(k){return FEATURE_MAP[k]===saved});
          if(fkSaved && isFeatureEnabled(evt,fkSaved)) target=saved;
        }
      }catch(e){}
      if(target) selectTab(target);
    }
  }

  // --- session sheet (SINGLE TTL entry point) ---
  function showSessionSheet(reason, roomCode){
    sessionExpired = (reason==='expired');
    var dlg=document.getElementById('session-sheet');
    var backdrop=document.getElementById('session-backdrop');
    var title=document.getElementById('session-title');
    var desc=document.getElementById('session-desc');
    var codeEl=document.getElementById('session-code');
    var rejoinBtn=document.getElementById('session-rejoin');
    var spectBtn=document.getElementById('session-spectate');
    if(!dlg) return;
    if(roomCode) rejoinUrl='/e/'+encodeURIComponent(roomCode);
    if(codeEl) codeEl.textContent = 'Room ' + (roomCode||code||'—');
    if(reason==='spectator'){
      if(title) title.textContent='You\'re watching as spectator';
      if(desc) desc.textContent='You can see everything but votes won\'t be counted. Rejoin to participate again.';
      if(rejoinBtn) rejoinBtn.textContent='Rejoin to participate';
    } else if(reason==='offline'){
      if(title) title.textContent='You\'re offline';
      if(desc) desc.textContent='We\'ve saved your answers locally. Reconnect to sync.';
      if(rejoinBtn) rejoinBtn.textContent='Retry connection';
    } else {
      if(title) title.textContent='Your session has ended';
      if(desc) desc.textContent='Your 4-hour session has expired. Rejoin the room to keep participating — your name, avatar and queued answers are still saved.';
      if(rejoinBtn) rejoinBtn.textContent='Rejoin — continue participating';
    }
    if(spectBtn) spectBtn.textContent = (reason==='spectator' ? 'Stay as spectator' : 'Continue as spectator');
    if(typeof dlg.showModal==='function'){ try{ if(!dlg.open) dlg.showModal(); }catch(e){ dlg.setAttribute('open',''); } } else dlg.setAttribute('open','');
    if(backdrop) backdrop.classList.add('open');
    document.body.style.overflow='hidden';
    updateWsBanner(false);
  }
  function hideSessionSheet(){
    var dlg=document.getElementById('session-sheet');
    var backdrop=document.getElementById('session-backdrop');
    if(dlg && dlg.open){ try{ dlg.close(); }catch(e){ dlg.removeAttribute('open'); } }
    if(backdrop) backdrop.classList.remove('open');
    document.body.style.overflow='';
  }
  window.showSessionSheet=showSessionSheet;
  window.hideSessionSheet=hideSessionSheet;

  // rejoin flow
  function doRejoin(){
    var btn=document.getElementById('session-rejoin');
    if(btn){ btn.disabled=true; btn.textContent='Rejoining…'; }
    fetch('/api/events/'+encodeURIComponent(code)+'/join',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).then(function(r){
      if(!r.ok) return r.json().catch(function(){return {};}).then(function(j){ throw new Error(j.error||'Could not rejoin'); });
      return r.json().catch(function(){return {};});
    }).then(function(){
      sessionExpired=false; spectatorMode=false;
      hideSessionSheet(); toast('Rejoined — welcome back!');
      fetchState().then(function(){ connectStream(true); flushQueue(); });
    }).catch(function(err){
      toast(err.message||'Could not rejoin','err');
      if(btn){ btn.disabled=false; btn.textContent='Rejoin — continue participating'; }
    });
  }
  function doSpectate(){
    spectatorMode=true; sessionExpired=false; hideSessionSheet(); toast('Spectator mode — watching only');
  }
  var _rejoinBtn=document.getElementById('session-rejoin');
  if(_rejoinBtn) _rejoinBtn.addEventListener('click', function(){
    if(sessionExpired) doRejoin(); else { // offline retry
      hideSessionSheet(); fetchState().then(connectStream);
    }
  });
  var _spectBtn=document.getElementById('session-spectate');
  if(_spectBtn) _spectBtn.addEventListener('click', function(){
    if(spectatorMode) hideSessionSheet();
    else doSpectate();
  });
  var _sessBackdrop=document.getElementById('session-backdrop');
  if(_sessBackdrop) _sessBackdrop.addEventListener('click', function(){
    if(sessionExpired) return; // must choose
    hideSessionSheet();
  });

  // slide indicator — restrained Slide N chip; matched styling when linked to live question
  function renderSlideIndicator(slide){
    var el=document.getElementById('slide-indicator');
    if(!el) return;
    if(!slide || slide.index===null || slide.index===undefined || slide.total===null || slide.total===undefined){
      el.classList.add('hidden'); el.style.display='none'; el.textContent=''; el.classList.remove('is-live'); return;
    }
    var txt='Slide '+slide.index+' / '+slide.total;
    if(slide.title) txt+=' · '+slide.title;
    el.textContent=txt; el.classList.remove('hidden'); el.style.display='';
    var active = stateCache && stateCache.active_question;
    if(active && slide.question_id && String(slide.question_id)===String(active.id)){
      el.classList.add('is-live');
    } else {
      el.classList.remove('is-live');
    }
  }
  // --- slide-sync focus ( §4 ) ---
  var slideSyncTimer=null;
  function syncSlideFocus(slide){
    if(!slide || slide.index===null || slide.index===undefined) { renderSlideIndicator(slide); return; }
    renderSlideIndicator(slide);
    var qid = slide.question_id;
    if(!qid || qid===0) {
      var card=document.getElementById('live-card');
      if(card) card.classList.remove('is-slide-live');
      return;
    }
    var active = stateCache && stateCache.active_question;
    if(!active || String(active.id)!==String(qid)) {
      var c2=document.getElementById('live-card');
      if(c2) c2.classList.remove('is-slide-live');
      return;
    }
    if(slideSyncTimer) clearTimeout(slideSyncTimer);
    slideSyncTimer=setTimeout(function(){
      slideSyncTimer=null;
      var cur=document.querySelector('.tab[aria-selected="true"]');
      var curName=cur?cur.getAttribute('data-tab'):null;
      if(curName!=='live'){
        var liveTab=document.querySelector('.tab[data-tab="live"]');
        if(liveTab && liveTab.style.display!=='none' && liveTab.getAttribute('aria-hidden')!=='true'){
          selectTab('live');
        }
      }
      var card=document.getElementById('live-card');
      if(card){
        card.classList.add('is-slide-live');
        try{ card.scrollIntoView({behavior:'smooth', block:'nearest'}); }catch(e){}
        if(!prefersReduced){
          card.classList.remove('slide-pulse');
          void card.offsetWidth;
          card.classList.add('slide-pulse');
          setTimeout(function(){ card.classList.remove('slide-pulse'); }, 900);
        }
      }
    }, 140);
  }

  // countdown ring factory
  function createTimerRing(remaining, duration){
    var wrap=document.createElement('div'); wrap.className='timer-ring';
    var svgNS='http://www.w3.org/2000/svg';
    var svg=document.createElementNS(svgNS,'svg'); svg.setAttribute('viewBox','0 0 56 56');
    var bg=document.createElementNS(svgNS,'circle'); bg.setAttribute('cx','28'); bg.setAttribute('cy','28'); bg.setAttribute('r','24'); bg.setAttribute('class','ring-bg');
    var fg=document.createElementNS(svgNS,'circle'); fg.setAttribute('cx','28'); fg.setAttribute('cy','28'); fg.setAttribute('r','24'); fg.setAttribute('class','ring-fg');
    fg.style.stroke='var(--accent)';
    svg.appendChild(bg); svg.appendChild(fg);
    var pct = duration>0 ? Math.max(0, Math.min(1, remaining/duration)) : 0;
    var circ=2*Math.PI*24; fg.style.strokeDasharray=circ+'';
    fg.style.strokeDashoffset= circ*(1-pct)+'';
    if(remaining<=10) fg.style.stroke='#f43f5e';
    else if(remaining<=30) fg.style.stroke='#f59e0b';
    var txt=document.createElement('span'); txt.className='ring-text'; txt.textContent= formatCountdown(remaining);
    wrap.appendChild(svg); wrap.appendChild(txt);
    wrap._update=function(rem, dur){
      txt.textContent=formatCountdown(rem);
      var p = dur>0 ? Math.max(0, Math.min(1, rem/dur)) : 0;
      fg.style.strokeDashoffset= circ*(1-p)+'';
      if(rem<=10) fg.style.stroke='#f43f5e'; else if(rem<=30) fg.style.stroke='#f59e0b'; else fg.style.stroke='var(--accent)';
    };
    return wrap;
  }

  // countdown state
  var countdownTimer=null, countdownRemaining=0, countdownDuration=0, countdownActiveId=null;
  function formatCountdown(sec){ sec=Math.max(0,Math.floor(sec)); var m=Math.floor(sec/60), s=sec%60; return m+':'+(s<10?'0':'')+s; }
  function clearCountdown(){ if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;} countdownRemaining=0; countdownDuration=0; countdownActiveId=null; var el=document.getElementById('audience-countdown'); if(el){el.classList.add('hidden'); el.style.display='none';}}
  function updateCountdownUI(){
    var wrap=document.getElementById('audience-countdown');
    var valEl=document.getElementById('countdown-value');
    var fillEl=document.getElementById('countdown-fill');
    var labelEl=document.getElementById('countdown-label');
    if(!wrap||!valEl) return;
    if(countdownRemaining<=0){ valEl.textContent="Time's up"; if(labelEl) labelEl.textContent="Time's up"; if(fillEl) fillEl.style.width='0%'; wrap.style.opacity='0.95'; return; }
    wrap.style.display='flex'; wrap.classList.remove('hidden'); wrap.style.opacity='1';
    valEl.textContent=formatCountdown(countdownRemaining);
    if(labelEl) labelEl.textContent='Time left';
    if(fillEl && countdownDuration>0){ var pct=Math.max(0,Math.min(100,Math.round(countdownRemaining/countdownDuration*100))); fillEl.style.width=pct+'%'; if(pct<=25) fillEl.style.background='#F43F5E'; else if(pct<=50) fillEl.style.background='#F59E0B'; else fillEl.style.background='var(--accent)'; } else if(fillEl) fillEl.style.width='100%';
    var ring=document.getElementById('live-ring');
    if(ring && ring._update) ring._update(countdownRemaining, countdownDuration);
  }
  function applyCountdownExpired(){
    var card=document.getElementById('live-card'); if(!card) return;
    var wrap=document.getElementById('audience-countdown');
    if(wrap){ var valEl=document.getElementById('countdown-value'); var labelEl=document.getElementById('countdown-label'); var fillEl=document.getElementById('countdown-fill'); if(valEl) valEl.textContent="Time's up"; if(labelEl) labelEl.textContent="Time's up"; if(fillEl) fillEl.style.width='0%'; wrap.style.opacity='0.95'; }
    var ctrls=card.querySelectorAll('button.option-btn, button.star, button.btn, input, textarea');
    ctrls.forEach(function(c){ c.disabled=true; c.classList.add('opacity-60'); });
    if(!document.getElementById('countdown-expired-note')){
      var note=document.createElement('div'); note.id='countdown-expired-note'; note.className='pill'; note.textContent="Time's up — waiting for results";
      note.style.marginTop='12px'; note.style.background='rgba(244,63,94,.14)'; note.style.color='#FECDD3';
      card.appendChild(note);
    }
  }
  function tickCountdown(){
    if(countdownRemaining<=0){ applyCountdownExpired(); if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;} return; }
    countdownRemaining-=1;
    if(countdownRemaining<=0){ countdownRemaining=0; updateCountdownUI(); applyCountdownExpired(); if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;} } else updateCountdownUI();
  }
  function syncCountdown(active){
    if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
    var hasTimer = active && typeof active.remaining_sec==='number' && active.remaining_sec!==null;
    if(!hasTimer){ clearCountdown(); return; }
    countdownRemaining=Math.max(0,Math.floor(active.remaining_sec));
    countdownDuration = (typeof active.duration_sec==='number' && active.duration_sec>0) ? active.duration_sec : countdownRemaining;
    if(!countdownDuration && active.expires_at) countdownDuration=countdownRemaining;
    countdownActiveId=active.id; updateCountdownUI();
    if(countdownRemaining<=0){ applyCountdownExpired(); return; }
    var oldNote=document.getElementById('countdown-expired-note'); if(oldNote&&oldNote.parentNode) oldNote.parentNode.removeChild(oldNote);
    countdownTimer=setInterval(tickCountdown,1000);
  }

  function canReveal(a){ if(!a) return false; if(a.status==='locked') return false; return a.status==='revealed' || !!a.show_results; }
  function deadlineMs(a){ if(!a) return null; if(a.deadline_at) return a.deadline_at; if(a.time_limit_s>0 && a.activated_at) return a.activated_at + a.time_limit_s*1000; return null; }
  function isLocked(a){ if(!a) return false; if(a.status==='locked') return true; var dl=deadlineMs(a); return a.status==='live' && dl!==null && Date.now()>=dl; }
  function correctLabel(a){ if(!a || a.correct_index===null||a.correct_index===undefined) return null; if(a.kind==='poll'){var opts=a.options||[]; return opts[a.correct_index]||null;} if(a.kind==='yesno') return a.correct_index===0?'yes':'no'; return null; }

  function vibrate(p){ try{ if(navigator.vibrate) navigator.vibrate(p);}catch(e){} }
  function genUUID(){ try{ if(window.crypto && crypto.randomUUID) return crypto.randomUUID();}catch(e){} return 'qt-'+Date.now()+'-'+Math.random().toString(36).slice(2,9); }

  var REACTION_EMOJIS=['👏','🔥','❤️','😂','🤯','👍'];
  var COLOR_LIST=["#6366F1","#EC4899","#F59E0B","#10B981","#38BDF8","#F43F5E","#A855F7","#84CC16"];
  function loadIdentity(){ try{ var raw=localStorage.getItem('qt_identity'); if(raw){var j=JSON.parse(raw); if(j && typeof j.name==='string') return j;}}catch(e){} return {name:'', emoji:'🙂', color:'#6366F1'}; }
  var identity=loadIdentity();
  if(!identity.emoji) identity.emoji='🙂';
  if(COLOR_LIST.indexOf(identity.color)===-1) identity.color='#6366F1';
  function saveIdentity(){ try{ localStorage.setItem('qt_identity', JSON.stringify(identity));}catch(e){} }
  function sendIdentity(){ if(!identity) return; var em=REACTION_EMOJIS.indexOf(identity.emoji)!==-1?identity.emoji:''; var col=COLOR_LIST.indexOf(identity.color)!==-1?identity.color:''; var nm=(identity.name||'').trim().slice(0,24); if(isOpen()) wsSend({type:'identity', name:nm, emoji:em||identity.emoji, color:col||identity.color}); }

  function initIdentityUI(){
    var avatar=document.getElementById('identity-avatar');
    var displayName=document.getElementById('identity-display-name');
    var openBtn=document.getElementById('identity-open');
    var dlg=document.getElementById('identity-sheet');
    var backdrop=document.getElementById('sheet-backdrop');
    var sheetName=document.getElementById('sheet-name');
    var eWrap=document.getElementById('sheet-emoji-pick');
    var cWrap=document.getElementById('sheet-color-pick');
    var saveBtn=document.getElementById('sheet-save');
    function refresh(){
      if(avatar){ avatar.textContent=identity.emoji||'🙂'; avatar.style.background=identity.color||'#6366F1'; }
      if(displayName) displayName.textContent= identity.name ? identity.name : 'Tap to set your name';
      if(sheetName && document.activeElement!==sheetName) sheetName.value=identity.name||'';
    }
    refresh();
    if(sheetName) sheetName.value=identity.name||'';
    if(eWrap){
      eWrap.textContent='';
      REACTION_EMOJIS.forEach(function(em){
        var b=document.createElement('button'); b.type='button'; b.className='emoji-dot'+(identity.emoji===em?' selected':''); b.textContent=em; b.setAttribute('aria-label','Pick '+em);
        b.addEventListener('click', function(){ identity.emoji=em; saveIdentity(); refresh(); Array.prototype.forEach.call(eWrap.querySelectorAll('.emoji-dot'), function(x){x.classList.toggle('selected', x.textContent===em);}); });
        eWrap.appendChild(b);
      });
    }
    if(cWrap){
      cWrap.textContent='';
      COLOR_LIST.forEach(function(col){
        var b=document.createElement('button'); b.type='button'; b.className='color-dot'+(identity.color===col?' selected':''); b.style.background=col; b.setAttribute('aria-label','Pick color '+col);
        b.addEventListener('click', function(){ identity.color=col; saveIdentity(); refresh(); Array.prototype.forEach.call(cWrap.children, function(ch){ ch.classList.toggle('selected', ch.style.background===col); }); });
        cWrap.appendChild(b);
      });
    }
    function openSheet(){ if(!dlg) return; if(typeof dlg.showModal==='function'){ try{ dlg.showModal(); }catch(e){ dlg.setAttribute('open',''); } } else dlg.setAttribute('open',''); if(backdrop) backdrop.classList.add('open'); if(sheetName) sheetName.focus(); }
    function closeSheet(){ if(dlg && dlg.open){ try{ dlg.close(); }catch(e){ dlg.removeAttribute('open'); }} if(backdrop) backdrop.classList.remove('open'); }
    function doSave(){ var v=sheetName.value.trim().slice(0,24); identity.name=v; saveIdentity(); refresh(); sendIdentity(); var qaAuthor=document.getElementById('qa-author'); if(qaAuthor && !qaAuthor.value) qaAuthor.placeholder=v? v:'Anonymous'; toast('Profile saved'); vibrate(40); closeSheet(); }
    if(openBtn) openBtn.addEventListener('click', openSheet);
    if(avatar) avatar.addEventListener('click', openSheet);
    if(displayName) displayName.addEventListener('click', openSheet);
    if(backdrop) backdrop.addEventListener('click', closeSheet);
    if(saveBtn) saveBtn.addEventListener('click', doSave);
    if(sheetName) sheetName.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); doSave(); }});
    // sync legacy hidden inputs for compat
    var legacyName=document.getElementById('identity-name');
    if(legacyName) legacyName.value=identity.name||'';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initIdentityUI); else initIdentityUI();

  function applyMe(me){
    if(!me) return;
    if(me.name && me.name!=='Anonymous') identity.name=me.name;
    if(me.emoji) identity.emoji=me.emoji;
    if(me.color) identity.color=me.color;
    saveIdentity();
    var avatar=document.getElementById('identity-avatar');
    var displayName=document.getElementById('identity-display-name');
    if(displayName) displayName.textContent= identity.name || 'Tap to set your name';
    if(avatar){ avatar.textContent=identity.emoji||'🙂'; avatar.style.background=identity.color||'#6366F1'; }
    var qaAuthor=document.getElementById('qa-author');
    if(qaAuthor) qaAuthor.placeholder=identity.name||'Anonymous';
    var legacy=document.getElementById('identity-name'); if(legacy) legacy.value=identity.name||'';
    applyRecap(me);
    updateJoinCountdown(me);
  }
  function updateJoinCountdown(me){
    var el=document.getElementById('join-countdown');
    if(!el) return;
    var js = stateCache && stateCache.join_session ? stateCache.join_session : (me && me.join_session ? me.join_session : null);
    // also support me directly
    if(me && me.join_session) js=me.join_session;
    if(stateCache && stateCache.join_session) js=stateCache.join_session;
    if(!js || !js.remaining_s){ el.classList.add('hidden'); el.style.display='none'; return; }
    var sec=Math.max(0, js.remaining_s);
    if(sec<=0){ el.classList.add('hidden'); el.style.display='none'; return; }
    var m=Math.floor(sec/60), s=sec%60;
    el.textContent='Session ends in '+m+':'+(s<10?'0':'')+s;
    el.classList.remove('hidden'); el.style.display='inline-flex';
  }
  // poll join_session countdown
  setInterval(function(){ if(stateCache && stateCache.join_session && typeof stateCache.join_session.remaining_s==='number'){ stateCache.join_session.remaining_s=Math.max(0, stateCache.join_session.remaining_s-1); updateJoinCountdown({}); } },1000);

  function applyRecap(me){
    var form=document.getElementById('recap-form'); if(!form) return;
    var email=document.getElementById('recap-email'); var remove=document.getElementById('recap-remove'); var status=document.getElementById('recap-status');
    var subscribed=!!(me && me.recap_subscribed);
    if(email && me && me.recap_email && document.activeElement!==email) email.value=me.recap_email;
    form.classList.toggle('hidden', subscribed);
    if(remove) remove.classList.toggle('hidden', !subscribed);
    if(status) status.textContent = subscribed ? 'Recap will be emailed to '+(me.recap_email||'your address')+'.' : '';
  }
  var recapForm=document.getElementById('recap-form');
  if(recapForm){
    recapForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(sessionExpired){ showSessionSheet('expired', code); return; }
      var input=document.getElementById('recap-email'); var email=input.value.trim(); if(!email){toast('Enter an email address','err'); return;}
      var btn=recapForm.querySelector('button[type="submit"]'); btn.disabled=true; btn.textContent='Saving…';
      fetch('/api/events/'+encodeURIComponent(code)+'/recap/subscribe',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})}).then(function(r){
        if(r.status===401){ return r.json().then(function(j){ if(j.code==='join_expired') showSessionSheet('expired', j.room_code||code); throw new Error(j.error||'Session expired'); }); }
        return r.json().catch(function(){return {};}).then(function(j){ if(!r.ok) throw new Error(j.error||'Could not save'); return j; });
      }).then(function(j){ applyRecap({recap_subscribed:true, recap_email:j.email||email}); toast('Recap email saved'); vibrate(40); }).catch(function(err){ toast(err.message||'Could not save','err'); }).finally(function(){ btn.disabled=false; btn.textContent='Email me the recap'; });
    });
    var removeBtn=document.getElementById('recap-remove');
    if(removeBtn) removeBtn.addEventListener('click', function(){
      if(sessionExpired){ showSessionSheet('expired',code); return; }
      removeBtn.disabled=true;
      fetch('/api/events/'+encodeURIComponent(code)+'/recap/unsubscribe',{method:'POST',credentials:'same-origin'}).then(function(r){ if(r.status===401) throw new Error('join_expired'); if(!r.ok) throw new Error('Could not unsubscribe'); return r.json().catch(function(){return {};}); }).then(function(){ applyRecap({recap_subscribed:false}); toast('Unsubscribed'); }).catch(function(err){ if(err.message==='join_expired') showSessionSheet('expired',code); else toast(err.message||'Could not unsubscribe','err'); }).finally(function(){removeBtn.disabled=false;});
    });
  }

  var QUEUE_KEY='qt_queue_'+code; var MAX_QUEUE=30;
  function loadQueue(){ try{var raw=localStorage.getItem(QUEUE_KEY); if(!raw) return []; var a=JSON.parse(raw); return Array.isArray(a)?a:[];}catch(e){return [];} }
  function saveQueue(q){ try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE))); }catch(e){} }
  function enqueue(item){
    var q=loadQueue();
    if(item.type==='answer'){ var found=-1; for(var i=0;i<q.length;i++){ if(q[i].type==='answer' && q[i].question_id===item.question_id){found=i;break;}} if(found!==-1) q.splice(found,1); }
    q.push(item); if(q.length>MAX_QUEUE) q.splice(0,q.length-MAX_QUEUE); saveQueue(q);
  }
  function flushQueue(){
    if(sessionExpired || spectatorMode) return;
    if(!isOpen()) return;
    var q=loadQueue(); if(!q.length) return;
    var remain=[];
    q.forEach(function(it){
      var ok=false;
      if(it.type==='answer') ok=wsSend({type:'answer', question_id:it.question_id, value:it.value, client_uuid:it.client_uuid});
      else if(it.type==='vote') ok=wsSend({type:'vote', id:it.id});
      else if(it.type==='qa') ok=wsSend({type:'qa', body:it.body, author:it.author});
      if(!ok) remain.push(it);
    });
    saveQueue(remain);
  }
  function pruneQueue(state){
    var q=loadQueue(); if(!q.length) return;
    var filtered=[]; var active=state.active_question; var qaList=state.qa||[]; var votedIds={}; qaList.forEach(function(x){ if(x.voted) votedIds[x.id]=true; });
    q.forEach(function(it){
      if(it.type==='answer'){ if(active && active.answered && active.id===it.question_id) return; }
      else if(it.type==='vote'){ if(votedIds[it.id]) return; }
      else if(it.type==='qa'){ var exists=false; for(var i=0;i<qaList.length;i++){ if(qaList[i].body===it.body){exists=true;break;}} if(exists) return; }
      filtered.push(it);
    });
    if(filtered.length!==q.length) saveQueue(filtered);
  }
  function parseAnswerArray(s){ if(!s) return []; try{var v=JSON.parse(s); return Array.isArray(v)?v:[];}catch(e){return [];} }

  // factories
  function createQuestionOptions(active, onPick){
    var wrap=document.createElement('div'); wrap.className='ans-grid stagger';
    var opts=active.options||[];
    opts.forEach(function(opt){
      var b=document.createElement('button'); b.type='button'; b.className='option-card option-btn'; b.textContent=opt;
      b.style.minHeight='52px';
      b.addEventListener('click', function(){
        b.classList.add('pressed');
        Array.prototype.forEach.call(wrap.querySelectorAll('.option-btn'), function(x){ if(x!==b){ x.disabled=true; x.style.opacity='.62'; } });
        setTimeout(function(){ b.classList.remove('pressed'); b.classList.add('selected'); }, 90);
        vibrate(20);
        onPick(opt,b);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
  function createResultsBars(active){
    var res=active.results||[]; if(!res.length) return null;
    var cl=correctLabel(active); var max=Math.max.apply(null,res.map(function(r){return r.count}))||1;
    var wrap=document.createElement('div'); wrap.className='results';
    res.forEach(function(r){
      var isCorrect = cl!==null && String(r.label).toLowerCase()===cl.toLowerCase();
      var row=document.createElement('div'); row.className='result-row';
      var head=document.createElement('div'); head.className='result-head';
      var lab=document.createElement('strong'); lab.textContent=isCorrect ? (r.label+' ✓') : r.label;
      var cnt=document.createElement('span'); cnt.textContent= r.count + ' · ' + (active.total ? Math.round(r.count/active.total*100)+'%' : '0%');
      head.appendChild(lab); head.appendChild(cnt);
      var track=document.createElement('div'); track.className='track';
      var fill=document.createElement('div'); fill.className='fill';
      if(isCorrect){ lab.style.color='#6EE7B7'; fill.style.background='var(--accent)'; }
      var pct = active.total ? (r.count/active.total*100) : (r.count/max*100);
      row.appendChild(head); track.appendChild(fill); row.appendChild(track); wrap.appendChild(row);
      if(prefersReduced) fill.style.width=pct+'%'; else requestAnimationFrame(function(){ fill.style.width=pct+'%'; });
    });
    return wrap;
  }
  function createQaCard(q, sorted){
    var card=document.createElement('div'); card.className='glass qa-item';
    var top=document.createElement('div'); top.style.display='flex'; top.style.gap='10px'; top.style.alignItems='flex-start';
    var avatar=document.createElement('div'); avatar.style.width='34px'; avatar.style.height='34px'; avatar.style.borderRadius='50%'; avatar.style.display='grid'; avatar.style.placeItems='center'; avatar.style.flexShrink='0'; avatar.style.background='#6366f1'; avatar.style.color='#fff'; avatar.textContent='🙂';
    // if author matches identity show identity
    if(q.author && q.author===identity.name){ avatar.textContent=identity.emoji||'🙂'; avatar.style.background=identity.color||'#6366f1'; }
    var bodyWrap=document.createElement('div'); bodyWrap.style.flex='1'; bodyWrap.style.minWidth='0';
    var body=document.createElement('div'); body.className='qa-body'; body.textContent=q.body;
    var meta=document.createElement('div'); meta.className='qa-meta'; meta.style.marginTop='6px';
    var author=document.createElement('strong'); author.textContent = q.author ? q.author : 'Anonymous';
    var votes=document.createElement('span'); votes.textContent='· '+q.votes+' votes';
    meta.appendChild(author); meta.appendChild(votes);
    if(q.status==='pending'){ var chip=document.createElement('span'); chip.className='pill'; chip.textContent='Awaiting approval'; meta.appendChild(chip); }
    if(q.status==='flagged'){ var chip2=document.createElement('span'); chip2.className='pill'; chip2.textContent='Flagged'; chip2.style.background='rgba(244,63,94,.14)'; meta.appendChild(chip2); }
    bodyWrap.appendChild(body); bodyWrap.appendChild(meta);
    var btn=document.createElement('button'); btn.className='vote-btn'+(q.voted?' voted':''); btn.type='button';
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="'+(q.voted?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.8"><path d="M12 5l7 7-1.4 1.4L12 7.8 6.4 13.4 5 12z"/><path d="M12 5v14"/></svg> '+(q.voted? q.votes : 'Vote');
    btn.setAttribute('aria-pressed', q.voted?'true':'false');
    if(q.voted) btn.disabled=true;
    btn.style.minHeight='46px'; btn.style.marginLeft='auto';
    btn.addEventListener('click', function(){
      if(sessionExpired){ showSessionSheet('expired', code); return; }
      if(spectatorMode){ toast('Spectator mode — rejoin to vote','err'); return; }
      if(btn.disabled) return; vibrate(40);
      if(isOpen()){
        pendingVotes[q.id]={btn:btn, q:q, sorted:sorted};
        if(!wsSend({type:'vote', id:q.id})){ delete pendingVotes[q.id]; enqueue({type:'vote', id:q.id}); doVoteFetch(q, sorted, btn); }
        return;
      }
      enqueue({type:'vote', id:q.id}); doVoteFetch(q, sorted, btn);
    });
    top.appendChild(avatar); top.appendChild(bodyWrap); top.appendChild(btn);
    card.appendChild(top); return card;
  }

  function initUmamiTracking(){
    fetch('/api/settings/analytics',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      if(j && j.tracking_enabled && j.umami_script_url && j.umami_website_id){
        var s=document.createElement('script'); s.async=true; s.defer=true; s.src=j.umami_script_url; s.setAttribute('data-website-id', j.umami_website_id); document.head.appendChild(s);
      }
    }).catch(function(){});
  }
  initUmamiTracking();

  var tabs=document.querySelectorAll('.tab');
  var panels={ live: document.getElementById('panel-live'), qa: document.getElementById('panel-qa'), slides: document.getElementById('panel-slides'), feedback: document.getElementById('panel-feedback'), leaderboard: document.getElementById('panel-leaderboard') };
  function selectTab(name){
    tabs.forEach(function(b){
      var on=b.getAttribute('data-tab')===name;
      b.setAttribute('aria-selected', on ? 'true':'false');
      b.setAttribute('tabindex', on?'0':'-1');
    });
    Object.keys(panels).forEach(function(k){ if(panels[k]) panels[k].classList.toggle('hidden', k!==name); });
    try{ localStorage.setItem('meetup_tab', name); }catch(e){}
  }
  // --- Mobile polish: keep active tab visible + scroll affordance ---
  var tabsEl = document.querySelector('.tabs');
  function updateTabsScrollable(){
    if(!tabsEl) return;
    var canScroll = tabsEl.scrollWidth > tabsEl.clientWidth + 1;
    tabsEl.classList.toggle('is-scrollable', canScroll);
  }
  function ensureTabVisible(name){
    updateTabsScrollable();
    if(!tabsEl) return;
    var target = document.querySelector('.tab[data-tab="'+name+'"]');
    if(target && typeof target.scrollIntoView === 'function'){
      try{ target.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'}); }catch(e){ target.scrollIntoView(); }
    }
  }
  // Enhance selectTab to auto-scroll the active tab into view
  var _origSelectTab = selectTab;
  selectTab = function(name){
    _origSelectTab(name);
    ensureTabVisible(name);
  };
  tabs.forEach(function(b){
    b.addEventListener('click', function(){ selectTab(b.getAttribute('data-tab')); });
    b.addEventListener('keydown', function(e){
      if(e.key==='ArrowRight' || e.key==='ArrowLeft'){
        e.preventDefault();
        var arr=Array.prototype.slice.call(tabs);
        var idx=arr.indexOf(b);
        var next = e.key==='ArrowRight' ? (idx+1)%arr.length : (idx-1+arr.length)%arr.length;
        arr[next].focus(); selectTab(arr[next].getAttribute('data-tab'));
      }
    });
  });
  try{ var saved=localStorage.getItem('meetup_tab'); if(saved && panels[saved]) selectTab(saved); }catch(e){}
  // initial scroll check + responsive updates
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ updateTabsScrollable(); var sel=document.querySelector('.tab[aria-selected="true"]'); if(sel) ensureTabVisible(sel.getAttribute('data-tab')); });
  else { updateTabsScrollable(); var sel2=document.querySelector('.tab[aria-selected="true"]'); if(sel2) ensureTabVisible(sel2.getAttribute('data-tab')); }
  window.addEventListener('resize', updateTabsScrollable);
  if(tabsEl) tabsEl.addEventListener('scroll', function(){ /* mask stays; no-op but keeps affordance */ }, {passive:true});

  function updateTabBadges(data){
    var qaCount=(data.qa||[]).length;
    var slidesCount=(data.presentations||[]).length || (stateCache && stateCache.presentations ? stateCache.presentations.length : 0);
    // we need to fetch presentations count from renderSlides? Keep simple: use data.slides fallback
    var fbCount=(data.feedback && data.feedback.questions ? data.feedback.questions.length : 0);
    var pendingQa = loadQueue().filter(function(x){return x.type==='qa'}).length;
    var elQa=document.getElementById('badge-qa'); if(elQa) elQa.textContent = qaCount ? String(qaCount) : '';
    var elSlides=document.getElementById('badge-slides'); if(elSlides) elSlides.textContent = slidesCount ? String(slidesCount) : '';
    var elFb=document.getElementById('badge-feedback'); if(elFb) elFb.textContent = fbCount ? String(fbCount) : '';
    var elLive=document.getElementById('badge-live'); if(elLive){
      var active=data.active_question;
      if(active && !active.answered && !isLocked(active)) elLive.textContent='•';
      else elLive.textContent='';
    }
  }

  function renderEvent(evt){
    var n=document.getElementById('event-name');
    var c=document.getElementById('event-code');
    var d=document.getElementById('event-desc');
    if(!evt){ n.textContent='Event not found'; return; }
    n.textContent=evt.name || evt.code;
    c.textContent=evt.code;
    var brand = evt.brand ? ' · '+evt.brand : '';
    var date = evt.event_date ? ' · '+evt.event_date : '';
    var status = evt.status ? ' · '+(evt.status==='open'?'Open':'Closed') : '';
    d.textContent = (evt.description||'') + brand + date + status;
    document.title = esc(evt.name||evt.code) + ' — Meetup';
    try{ applyFeatureGating(evt); }catch(e){}
  }

  function renderMedia(container, q){
    if(!q || !q.media_url) return;
    var wrap=document.createElement('div'); wrap.className='q-media'; wrap.style.marginBottom='12px';
    var el;
    if(q.media_type==='video'){
      el=document.createElement('video'); el.controls=true; el.muted=true; el.autoplay=true; el.loop=true; el.playsInline=true; el.src=q.media_url;
      el.style.width='100%'; el.style.borderRadius='12px';
    } else {
      el=document.createElement('img'); el.src=q.media_url; el.alt=q.prompt||'question media'; el.loading='lazy';
      el.style.maxWidth='100%'; el.style.borderRadius='12px';
    }
    wrap.appendChild(el); container.appendChild(wrap);
  }

  function showQuizBanner(isCorrect, points){
    var el=document.getElementById('quiz-banner');
    if(!el || prefersReduced) return;
    el.style.display='block'; el.className='glass card-pad show';
    el.textContent='';
    if(isCorrect){
      el.style.borderColor='rgba(16,185,129,.35)'; el.style.background='rgba(16,185,129,.12)';
      var strong=document.createElement('strong'); strong.textContent='Correct! +'+points+' pts';
      var sub=document.createElement('span'); sub.style.marginLeft='8px'; sub.style.color='var(--muted)'; sub.textContent='Nice one.';
      el.appendChild(strong); el.appendChild(sub);
    } else {
      el.style.borderColor='rgba(244,63,94,.28)'; el.style.background='rgba(244,63,94,.08)';
      el.textContent='Not this time — keep going!';
    }
    setTimeout(function(){ el.style.display='none'; el.classList.remove('show'); }, 3200);
  }

  function renderLive(active){
    var card=document.getElementById('live-card');
    card.textContent='';
    card.setAttribute('aria-busy','false');
    if(!active){
      if(stateCache && stateCache._fetchError){
        var errWrap=document.createElement('div'); errWrap.style.display='grid'; errWrap.style.gap='10px'; errWrap.style.placeItems='center'; errWrap.style.padding='18px'; errWrap.style.textAlign='center';
        var h=document.createElement('h3'); h.textContent='Could not load event'; h.style.fontFamily='var(--font-display)';
        var p=document.createElement('p'); p.textContent='Check the link and try again.'; p.style.color='var(--muted)';
        var btn=document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Retry'; btn.style.minHeight='46px';
        btn.addEventListener('click', function(){ fetchState(); });
        errWrap.appendChild(h); errWrap.appendChild(p); errWrap.appendChild(btn);
        card.appendChild(errWrap); return;
      }
      // skeleton
      var w=document.createElement('div'); w.className='waiting';
      var orb=document.createElement('div'); orb.className='orb';
      orb.innerHTML='<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><path d="M12 3l7 4v8l-7 4-7-4V7z"/><circle cx="12" cy="12" r="2.8"/></svg>';
      var h2=document.createElement('h3'); h2.textContent='Waiting for the host…';
      var p2=document.createElement('p'); p2.textContent='The host will start a live question soon. Stay on this tab — it updates automatically.';
      w.appendChild(orb); w.appendChild(h2); w.appendChild(p2);
      card.appendChild(w); return;
      var h=document.createElement('h3'); h.textContent='Waiting for the host…';
      var p=document.createElement('p'); p.textContent='The host will start a live question soon. Stay on this tab — it updates automatically.';
      w.appendChild(orb); w.appendChild(h); w.appendChild(p);
      var roster=document.createElement('div'); roster.id='audience-roster'; roster.style.cssText='width:100%;display:flex;flex-direction:column;align-items:center;margin-top:12px';
      w.appendChild(roster); card.appendChild(w); try{ renderAudienceRoster(); }catch(e){}
      return;
    }
    renderMedia(card, active);
    var locked=isLocked(active);
    var topRow=document.createElement('div'); topRow.style.display='flex'; topRow.style.gap='12px'; topRow.style.alignItems='flex-start';
    var prompt=document.createElement('h2'); prompt.className='prompt'; prompt.textContent=active.prompt; prompt.style.flex='1';
    topRow.appendChild(prompt);
    // timer ring if has countdown
    if(typeof active.remaining_sec==='number' && active.status==='live' && !locked){
      var ring=createTimerRing(Math.max(0, active.remaining_sec), active.duration_sec||active.remaining_sec);
      ring.id='live-ring'; topRow.appendChild(ring);
    }
    card.appendChild(topRow);
    var meta=document.createElement('div'); meta.className='inline'; meta.style.marginTop='10px';
    var pill=document.createElement('span'); pill.className='pill'; pill.textContent= locked ? 'locked' : (active.status==='revealed' ? 'revealed' : active.kind);
    var total=document.createElement('span'); total.className='mono'; total.style.color='var(--muted)'; total.style.fontSize='.84rem'; total.textContent= locked ? 'Answers locked' : (canReveal(active) ? (active.total+' responses') : 'Responses hidden until host reveals');
    meta.appendChild(pill); meta.appendChild(total);
    if(active.points_base){ var pb=document.createElement('span'); pb.className='pill'; pb.textContent=active.points_base+' pts'; meta.appendChild(pb); }
    if(spectatorMode){ var sp=document.createElement('span'); sp.className='pill'; sp.textContent='Spectator'; sp.style.background='rgba(245,158,11,.14)'; meta.appendChild(sp); }
    card.appendChild(meta);

    var cdWrap=document.createElement('div'); cdWrap.id='audience-countdown'; cdWrap.className='hidden';
    cdWrap.style.display='none'; cdWrap.style.alignItems='center'; cdWrap.style.gap='10px'; cdWrap.style.marginTop='14px'; cdWrap.style.padding='10px 12px'; cdWrap.style.border='1px solid var(--border)'; cdWrap.style.borderRadius='12px'; cdWrap.style.background='rgba(255,255,255,.06)';
    var cdIcon=document.createElement('span'); cdIcon.setAttribute('aria-hidden','true'); cdIcon.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>';
    cdIcon.style.color='var(--muted)'; cdIcon.style.display='grid'; cdIcon.style.placeItems='center';
    var cdLabel=document.createElement('span'); cdLabel.id='countdown-label'; cdLabel.style.fontSize='.82rem'; cdLabel.style.color='var(--muted)'; cdLabel.style.fontWeight='600'; cdLabel.textContent='Time left';
    var cdVal=document.createElement('span'); cdVal.id='countdown-value'; cdVal.style.fontVariantNumeric='tabular-nums'; cdVal.style.fontWeight='800'; cdVal.textContent='--:--';
    cdVal.style.fontFamily='var(--font-mono)';
    var cdTrack=document.createElement('div'); cdTrack.style.flex='1'; cdTrack.style.height='6px'; cdTrack.style.borderRadius='999px'; cdTrack.style.background='rgba(255,255,255,.08)'; cdTrack.style.overflow='hidden'; cdTrack.style.marginLeft='4px';
    var cdFill=document.createElement('div'); cdFill.id='countdown-fill'; cdFill.style.height='100%'; cdFill.style.borderRadius='999px'; cdFill.style.background='var(--accent)'; cdFill.style.transition='width .35s linear'; cdFill.style.width='100%';
    cdTrack.appendChild(cdFill); cdWrap.appendChild(cdIcon); cdWrap.appendChild(cdLabel); cdWrap.appendChild(cdVal); cdWrap.appendChild(cdTrack);
    card.appendChild(cdWrap);

    if(active.answered){
      var th=document.createElement('div'); th.className='thanks'; th.style.marginTop='12px';
      th.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>';
      var answerText=active.my_answer||'';
      if(active.kind==='multi') answerText=parseAnswerArray(active.my_answer).join(', ');
      if(active.kind==='ranking') answerText=parseAnswerArray(active.my_answer).join(' › ');
      var s=document.createElement('span');
      s.textContent= answerText ? ('Thanks — your answer: '+answerText+'. Wait for results.') : 'Thanks — your answer is in. You can wait for results or keep exploring Q&A.';
      th.appendChild(s); card.appendChild(th);
      if(active.my_correct!==null && active.my_correct!==undefined){
        var cb=document.createElement('div'); cb.className='pill'; cb.style.marginTop='8px';
        if(active.my_correct){ cb.textContent='✓ Correct +'+(active.my_points||0)+' pts'; cb.style.background='rgba(16,185,129,.18)'; cb.style.color='#6EE7B7'; }
        else { cb.textContent='Not correct this time'; cb.style.background='rgba(244,63,94,.14)'; }
        card.appendChild(cb);
      }
      if(locked){ var lockNote=document.createElement('div'); lockNote.className='pill'; lockNote.style.marginTop='8px'; lockNote.textContent='⏱ Answers locked — waiting for the reveal…'; card.appendChild(lockNote); }
    } else if(locked){
      var lou=document.createElement('div'); lou.className='waiting'; lou.style.minHeight='120px'; lou.style.marginTop='12px';
      var lh=document.createElement('h3'); lh.textContent="Time's up — answers are locked"; lh.style.fontSize='1.1rem';
      var lp=document.createElement('p'); lp.textContent='Wait for the host to reveal the results.';
      lou.appendChild(lh); lou.appendChild(lp); card.appendChild(lou);
    }

    var disable = locked || active.answered || sessionExpired || spectatorMode;
    if(active.kind==='poll'){
      var opts=active.options||[];
      if(!disable){ card.appendChild(createQuestionOptions(active, function(opt,b){ submitAnswer(active.id, opt, b); })); }
      var bars=createResultsBars(active); if(bars) card.appendChild(bars);
      if(canReveal(active) && active.correct_index!==null && active.correct_index!==undefined){ var hint=document.createElement('div'); hint.style.color='#6EE7B7'; hint.style.fontSize='.82rem'; hint.style.marginTop='8px'; var correctOpt=opts[active.correct_index]; if(correctOpt) hint.textContent='Correct: '+correctOpt; card.appendChild(hint); }
    } else if(active.kind==='rating'){
      if(!disable){
        var stars=document.createElement('div'); stars.className='stars'; stars.style.marginTop='16px'; stars.setAttribute('role','group'); stars.setAttribute('aria-label','Rating 1 to 5');
        for(var i=1;i<=5;i++){ (function(v){ var btn=document.createElement('button'); btn.className='star'; btn.type='button'; btn.style.minWidth='46px'; btn.style.minHeight='46px'; btn.setAttribute('aria-label','Rate '+v+' of 5'); btn.textContent=String(v); btn.addEventListener('click', function(){ btn.classList.add('pressed'); vibrate(20); submitAnswer(active.id, String(v), btn); }); stars.appendChild(btn); })(i); }
        card.appendChild(stars);
      }
      var rb=createResultsBars(active); if(rb) card.appendChild(rb);
    } else if(active.kind==='yesno'){
      if(!disable){ card.appendChild(createQuestionOptions({options:['Yes','No']}, function(opt,b){ submitAnswer(active.id, opt.toLowerCase(), b); })); }
      var yb=createResultsBars(active); if(yb) card.appendChild(yb);
      if(canReveal(active) && active.correct_index!==null){ var yh=document.createElement('div'); yh.style.color='#6EE7B7'; yh.style.fontSize='.82rem'; yh.style.marginTop='8px'; yh.textContent='Correct: '+(active.correct_index===0?'Yes':'No'); card.appendChild(yh); }
    } else if(active.kind==='nps'){
      if(!disable){
        var nwrap=document.createElement('div'); nwrap.className='ans-grid'; nwrap.style.gridTemplateColumns='repeat(auto-fill,minmax(46px,1fr))';
        for(var n=0;n<=10;n++){ (function(v){ var b=document.createElement('button'); b.className='option-card option-btn'; b.type='button'; b.style.justifyContent='center'; b.textContent=String(v); b.setAttribute('aria-label','Score '+v+' out of 10'); b.addEventListener('click', function(){ b.classList.add('pressed'); vibrate(20); submitAnswer(active.id, String(v), b); }); nwrap.appendChild(b); })(n); }
        card.appendChild(nwrap);
      }
      if(canReveal(active) && active.nps!==null){ var npsBadge=document.createElement('div'); npsBadge.className='pill'; npsBadge.style.marginTop='14px'; npsBadge.textContent='NPS '+active.nps; card.appendChild(npsBadge); }
      var nb=createResultsBars(active); if(nb) card.appendChild(nb);
    } else if(active.kind==='multi'){
      if(!disable){
        var mform=document.createElement('form'); mform.className='ans-grid';
        var boxes=[];
        (active.options||[]).forEach(function(opt){
          var lab=document.createElement('label'); lab.className='option-card option-btn'; lab.style.cursor='pointer';
          var cb=document.createElement('input'); cb.type='checkbox'; cb.value=opt;
          var sp=document.createElement('span'); sp.textContent=opt;
          lab.appendChild(cb); lab.appendChild(sp); boxes.push(cb); mform.appendChild(lab);
        });
        var mbtn=document.createElement('button'); mbtn.className='btn btn-primary'; mbtn.type='submit'; mbtn.style.minHeight='46px'; mbtn.textContent='Submit selection';
        mform.appendChild(mbtn);
        mform.addEventListener('submit', function(e){ e.preventDefault(); if(sessionExpired){showSessionSheet('expired',code);return;} if(spectatorMode){toast('Spectator mode — rejoin to vote','err');return;} var picked=boxes.filter(function(c){return c.checked}).map(function(c){return c.value}); if(!picked.length){toast('Pick at least one option','err');return;} submitAnswer(active.id, JSON.stringify(picked), mbtn); });
        card.appendChild(mform);
      }
      var mb=createResultsBars(active); if(mb) card.appendChild(mb);
    } else if(active.kind==='ranking'){
      if(!disable){
        var order=(active.options||[]).slice();
        var rform=document.createElement('form'); rform.className='ans-grid';
        var rlist=document.createElement('div'); rlist.style.display='grid'; rlist.style.gap='8px';
        function paintRank(){
          rlist.textContent='';
          order.forEach(function(opt, idx){
            var row=document.createElement('div'); row.className='option-card';
            var num=document.createElement('span'); num.className='pill'; num.textContent=String(idx+1);
            var sp=document.createElement('span'); sp.style.flex='1'; sp.textContent=opt;
            var up=document.createElement('button'); up.type='button'; up.className='btn btn-ghost btn-small'; up.style.minHeight='36px'; up.textContent='↑'; up.setAttribute('aria-label','Move '+opt+' up'); up.disabled=idx===0;
            var down=document.createElement('button'); down.type='button'; down.className='btn btn-ghost btn-small'; down.style.minHeight='36px'; down.textContent='↓'; down.setAttribute('aria-label','Move '+opt+' down'); down.disabled=idx===order.length-1;
            up.addEventListener('click', function(){ var t=order[idx-1]; order[idx-1]=order[idx]; order[idx]=t; paintRank(); });
            down.addEventListener('click', function(){ var t=order[idx+1]; order[idx+1]=order[idx]; order[idx]=t; paintRank(); });
            row.appendChild(num); row.appendChild(sp); row.appendChild(up); row.appendChild(down);
            rlist.appendChild(row);
          });
        }
        paintRank();
        var rbtn=document.createElement('button'); rbtn.className='btn btn-primary'; rbtn.type='submit'; rbtn.style.minHeight='46px'; rbtn.textContent='Submit ranking';
        rform.appendChild(rlist); rform.appendChild(rbtn);
        rform.addEventListener('submit', function(e){ e.preventDefault(); if(sessionExpired){showSessionSheet('expired',code);return;} submitAnswer(active.id, JSON.stringify(order), rbtn); });
        card.appendChild(rform);
      }
      renderRanking(card, active);
    } else if(active.kind==='open'){
      if(!disable){
        var form=document.createElement('form'); form.className='ans-grid';
        var ta=document.createElement('textarea'); ta.className='textarea'; ta.placeholder='Type your answer…'; ta.required=true; ta.rows=3; ta.maxLength=500;
        var btn=document.createElement('button'); btn.className='btn btn-primary'; btn.type='submit'; btn.style.minHeight='46px'; btn.textContent='Submit';
        form.appendChild(ta); form.appendChild(btn);
        form.addEventListener('submit', function(e){ e.preventDefault(); if(sessionExpired){showSessionSheet('expired',code);return;} if(!ta.value.trim()) return; submitAnswer(active.id, ta.value.trim(), btn); });
        card.appendChild(form);
      }
      if(canReveal(active)){ var ob=createResultsBars(active); if(ob) card.appendChild(ob); }
    } else if(active.kind==='wordcloud'){
      if(!disable){
        var form2=document.createElement('form'); form2.className='ans-grid';
        var ta2=document.createElement('textarea'); ta2.className='textarea'; ta2.placeholder='One or two words…'; ta2.required=true; ta2.rows=2; ta2.maxLength=200;
        var b2=document.createElement('button'); b2.className='btn btn-primary'; b2.type='submit'; b2.style.minHeight='46px'; b2.textContent='Send';
        form2.appendChild(ta2); form2.appendChild(b2);
        form2.addEventListener('submit', function(e){ e.preventDefault(); if(sessionExpired){showSessionSheet('expired',code);return;} if(!ta2.value.trim()) return; submitAnswer(active.id, ta2.value.trim(), b2); });
        card.appendChild(form2);
      }
      renderWordCloud(card, active);
      if(canReveal(active)){ var wb=createResultsBars(active); if(wb) card.appendChild(wb); }
    }
  }

  function renderBars(container, active){
    var b=createResultsBars(active); if(b) container.appendChild(b);
  }
  function renderRanking(container, active){
    if(!canReveal(active)) return;
    var res=active.results||[]; if(!res.length) return;
    var max=Math.max.apply(null, res.map(function(r){return r.score||0}))||1;
    var wrap=document.createElement('div'); wrap.className='results'; wrap.style.marginTop='14px';
    res.forEach(function(r, idx){
      var row=document.createElement('div'); row.className='result-row';
      var head=document.createElement('div'); head.className='result-head';
      var lab=document.createElement('strong'); lab.textContent=(idx+1)+'. '+r.label;
      var cnt=document.createElement('span'); cnt.textContent=(r.score||0)+' pts · avg '+(r.avg_rank ? r.avg_rank.toFixed(1) : '0');
      head.appendChild(lab); head.appendChild(cnt);
      var track=document.createElement('div'); track.className='track';
      var fill=document.createElement('div'); fill.className='fill';
      row.appendChild(head); track.appendChild(fill); row.appendChild(track); wrap.appendChild(row);
      if(prefersReduced) fill.style.width=((r.score||0)/max*100)+'%'; else requestAnimationFrame(function(){ fill.style.width=((r.score||0)/max*100)+'%'; });
    });
    container.appendChild(wrap);
  }
  function renderWordCloud(container, active){
    if(!canReveal(active)) return;
    var res=active.results||[]; if(!res.length) return;
    var cloud=document.createElement('div'); cloud.className='cloud'; cloud.style.marginTop='14px';
    var filtered=res.filter(function(r){return r.count>0});
    if(!filtered.length){ var empty=document.createElement('span'); empty.style.color='var(--muted)'; empty.style.fontSize='.88rem'; empty.textContent='No answers yet — be the first!'; cloud.appendChild(empty); }
    else {
      var max=Math.max.apply(null, filtered.map(function(r){return r.count}));
      filtered.sort(function(a,b){return b.count-a.count});
      filtered.forEach(function(r, idx){
        var s=document.createElement('span'); s.className='cloud-item';
        var scale=0.82+(r.count/max)*0.55; var opacity=0.85+(r.count/max)*0.15;
        s.style.fontSize=(scale)+'rem'; s.style.opacity=String(opacity);
        if(!prefersReduced) s.style.animationDelay=(idx*45)+'ms';
        if(idx===0){ s.style.background='var(--accent)'; s.style.color='#fff'; s.style.borderColor='transparent'; }
        s.textContent=r.label; cloud.appendChild(s);
      });
    }
    container.appendChild(cloud);
  }

  var qaFilter='popular';
  var pendingQaCards=[];
  function renderQA(list){
    var root=document.getElementById('qa-list');
    root.textContent='';
    if(sessionExpired){
      var exp=document.createElement('div'); exp.className='glass card-pad'; exp.style.color='var(--muted)'; exp.textContent='Session ended — rejoin to ask or vote.';
      root.appendChild(exp); return;
    }
    // pending optimistic card
    var pendWrap=document.getElementById('qa-pending');
    if(pendWrap){ pendWrap.textContent=''; if(pendingQaCards.length){ pendWrap.classList.remove('hidden'); pendingQaCards.forEach(function(c){ pendWrap.appendChild(c); }); } else pendWrap.classList.add('hidden'); }
    if(!list || !list.length){
      if(pendingQaCards.length) return;
      var empty=document.createElement('div'); empty.className='empty-illustration';
      var orb=document.createElement('div'); orb.className='orb'; orb.textContent='💬';
      var ht=document.createElement('div'); ht.style.fontWeight='700'; ht.style.color='var(--text)'; ht.textContent='No questions yet';
      var pt=document.createElement('div'); pt.textContent='Be the first to ask! Your question will appear after the host approves it.';
      var sug=document.createElement('div'); sug.style.display='flex'; sug.style.gap='6px'; sug.style.flexWrap='wrap'; sug.style.justifyContent='center';
      ['What inspired this?', 'Can you give an example?', 'What\'s next?'].forEach(function(s){
        var b=document.createElement('button'); b.className='chip'; b.textContent=s; b.type='button'; b.addEventListener('click', function(){ var ta=document.getElementById('qa-body'); if(ta){ ta.value=s; ta.focus(); }});
        sug.appendChild(b);
      });
      empty.appendChild(orb); empty.appendChild(ht); empty.appendChild(pt); empty.appendChild(sug);
      root.appendChild(empty); return;
    }
    var sorted=list.slice();
    if(qaFilter==='popular') sorted.sort(function(a,b){return b.votes - a.votes;});
    else if(qaFilter==='recent') sorted.sort(function(a,b){ return (b.created_at||0) - (a.created_at||0); });
    else if(qaFilter==='mine') sorted = sorted.filter(function(q){ return q.author && q.author===identity.name; });
    if(qaFilter==='mine' && !sorted.length){
      var e2=document.createElement('div'); e2.className='glass card-pad'; e2.style.color='var(--muted)'; e2.textContent='You haven\'t asked anything yet.';
      root.appendChild(e2); return;
    }
    sorted.forEach(function(q){
      root.appendChild(createQaCard(q, list));
    });
  }
  // filter chips
  document.querySelectorAll('[data-qa-filter]').forEach(function(btn){
    btn.addEventListener('click', function(){
      qaFilter=btn.getAttribute('data-qa-filter');
      document.querySelectorAll('[data-qa-filter]').forEach(function(b){ b.classList.toggle('active', b===btn); });
      renderQA(stateCache ? stateCache.qa||[] : []);
    });
  });

  function renderSlides(list){
    var root=document.getElementById('slides-list');
    root.textContent='';
    if(!list || !list.length){ var e=document.createElement('div'); e.style.color='var(--muted)'; e.style.fontSize='.9rem'; e.textContent='No slides available yet.'; root.appendChild(e); return; }
    list.forEach(function(p){
      var row=document.createElement('div'); row.className='option-card'; row.style.cursor='default';
      var icon=document.createElement('div'); icon.style.width='42px'; icon.style.height='42px'; icon.style.borderRadius='10px'; icon.style.display='grid'; icon.style.placeItems='center'; icon.style.background='rgba(124,107,255,.18)'; icon.style.color='#A5B4FC'; icon.style.flexShrink='0';
      icon.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
      var info=document.createElement('div'); info.style.flex='1'; info.style.minWidth='0';
      var t=document.createElement('div'); t.style.fontWeight='700'; t.textContent=p.title || p.filename;
      var sub=document.createElement('div'); sub.style.color='var(--muted)'; sub.style.fontSize='.82rem'; sub.textContent=(p.speaker? p.speaker+' · ':'') + (p.size? (Math.round(p.size/1024)+' KB · ') : '') + (p.filename||'');
      info.appendChild(t); info.appendChild(sub);
      var a=document.createElement('a'); a.className='btn btn-ghost btn-small'; a.href=p.url; a.textContent='Download'; a.setAttribute('download',''); a.style.minHeight='36px';
      row.appendChild(icon); row.appendChild(info); row.appendChild(a); root.appendChild(row);
    });
  }

  function renderLeaderboard(entries){
    var card=document.getElementById('leaderboard-card'); if(!card) return;
    card.textContent='';
    var h=document.createElement('h2'); h.className='section-title'; h.textContent='Leaderboard'; card.appendChild(h);
    var sub=document.createElement('p'); sub.className='section-sub'; sub.textContent='Top 10 — points from quiz questions.'; card.appendChild(sub);
    if(!entries || !entries.length){ var empty=document.createElement('div'); empty.style.color='var(--muted)'; empty.style.marginTop='14px'; empty.textContent='No scores yet — answer a quiz to get on the board!'; card.appendChild(empty); return; }
    var list=document.createElement('div'); list.style.display='grid'; list.style.gap='8px'; list.style.marginTop='14px';
    entries.forEach(function(e){
      var row=document.createElement('div'); row.className='lb-row';
      var isMe = identity.name && e.name===identity.name;
      if(isMe) row.classList.add('is-me');
      var rank=document.createElement('div'); rank.className='lb-rank'; rank.textContent=String(e.rank);
      if(e.rank===1){ rank.style.background='var(--accent)'; rank.style.color='#fff'; }
      var avatar=document.createElement('div'); avatar.style.width='36px'; avatar.style.height='36px'; avatar.style.borderRadius='50%'; avatar.style.display='grid'; avatar.style.placeItems='center'; avatar.style.flexShrink='0'; avatar.style.color='#fff'; avatar.style.background=e.color||'#6366F1'; avatar.textContent=e.emoji||'🙂';
      var info=document.createElement('div'); info.style.flex='1'; info.style.minWidth='0';
      var nm=document.createElement('div'); nm.style.fontWeight='700'; nm.style.whiteSpace='nowrap'; nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.textContent=e.name||'Anonymous';
      var pts=document.createElement('div'); pts.style.color='var(--muted)'; pts.style.fontSize='.82rem'; pts.textContent=e.points+' pts';
      info.appendChild(nm); info.appendChild(pts);
      var score=document.createElement('div'); score.style.fontWeight='800'; score.textContent=String(e.points); score.style.fontFamily='var(--font-mono)';
      row.appendChild(rank); row.appendChild(avatar); row.appendChild(info); row.appendChild(score); list.appendChild(row);
    });
    card.appendChild(list);
  }
  function renderPodium(entries){
    var card=document.getElementById('live-card'); if(!card) return;
    card.textContent=''; var h=document.createElement('h2'); h.className='section-title'; h.textContent='🏆 Leaderboard'; card.appendChild(h);
    var sub=document.createElement('p'); sub.className='section-sub'; sub.textContent='Top scores from this event.'; card.appendChild(sub);
    entries=entries||[]; if(!entries.length){ var empty=document.createElement('div'); empty.style.color='var(--muted)'; empty.style.marginTop='14px'; empty.textContent='No scores yet — play a quiz!'; card.appendChild(empty); return; }
    var top=entries.slice(0,3), rest=entries.slice(3);
    var order=[]; if(top[1]) order.push(top[1]); if(top[0]) order.push(top[0]); if(top[2]) order.push(top[2]);
    var colors={1:'var(--accent)',2:'var(--surface-2)',3:'var(--surface-3)'}; var heights={1:'120px',2:'92px',3:'72px'}; var meds={1:'🥇',2:'🥈',3:'🥉'};
    var podium=document.createElement('div'); podium.style.display='flex'; podium.style.alignItems='flex-end'; podium.style.justifyContent='center'; podium.style.gap='10px'; podium.style.margin='20px 0 6px'; podium.style.flexWrap='wrap';
    order.forEach(function(e){
      var rank=e.rank||0; var col=document.createElement('div'); col.style.display='flex'; col.style.flexDirection='column'; col.style.alignItems='center'; col.style.gap='6px'; col.style.minWidth='92px'; col.style.flex='1'; col.style.maxWidth='140px';
      var em=document.createElement('div'); em.style.width='44px'; em.style.height='44px'; em.style.borderRadius='50%'; em.style.display='grid'; em.style.placeItems='center'; em.style.color='#fff'; em.style.background=e.color||'#6366F1'; em.textContent=e.emoji||'🙂';
      var nm=document.createElement('div'); nm.style.fontWeight='700'; nm.style.fontSize='.86rem'; nm.style.textAlign='center'; nm.style.maxWidth='130px'; nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.style.whiteSpace='nowrap'; nm.textContent=e.name||'Anonymous';
      var block=document.createElement('div'); block.style.width='100%'; block.style.height=heights[rank]||'60px'; block.style.borderRadius='12px 12px 0 0'; block.style.background=colors[rank]||'rgba(255,255,255,.12)'; block.style.display='flex'; block.style.flexDirection='column'; block.style.alignItems='center'; block.style.justifyContent='center';
      var md=document.createElement('div'); md.textContent=meds[rank]||('#'+rank); md.style.fontSize='1.15rem';
      var pt=document.createElement('div'); pt.style.fontWeight='900'; pt.style.color='#0B1020'; pt.textContent=(e.points||0)+' pts';
      block.appendChild(md); block.appendChild(pt); col.appendChild(em); col.appendChild(nm); col.appendChild(block); podium.appendChild(col);
    });
    card.appendChild(podium);
    if(rest.length){ var list=document.createElement('div'); list.style.display='grid'; list.style.gap='8px'; list.style.marginTop='12px'; rest.forEach(function(e){ var row=document.createElement('div'); row.className='lb-row'; var rank=document.createElement('div'); rank.className='lb-rank'; rank.textContent='#'+(e.rank||0); var avatar=document.createElement('div'); avatar.style.width='32px'; avatar.style.height='32px'; avatar.style.borderRadius='50%'; avatar.style.display='grid'; avatar.style.placeItems='center'; avatar.style.color='#fff'; avatar.style.background=e.color||'#6366F1'; avatar.textContent=e.emoji||'🙂'; var nm=document.createElement('div'); nm.style.flex='1'; nm.style.fontWeight='600'; nm.style.whiteSpace='nowrap'; nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.textContent=e.name||'Anonymous'; var pt=document.createElement('div'); pt.style.fontWeight='800'; pt.textContent=String(e.points||0); pt.style.fontFamily='var(--font-mono)'; row.appendChild(rank); row.appendChild(avatar); row.appendChild(nm); row.appendChild(pt); list.appendChild(row); }); card.appendChild(list); }
  }

  function buildFeedbackControl(q, inputId){
    var el=document.createElement('div'); el.style.display='grid'; el.style.gap='8px';
    var i;
    if(q.kind==='rating'){
      var stars=document.createElement('div'); stars.className='stars'; stars.setAttribute('role','group'); stars.setAttribute('aria-label', q.prompt);
      var rhidden=document.createElement('input'); rhidden.type='hidden'; rhidden.id=inputId;
      for(i=1;i<=5;i++){ (function(val){ var b=document.createElement('button'); b.type='button'; b.className='star'; b.style.minHeight='46px'; b.style.minWidth='46px'; b.textContent=String(val); b.setAttribute('aria-label', val+' of 5'); b.addEventListener('click', function(){ rhidden.value=String(val); Array.prototype.forEach.call(stars.querySelectorAll('.star'), function(s, idx){ s.classList.toggle('active', idx < val); }); }); stars.appendChild(b); })(i); }
      el.appendChild(stars); el.appendChild(rhidden);
      return { el:el, read:function(){return rhidden.value;}, clear:function(){ rhidden.value=''; Array.prototype.forEach.call(stars.querySelectorAll('.star'), function(s){s.classList.remove('active');}); } };
    }
    if(q.kind==='yesno' || q.kind==='poll'){
      var opts = q.kind==='yesno' ? ['Yes','No'] : (q.options||[]);
      var bhidden=document.createElement('input'); bhidden.type='hidden'; bhidden.id=inputId;
      var grid=document.createElement('div'); grid.className='ans-grid';
      opts.forEach(function(opt){ var b=document.createElement('button'); b.type='button'; b.className='option-card option-btn'; b.textContent=opt; b.addEventListener('click', function(){ bhidden.value = q.kind==='yesno' ? opt.toLowerCase() : opt; Array.prototype.forEach.call(grid.querySelectorAll('button'), function(x){ x.classList.toggle('selected', x===b); }); }); grid.appendChild(b); });
      el.appendChild(grid); el.appendChild(bhidden);
      return { el:el, read:function(){return bhidden.value;}, clear:function(){ bhidden.value=''; Array.prototype.forEach.call(grid.querySelectorAll('button'), function(x){x.classList.remove('selected');}); } };
    }
    if(q.kind==='nps'){
      var nhidden=document.createElement('input'); nhidden.type='hidden'; nhidden.id=inputId;
      var nrow=document.createElement('div'); nrow.className='ans-grid'; nrow.style.gridTemplateColumns='repeat(auto-fill,minmax(46px,1fr))';
      for(i=0;i<=10;i++){ (function(val){ var b=document.createElement('button'); b.type='button'; b.className='option-card option-btn'; b.style.justifyContent='center'; b.textContent=String(val); b.addEventListener('click', function(){ nhidden.value=String(val); Array.prototype.forEach.call(nrow.querySelectorAll('button'), function(x){ x.classList.toggle('selected', x===b); }); }); nrow.appendChild(b); })(i); }
      el.appendChild(nrow); el.appendChild(nhidden);
      return { el:el, read:function(){return nhidden.value;}, clear:function(){ nhidden.value=''; Array.prototype.forEach.call(nrow.querySelectorAll('button'), function(x){x.classList.remove('selected');}); } };
    }
    if(q.kind==='multi'){
      var boxes=[]; (q.options||[]).forEach(function(opt){ var lab=document.createElement('label'); lab.className='option-card option-btn'; lab.style.cursor='pointer'; var cb=document.createElement('input'); cb.type='checkbox'; cb.value=opt; var sp=document.createElement('span'); sp.textContent=opt; lab.appendChild(cb); lab.appendChild(sp); boxes.push(cb); el.appendChild(lab); });
      return { el:el, read:function(){ return JSON.stringify(boxes.filter(function(c){return c.checked}).map(function(c){return c.value})); }, clear:function(){ boxes.forEach(function(c){c.checked=false;}); }, validate:function(){ return boxes.some(function(c){return c.checked}); } };
    }
    if(q.kind==='ranking'){
      var order=(q.options||[]).slice(); var touched=false; var rlist=document.createElement('div'); rlist.style.display='grid'; rlist.style.gap='8px';
      function paint(){ rlist.textContent=''; order.forEach(function(opt, idx){ var row=document.createElement('div'); row.className='option-card'; var num=document.createElement('span'); num.className='pill'; num.textContent=String(idx+1); var sp=document.createElement('span'); sp.style.flex='1'; sp.textContent=opt; var up=document.createElement('button'); up.type='button'; up.className='btn btn-ghost btn-small'; up.style.minHeight='36px'; up.textContent='↑'; up.disabled=idx===0; var down=document.createElement('button'); down.type='button'; down.className='btn btn-ghost btn-small'; down.style.minHeight='36px'; down.textContent='↓'; down.disabled=idx===order.length-1; up.addEventListener('click', function(){ touched=true; var t=order[idx-1]; order[idx-1]=order[idx]; order[idx]=t; paint(); }); down.addEventListener('click', function(){ touched=true; var t=order[idx+1]; order[idx+1]=order[idx]; order[idx]=t; paint(); }); row.appendChild(num); row.appendChild(sp); row.appendChild(up); row.appendChild(down); rlist.appendChild(row); }); }
      paint(); el.appendChild(rlist);
      return { el:el, read:function(){ return touched ? JSON.stringify(order) : ''; }, clear:function(){ touched=false; } };
    }
    var ta=document.createElement('textarea'); ta.className='textarea'; ta.id=inputId; ta.rows=3; ta.placeholder='Your answer…'; ta.maxLength = q.kind==='wordcloud' ? 200 : 500;
    el.appendChild(ta);
    return { el:el, read:function(){return ta.value.trim();}, clear:function(){ ta.value=''; } };
  }

  function renderFeedback(feedback, eventObj){
    var card=document.getElementById('feedback-card'); card.textContent='';
    if(!feedback || !feedback.open){
      var title=document.createElement('h2'); title.className='section-title'; title.textContent='Feedback';
      var sub=document.createElement('p'); sub.className='section-sub'; sub.textContent='Feedback is not open yet. The host will open it during or after the event.';
      var badge=document.createElement('div'); badge.className='pill'; badge.style.marginTop='12px'; badge.textContent='Closed';
      card.appendChild(title); card.appendChild(sub); card.appendChild(badge); return;
    }
    var qs=feedback.questions||[]; if(!qs.length){ var t2=document.createElement('h2'); t2.className='section-title'; t2.textContent='Feedback'; card.appendChild(t2); var p2=document.createElement('p'); p2.style.color='var(--muted)'; p2.textContent='Feedback is open but no questions are configured.'; card.appendChild(p2); return; }
    var h=document.createElement('h2'); h.className='section-title'; h.textContent='Feedback'; card.appendChild(h);
    var intro=document.createElement('p'); intro.className='section-sub'; intro.textContent='Your feedback helps the host improve. Thanks for taking a minute.'; card.appendChild(intro);
    var form=document.createElement('form'); form.style.display='grid'; form.style.gap='18px'; form.style.marginTop='16px';
    var states={};
    qs.forEach(function(q){
      var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px';
      renderMedia(wrap, q);
      var label=document.createElement('label'); label.style.fontWeight='650'; label.style.fontFamily='var(--font-display)'; label.textContent=q.prompt; label.setAttribute('for','fb-'+q.id);
      var ctl=buildFeedbackControl(q, 'fb-'+q.id);
      wrap.appendChild(label); wrap.appendChild(ctl.el); states[q.id]=ctl; form.appendChild(wrap);
    });
    var submit=document.createElement('button'); submit.className='btn btn-primary'; submit.type='submit'; submit.style.minHeight='46px'; submit.textContent='Submit feedback';
    var hint=document.createElement('div'); hint.style.color='var(--muted)'; hint.style.fontSize='.82rem'; hint.textContent='Each answer is submitted individually.';
    form.appendChild(submit); form.appendChild(hint);
    form.addEventListener('submit', function(e){
      e.preventDefault();
      if(sessionExpired){ showSessionSheet('expired',code); return; }
      if(spectatorMode){ toast('Spectator mode — rejoin to submit','err'); return; }
      var items=[]; qs.forEach(function(q){ var ctl=states[q.id]; if(!ctl) return; if(ctl.validate && !ctl.validate()) return; var val=(ctl.read()||'').trim(); if(!val) return; items.push({q:q, ctl:ctl, val:val}); });
      if(!items.length){ toast('Please fill at least one field','err'); return; }
      vibrate(40);
      if(isOpen()){
        var waiting={}; var total=items.length; items.forEach(function(it){ waiting[it.q.id]=true; });
        pendingFeedback={waiting:waiting, total:total, done:0, states:states, submit:submit};
        submit.disabled=true; submit.textContent='Sending…';
        var ok=true; items.forEach(function(it){ if(!wsSend({type:'answer', question_id:it.q.id, value:it.val})){ ok=false; } });
        if(!ok){ pendingFeedback=null; submit.disabled=false; submit.textContent='Submit feedback'; toast('Could not submit feedback','err'); }
        return;
      }
      var tasks=[]; items.forEach(function(it){ enqueue({type:'answer', question_id:it.q.id, value:it.val, client_uuid:genUUID()}); tasks.push(fetch('/api/events/'+encodeURIComponent(code)+'/answers',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({question_id:it.q.id, value:it.val})}).then(function(r){ if(r.status===401) throw new Error('join_expired'); if(!r.ok) throw new Error('failed'); it.ctl.clear(); })); });
      submit.disabled=true; submit.textContent='Sending…';
      Promise.all(tasks).then(function(){ toast('Feedback sent — thank you!'); vibrate(40); }).catch(function(err){ if(err.message==='join_expired') showSessionSheet('expired',code); else toast('Some answers failed','err'); }).finally(function(){ submit.disabled=false; submit.textContent='Submit feedback'; });
    });
    card.appendChild(form);
  }

  function initReactionBar(){
    var wrap=document.getElementById('reaction-btns'); var countsEl=document.getElementById('reaction-counts'); if(!wrap) return;
    wrap.textContent=''; var lastSend=0;
    REACTION_EMOJIS.forEach(function(em){
      var b=document.createElement('button'); b.type='button'; b.className='r-btn'; b.textContent=em; b.setAttribute('aria-label','React '+em); b.setAttribute('aria-pressed','false');
      b.addEventListener('click', function(){
        if(sessionExpired || spectatorMode){ toast('Rejoin to react','err'); return; }
        var now=Date.now(); if(now-lastSend<80) return; lastSend=now;
        b.classList.add('pressed'); setTimeout(function(){ b.classList.remove('pressed'); }, 180);
        if(isOpen()) wsSend({type:'reaction', emoji:em});
        if(!prefersReduced) spawnFloat(em); else { var c=document.createElement('span'); c.className='count-pill'; c.textContent=em; countsEl.appendChild(c); setTimeout(function(){ if(c.parentNode) c.parentNode.removeChild(c); },1200); }
        vibrate(20);
      });
      wrap.appendChild(b);
    });
    window._qtUpdateReactions=function(data){
      if(!countsEl) return; countsEl.textContent=''; if(!data || !data.length) return;
      data.forEach(function(r){ var s=document.createElement('span'); s.className='count-pill'; s.textContent=r.emoji+' '+r.count; countsEl.appendChild(s); });
    };
  }
  function spawnFloat(emoji){
    if(prefersReduced) return;
    var root=document.getElementById('reaction-float'); if(!root) return;
    var el=document.createElement('div'); el.className='float-emoji'; el.textContent=emoji; root.appendChild(el);
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 1100);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initReactionBar); else initReactionBar();

  var ws=null; var wsBackoff=1000; var wsTimer=null;
  var pendingAnswers={}; var pendingVotes={}; var pendingQA=null; var pendingFeedback=null;
  function wsUrl(){ return (location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/events/'+encodeURIComponent(code); }
  function isOpen(){ return ws && ws.readyState===1; }
  function wsSend(obj){ try{ ws.send(JSON.stringify(obj)); return true; }catch(e){ return false; } }
  function updateWsBanner(show){
    var el=document.getElementById('ws-banner');
    if(!el) return;
    if(show && !sessionExpired) el.classList.add('show');
    else el.classList.remove('show');
  }
  function handleWsMessage(m){
    if(!m || !m.type) return;
    if(m.type==='session_expired'){
      var rc=(m.data && m.data.event_code) || code;
      var ru=(m.data && m.data.rejoin_url) || '/e/'+encodeURIComponent(rc);
      rejoinUrl=ru;
      showSessionSheet('expired', rc);
      try{ if(ws) ws.close(); }catch(e){}
      return;
    }
    if(m.type==='participants' && m.data){
      participantsData={count:m.data.count||0, participants:Array.isArray(m.data.participants)?m.data.participants:[]};
      renderAudienceRoster();
      return;
    }
    if(m.type==='nav' && m.data && typeof m.data.index==='number'){
      // deck remote nav sync — no audience action needed
      return;
    }
    if(m.type==='slide'){
      var sd=m.data || m;
      var slide={index: sd.index, total: sd.total, title: sd.title||'', question_id: sd.question_id||0, slide_id: sd.slide_id||'', deck_slug: sd.deck_slug||''};
      if(typeof slide.index==='number' && typeof slide.total==='number') syncSlideFocus(slide);
      return;
    }
    if(m.type==='state' && m.data){ applyState(m.data); return; }
    if(m.type==='reactions'){ if(window._qtUpdateReactions) window._qtUpdateReactions(m.data); if(m.data && m.data.length && !prefersReduced){ var top=m.data.slice().sort(function(a,b){return b.count-a.count;})[0]; if(top) spawnFloat(top.emoji); } return; }
    if(m.type==='ping' && isOpen()){ wsSend({type:'pong'}); return; }
    if(m.type==='pong') return;
    if(m.type==='result'){
      if(m.for==='vote'){ var pv=pendingVotes[m.id]; if(pv){ delete pendingVotes[m.id]; if(typeof m.votes==='number') pv.q.votes=m.votes; pv.q.voted=!!m.voted; renderQA(pv.sorted); toast('Upvoted — thanks!'); vibrate(40); pruneQueue(stateCache||{}); saveQueue(loadQueue().filter(function(x){ return !(x.type==='vote' && x.id===m.id);})); } return; }
      if(m.for==='answer'){
        if(pendingFeedback && pendingFeedback.waiting[m.id||m.question_id]){
          delete pendingFeedback.waiting[m.id||m.question_id]; var qidFb=m.id||m.question_id; var ctl=pendingFeedback.states[qidFb]; if(ctl) ctl.clear(); pendingFeedback.done++;
          if(m.is_correct!==undefined){ if(m.is_correct){ toast('Correct! +'+(m.points_awarded||0)+' pts'); if(!prefersReduced) vibrate([20,30,20]); } else { toast('Answer saved'); vibrate(40); } }
          if(pendingFeedback.done>=pendingFeedback.total){ toast('Feedback sent — thank you!'); pendingFeedback.submit.textContent='Submit feedback'; pendingFeedback.submit.disabled=false; pendingFeedback=null; }
          if(pendingAnswers[qidFb]) delete pendingAnswers[qidFb]; return;
        }
        var pa=pendingAnswers[m.id||m.question_id]; if(pa){ delete pendingAnswers[m.id||m.question_id]; if(m.status==='flagged'){ toast('Answer sent — under review'); } else if(typeof m.is_correct==='boolean'){ if(m.is_correct){ toast('Correct! +'+(m.points_awarded||0)+' pts'); showQuizBanner(true, m.points_awarded||0); if(!prefersReduced) vibrate([20,30,20]); } else { toast('Not this time'); showQuizBanner(false,0); } } else { toast('Answer sent!'); } pa.btn.textContent='Sent ✓'; var qid=m.id||m.question_id; var qq=loadQueue().filter(function(x){ return !(x.type==='answer' && x.question_id===qid); }); saveQueue(qq); } return;
      }
      if(m.for==='qa'){
        if(pendingQA){ var btn=pendingQA.btn; pendingQA=null; document.getElementById('qa-body').value=''; document.getElementById('qa-author').value=''; // clear optimistic
          pendingQaCards=[]; var pw=document.getElementById('qa-pending'); if(pw) pw.textContent='';
          toast(m.status==='flagged' ? 'Question submitted — under review' : 'Question submitted — awaiting approval'); vibrate(40); btn.disabled=false; btn.textContent='Submit question'; var qq2=loadQueue().filter(function(x){ return x.type!=='qa'; }); saveQueue(qq2); fetchState(); }
        return;
      }
      if(m.for==='identity'){ return; }
    }
    if(m.type==='error'){
      if(m.for==='vote'){ var pv2=pendingVotes[m.id]; if(pv2){ delete pendingVotes[m.id]; pv2.btn.disabled=false; toast(m.error||'Could not vote','err'); } return; }
      if(m.for==='answer'){
        if(pendingFeedback && pendingFeedback.waiting[m.id||m.question_id]){ delete pendingFeedback.waiting[m.id||m.question_id]; pendingFeedback=null; var fbBtn=document.querySelector('#feedback-card form button[type="submit"]'); if(fbBtn){ fbBtn.disabled=false; fbBtn.textContent='Submit feedback'; } toast(m.error||'Some answers failed','err'); return; }
        var pa2=pendingAnswers[m.id||m.question_id]; if(pa2){ delete pendingAnswers[m.id||m.question_id]; pa2.btn.disabled=false; pa2.btn.textContent=pa2.orig; if(m.code==='join_expired' || (m.error && m.error.indexOf('join_expired')!==-1)) showSessionSheet('expired', code); else toast(m.error||'Could not submit answer','err'); } else toast(m.error||'Could not submit answer','err'); return;
      }
      if(m.for==='qa'){
        var hadQA=pendingQA; pendingQA=null;
        if(m.code==='join_expired'){ showSessionSheet('expired', code); return; }
        if(m.retry_after_s){ startQACooldown(m.retry_after_s, m.error||'Slow mode'); return; }
        if(hadQA){ var b=hadQA.btn; b.disabled=false; b.textContent='Submit question'; toast(m.error||'Could not submit question','err'); pendingQaCards=[]; }
        return;
      }
      if(m.code==='join_expired'){ showSessionSheet('expired', code); return; }
      toast(m.error||'Error','err');
    }
  }

  function submitAnswer(qid, value, btn){
    if(sessionExpired){ showSessionSheet('expired', code); return; }
    if(spectatorMode){ toast('Spectator mode — rejoin to answer','err'); return; }
    var orig=btn.textContent; btn.disabled=true; btn.textContent='Sending…';
    var client_uuid=genUUID();
    if(isOpen()){
      pendingAnswers[qid]={btn:btn, orig:orig};
      if(!wsSend({type:'answer', question_id:qid, value:value, client_uuid:client_uuid})){ delete pendingAnswers[qid]; enqueue({type:'answer', question_id:qid, value:value, client_uuid:client_uuid}); doSubmitAnswerFetch(qid, value, btn, orig, client_uuid); }
      return;
    }
    enqueue({type:'answer', question_id:qid, value:value, client_uuid:client_uuid}); doSubmitAnswerFetch(qid, value, btn, orig, client_uuid);
  }
  function doSubmitAnswerFetch(qid, value, btn, orig, client_uuid){
    fetch('/api/events/'+encodeURIComponent(code)+'/answers',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({question_id:qid, value:value, client_uuid:client_uuid})}).then(function(r){
      if(r.status===401){ return r.json().then(function(j){ if(j.code==='join_expired') showSessionSheet('expired', j.room_code||code); throw new Error(j.error||'Session expired'); }); }
      if(!r.ok) throw new Error('answer failed'); return r.json();
    }).then(function(j){
      if(j.flagged){ toast('Answer sent — under review'); }
      else if(typeof j.is_correct==='boolean'){ if(j.is_correct){ toast('Correct! +'+(j.points_awarded||0)+' pts'); showQuizBanner(true, j.points_awarded||0); if(!prefersReduced) vibrate([20,30,20]); } else { toast('Not this time'); showQuizBanner(false,0); } }
      else { toast('Answer sent!'); }
      btn.textContent='Sent ✓';
      var qq=loadQueue().filter(function(x){ return !(x.type==='answer' && x.question_id===qid); }); saveQueue(qq);
    }).catch(function(err){ if(err.message && err.message.indexOf('Session expired')!==-1) return; btn.disabled=false; btn.textContent=orig; toast('Could not submit answer','err'); });
  }
  function doVoteFetch(q, sorted, btn){
    fetch('/api/events/'+encodeURIComponent(code)+'/qa/'+q.id+'/vote',{method:'POST',credentials:'same-origin'}).then(function(r){
      if(r.status===401){ return r.json().then(function(j){ if(j.code==='join_expired') showSessionSheet('expired', j.room_code||code); throw new Error('Session expired'); }); }
      if(!r.ok) throw new Error('vote failed'); return r.json();
    }).then(function(j){ q.votes=j.votes; q.voted=true; renderQA(sorted); toast('Upvoted — thanks!'); vibrate(40); var qq=loadQueue().filter(function(x){ return !(x.type==='vote' && x.id===q.id); }); saveQueue(qq); }).catch(function(err){ if(err.message==='Session expired') return; btn.disabled=false; toast('Could not vote','err'); });
  }

  var qaCooldownTimer=null;
  function startQACooldown(sec, msg){
    var form=document.getElementById('qa-form'); if(!form) return; var btn=form.querySelector('button[type="submit"]'); if(!btn) return;
    if(qaCooldownTimer){ clearInterval(qaCooldownTimer); qaCooldownTimer=null; }
    var remaining=Math.max(0,Math.round(sec||0)); if(msg) toast(msg,'err'); if(remaining<=0) return;
    var tick=function(){ if(remaining<=0){ clearInterval(qaCooldownTimer); qaCooldownTimer=null; btn.disabled=false; btn.textContent='Submit question'; return; } btn.disabled=true; btn.textContent='Wait '+remaining+'s…'; remaining--; };
    tick(); qaCooldownTimer=setInterval(tick,1000);
  }

  var qaForm=document.getElementById('qa-form');
  if(qaForm){
    qaForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(sessionExpired){ showSessionSheet('expired', code); return; }
      if(spectatorMode){ toast('Spectator mode — rejoin to ask','err'); return; }
      var body=document.getElementById('qa-body').value.trim();
      var authorRaw=document.getElementById('qa-author').value.trim();
      var author = authorRaw || (identity.name||'');
      if(!body) return;
      var btn=qaForm.querySelector('button[type="submit"]'); btn.disabled=true; btn.textContent='Submitting…';
      // optimistic pending card
      var pendCard=document.createElement('div'); pendCard.className='glass qa-item'; pendCard.style.opacity='0.85';
      var pb=document.createElement('div'); pb.className='qa-body'; pb.textContent=body;
      var pm=document.createElement('div'); pm.className='qa-meta'; pm.innerHTML='<strong>'+(author||'You')+'</strong> · awaiting approval <span class="pill">Pending</span>';
      pendCard.appendChild(pb); pendCard.appendChild(pm);
      pendingQaCards=[pendCard];
      var pw=document.getElementById('qa-pending'); if(pw){ pw.textContent=''; pw.appendChild(pendCard); pw.classList.remove('hidden'); }
      if(isOpen()){
        pendingQA={btn:btn};
        if(!wsSend({type:'qa', body:body, author:author})){ pendingQA=null; btn.disabled=false; btn.textContent='Submit question'; toast('Could not submit question','err'); enqueue({type:'qa', body:body, author:author}); pendingQaCards=[]; if(pw) pw.classList.add('hidden'); }
        return;
      }
      enqueue({type:'qa', body:body, author:author});
      fetch('/api/events/'+encodeURIComponent(code)+'/qa',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:body, author:author})}).then(function(r){
        if(r.status===401){ return r.json().then(function(j){ if(j.code==='join_expired') showSessionSheet('expired', j.room_code||code); throw {handled:true, expired:true}; }); }
        if(r.status===429){ return r.json().then(function(j){ saveQueue(loadQueue().filter(function(x){ return x.type!=='qa'; })); startQACooldown(j.retry_after_s||0, j.error||'Slow mode'); pendingQaCards=[]; if(pw) pw.classList.add('hidden'); throw {handled:true}; }); }
        if(!r.ok) throw new Error('qa failed'); return r.json();
      }).then(function(j){
        document.getElementById('qa-body').value=''; document.getElementById('qa-author').value='';
        toast(j.flagged ? 'Question submitted — under review' : (j.status==='pending' ? 'Question submitted — awaiting approval' : 'Question posted!')); vibrate(40);
        var qq=loadQueue().filter(function(x){ return x.type!=='qa'; }); saveQueue(qq);
        pendingQaCards=[]; if(pw) pw.classList.add('hidden');
        fetchState();
      }).catch(function(err){ if(!(err&&err.handled)){ pendingQaCards=[]; if(pw) pw.classList.add('hidden'); toast('Could not submit question','err'); } }).finally(function(){ if(!qaCooldownTimer){ btn.disabled=false; btn.textContent='Submit question'; } });
    });
  }

  function applyState(data){
    if(!data) return;
    try{ stateCache=data; }catch(e){ console.error('applyState init', e); throw e; }
    try{ if(data.join_session) updateJoinCountdown(data); }catch(e){ console.error('updateJoinCountdown', e); throw e; }
    if(data.event) renderEvent(data.event);
    if(data.event && data.event.show_podium){ renderPodium(data.leaderboard || []); }
    else { renderLive(data.active_question || null); }
    renderQA(data.qa || []);
    renderFeedback(data.feedback || {open:false, questions:[]}, data.event);
    renderLeaderboard(data.leaderboard || []);
    updateTabBadges(data);
    if(data.me) applyMe(data.me);
    pruneQueue(data);
    syncCountdown(data.active_question || null);
    var slide = data.current_slide || data.currentSlide || null;
    if(slide) {
      slide = {index: slide.index, total: slide.total, title: slide.title||'', question_id: slide.question_id||slide.questionId||0, slide_id: slide.slide_id||slide.slideId||'', deck_slug: slide.deck_slug||slide.deckSlug||''};
    }
    syncSlideFocus(slide);
    tickCountdown();
    // aria-busy
    document.querySelectorAll('[role="tabpanel"]').forEach(function(p){ p.setAttribute('aria-busy','false'); });
  }

  var lastExpired=false;
  function tickCountdown(){
    var active=stateCache && stateCache.active_question;
    var dl=deadlineMs(active);
    var pill=document.getElementById('countdown-pill');
    var visible = !!(active && dl && active.status!=='revealed' && active.status!=='closed' && !(stateCache.event && stateCache.event.show_podium));
    if(pill){
      if(!visible){ pill.classList.add('hidden'); pill.style.display='none'; }
      else {
        pill.classList.remove('hidden'); pill.style.display='';
        if(active.status==='locked') pill.textContent='⏱ Locked';
        else pill.textContent='⏱ '+Math.ceil(Math.max(0, dl-Date.now())/1000)+'s';
      }
    }
    var expired = !!(active && active.status==='live' && dl && Date.now()>=dl);
    if(expired && !lastExpired && !(stateCache.event && stateCache.event.show_podium)){ renderLive(active); }
    lastExpired=expired;
  }
  setInterval(tickCountdown, 250);

  function fetchState(){
    if(!code){ renderEvent(null); return Promise.resolve(); }
    document.querySelectorAll('[role="tabpanel"]').forEach(function(p){ p.setAttribute('aria-busy','true'); });
    var p=fetch('/api/events/'+encodeURIComponent(code)+'/state',{credentials:'same-origin'}).then(function(r){
      if(r.status===401){
        return r.json().then(function(j){
          if(j.code==='join_expired' || j.error==='join_expired'){
            showSessionSheet('expired', j.room_code||j.roomCode||code);
            throw {handled:true};
          }
          throw new Error('state '+r.status);
        });
      }
      if(!r.ok) throw new Error('state '+r.status);
      return r.json();
    }).then(function(j){ stateCache._fetchError=false; applyState(j); updateWsBanner(false); }).catch(function(err){
      if(err && err.handled) return;
      stateCache = stateCache || {};
      stateCache._fetchError=true;
      var card=document.getElementById('live-card');
      card.textContent=''; var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='10px'; wrap.style.placeItems='center'; wrap.style.padding='16px'; wrap.style.textAlign='center';
      var pp=document.createElement('p'); pp.style.color='var(--muted)'; pp.textContent='Could not load event. Check the link and try again.';
      var btn=document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Retry'; btn.style.minHeight='46px'; btn.addEventListener('click', function(){ fetchState(); });
      wrap.appendChild(pp); wrap.appendChild(btn); card.appendChild(wrap);
      updateWsBanner(true);
    });
    fetch('/api/events/'+encodeURIComponent(code)+'/presentations',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){ renderSlides(Array.isArray(j)?j:[]); if(stateCache) updateTabBadges(Object.assign({}, stateCache, {presentations:j})); }).catch(function(){});
    return p;
  }

  function connectStream(force){
    if(!code || typeof WebSocket==='undefined') return;
    if(ws && !force) return;
    if(wsTimer){ clearTimeout(wsTimer); wsTimer=null; }
    if(ws){ try{ ws.close(); }catch(e){} ws=null; }
    try{ ws=new WebSocket(wsUrl()); }catch(e){ return; }
    ws.onopen=function(){ wsBackoff=1000; updateWsBanner(false); sendIdentity(); if(!sessionExpired && !spectatorMode) flushQueue(); };
    ws.onmessage=function(ev){ try{ var m=JSON.parse(ev.data); handleWsMessage(m); }catch(err){} };
    ws.onclose=function(){
      ws=null;
      if(!code) return;
      if(sessionExpired) return;
      updateWsBanner(true);
      wsTimer=setTimeout(function(){ wsBackoff=Math.min(wsBackoff*2, 10000); connectStream(true); }, wsBackoff);
    };
    ws.onerror=function(){ try{ ws.close(); }catch(e){} };
  }

  var wsRetry=document.getElementById('ws-retry');
  if(wsRetry) wsRetry.addEventListener('click', function(){ updateWsBanner(false); fetchState().then(function(){ connectStream(true); }); });

  if(!code){
    renderEvent(null);
    document.getElementById('live-card').textContent='No event code in URL. Open /e/YOURCODE';
  } else {
    document.getElementById('event-code').textContent=code;
    fetchState().then(function(){ connectStream(true); }, function(){ connectStream(true); });
    // set live badge code
    // open SSE only after the first state fetch so the participant cookie is
    // set before the stream binds to an identity
    fetchState().then(connectStream, connectStream);
    fetchParticipants();
  }
  // handle online/offline
  window.addEventListener('online', function(){ if(!sessionExpired) { updateWsBanner(false); fetchState().then(function(){ connectStream(true); }); } });
  window.addEventListener('offline', function(){ updateWsBanner(true); });
})();
