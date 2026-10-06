/* admin.js — vanilla admin panel */
(function(){
  function toast(msg, kind){
    kind=kind||'ok';
    var root=document.getElementById('toast-root');
    var t=document.createElement('div'); t.className='toast '+kind;
    var icon=document.createElement('span'); icon.className='toast-icon';
    icon.innerHTML = kind==='ok' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v5"/><path d="M12 16h.01"/></svg>';
    var txt=document.createElement('span'); txt.textContent=msg;
    t.appendChild(icon); t.appendChild(txt); root.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transform='translateY(8px)'; t.style.transition='all .3s'; }, 2400);
    setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2800);
  }
  function initUmamiTracking(){
    fetch('/api/settings/analytics',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      if(j && j.tracking_enabled && j.umami_script_url && j.umami_website_id){
        var s=document.createElement('script'); s.async=true; s.defer=true; s.src=j.umami_script_url; s.setAttribute('data-website-id', j.umami_website_id); document.head.appendChild(s);
      }
    }).catch(function(){});
  }
  initUmamiTracking();

  function api(path, opts){
    opts=opts||{}; opts.credentials='same-origin';
    opts.headers = opts.headers || {};
    if(opts.body && !(opts.body instanceof FormData) && !opts.headers['Content-Type']) opts.headers['Content-Type']='application/json';
    return fetch(path, opts).then(function(r){
      if(r.status===401) throw Object.assign(new Error('unauthorized'),{code:401, r:r});
      if(r.status===204) return {};
      var ct=r.headers.get('content-type')||'';
      if(ct.indexOf('application/json')!==-1) return r.json().then(function(j){ if(!r.ok) throw Object.assign(new Error(j.error||'error'),{status:r.status,j:j}); return j; });
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r;
    });
  }

  var els={
    gateSetup: document.getElementById('gate-setup'),
    gateLogin: document.getElementById('gate-login'),
    app: document.getElementById('app'),
    btnLogout: document.getElementById('btn-logout'),
    meInfo: document.getElementById('me-info'),
    eventsList: document.getElementById('events-list'),
    createWrap: document.getElementById('create-event-wrap'),
    formCreate: document.getElementById('form-create-event'),
    selectedBar: document.getElementById('selected-bar'),
    selName: document.getElementById('sel-name'),
    selMeta: document.getElementById('sel-meta'),
    btnOidcSetup: document.getElementById('btn-oidc-setup'),
    btnOidcLogin: document.getElementById('btn-oidc-login'),
    btnForgotWrap: document.getElementById('forgot-wrap'),
  };

  var state={ user:null, events:[], selectedId:null };

  function showGate(which){
    els.gateSetup.classList.toggle('hidden', which!=='setup');
    els.gateLogin.classList.toggle('hidden', which!=='login');
    els.app.classList.toggle('hidden', which!=='app');
    els.btnLogout.classList.toggle('hidden', which!=='app');
  }

  // setup & login forms
  document.getElementById('form-setup').addEventListener('submit', function(e){
    e.preventDefault();
    var u=document.getElementById('setup-user').value.trim();
    var p=document.getElementById('setup-pass').value;
    var msg=document.getElementById('setup-msg'); msg.textContent='Creating…';
    api('/api/setup',{method:'POST', body:JSON.stringify({username:u, password:p})}).then(function(){
      msg.textContent='Account created — signing in…';
      return api('/api/auth/login',{method:'POST', body:JSON.stringify({username:u, password:p})});
    }).then(function(){ return boot(); }).catch(function(err){ msg.textContent=err.message||'Setup failed'; toast(msg.textContent,'err'); });
  });
  document.getElementById('form-login').addEventListener('submit', function(e){
    e.preventDefault();
    var u=document.getElementById('login-user').value.trim();
    var p=document.getElementById('login-pass').value;
    var msg=document.getElementById('login-msg'); msg.textContent='';
    api('/api/auth/login',{method:'POST', body:JSON.stringify({username:u, password:p})}).then(function(j){
      toast('Welcome, '+(j.user?j.user.username:u));
      boot();
    }).catch(function(err){
      msg.textContent = (err.j && err.j.error) || err.message || 'Login failed';
      toast(msg.textContent,'err');
    });
  });
  els.btnLogout.addEventListener('click', function(){
    api('/api/auth/logout',{method:'POST'}).then(function(){ boot(); }).catch(function(){ boot(); });
  });

  // OIDC buttons: shown on the setup and login gates when enabled. The local
  // "Forgot password?" link is the opposite: only offered when the user cannot
  // sign in with SSO (OIDC disabled), since resetting a local password is the
  // only way back in then. If the status check fails we show it as a fallback.
  function initOIDC(){
    api('/api/auth/oidc/status').then(function(j){
      var on=!!j.enabled;
      if(els.btnOidcSetup) els.btnOidcSetup.classList.toggle('hidden', !on);
      if(els.btnOidcLogin) els.btnOidcLogin.classList.toggle('hidden', !on);
      if(els.btnForgotWrap) els.btnForgotWrap.classList.toggle('hidden', on);
    }).catch(function(){
      if(els.btnForgotWrap) els.btnForgotWrap.classList.remove('hidden');
    });
  }

  function oidcErrorNotice(){
    var err=new URLSearchParams(window.location.search).get('oidc_error');
    if(err==='unknown_user'){
      var msg=document.getElementById('login-msg');
      if(msg) msg.textContent='That OIDC account is not allowed to sign in. Ask an admin for access or use a local account.';
    }
  }

  function boot(){
    initOIDC(); oidcErrorNotice();
    api('/api/setup/status').then(function(j){
      if(j.needs_setup){ showGate('setup'); return Promise.reject('setup'); }
      return api('/api/auth/me');
    }).then(function(j){
      state.user=j.user; if(els.meInfo) els.meInfo.textContent=j.user.username+' · '+j.user.role;
      showGate('app'); return loadEvents();
    }).then(function(){
      loadBranding(); loadAnalytics(); loadOtel(); loadEmail(); loadWebhooks(); loadFilter(); loadRecapSettings();
    }).catch(function(err){
      if(err==='setup') return;
      if(err && err.code===401){ showGate('login'); return; }
      // if fetch failed, show login
      if(err && err.message==='unauthorized') showGate('login');
    });
  }

  // nav tabs
  var navBtns=document.querySelectorAll('.admin-nav button');
  var panels=document.querySelectorAll('[data-panel]');
  function setView(name){
    navBtns.forEach(function(b){ var on=b.getAttribute('data-view')===name; b.classList.toggle('active', on); if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    panels.forEach(function(p){ p.classList.toggle('hidden', p.getAttribute('data-panel')!==name); });
    if(name==='questions' && state.selectedId) loadQuestions(state.selectedId);
    if(name==='qa' && state.selectedId){ loadQA(state.selectedId); loadModeration(state.selectedId); }
    if(name==='slides' && state.selectedId) loadSlides(state.selectedId);
    if(name==='results' && state.selectedId) loadResults(state.selectedId);
    if(name==='leaderboard' && state.selectedId) loadLeaderboard(state.selectedId);
    if(name==='stats') loadStats();
    if(name!=='stats') closeStatsStream();
    if(name==='leaderboard') startLeaderboardPolling();
    else stopLeaderboardPolling();
  }
  navBtns.forEach(function(b){ b.addEventListener('click', function(){ setView(b.getAttribute('data-view')); }); });

  // events
  document.getElementById('btn-new-event').addEventListener('click', function(){ els.createWrap.classList.remove('hidden'); });
  document.getElementById('btn-cancel-create').addEventListener('click', function(){ els.createWrap.classList.add('hidden'); });
  els.formCreate.addEventListener('submit', function(e){
    e.preventDefault();
    var payload={
      name: document.getElementById('ce-name').value.trim(),
      code: document.getElementById('ce-code').value.trim(),
      description: document.getElementById('ce-desc').value.trim(),
      event_date: document.getElementById('ce-date').value.trim()
    };
    if(!payload.name) return;
    api('/api/admin/events',{method:'POST', body:JSON.stringify(payload)}).then(function(){
      toast('Event created'); els.formCreate.reset(); els.createWrap.classList.add('hidden'); loadEvents();
    }).catch(function(err){ toast(err.message||'Create failed','err'); });
  });

  function loadEvents(){
    return api('/api/admin/events').then(function(list){
      state.events=Array.isArray(list)?list:[];
      renderEvents(state.events);
      if(state.events.length && !state.selectedId) selectEvent(state.events[0].id);
      else if(state.selectedId) updateSelectedBar();
    }).catch(function(err){ if(err.code!==401) toast('Could not load events','err'); });
  }
  function renderEvents(list){
    var root=els.eventsList; root.textContent='';
    if(!list.length){
      var empty=document.createElement('div'); empty.className='glass card-pad admin-empty'; empty.textContent='No events yet — create your first one.';
      root.appendChild(empty); return;
    }
    list.forEach(function(ev){
      var card=document.createElement('div'); card.className='glass event-card';
      if(state.selectedId===ev.id) card.style.borderColor='rgba(124,107,255,.45)';
      var top=document.createElement('div'); top.style.display='flex'; top.style.justifyContent='space-between'; top.style.gap='10px'; top.style.alignItems='flex-start';
      var left=document.createElement('div');
      var h=document.createElement('h3'); h.textContent=ev.name; left.appendChild(h);
      var meta=document.createElement('div'); meta.style.color='var(--muted)'; meta.style.fontSize='.84rem';
      meta.textContent = (ev.code||'') + (ev.room_code?' · room '+ev.room_code:'') + (ev.event_date?' · '+ev.event_date:'') + ' · '+ev.status + (ev.feedback_open?' · feedback open':'') + ' · '+ (ev.question_count||0)+' questions' + (ev.pending_qa_count?' · '+ev.pending_qa_count+' pending':'');
      left.appendChild(meta);
      var badge=document.createElement('span'); badge.className='badge '+(ev.status==='open'?'open':'closed'); badge.textContent=ev.status;
      top.appendChild(left); top.appendChild(badge);
      var actions=document.createElement('div'); actions.className='inline';
      var btnSel=document.createElement('button'); btnSel.className='btn btn-primary btn-small'; btnSel.type='button'; btnSel.textContent= state.selectedId===ev.id ? 'Selected' : 'Manage';
      btnSel.addEventListener('click', function(){ selectEvent(ev.id); setView('questions'); });
      var aLive=document.createElement('a'); aLive.className='btn btn-ghost btn-small'; aLive.href='/live/'+encodeURIComponent(ev.code); aLive.target='_blank'; aLive.textContent='Live';
      var aAud=document.createElement('a'); aAud.className='btn btn-ghost btn-small'; aAud.href='/e/'+encodeURIComponent(ev.code); aAud.target='_blank'; aAud.textContent='Audience';
      var aJoin=document.createElement('a'); aJoin.className='btn btn-ghost btn-small'; aJoin.href='/join'+(ev.room_code?'?room='+encodeURIComponent(ev.room_code):''); aJoin.target='_blank'; aJoin.textContent='Join';
      var btnClone=document.createElement('button'); btnClone.className='btn btn-ghost btn-small'; btnClone.type='button'; btnClone.textContent='Clone';
      btnClone.addEventListener('click', function(){
        var defName=(ev.name||'')+' (copy)';
        var newName=window.prompt('Clone name (leave blank to auto-generate)', defName);
        if(newName===null) return;
        newName=newName.trim();
        var payload=newName?{name:newName}:{};
        btnClone.disabled=true;
        api('/api/admin/events/'+ev.id+'/clone',{method:'POST', body:JSON.stringify(payload)}).then(function(newEv){
          toast('Event cloned');
          var nid=newEv && (newEv.id || (newEv.event && newEv.event.id));
          return loadEvents().then(function(){
            if(nid) selectEvent(nid);
            else if(newEv && newEv.code){
              var found=state.events.find(function(e){return e.code===newEv.code});
              if(found) selectEvent(found.id);
            }
          });
        }).catch(function(err){ toast((err.j && err.j.error) || err.message || 'Clone failed','err'); }).then(function(){ btnClone.disabled=false; });
      });
      actions.appendChild(btnSel); actions.appendChild(aLive); actions.appendChild(aAud); actions.appendChild(aJoin); actions.appendChild(btnClone);
      card.appendChild(top); card.appendChild(actions); root.appendChild(card);
    });
  }
  function selectEvent(id){
    state.selectedId=id;
    updateSelectedBar();
    renderEvents(state.events);
    // load all panels data
    loadQuestions(id); loadQA(id); loadSlides(id); loadResults(id);
    // fill settings form
    var ev=state.events.find(function(e){return e.id===id});
    if(ev){
      document.getElementById('es-name').value=ev.name||'';
      document.getElementById('es-desc').value=ev.description||'';
      document.getElementById('es-date').value=ev.event_date||'';
      document.getElementById('es-status').value=ev.status||'open';
      document.getElementById('es-feedback').checked=!!ev.feedback_open;
      document.getElementById('es-slowmode').value=ev.qa_slow_mode_s||0;
      document.getElementById('es-publish').checked=!!ev.results_published;
      loadRecapSubs(id); resetRecapPreview();
    }
  }
  function updateSelectedBar(){
    var ev=state.events.find(function(e){return e.id===state.selectedId});
    if(!ev){ els.selectedBar.classList.add('hidden'); return; }
    els.selectedBar.classList.remove('hidden');
    els.selName.textContent=ev.name;
    els.selMeta.textContent=ev.code+(ev.room_code?' · room '+ev.room_code:'')+' · '+ev.status+' · '+(ev.event_date||'no date');
    syncPodiumButton(ev);
    document.getElementById('sel-live').href='/live/'+encodeURIComponent(ev.code);
    document.getElementById('sel-aud').href='/e/'+encodeURIComponent(ev.code);
    document.getElementById('sel-join').href='/join'+(ev.room_code?'?room='+encodeURIComponent(ev.room_code):'');
    document.getElementById('link-live').href='/live/'+encodeURIComponent(ev.code);
    document.getElementById('link-audience').href='/e/'+encodeURIComponent(ev.code);
  }

  document.getElementById('btn-delete-event').addEventListener('click', function(){
    if(!state.selectedId) return;
    if(!confirm('Delete this event and all its data?')) return;
    api('/api/admin/events/'+state.selectedId,{method:'DELETE'}).then(function(){ toast('Event deleted'); state.selectedId=null; els.selectedBar.classList.add('hidden'); loadEvents(); }).catch(function(err){ toast(err.message||'Delete failed','err'); });
  });
  document.getElementById('btn-export').addEventListener('click', function(){
    if(!state.selectedId) return;
    window.location.href='/api/admin/events/'+state.selectedId+'/export.csv';
  });

  // Podium screen toggle (lives on the selected-event bar).
  document.getElementById('btn-podium').addEventListener('click', function(){
    if(!state.selectedId) return;
    var show=this.getAttribute('data-show')!=='0';
    api('/api/admin/events/'+state.selectedId+'/podium',{method:'POST', body:JSON.stringify({show:show})}).then(function(ev){
      toast(show?'Podium shown':'Podium hidden');
      var cur=state.events.find(function(e){return e.id===state.selectedId});
      if(cur && ev) cur.show_podium=!!ev.show_podium;
      updateSelectedBar();
    }).catch(function(err){ toast(err.message||'Podium update failed','err'); });
  });
  function syncPodiumButton(ev){
    var b=document.getElementById('btn-podium'); if(!b) return;
    b.textContent=(ev&&ev.show_podium)?'Hide podium':'Show podium';
    b.setAttribute('data-show',(ev&&ev.show_podium)?'0':'1');
  }
  // Live countdowns for timed questions in the admin list.
  setInterval(function(){
    var nodes=document.querySelectorAll('[data-countdown]');
    for(var i=0;i<nodes.length;i++){
      var dl=parseInt(nodes[i].getAttribute('data-countdown'),10);
      if(isNaN(dl)) continue;
      var left=Math.max(0,Math.ceil((dl-Date.now())/1000));
      nodes[i].textContent='⏱ '+left+'s';
    }
  },250);

  // event settings
  document.getElementById('form-event-settings').addEventListener('submit', function(e){
    e.preventDefault();
    if(!state.selectedId) return toast('Select an event first','err');
    var payload={
      name: document.getElementById('es-name').value.trim(),
      description: document.getElementById('es-desc').value.trim(),
      event_date: document.getElementById('es-date').value.trim(),
      status: document.getElementById('es-status').value,
      feedback_open: document.getElementById('es-feedback').checked,
      qa_slow_mode_s: Math.max(0, Math.min(3600, parseInt(document.getElementById('es-slowmode').value,10)||0)),
      results_published: document.getElementById('es-publish').checked
    };
    api('/api/admin/events/'+state.selectedId,{method:'PATCH', body:JSON.stringify(payload)}).then(function(){ toast('Event saved'); loadEvents(); }).catch(function(err){ toast(err.message||'Save failed','err'); });
  });

  // questions
  var qKind=document.getElementById('aq-kind');
  var qOptsWrap=document.getElementById('aq-options-wrap');
  var qOptionKinds=['poll','multi','ranking'];
  var aqCorrect=document.getElementById('aq-correct');
  var aqPoints=document.getElementById('aq-points');
  var aqScoringWrap=document.getElementById('aq-scoring-wrap');
  var aqDuration=document.getElementById('aq-duration');
  var aqAutoReveal=document.getElementById('aq-auto-reveal');
  var aqTimingWrap=document.getElementById('aq-timing-wrap');
  function syncScoringControls(){
    var kind=qKind.value;
    var scorable=kind==='poll'||kind==='yesno';
    if(aqScoringWrap) aqScoringWrap.style.display=scorable?'':'none';
    if(!scorable) return;
    var prev=aqCorrect.value;
    aqCorrect.textContent='';
    var none=document.createElement('option'); none.value=''; none.textContent='— Not scored —'; aqCorrect.appendChild(none);
    if(kind==='poll'){
      var raw=(document.getElementById('aq-options').value||'').split(',').map(function(s){return s.trim()}).filter(Boolean);
      if(!raw.length) raw=['Option A','Option B'];
      raw.forEach(function(label, idx){
        var o=document.createElement('option'); o.value=String(idx); o.textContent=(idx+1)+'. '+label; aqCorrect.appendChild(o);
      });
    } else if(kind==='yesno'){
      var oYes=document.createElement('option'); oYes.value='0'; oYes.textContent='Yes (correct)'; aqCorrect.appendChild(oYes);
      var oNo=document.createElement('option'); oNo.value='1'; oNo.textContent='No (correct)'; aqCorrect.appendChild(oNo);
    }
    if(prev!==null) aqCorrect.value=prev;
  }
  function syncTimingWrap(){
    if(!aqTimingWrap) return;
    var modeEl=document.getElementById('aq-mode');
    var fbEl=document.getElementById('aq-feedback');
    var isLive = !modeEl || modeEl.value==='live';
    var isFeedback = fbEl && fbEl.checked;
    aqTimingWrap.style.display = (isLive && !isFeedback) ? '' : 'none';
  }
  function syncQuestionKind(){ qOptsWrap.style.display = qOptionKinds.indexOf(qKind.value)>=0 ? '' : 'none'; syncScoringControls(); syncTimingWrap(); }
  qKind.addEventListener('change', syncQuestionKind);
  var aqOptsInput=document.getElementById('aq-options');
  if(aqOptsInput) aqOptsInput.addEventListener('input', syncScoringControls);
  var aqModeEl=document.getElementById('aq-mode');
  if(aqModeEl) aqModeEl.addEventListener('change', syncTimingWrap);
  var aqFbEl=document.getElementById('aq-feedback');
  if(aqFbEl) aqFbEl.addEventListener('change', syncTimingWrap);
  syncQuestionKind();
  syncTimingWrap();

  // question media (upload or external url)
  var qMedia={url:'',type:''};
  var qMediaFile=document.getElementById('aq-media-file');
  var qMediaUrl=document.getElementById('aq-media-url');
  var qMediaPreview=document.getElementById('aq-media-preview');
  var qMediaClear=document.getElementById('aq-media-clear');
  function mediaTypeFromURL(u){ return /\.(mp4|webm|mov)(\?.*)?$/i.test(u)?'video':'image'; }
  function renderQuestionMediaPreview(){
    qMediaPreview.textContent='';
    if(!qMedia.url){ qMediaPreview.classList.add('hidden'); qMediaClear.classList.add('hidden'); return; }
    var el;
    if(qMedia.type==='video'){ el=document.createElement('video'); el.controls=true; el.muted=true; el.src=qMedia.url; el.style.maxHeight='160px'; el.style.borderRadius='10px'; }
    else { el=document.createElement('img'); el.src=qMedia.url; el.alt='media preview'; el.style.maxHeight='160px'; el.style.borderRadius='10px'; }
    qMediaPreview.appendChild(el);
    qMediaPreview.classList.remove('hidden');
    qMediaClear.classList.remove('hidden');
  }
  function resetQuestionMedia(){ qMedia={url:'',type:''}; qMediaFile.value=''; qMediaUrl.value=''; renderQuestionMediaPreview(); }
  qMediaClear.addEventListener('click', resetQuestionMedia);
  qMediaUrl.addEventListener('change', function(){
    var u=qMediaUrl.value.trim();
    if(!u){ qMedia={url:'',type:''}; renderQuestionMediaPreview(); return; }
    qMedia={url:u,type:mediaTypeFromURL(u)}; qMediaFile.value='';
    renderQuestionMediaPreview();
  });
  qMediaFile.addEventListener('change', function(){
    var f=qMediaFile.files[0]; if(!f) return;
    if(!state.selectedId){ toast('Select an event first','err'); qMediaFile.value=''; return; }
    var fd=new FormData(); fd.append('file', f);
    toast('Uploading '+f.name+'…');
    api('/api/admin/events/'+state.selectedId+'/questions/media',{method:'POST', body:fd}).then(function(data){
      qMedia={url:data.url,type:data.media_type};
      qMediaUrl.value='';
      renderQuestionMediaPreview();
      toast('Media uploaded');
    }).catch(function(err){ toast(err.message||'Upload failed','err'); qMediaFile.value=''; });
  });

  document.getElementById('form-add-question').addEventListener('submit', function(e){
    e.preventDefault();
    if(!state.selectedId) return toast('Select an event first','err');
    var kind=document.getElementById('aq-kind').value;
    var mode=document.getElementById('aq-mode').value;
    var prompt=document.getElementById('aq-prompt').value.trim();
    var optsRaw=document.getElementById('aq-options').value.trim();
    var opts = qOptionKinds.indexOf(kind)>=0 ? optsRaw.split(',').map(function(s){return s.trim()}).filter(Boolean) : [];
    if(!prompt) return;
    if(qOptionKinds.indexOf(kind)>=0 && opts.length<2) return toast('Add at least 2 options','err');
    var payload={ kind:kind, mode:mode, prompt:prompt, options:opts, is_feedback: document.getElementById('aq-feedback').checked, show_results: document.getElementById('aq-show').checked, position: 0, media_url: qMedia.url, media_type: qMedia.type };
    var durVal = aqDuration ? parseInt(aqDuration.value,10) : 0;
    if(isNaN(durVal)) durVal=0;
    var isLiveMode = mode==='live' && !payload.is_feedback;
    if(isLiveMode){
      payload.duration_sec = durVal;
      payload.auto_close = durVal>0 ? 1 : 0;
      payload.auto_reveal = aqAutoReveal && aqAutoReveal.checked ? 1 : 0;
    } else {
      payload.duration_sec = 0;
      payload.auto_close = 0;
      payload.auto_reveal = 0;
    }
    var tl=parseInt(document.getElementById('aq-timelimit').value,10);
    payload.time_limit_s = (!isNaN(tl)&&tl>0)? tl : 0;
    if(kind==='poll'||kind==='yesno'){
      var cv=aqCorrect.value;
      if(cv==='') payload.correct_index=null; else payload.correct_index=parseInt(cv,10);
      var pb=parseInt(aqPoints.value,10); if(!isNaN(pb)&&pb>0) payload.points_base=pb; else payload.points_base=100;
    }
    api('/api/admin/events/'+state.selectedId+'/questions',{method:'POST', body:JSON.stringify(payload)}).then(function(){ toast('Question added'); document.getElementById('form-add-question').reset(); document.getElementById('aq-show').checked=true; document.getElementById('aq-timelimit').value='0'; aqPoints.value='100'; if(aqDuration) aqDuration.value='0'; if(aqAutoReveal) aqAutoReveal.checked=false; resetQuestionMedia(); syncScoringControls(); syncTimingWrap(); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Add failed','err'); });
  });

  // --- queue helpers ---
  function reorderQuestions(orderedIds){
    if(!state.selectedId) return Promise.reject(new Error('no event'));
    return api('/api/admin/events/'+state.selectedId+'/questions/reorder',{method:'POST', body:JSON.stringify({order:orderedIds})});
  }
  function handleNextQuestion(){
    if(!state.selectedId) return toast('Select an event first','err');
    var btn=document.getElementById('btn-next-question');
    if(btn) btn.disabled=true;
    api('/api/admin/events/'+state.selectedId+'/questions/next',{method:'POST', body:JSON.stringify({})}).then(function(j){
      if(j && j.empty){ toast('Queue empty — no draft questions'); }
      else if(j && j.skipped){ toast('Skipped live question'); }
      else if(j && j.ok && j.empty){ toast('Queue empty'); }
      else { toast('Next question activated'); }
      loadQuestions(state.selectedId);
    }).catch(function(err){
      var msg=(err.j && err.j.error) || err.message || 'Next failed';
      if(err.j && err.j.empty) msg='Queue empty';
      toast(msg,'err');
    }).then(function(){ if(btn) btn.disabled=false; });
  }
  var _queueDragId=null;
  function renderQueue(list){
    var strip=document.getElementById('queue-strip');
    var qList=document.getElementById('queue-list');
    var qCount=document.getElementById('queue-count');
    var qEmpty=document.getElementById('queue-empty');
    if(!qList || !qCount) return;
    var drafts=(Array.isArray(list)?list:[]).filter(function(q){return q.status==='draft'}).sort(function(a,b){return (a.position||0)-(b.position||0)});
    qCount.textContent=drafts.length+' queued';
    qList.textContent='';
    if(strip) strip.style.display='';
    if(!drafts.length){
      if(qEmpty) qEmpty.style.display='';
      return;
    }
    if(qEmpty) qEmpty.style.display='none';
    drafts.forEach(function(q, idx){
      var item=document.createElement('div'); item.className='glass card-pad'; item.style.display='flex'; item.style.alignItems='center'; item.style.gap='10px'; item.style.padding='10px 12px'; item.draggable=true; item.dataset.qid=String(q.id);
      item.addEventListener('dragstart', function(e){ _queueDragId=q.id; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain', String(q.id)); item.style.opacity='0.5'; });
      item.addEventListener('dragend', function(){ item.style.opacity=''; _queueDragId=null; });
      item.addEventListener('dragover', function(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; item.style.outline='1px dashed rgba(124,107,255,.6)'; });
      item.addEventListener('dragleave', function(){ item.style.outline=''; });
      item.addEventListener('drop', function(e){
        e.preventDefault(); item.style.outline='';
        var draggedId=_queueDragId ? _queueDragId : parseInt(e.dataTransfer.getData('text/plain'),10);
        if(!draggedId || draggedId===q.id) return;
        var ordered=drafts.map(function(d){return d.id});
        var fromIdx=ordered.indexOf(draggedId);
        var toIdx=ordered.indexOf(q.id);
        if(fromIdx<0 || toIdx<0) return;
        ordered.splice(fromIdx,1);
        ordered.splice(toIdx,0,draggedId);
        // build full order: drafts reordered + non-drafts appended in existing order
        var nonDrafts=(Array.isArray(list)?list:[]).filter(function(x){return x.status!=='draft'}).map(function(x){return x.id});
        // we need to send order for all questions in the desired final position order.
        // Simplest: send reorder for drafts only in their new order interleaved by position? But endpoint expects all ids. We'll map to full list order: place reordered drafts at top sorted positions then rest.
        // Build full ordered list following original list sorted by position, but with drafts reordered.
        var fullSorted=(Array.isArray(list)?list:[]).slice().sort(function(a,b){return (a.position||0)-(b.position||0)});
        var draftSet={}; drafts.forEach(function(d){draftSet[d.id]=true});
        var remainingFull=fullSorted.filter(function(x){return !draftSet[x.id]}).map(function(x){return x.id});
        // drafts new order + remaining
        var newOrder=ordered.concat(remainingFull);
        reorderQuestions(newOrder).then(function(){ toast('Queue reordered'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Reorder failed','err'); });
      });
      var handle=document.createElement('span'); handle.textContent='≡'; handle.title='Drag to reorder'; handle.style.cursor='grab'; handle.style.color='var(--muted)'; handle.style.fontSize='1.1rem'; handle.style.padding='0 4px';
      var num=document.createElement('span'); num.className='pill'; num.textContent='#'+(idx+1); num.style.minWidth='36px'; num.style.textAlign='center';
      var promptEl=document.createElement('span'); promptEl.style.flex='1'; promptEl.style.fontWeight='600'; promptEl.style.whiteSpace='nowrap'; promptEl.style.overflow='hidden'; promptEl.style.textOverflow='ellipsis'; promptEl.textContent=q.prompt;
      var kindEl=document.createElement('span'); kindEl.style.color='var(--muted)'; kindEl.style.fontSize='.78rem'; kindEl.textContent=q.kind;
      var timerChip=null;
      if(q.duration_sec && q.duration_sec>0){
        timerChip=document.createElement('span'); timerChip.className='pill'; timerChip.style.fontSize='.78rem';
        timerChip.textContent='⏱ '+q.duration_sec+'s'+(q.auto_reveal?' · auto':'');
      }
      item.appendChild(handle); item.appendChild(num); item.appendChild(promptEl); item.appendChild(kindEl); if(timerChip) item.appendChild(timerChip);
      qList.appendChild(item);
    });
  }

  function loadQuestions(id){
    api('/api/admin/events/'+id+'/questions').then(function(list){
      var arr=Array.isArray(list)?list:[];
      renderQuestions(arr);
      renderQueue(arr);
      document.getElementById('q-count').textContent=arr.length+' total';
    }).catch(function(){ document.getElementById('questions-list').textContent='Could not load questions.'; });
  }
  function renderQuestions(list){
    var root=document.getElementById('questions-list'); root.textContent='';
    if(!list.length){ var e=document.createElement('div'); e.className='glass card-pad'; e.style.color='var(--muted)'; e.textContent='No questions yet.'; root.appendChild(e); return; }
    list.forEach(function(q, idx){
      var row=document.createElement('div'); row.className='q-row '+q.status;
      var top=document.createElement('div'); top.style.display='flex'; top.style.justifyContent='space-between'; top.style.gap='10px'; top.style.alignItems='flex-start';
      var left=document.createElement('div'); left.style.flex='1';
      var prompt=document.createElement('div'); prompt.style.fontWeight='700'; prompt.style.letterSpacing='-.02em'; prompt.textContent=q.prompt;
      var meta=document.createElement('div'); meta.style.color='var(--muted)'; meta.style.fontSize='.82rem'; meta.style.marginTop='4px';
      meta.textContent = q.kind+' · '+q.mode + (q.is_feedback?' · feedback':'') + ' · '+q.status + (q.time_limit_s>0?' · ⏱ '+q.time_limit_s+'s':'') + (q.show_results?' · results visible':' · results hidden') + (q.options && q.options.length ? ' · '+q.options.join(', '):'') + (q.respondents? ' · '+q.respondents+' respondents':'') + (q.media_url? ' · '+q.media_type:'');
      left.appendChild(prompt); left.appendChild(meta);
      // correct badge
      var correctLabel=null;
      if((q.kind==='poll'||q.kind==='yesno') && q.correct_index!==null && q.correct_index!==undefined){
        if(q.kind==='poll' && q.options && q.options[q.correct_index]!==undefined) correctLabel=q.options[q.correct_index];
        else if(q.kind==='yesno') correctLabel=q.correct_index===0?'yes':'no';
        else correctLabel=String(q.correct_index);
        var cpill=document.createElement('span'); cpill.className='pill'; cpill.style.marginTop='6px'; cpill.style.display='inline-flex'; cpill.style.alignItems='center'; cpill.style.gap='4px';
        cpill.innerHTML='<span style="color:#22C55E">✓</span> Correct: '+correctLabel+' · '+(q.points_base||100)+' pts';
        left.appendChild(cpill);
      } else if(q.kind==='poll'||q.kind==='yesno'){
        var npill=document.createElement('span'); npill.className='pill'; npill.style.marginTop='6px'; npill.style.display='inline-block'; npill.style.opacity='.7'; npill.textContent='Not scored · '+(q.points_base||100)+' pts';
        left.appendChild(npill);
      }
      // timer chip
      if(q.duration_sec && q.duration_sec>0 && !q.is_feedback){
        var tChip=document.createElement('span'); tChip.className='pill'; tChip.style.marginTop='6px'; tChip.style.display='inline-flex'; tChip.style.alignItems='center'; tChip.style.gap='4px'; tChip.style.marginLeft='6px';
        var tLabel=document.createElement('span'); tLabel.textContent='⏱ '+q.duration_sec+'s';
        tChip.appendChild(tLabel);
        if(q.auto_reveal){ var ar=document.createElement('span'); ar.style.color='#22C55E'; ar.textContent=' · auto-reveal'; tChip.appendChild(ar); }
        else { var ar2=document.createElement('span'); ar2.style.opacity='.6'; ar2.textContent=' · manual'; tChip.appendChild(ar2); }
        left.appendChild(tChip);
      } else if(q.duration_sec===0 && !q.is_feedback){
        var tChip0=document.createElement('span'); tChip0.className='pill'; tChip0.style.marginTop='6px'; tChip0.style.display='inline-block'; tChip0.style.opacity='.55'; tChip0.style.marginLeft='6px'; tChip0.textContent='⏱ untimed';
        left.appendChild(tChip0);
      }
      if(q.status==='live' && q.deadline_at){
        var cd=document.createElement('span'); cd.className='pill'; cd.style.marginTop='6px'; cd.style.display='inline-block'; cd.setAttribute('data-countdown',String(q.deadline_at)); cd.textContent='⏱ …';
        left.appendChild(cd);
      }
      var badge=document.createElement('span'); badge.className='badge '+(q.status==='live'?'open':''); badge.textContent=q.status;
      top.appendChild(left); top.appendChild(badge);
      var actions=document.createElement('div'); actions.className='inline'; actions.style.marginTop='6px';
      if(q.status==='draft'||q.status==='closed'){
        var bAct=document.createElement('button'); bAct.className='btn btn-primary btn-small'; bAct.type='button'; bAct.textContent='Activate';
        bAct.addEventListener('click', function(){
          var overrideBody=null;
          // allow optional duration override via prompt (simple, keeps UI uncluttered)
          if(!q.is_feedback){
            var defVal = (q.duration_sec!=null? q.duration_sec:0);
            var raw = window.prompt('Duration in seconds — 0=untimed, 5–180 (leave as '+defVal+' to keep saved value)', String(defVal));
            if(raw===null) return;
            var pv=parseInt(raw,10);
            if(!isNaN(pv) && pv!==defVal){
              if(pv!==0 && (pv<5 || pv>180)){ toast('Duration must be 0 or 5–180','err'); return; }
              overrideBody=JSON.stringify({duration_sec: pv});
            }
          }
          var opts={method:'POST'};
          if(overrideBody) opts.body=overrideBody;
          api('/api/admin/events/'+state.selectedId+'/questions/'+q.id+'/activate',opts).then(function(){ toast('Activated'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Activate failed','err'); });
        });
        actions.appendChild(bAct);
      }
      if(q.status==='live'||q.status==='locked'){
        var bReveal=document.createElement('button'); bReveal.className='btn btn-primary btn-small'; bReveal.type='button'; bReveal.textContent='Reveal';
        bReveal.addEventListener('click', function(){ api('/api/admin/events/'+state.selectedId+'/questions/'+q.id+'/reveal',{method:'POST'}).then(function(){ toast('Revealed'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Reveal failed','err'); }); });
        actions.appendChild(bReveal);
      }
      if(q.status==='live'||q.status==='locked'||q.status==='revealed'){
        var bClose=document.createElement('button'); bClose.className='btn btn-ghost btn-small'; bClose.type='button'; bClose.textContent='Close';
        bClose.addEventListener('click', function(){ api('/api/admin/events/'+state.selectedId+'/questions/'+q.id+'/close',{method:'POST'}).then(function(){ toast('Closed'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Close failed','err'); }); });
        actions.appendChild(bClose);
      }
      var bDel=document.createElement('button'); bDel.className='btn btn-ghost btn-small'; bDel.type='button'; bDel.textContent='Delete'; bDel.style.color='#F87171';
      bDel.addEventListener('click', function(){ if(!confirm('Delete question?')) return; api('/api/admin/events/'+state.selectedId+'/questions/'+q.id,{method:'DELETE'}).then(function(){ toast('Deleted'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Delete failed','err'); }); });
      var bUp=document.createElement('button'); bUp.className='btn btn-ghost btn-small'; bUp.type='button'; bUp.textContent='↑'; bUp.title='Move up'; bUp.setAttribute('aria-label','Move up');
      bUp.addEventListener('click', function(){ moveQuestion(q, -1, list); });
      var bDown=document.createElement('button'); bDown.className='btn btn-ghost btn-small'; bDown.type='button'; bDown.textContent='↓'; bDown.title='Move down'; bDown.setAttribute('aria-label','Move down');
      bDown.addEventListener('click', function(){ moveQuestion(q, 1, list); });
      var bToggle=document.createElement('button'); bToggle.className='btn btn-ghost btn-small'; bToggle.type='button'; bToggle.textContent= q.show_results? 'Hide results':'Show results';
      bToggle.addEventListener('click', function(){ api('/api/admin/events/'+state.selectedId+'/questions/'+q.id,{method:'PATCH', body:JSON.stringify({show_results:!q.show_results})}).then(function(){ loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Update failed','err'); }); });
      actions.appendChild(bToggle); actions.appendChild(bUp); actions.appendChild(bDown); actions.appendChild(bDel);

      // inline edit prompt? small
      var editWrap=document.createElement('div'); editWrap.style.display='flex'; editWrap.style.gap='8px'; editWrap.style.marginTop='8px';
      var inp=document.createElement('input'); inp.className='input'; inp.value=q.prompt; inp.style.flex='1'; inp.setAttribute('aria-label','Edit prompt');
      var bSave=document.createElement('button'); bSave.className='btn btn-ghost btn-small'; bSave.type='button'; bSave.textContent='Save';
      bSave.addEventListener('click', function(){ api('/api/admin/events/'+state.selectedId+'/questions/'+q.id,{method:'PATCH', body:JSON.stringify({prompt:inp.value.trim()})}).then(function(){ toast('Saved'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Save failed','err'); }); });
      editWrap.appendChild(inp); editWrap.appendChild(bSave);
      var tlInp=document.createElement('input'); tlInp.className='input'; tlInp.type='number'; tlInp.min='0'; tlInp.max='3600'; tlInp.step='5'; tlInp.style.width='110px'; tlInp.value=String(q.time_limit_s||0); tlInp.setAttribute('aria-label','Time limit (seconds)'); tlInp.title='Time limit (seconds)';
      var bTl=document.createElement('button'); bTl.className='btn btn-ghost btn-small'; bTl.type='button'; bTl.textContent='Save timer';
      bTl.addEventListener('click', function(){
        var v=parseInt(tlInp.value,10); if(isNaN(v)||v<0) v=0; if(v>3600) v=3600;
        api('/api/admin/events/'+state.selectedId+'/questions/'+q.id,{method:'PATCH', body:JSON.stringify({time_limit_s:v})}).then(function(){ toast(v>0?('Timer set to '+v+'s'):'Timer removed'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Save failed','err'); });
      });
      editWrap.appendChild(tlInp); editWrap.appendChild(bTl);
      // scoring edit for poll/yesno
      if(q.kind==='poll'||q.kind==='yesno'){
        var scoreWrap=document.createElement('div'); scoreWrap.style.display='flex'; scoreWrap.style.gap='8px'; scoreWrap.style.marginTop='8px'; scoreWrap.style.flexWrap='wrap'; scoreWrap.style.alignItems='center';
        var sel=document.createElement('select'); sel.className='select'; sel.style.minWidth='180px';
        var oNone=document.createElement('option'); oNone.value=''; oNone.textContent='— Not scored —'; sel.appendChild(oNone);
        if(q.kind==='poll' && q.options){
          q.options.forEach(function(opt, idx){ var o=document.createElement('option'); o.value=String(idx); o.textContent=(idx+1)+'. '+opt; sel.appendChild(o); });
        } else if(q.kind==='yesno'){
          var oY=document.createElement('option'); oY.value='0'; oY.textContent='Yes'; sel.appendChild(oY);
          var oN=document.createElement('option'); oN.value='1'; oN.textContent='No'; sel.appendChild(oN);
        }
        if(q.correct_index!==null && q.correct_index!==undefined) sel.value=String(q.correct_index); else sel.value='';
        var ptInput=document.createElement('input'); ptInput.className='input'; ptInput.type='number'; ptInput.min='10'; ptInput.step='10'; ptInput.style.width='110px'; ptInput.value=String(q.points_base||100); ptInput.setAttribute('aria-label','Base points');
        var ptLabel=document.createElement('span'); ptLabel.style.fontSize='.82rem'; ptLabel.style.color='var(--muted)'; ptLabel.textContent='pts';
        var bScore=document.createElement('button'); bScore.className='btn btn-ghost btn-small'; bScore.type='button'; bScore.textContent='Save scoring';
        bScore.addEventListener('click', function(){
          var payload={};
          if(sel.value==='') payload.correct_index=null; else payload.correct_index=parseInt(sel.value,10);
          var pb=parseInt(ptInput.value,10); if(!isNaN(pb)&&pb>0) payload.points_base=pb;
          api('/api/admin/events/'+state.selectedId+'/questions/'+q.id,{method:'PATCH', body:JSON.stringify(payload)}).then(function(){ toast('Scoring saved'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Save failed','err'); });
        });
        scoreWrap.appendChild(sel); scoreWrap.appendChild(ptInput); scoreWrap.appendChild(ptLabel); scoreWrap.appendChild(bScore);
        row._scoreWrap=scoreWrap;
      }
      // timing edit for live non-feedback questions
      if(!q.is_feedback){
        var timingEdit=document.createElement('div'); timingEdit.style.display='flex'; timingEdit.style.gap='8px'; timingEdit.style.marginTop='8px'; timingEdit.style.flexWrap='wrap'; timingEdit.style.alignItems='center';
        var durSel=document.createElement('select'); durSel.className='select'; durSel.style.minWidth='140px'; durSel.setAttribute('aria-label','Duration');
        [['0','Untimed'],['5','5s'],['10','10s'],['15','15s'],['30','30s'],['45','45s'],['60','60s'],['90','90s'],['120','120s'],['180','180s']].forEach(function(p){ var o=document.createElement('option'); o.value=p[0]; o.textContent=p[1]; durSel.appendChild(o); });
        durSel.value=String(q.duration_sec||0);
        var arCheck=document.createElement('label'); arCheck.style.display='inline-flex'; arCheck.style.alignItems='center'; arCheck.style.gap='6px'; arCheck.style.fontSize='.84rem'; arCheck.style.cursor='pointer';
        var arBox=document.createElement('input'); arBox.type='checkbox'; arBox.checked=!!q.auto_reveal; arBox.setAttribute('aria-label','Auto reveal');
        var arText=document.createElement('span'); arText.textContent='Auto-reveal';
        arCheck.appendChild(arBox); arCheck.appendChild(arText);
        var bTiming=document.createElement('button'); bTiming.className='btn btn-ghost btn-small'; bTiming.type='button'; bTiming.textContent='Save timing';
        bTiming.addEventListener('click', function(){
          var dv=parseInt(durSel.value,10); if(isNaN(dv)) dv=0;
          var payload={duration_sec: dv, auto_reveal: arBox.checked?1:0, auto_close: dv>0?1:0};
          api('/api/admin/events/'+state.selectedId+'/questions/'+q.id,{method:'PATCH', body:JSON.stringify(payload)}).then(function(){ toast('Timing saved'); loadQuestions(state.selectedId); }).catch(function(err){ toast(err.message||'Save failed','err'); });
        });
        timingEdit.appendChild(durSel); timingEdit.appendChild(arCheck); timingEdit.appendChild(bTiming);
        row._timingEdit=timingEdit;
      }

      // results mini bars
      var barWrap=document.createElement('div'); barWrap.style.display='grid'; barWrap.style.gap='6px'; barWrap.style.marginTop='8px';
      if(q.kind==='nps' && typeof q.nps==='number'){
        var npsRow=document.createElement('div'); npsRow.style.fontWeight='700'; npsRow.style.fontSize='.9rem'; npsRow.textContent='NPS '+q.nps;
        barWrap.appendChild(npsRow);
      }
      if(q.results && q.results.length){
        var total=q.total||0;
        var qCorrectLabelForBar=null;
        if((q.kind==='poll'||q.kind==='yesno') && q.correct_index!==null && q.correct_index!==undefined && q.show_results){
          if(q.kind==='poll' && q.options) qCorrectLabelForBar=q.options[q.correct_index];
          else if(q.kind==='yesno') qCorrectLabelForBar=q.correct_index===0?'yes':'no';
        }
        q.results.forEach(function(r){
          var isCorrect = qCorrectLabelForBar!==null && r.label===qCorrectLabelForBar;
          var row2=document.createElement('div'); row2.style.display='flex'; row2.style.justifyContent='space-between'; row2.style.fontSize='.84rem'; row2.style.gap='10px';
          var lab=document.createElement('span'); lab.style.fontWeight='600'; lab.textContent=(isCorrect?'✓ ':'')+r.label; if(isCorrect) lab.style.color='#22C55E';
          var cnt=document.createElement('span'); cnt.style.color='var(--muted)';
          if(q.kind==='ranking'){
            cnt.textContent=r.count+' ballots · '+r.score+' pts · avg '+(r.avg_rank||0).toFixed(2);
          }else{
            cnt.textContent=r.count + (total? ' · '+Math.round(r.count/total*100)+'%':'');
          }
          row2.appendChild(lab); row2.appendChild(cnt);
          var track=document.createElement('div'); track.style.height='8px'; track.style.borderRadius='999px'; track.style.background='rgba(255,255,255,.08)'; track.style.overflow='hidden'; if(isCorrect) track.style.outline='1px solid rgba(34,197,94,.6)';
          var pct = 0;
          if(q.kind==='ranking' && q.results.length){
            var maxScore=Math.max.apply(null, q.results.map(function(x){return x.score||0}));
            pct = maxScore>0 ? (r.score||0)/maxScore*100 : 0;
          }else{
            pct = total? r.count/total*100 : 0;
          }
          var fill=document.createElement('div'); fill.style.height='100%'; fill.style.width= pct+'%';
          fill.style.background=isCorrect?'linear-gradient(135deg,#22C55E,#16A34A)':'linear-gradient(135deg,#6366F1,#EC4899)';
          track.appendChild(fill); barWrap.appendChild(row2); barWrap.appendChild(track);
        });
      }

      row.appendChild(top); row.appendChild(actions); row.appendChild(editWrap);
      if(row._scoreWrap) row.appendChild(row._scoreWrap);
      if(row._timingEdit) row.appendChild(row._timingEdit);
      if(barWrap.childNodes.length) row.appendChild(barWrap);
      root.appendChild(row);
    });
  }
  function moveQuestion(q, dir, list){
    var sorted=list.slice().sort(function(a,b){return (a.position||0)-(b.position||0)});
    var idx=sorted.indexOf(q);
    if(idx<0) idx=list.indexOf(q);
    var newIdx=idx+dir;
    if(newIdx<0 || newIdx>=sorted.length) return;
    var ordered=sorted.map(function(x){return x.id});
    var tmp=ordered[idx]; ordered[idx]=ordered[newIdx]; ordered[newIdx]=tmp;
    reorderQuestions(ordered).then(function(){ loadQuestions(state.selectedId); }).catch(function(err){
      // fallback to legacy two-patch if reorder not available
      var other=sorted[newIdx];
      var p1=q.position, p2=other.position;
      if(p1===p2){ p1=idx; p2=newIdx; }
      return Promise.all([
        api('/api/admin/events/'+state.selectedId+'/questions/'+q.id,{method:'PATCH', body:JSON.stringify({position:p2})}),
        api('/api/admin/events/'+state.selectedId+'/questions/'+other.id,{method:'PATCH', body:JSON.stringify({position:p1})})
      ]).then(function(){ loadQuestions(state.selectedId); });
    }).catch(function(err){ toast(err.message||'Move failed','err'); });
  }

  var btnNextQ=document.getElementById('btn-next-question');
  if(btnNextQ) btnNextQ.addEventListener('click', handleNextQuestion);

  // QA
  document.getElementById('btn-refresh-qa').addEventListener('click', function(){ if(state.selectedId) loadQA(state.selectedId); });
  function loadQA(id){
    api('/api/admin/events/'+id+'/qa').then(function(list){ renderQA(Array.isArray(list)?list:[]); }).catch(function(){ document.getElementById('qa-list').textContent='Could not load Q&A.'; });
  }
  function renderQA(list){
    var root=document.getElementById('qa-list'); root.textContent='';
    if(!list.length){ var e=document.createElement('div'); e.className='glass card-pad'; e.style.color='var(--muted)'; e.textContent='No questions.'; root.appendChild(e); return; }
    list.forEach(function(q){
      var card=document.createElement('div'); card.className='glass qa-item';
      var body=document.createElement('div'); body.className='qa-body'; body.textContent=q.body;
      var meta=document.createElement('div'); meta.className='qa-meta';
      var author=document.createElement('strong'); author.textContent=q.author||'Anonymous';
      var votes=document.createElement('span'); votes.textContent='· '+q.votes+' votes';
      var badge=document.createElement('span'); badge.className='pill'; badge.textContent=q.status;
      meta.appendChild(author); meta.appendChild(votes); meta.appendChild(badge);
      if(q.flagged){ var fb=document.createElement('span'); fb.className='pill'; fb.textContent='⚑ flagged'; fb.style.color='#FBBF24'; meta.appendChild(fb); }
      var actions=document.createElement('div'); actions.className='inline'; actions.style.marginTop='6px';
      ['approved','hidden','answered'].forEach(function(s){
        var b=document.createElement('button'); b.className='btn btn-ghost btn-small'; b.type='button'; b.textContent=s;
        if(q.status===s) b.style.background='rgba(124,107,255,.2)';
        b.addEventListener('click', function(){ api('/api/admin/events/'+state.selectedId+'/qa/'+q.id,{method:'PATCH', body:JSON.stringify({status:s})}).then(function(){ toast('Updated to '+s); loadQA(state.selectedId); }).catch(function(err){ toast(err.message||'Update failed','err'); }); });
        actions.appendChild(b);
      });
      var bDel=document.createElement('button'); bDel.className='btn btn-ghost btn-small'; bDel.type='button'; bDel.textContent='Delete'; bDel.style.color='#F87171';
      bDel.addEventListener('click', function(){ if(!confirm('Delete?')) return; api('/api/admin/events/'+state.selectedId+'/qa/'+q.id,{method:'DELETE'}).then(function(){ toast('Deleted'); loadQA(state.selectedId); }).catch(function(err){ toast(err.message||'Delete failed','err'); }); });
      actions.appendChild(bDel);
      card.appendChild(body); card.appendChild(meta); card.appendChild(actions); root.appendChild(card);
    });
  }

  // answer moderation
  document.getElementById('btn-refresh-moderation').addEventListener('click', function(){ if(state.selectedId) loadModeration(state.selectedId); });
  document.getElementById('mod-status').addEventListener('change', function(){ if(state.selectedId) loadModeration(state.selectedId); });
  function loadModeration(id){
    var status=document.getElementById('mod-status').value;
    var qs=status?('?status='+encodeURIComponent(status)):'';
    api('/api/admin/events/'+id+'/answers'+qs).then(function(list){ renderModeration(Array.isArray(list)?list:[]); }).catch(function(){ document.getElementById('moderation-list').textContent='Could not load answers.'; });
  }
  function renderModeration(list){
    var root=document.getElementById('moderation-list'); root.textContent='';
    if(!list.length){ var e=document.createElement('div'); e.className='glass card-pad'; e.style.color='var(--muted)'; e.textContent='No answers in this state.'; root.appendChild(e); return; }
    list.forEach(function(a){
      var card=document.createElement('div'); card.className='glass qa-item';
      var value=document.createElement('div'); value.className='qa-body'; value.textContent=a.value;
      var prompt=document.createElement('div'); prompt.style.color='var(--muted)'; prompt.style.fontSize='.82rem'; prompt.textContent=a.prompt+' · '+a.kind;
      var meta=document.createElement('div'); meta.className='qa-meta';
      var who=document.createElement('strong'); who.textContent=(a.emoji||'🙂')+' '+(a.name||'Anonymous');
      var badge=document.createElement('span'); badge.className='pill'; badge.textContent=a.status;
      if(a.status==='flagged'){ badge.style.background='rgba(251,191,36,.18)'; badge.style.color='#FBBF24'; }
      meta.appendChild(who); meta.appendChild(badge);
      var actions=document.createElement('div'); actions.className='inline'; actions.style.marginTop='6px';
      function act(label,status,color){
        var b=document.createElement('button'); b.className='btn btn-ghost btn-small'; b.type='button'; b.textContent=label; if(color) b.style.color=color;
        b.addEventListener('click', function(){
          api('/api/admin/events/'+state.selectedId+'/answers/'+a.id,{method:'PATCH', body:JSON.stringify({status:status})}).then(function(){ toast('Answer '+status); loadModeration(state.selectedId); loadResults(state.selectedId); }).catch(function(err){ toast(err.message||'Update failed','err'); });
        });
        actions.appendChild(b);
      }
      if(a.status!=='visible') act('Approve','visible');
      if(a.status!=='hidden') act('Hide','hidden','#F87171');
      card.appendChild(value); card.appendChild(prompt); card.appendChild(meta); card.appendChild(actions); root.appendChild(card);
    });
  }

  // slides
  document.getElementById('form-upload').addEventListener('submit', function(e){
    e.preventDefault();
    if(!state.selectedId) return toast('Select an event','err');
    var title=document.getElementById('up-title').value.trim();
    var speaker=document.getElementById('up-speaker').value.trim();
    var file=document.getElementById('up-file').files[0];
    if(!file) return;
    var fd=new FormData(); fd.append('title', title); fd.append('speaker', speaker); fd.append('file', file);
    var prog=document.getElementById('up-progress'); prog.textContent='Uploading…';
    var xhr=new XMLHttpRequest();
    xhr.open('POST','/api/admin/events/'+state.selectedId+'/presentations', true);
    xhr.withCredentials=true;
    xhr.upload.onprogress=function(ev){ if(ev.lengthComputable) prog.textContent=Math.round(ev.loaded/ev.total*100)+'%'; };
    xhr.onload=function(){
      if(xhr.status>=200 && xhr.status<300){ prog.textContent='Done'; toast('Uploaded'); document.getElementById('form-upload').reset(); loadSlides(state.selectedId); setTimeout(function(){ prog.textContent=''; },1200); }
      else { prog.textContent='Failed'; toast('Upload failed','err'); }
    };
    xhr.onerror=function(){ prog.textContent='Failed'; toast('Upload failed','err'); };
    xhr.send(fd);
  });
  function loadSlides(id){
    api('/api/admin/events/'+id+'/presentations').then(function(list){ renderSlides(Array.isArray(list)?list:[]); }).catch(function(){});
  }
  function renderSlides(list){
    var root=document.getElementById('slides-list'); root.textContent='';
    if(!list.length){ var e=document.createElement('div'); e.className='glass card-pad'; e.style.color='var(--muted)'; e.textContent='No presentations yet.'; root.appendChild(e); return; }
    list.forEach(function(p){
      var row=document.createElement('div'); row.className='glass card-pad'; row.style.display='flex'; row.style.gap='12px'; row.style.alignItems='center';
      var info=document.createElement('div'); info.style.flex='1';
      var t=document.createElement('div'); t.style.fontWeight='700'; t.textContent=p.title||p.filename;
      var sub=document.createElement('div'); sub.style.color='var(--muted)'; sub.style.fontSize='.82rem'; sub.textContent=(p.speaker? p.speaker+' · ':'')+ (p.filename||'') + (p.size? ' · '+Math.round(p.size/1024)+' KB':'');
      info.appendChild(t); info.appendChild(sub);
      var a=document.createElement('a'); a.className='btn btn-ghost btn-small'; a.href=p.url; a.textContent='Open'; a.target='_blank';
      var bDel=document.createElement('button'); bDel.className='btn btn-ghost btn-small'; bDel.type='button'; bDel.textContent='Delete'; bDel.style.color='#F87171';
      bDel.addEventListener('click', function(){ if(!confirm('Delete presentation?')) return; api('/api/admin/events/'+state.selectedId+'/presentations/'+p.id,{method:'DELETE'}).then(function(){ toast('Deleted'); loadSlides(state.selectedId); }).catch(function(err){ toast(err.message||'Delete failed','err'); }); });
      row.appendChild(info); row.appendChild(a); row.appendChild(bDel); root.appendChild(row);
    });
  }

  // results
  document.getElementById('btn-refresh-results').addEventListener('click', function(){ if(state.selectedId) loadResults(state.selectedId); });
  var btnReport=document.getElementById('btn-report');
  if(btnReport) btnReport.addEventListener('click', function(){
    if(!state.selectedId) return toast('Select an event first','err');
    window.open('/api/admin/events/'+state.selectedId+'/report','_blank');
  });
  function loadResults(id){
    api('/api/admin/events/'+id+'/questions').then(function(list){
      var root=document.getElementById('results-list'); root.textContent='';
      var qs=Array.isArray(list)?list:[];
      if(!qs.length){ root.textContent='No questions.'; return; }
      qs.forEach(function(q){
        var card=document.createElement('div'); card.className='glass card-pad';
        var title=document.createElement('div'); title.style.fontWeight='700'; title.textContent=q.prompt;
        var metaText=q.kind+' · '+q.status+' · '+(q.total||0)+' responses'+(q.is_feedback?' · feedback':'')+(q.media_url?' · '+q.media_type:'');
        if((q.kind==='poll'||q.kind==='yesno') && q.correct_index!==null && q.correct_index!==undefined){
          var clab=q.kind==='poll'?(q.options[q.correct_index]||'#'+q.correct_index):(q.correct_index===0?'yes':'no');
          metaText+=' · ✓ '+clab+' · '+(q.points_base||100)+' pts';
          if(!q.show_results) metaText+=' (answer hidden until results visible)';
        }
        var meta=document.createElement('div'); meta.style.color='var(--muted)'; meta.style.fontSize='.82rem'; meta.textContent=metaText;
        card.appendChild(title); card.appendChild(meta);
        if(q.media_url){
          var m=document.createElement(q.media_type==='video'?'video':'img');
          if(q.media_type==='video'){ m.controls=true; m.muted=true; m.src=q.media_url; } else { m.src=q.media_url; m.alt=q.prompt||'media'; }
          m.style.cssText='max-width:100%;max-height:200px;border-radius:12px;margin-top:10px';
          card.appendChild(m);
        }
        if(q.kind==='wordcloud' && q.results){
          var cloud=document.createElement('div'); cloud.className='cloud'; cloud.style.marginTop='12px';
          var filtered=q.results.filter(function(r){return r.count>0});
          if(!filtered.length) cloud.textContent='No answers yet.';
          else {
            var max=Math.max.apply(null, filtered.map(function(r){return r.count}));
            filtered.forEach(function(r,i){
              var s=document.createElement('span'); s.className='cloud-item'; s.textContent=r.label;
              var sc=0.9 + (r.count/max)*0.6; s.style.fontSize=sc+'rem';
              if(i===0){ s.style.background='linear-gradient(135deg,#6366F1,#EC4899)'; s.style.color='#fff'; s.style.borderColor='transparent'; }
              cloud.appendChild(s);
            });
          }
          card.appendChild(cloud);
        }
        if(q.results && q.results.length){
          var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px'; wrap.style.marginTop='12px';
          if(q.kind==='nps' && typeof q.nps==='number'){
            var nps=document.createElement('div'); nps.style.fontWeight='700'; nps.style.marginTop='10px'; nps.style.fontSize='1rem'; nps.textContent='NPS score: '+q.nps;
            card.appendChild(nps);
          }
          var maxScore=0;
          if(q.kind==='ranking'){
            maxScore=Math.max.apply(null, q.results.map(function(x){return x.score||0}));
          }
          var correctResLabel=null;
          if((q.kind==='poll'||q.kind==='yesno') && q.correct_index!==null && q.correct_index!==undefined && q.show_results){
            if(q.kind==='poll' && q.options) correctResLabel=q.options[q.correct_index];
            else if(q.kind==='yesno') correctResLabel=q.correct_index===0?'yes':'no';
          }
          q.results.forEach(function(r){
            var isCorrect = correctResLabel!==null && r.label===correctResLabel;
            var row=document.createElement('div'); row.style.display='grid'; row.style.gap='4px';
            var head=document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.fontSize='.88rem';
            var lab=document.createElement('strong'); lab.textContent=(isCorrect?'✓ ':'')+r.label; if(isCorrect) lab.style.color='#22C55E';
            var cnt=document.createElement('span'); cnt.style.color='var(--muted)';
            if(q.kind==='ranking'){
              cnt.textContent=r.count+' ballots · '+r.score+' pts · avg '+(r.avg_rank||0).toFixed(2);
            }else{
              cnt.textContent=r.count + (q.total? ' · '+Math.round(r.count/q.total*100)+'%':'');
            }
            head.appendChild(lab); head.appendChild(cnt);
            var track=document.createElement('div'); track.style.height='10px'; track.style.borderRadius='999px'; track.style.background='rgba(255,255,255,.07)'; track.style.overflow='hidden';
            if(isCorrect) track.style.outline='1px solid rgba(34,197,94,.5)';
            var pct=0;
            if(q.kind==='ranking'){
              pct = maxScore>0? (r.score||0)/maxScore*100 : 0;
            }else{
              pct = q.total? (r.count/q.total*100) : 0;
            }
            var fill=document.createElement('div'); fill.style.height='100%'; fill.style.width= pct+'%';
            fill.style.background=isCorrect?'linear-gradient(135deg,#22C55E,#16A34A)':'linear-gradient(135deg,#6366F1,#EC4899)';
            track.appendChild(fill); row.appendChild(head); row.appendChild(track); wrap.appendChild(row);
          });
          card.appendChild(wrap);
        }
        root.appendChild(card);
      });
      // feedback summary: filter is_feedback
      var fb=qs.filter(function(q){return q.is_feedback});
      var sum=document.getElementById('feedback-summary'); sum.textContent='';
      if(!fb.length) sum.textContent='No feedback questions configured.';
      else {
        fb.forEach(function(q){
          var d=document.createElement('div'); d.style.padding='8px 0'; d.style.borderTop='1px solid rgba(255,255,255,.06)';
          var t=document.createElement('div'); t.style.fontWeight='600'; t.textContent=q.prompt;
          var r=document.createElement('div'); r.style.color='var(--muted)'; r.textContent=(q.total||0)+' responses';
          d.appendChild(t); d.appendChild(r); sum.appendChild(d);
        });
      }
    });
  }

  // stats
  var statsSource=null; var statsBackoff=1000; var statsTimer=null; var statsCurrentId=null;
  function setStatsLive(on){ var el=document.getElementById('stats-live'); if(el) el.textContent='Live updates: '+(on?'on':'off'); }
  function adminWsUrl(id){ return (location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/admin/events/'+encodeURIComponent(id)+'/stats'; }
  function closeStatsStream(){
    statsCurrentId=null;
    if(statsTimer){ clearTimeout(statsTimer); statsTimer=null; }
    if(statsSource){ try{ statsSource.close(); }catch(e){} statsSource=null; }
    setStatsLive(false);
  }

  function statCard(label, value, sub){
    var card=document.createElement('div'); card.className='stat-card';
    var v=document.createElement('div'); v.className='stat-value'; v.textContent=value;
    var l=document.createElement('div'); l.className='stat-label'; l.textContent=label;
    card.appendChild(v); card.appendChild(l);
    if(sub){ var s=document.createElement('div'); s.className='stat-sub'; s.textContent=sub; card.appendChild(s); }
    return card;
  }
  function donut(pctValue){
    var pct=Math.max(0,Math.min(100,Number(pctValue)||0));
    var ns='http://www.w3.org/2000/svg', r=24, c=2*Math.PI*r;
    var svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 60 60'); svg.setAttribute('width','60'); svg.setAttribute('height','60');
    var bg=document.createElementNS(ns,'circle');
    bg.setAttribute('cx','30'); bg.setAttribute('cy','30'); bg.setAttribute('r',String(r));
    bg.setAttribute('fill','none'); bg.setAttribute('stroke','rgba(255,255,255,.10)'); bg.setAttribute('stroke-width','7');
    var arc=document.createElementNS(ns,'circle');
    arc.setAttribute('cx','30'); arc.setAttribute('cy','30'); arc.setAttribute('r',String(r));
    arc.setAttribute('fill','none'); arc.setAttribute('stroke','#A78BFA'); arc.setAttribute('stroke-width','7');
    arc.setAttribute('stroke-linecap','round');
    arc.setAttribute('stroke-dasharray',(c*pct/100).toFixed(2)+' '+c.toFixed(2));
    arc.setAttribute('transform','rotate(-90 30 30)');
    svg.appendChild(bg); svg.appendChild(arc);
    return svg;
  }
  function donutCard(label, pctValue, sub){
    var pct=Math.max(0,Math.min(100,Number(pctValue)||0));
    var card=document.createElement('div'); card.className='stat-card';
    var row=document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='12px';
    row.appendChild(donut(pct));
    var box=document.createElement('div');
    var v=document.createElement('div'); v.className='stat-value'; v.textContent=pct.toFixed(1)+'%';
    var l=document.createElement('div'); l.className='stat-label'; l.textContent=label;
    box.appendChild(v); box.appendChild(l); row.appendChild(box); card.appendChild(row);
    if(sub){ var s=document.createElement('div'); s.className='stat-sub'; s.textContent=sub; card.appendChild(s); }
    return card;
  }
  function renderGlobalStats(t){
    var root=document.getElementById('stats-global'); root.textContent='';
    var items=[
      ['Events', t.events||0],
      ['Participants', t.participants||0],
      ['Answers', t.answers||0],
      ['Questions', t.questions||0],
      ['Q&A', t.qa||0],
      ['Votes', t.votes||0]
    ];
    items.forEach(function(it){ root.appendChild(statCard(it[0], it[1], null)); });
  }
  function renderStatsEvents(list){
    var root=document.getElementById('stats-events'); root.textContent='';
    if(!list.length){ root.textContent='No events yet.'; return; }
    list.forEach(function(ev){
      var row=document.createElement('div'); row.className='q-row'; row.style.marginTop='8px';
      var head=document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.gap='10px'; head.style.flexWrap='wrap';
      var name=document.createElement('strong'); name.textContent=ev.name;
      var meta=document.createElement('span'); meta.style.color='var(--muted)'; meta.style.fontSize='.82rem';
      meta.textContent=ev.code+' · '+ev.status+' · '+(ev.participants||0)+' participants · '+(ev.answers||0)+' answers · '+(ev.qa||0)+' Q&A';
      head.appendChild(name); head.appendChild(meta);
      var lbl=document.createElement('div'); lbl.className='stat-sub';
      lbl.textContent='Response rate '+Math.round((ev.response_rate||0)*10)/10+'% · '+(ev.answered||0)+' of '+(ev.participants||0)+' answered';
      var track=document.createElement('div'); track.className='stat-bar';
      var fill=document.createElement('i'); fill.style.width=Math.max(0,Math.min(100,ev.response_rate||0))+'%'; track.appendChild(fill);
      var btn=document.createElement('button'); btn.className='btn btn-ghost btn-small'; btn.type='button'; btn.textContent='Open stats';
      btn.addEventListener('click', function(){ selectEvent(ev.id); setView('stats'); });
      row.appendChild(head); row.appendChild(lbl); row.appendChild(track); row.appendChild(btn);
      root.appendChild(row);
    });
  }
  function fillStatsEventSelect(list){
    var sel=document.getElementById('stats-event-select'); sel.textContent='';
    if(!list.length){ var o=document.createElement('option'); o.value=''; o.textContent='No events'; sel.appendChild(o); return; }
    list.forEach(function(ev){
      var o=document.createElement('option'); o.value=String(ev.id); o.textContent=ev.name+' · '+ev.code; sel.appendChild(o);
    });
    if(state.selectedId && list.some(function(ev){return ev.id===state.selectedId})) sel.value=String(state.selectedId);
  }
  function statsQuestionCard(q){
    var card=document.createElement('div'); card.className='glass card-pad';
    var title=document.createElement('div'); title.style.fontWeight='700'; title.textContent=q.prompt;
    var meta=document.createElement('div'); meta.style.color='var(--muted)'; meta.style.fontSize='.82rem';
    meta.textContent=q.kind+(q.media_type?' · '+q.media_type:'')+' · '+(q.respondents||0)+' respondents · '+(q.total||0)+' responses';
    card.appendChild(title); card.appendChild(meta);
    if(q.kind==='nps' && typeof q.nps==='number'){
      var nps=document.createElement('div'); nps.style.fontWeight='700'; nps.style.marginTop='8px'; nps.textContent='NPS score: '+q.nps;
      card.appendChild(nps);
    }
    if(q.results && q.results.length){
      var maxScore=0;
      if(q.kind==='ranking'){ maxScore=Math.max.apply(null,q.results.map(function(x){return x.score||0})); }
      var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='8px'; wrap.style.marginTop='10px';
      q.results.forEach(function(r){
        var row=document.createElement('div'); row.style.display='grid'; row.style.gap='4px';
        var head=document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.fontSize='.86rem';
        var lab=document.createElement('strong'); lab.textContent=r.label;
        var cnt=document.createElement('span'); cnt.style.color='var(--muted)';
        if(q.kind==='ranking'){ cnt.textContent=r.count+' ballots · '+r.score+' pts · avg '+(r.avg_rank||0).toFixed(2); }
        else { cnt.textContent=r.count + (q.total?' · '+Math.round(r.count/q.total*100)+'%':''); }
        head.appendChild(lab); head.appendChild(cnt);
        var track=document.createElement('div'); track.className='stat-bar';
        var fill=document.createElement('i');
        var pct=0;
        if(q.kind==='ranking'){ pct = maxScore>0 ? (r.score||0)/maxScore*100 : 0; }
        else { pct = q.total ? (r.count/q.total*100) : 0; }
        fill.style.width=pct+'%'; track.appendChild(fill);
        row.appendChild(head); row.appendChild(track); wrap.appendChild(row);
      });
      card.appendChild(wrap);
    }
    return card;
  }
  function renderStatsEvent(j){
    var ev=(j&&j.event)||{};
    var cards=document.getElementById('stats-event-cards'); cards.textContent='';
    cards.appendChild(statCard('Participants', ev.participants||0, null));
    cards.appendChild(donutCard('Answered', ev.response_rate||0, (ev.answered||0)+' of '+(ev.participants||0)+' participants'));
    cards.appendChild(statCard('Answers', ev.answers||0, null));
    cards.appendChild(statCard('Questions', ev.questions||0, null));
    cards.appendChild(statCard('Q&A', ev.qa||0, (ev.votes||0)+' votes'));
    cards.appendChild(donutCard('Feedback', ev.feedback_rate||0, (ev.feedback_answered||0)+' of '+(ev.participants||0)+' participants'));
    var qroot=document.getElementById('stats-questions'); qroot.textContent='';
    var qs=(j&&j.questions)||[];
    if(!qs.length) qroot.textContent='No questions yet.';
    else qs.forEach(function(q){ qroot.appendChild(statsQuestionCard(q)); });
    var froot=document.getElementById('stats-feedback'); froot.textContent='';
    var fb=(j&&j.feedback)||[];
    if(!fb.length) froot.textContent='No feedback questions configured.';
    else fb.forEach(function(q){ froot.appendChild(statsQuestionCard(q)); });
  }
  function loadStatsEvent(id){
    api('/api/admin/events/'+id+'/stats').then(renderStatsEvent).catch(function(err){ toast(err.message||'Could not load event stats','err'); });
  }
  function loadStats(){
    api('/api/admin/stats').then(function(j){
      renderGlobalStats(j.totals||{});
      var list=Array.isArray(j.events)?j.events:[];
      renderStatsEvents(list);
      fillStatsEventSelect(list);
      if(state.selectedId){ loadStatsEvent(state.selectedId); connectStatsStream(state.selectedId); }
      else {
        closeStatsStream();
        document.getElementById('stats-event-cards').textContent='Select an event.';
        document.getElementById('stats-questions').textContent='';
        document.getElementById('stats-feedback').textContent='';
      }
    }).catch(function(err){ toast(err.message||'Could not load stats','err'); });
  }
  function connectStatsStream(id){
    closeStatsStream();
    if(!id || typeof WebSocket==='undefined') return;
    statsCurrentId=id; statsBackoff=1000;
    doConnectStats(id);
  }
  function doConnectStats(id){
    if(statsCurrentId!==id) return;
    if(statsTimer){ clearTimeout(statsTimer); statsTimer=null; }
    try{ statsSource=new WebSocket(adminWsUrl(id)); }catch(e){ return; }
    statsSource.onopen=function(){ statsBackoff=1000; setStatsLive(true); };
    statsSource.onmessage=function(ev){
      try{
        var m=JSON.parse(ev.data);
        if(m.type==='stats' && m.data) renderStatsEvent(m.data);
        else if(m.type==='ping'){ try{ statsSource.send(JSON.stringify({type:'pong'})); }catch(e){} }
      }catch(err){}
    };
    statsSource.onclose=function(){
      if(statsCurrentId!==id) return;
      statsSource=null; setStatsLive(false);
      statsTimer=setTimeout(function(){ statsBackoff=Math.min(statsBackoff*2, 10000); doConnectStats(id); }, statsBackoff);
    };
    statsSource.onerror=function(){ try{ statsSource.close(); }catch(e){} };
  }
  document.getElementById('btn-refresh-stats').addEventListener('click', function(){
    loadStats();
  });
  document.getElementById('stats-event-select').addEventListener('change', function(){
    var id=parseInt(this.value,10)||0;
    if(!id) return;
    if(id!==state.selectedId){
      state.selectedId=id;
      updateSelectedBar();
      renderEvents(state.events);
    }
    loadStatsEvent(id);
    connectStatsStream(id);
  });

  // leaderboard
  var lbTimer=null; var lbWS=null;
  function renderLeaderboard(entries){
    var root=document.getElementById('leaderboard-list'); if(!root) return;
    root.textContent='';
    var countEl=document.getElementById('lb-count'); if(countEl) countEl.textContent=(entries&&entries.length?entries.length:0)+' players';
    if(!entries||!entries.length){
      var empty=document.createElement('div'); empty.className='glass card-pad'; empty.style.color='var(--muted)'; empty.textContent='No scores yet — activate a scored question and collect answers.';
      root.appendChild(empty); return;
    }
    entries.forEach(function(e){
      var row=document.createElement('div'); row.className='glass card-pad'; row.style.display='flex'; row.style.alignItems='center'; row.style.gap='14px';
      var rank=document.createElement('div'); rank.style.minWidth='28px'; rank.style.textAlign='center'; rank.style.fontWeight='800'; rank.style.fontSize='1.05rem';
      rank.textContent='#'+e.rank; if(e.rank===1) rank.style.color='#F59E0B'; else if(e.rank===2) rank.style.color='#9AA0B8'; else if(e.rank===3) rank.style.color='#D97706';
      var avatar=document.createElement('div'); avatar.style.width='36px'; avatar.style.height='36px'; avatar.style.borderRadius='999px'; avatar.style.display='grid'; avatar.style.placeItems='center'; avatar.style.fontSize='1.1rem'; avatar.style.flexShrink='0';
      avatar.style.background=e.color||'#6366F1'; avatar.style.color='#fff'; avatar.textContent=e.emoji||'🙂';
      var info=document.createElement('div'); info.style.flex='1'; info.style.minWidth='0';
      var name=document.createElement('div'); name.style.fontWeight='700'; name.style.whiteSpace='nowrap'; name.style.overflow='hidden'; name.style.textOverflow='ellipsis'; name.textContent=e.name||'Anonymous';
      var sub=document.createElement('div'); sub.style.color='var(--muted)'; sub.style.fontSize='.82rem'; sub.textContent=e.points+' pts';
      info.appendChild(name); info.appendChild(sub);
      var pts=document.createElement('div'); pts.style.fontWeight='800'; pts.style.fontSize='1.1rem'; pts.textContent=String(e.points);
      row.appendChild(rank); row.appendChild(avatar); row.appendChild(info); row.appendChild(pts);
      root.appendChild(row);
    });
  }
  function fetchLeaderboard(id){
    if(!id) return Promise.resolve([]);
    // try admin endpoint first, fall back to public via code if needed
    return api('/api/admin/events/'+id+'/leaderboard').then(function(j){
      var arr=j.entries||j.leaderboard||j||[]; return Array.isArray(arr)?arr:[];
    }).catch(function(err){
      // fallback to public leaderboard via event code
      var ev=(state.events||[]).find(function(e){return e.id===id});
      if(ev&&ev.code){
        return api('/api/events/'+encodeURIComponent(ev.code)+'/leaderboard').then(function(j){
          var arr=j.entries||[]; return Array.isArray(arr)?arr:[];
        }).catch(function(){ return []; });
      }
      return [];
    });
  }
  function loadLeaderboard(id){
    var target=id||state.selectedId;
    if(!target){ renderLeaderboard([]); return; }
    var liveEl=document.getElementById('lb-live'); if(liveEl) liveEl.textContent='Live: loading…';
    fetchLeaderboard(target).then(function(entries){ renderLeaderboard(entries); if(liveEl) liveEl.textContent='Live: updated '+new Date().toLocaleTimeString(); }).catch(function(){ renderLeaderboard([]); if(liveEl) liveEl.textContent='Live: failed'; });
  }
  function startLeaderboardPolling(){
    stopLeaderboardPolling();
    if(!state.selectedId) return;
    loadLeaderboard(state.selectedId);
    lbTimer=setInterval(function(){
      var panel=document.querySelector('[data-panel="leaderboard"]');
      if(panel && panel.classList.contains('hidden')) return;
      if(state.selectedId) fetchLeaderboard(state.selectedId).then(renderLeaderboard);
    }, 4000);
    // optionally listen to admin stats WS as hint to refresh (reuses existing infra)
    // if stats WS is active, its messages trigger a refresh
    var origOnMessage=null;
    // simple: when stats socket pushes, refresh leaderboard too
    // we hook into statsSource if present
    if(typeof WebSocket!=='undefined' && state.selectedId){
      try{
        var url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/admin/events/'+encodeURIComponent(state.selectedId)+'/stats';
        lbWS=new WebSocket(url);
        lbWS.onmessage=function(ev){
          try{
            var m=JSON.parse(ev.data);
            if(m.type==='stats' && m.data) fetchLeaderboard(state.selectedId).then(renderLeaderboard);
          }catch(e){}
        };
        lbWS.onerror=function(){ try{ lbWS.close(); }catch(e){} };
      }catch(e){}
    }
  }
  function stopLeaderboardPolling(){
    if(lbTimer){ clearInterval(lbTimer); lbTimer=null; }
    if(lbWS){ try{ lbWS.close(); }catch(e){} lbWS=null; }
  }
  var btnLb=document.getElementById('btn-refresh-leaderboard');
  if(btnLb) btnLb.addEventListener('click', function(){ if(state.selectedId) loadLeaderboard(state.selectedId); else toast('Select an event','err'); });

  // keep leaderboard in sync when event changes
  var origSelectEvent=selectEvent;
  // wrap selectEvent to also refresh leaderboard if visible
  var _selectEvent=selectEvent;
  selectEvent=function(id){
    _selectEvent(id);
    var lbPanel=document.querySelector('[data-panel="leaderboard"]');
    if(lbPanel && !lbPanel.classList.contains('hidden')) loadLeaderboard(id);
  };

  // forgot password
  var forgotLink=document.getElementById('btn-forgot');
  var forgotForm=document.getElementById('form-forgot');
  if(forgotLink) forgotLink.addEventListener('click', function(e){ e.preventDefault(); forgotForm.classList.toggle('hidden'); });
  if(forgotForm) forgotForm.addEventListener('submit', function(e){
    e.preventDefault();
    var val=document.getElementById('forgot-input').value.trim();
    var msg=document.getElementById('forgot-msg'); msg.textContent='Sending…';
    api('/api/auth/forgot-password',{method:'POST', body:JSON.stringify({email:val})}).then(function(j){ msg.textContent=j.message||'If that account exists, a reset link has been sent.'; toast(msg.textContent); }).catch(function(err){ msg.textContent=err.message||'Failed'; toast(msg.textContent,'err'); });
  });

  // email settings
  function loadEmail(){
    api('/api/admin/settings/email').then(function(j){
      document.getElementById('em-host').value=j.effective?j.effective.host:j.host||'';
      document.getElementById('em-port').value=j.effective?j.effective.port:j.port||'';
      document.getElementById('em-user').value=j.effective?j.effective.user:j.user||'';
      document.getElementById('em-from').value=j.effective?j.effective.from:j.from||'';
      document.getElementById('em-tls').value=j.effective?j.effective.tls:j.tls||'starttls';
      var st=document.getElementById('email-status');
      if(st) st.textContent=j.enabled?'Configured':'Not configured';
    }).catch(function(){});
  }
  var formEmail=document.getElementById('form-email');
  if(formEmail) formEmail.addEventListener('submit', function(e){
    e.preventDefault();
    var payload={ host: document.getElementById('em-host').value.trim(), port: parseInt(document.getElementById('em-port').value,10)||0, user: document.getElementById('em-user').value.trim(), password: document.getElementById('em-pass').value, from: document.getElementById('em-from').value.trim(), tls: document.getElementById('em-tls').value };
    api('/api/admin/settings/email',{method:'PUT', body:JSON.stringify(payload)}).then(function(){ toast('Email settings saved'); document.getElementById('em-pass').value=''; loadEmail(); }).catch(function(err){ toast(err.message||'Failed','err'); });
  });
  var btnTest=document.getElementById('btn-test-email');
  if(btnTest) btnTest.addEventListener('click', function(){
    var st=document.getElementById('email-status'); if(st) st.textContent='Sending…';
    api('/api/admin/settings/email/test',{method:'POST', body:JSON.stringify({})}).then(function(){ toast('Test email sent'); if(st) st.textContent='Test sent'; }).catch(function(err){ toast(err.message||'Test failed','err'); if(st) st.textContent=err.message||'Failed'; });
  });

  // webhooks
  function loadWebhooks(){
    api('/api/admin/settings/webhooks').then(function(j){
      var urlEl=document.getElementById('wh-url');
      var secEl=document.getElementById('wh-secret');
      var enEl=document.getElementById('wh-enabled');
      var evEl=document.getElementById('wh-events');
      if(urlEl) urlEl.value=j.url||'';
      if(enEl) enEl.checked=!!j.enabled;
      if(evEl) evEl.value=Array.isArray(j.events)?j.events.join(', '):(j.events||'');
      if(secEl){
        secEl.value='';
        if(j.webhook_secret_set) secEl.placeholder='•••••••• (unchanged)';
        else secEl.placeholder='optional secret';
      }
      var st=document.getElementById('wh-status');
      if(st) st.textContent=j.enabled?'Enabled':'Disabled';
    }).catch(function(){});
  }
  var formWH=document.getElementById('form-webhooks');
  if(formWH) formWH.addEventListener('submit', function(e){
    e.preventDefault();
    var url=(document.getElementById('wh-url').value||'').trim();
    var secret=document.getElementById('wh-secret').value;
    var enabled=!!document.getElementById('wh-enabled').checked;
    var raw=(document.getElementById('wh-events').value||'').trim();
    var events=raw? raw.split(',').map(function(s){return s.trim()}).filter(Boolean) : [];
    var payload={url:url, enabled:enabled, events:events};
    if(secret) payload.secret=secret;
    var st=document.getElementById('wh-status'); if(st) st.textContent='Saving…';
    api('/api/admin/settings/webhooks',{method:'PUT', body:JSON.stringify(payload)}).then(function(){
      toast('Webhook settings saved');
      var secEl=document.getElementById('wh-secret'); if(secEl) secEl.value='';
      if(st) st.textContent='Saved';
      loadWebhooks();
    }).catch(function(err){ toast((err.j&&err.j.error)||err.message||'Save failed','err'); if(st) st.textContent=err.message||'Failed'; });
  });
  var btnTestWH=document.getElementById('btn-test-webhook');
  if(btnTestWH) btnTestWH.addEventListener('click', function(){
    var st=document.getElementById('wh-status'); if(st) st.textContent='Sending test…';
    var resEl=document.getElementById('wh-test-result');
    if(resEl){ resEl.textContent=''; resEl.classList.add('hidden'); }
    api('/api/admin/settings/webhooks/test',{method:'POST', body:JSON.stringify({})}).then(function(j){
      toast('Webhook test sent');
      if(st) st.textContent=j.ok ? 'Test ok · '+j.status : 'Test returned '+j.status;
      if(resEl){
        var body=j.body||'';
        if(body.length>2000) body=body.slice(0,2000)+'…';
        resEl.textContent='ok: '+j.ok+'\nstatus: '+j.status+'\nbody: '+body;
        resEl.classList.remove('hidden');
      }
    }).catch(function(err){
      toast((err.j&&err.j.error)||err.message||'Test failed','err');
      if(st) st.textContent=err.message||'Failed';
      if(resEl && err.j){
        var b=err.j.body||err.j.error||'';
        if(typeof b==='string' && b.length>2000) b=b.slice(0,2000)+'…';
        resEl.textContent='error: '+(err.j.error||err.message)+'\nstatus: '+(err.j.status||'')+'\nbody: '+b;
        resEl.classList.remove('hidden');
      }
    });
  });

  // content filter settings
  function loadFilter(){
    api('/api/admin/settings/filter').then(function(j){
      document.getElementById('cf-enabled').checked=!!j.enabled;
      document.getElementById('cf-words').value=j.words||'';
      document.getElementById('cf-action').value=j.action||'flag';
    }).catch(function(){});
  }
  var formFilter=document.getElementById('form-filter');
  if(formFilter) formFilter.addEventListener('submit', function(e){
    e.preventDefault();
    var payload={ enabled: document.getElementById('cf-enabled').checked, words: document.getElementById('cf-words').value, action: document.getElementById('cf-action').value };
    api('/api/admin/settings/filter',{method:'PUT', body:JSON.stringify(payload)}).then(function(){ toast('Filter saved'); }).catch(function(err){ toast(err.message||'Failed','err'); });
  });

  // recap settings + per-event send
  function loadRecapSettings(){
    api('/api/admin/settings/recap').then(function(j){
      document.getElementById('rc-emails').value=j.emails||'';
    }).catch(function(){});
  }
  var formRecap=document.getElementById('form-recap');
  if(formRecap) formRecap.addEventListener('submit', function(e){
    e.preventDefault();
    api('/api/admin/settings/recap',{method:'PUT', body:JSON.stringify({emails: document.getElementById('rc-emails').value})}).then(function(){ toast('Recipients saved'); }).catch(function(err){ toast(err.message||'Failed','err'); });
  });
  function resetRecapPreview(){
    var pre=document.getElementById('rc-preview'); if(pre){ pre.classList.add('hidden'); pre.textContent=''; }
    var meta=document.getElementById('rc-preview-meta'); if(meta) meta.textContent='';
    var send=document.getElementById('rc-send-status'); if(send) send.textContent='';
  }
  function loadRecapSubs(id){
    var root=document.getElementById('recap-subs'); if(!root) return;
    if(!id){ root.textContent='Select an event to see subscriptions.'; return; }
    root.textContent='Loading…';
    api('/api/admin/events/'+id+'/recap').then(function(j){
      var list=(j&&j.subscriptions)||[];
      root.textContent='';
      if(!list.length){ root.textContent='No attendee opt-ins yet.'; return; }
      list.forEach(function(s){
        var row=document.createElement('div'); row.className='inline gap-2'; row.style.justifyContent='space-between';
        var who=document.createElement('span');
        who.textContent=(s.emoji||'🙂')+' '+(s.name||'Anonymous')+' — '+s.email;
        var rm=document.createElement('button'); rm.className='btn btn-ghost btn-small'; rm.type='button'; rm.textContent='Remove';
        rm.addEventListener('click', function(){
          api('/api/admin/events/'+id+'/recap/'+s.id,{method:'DELETE'}).then(function(){ toast('Subscription removed'); loadRecapSubs(id); }).catch(function(err){ toast(err.message||'Remove failed','err'); });
        });
        row.appendChild(who); row.appendChild(rm); root.appendChild(row);
      });
    }).catch(function(){ root.textContent='Could not load subscriptions.'; });
  }
  document.getElementById('btn-refresh-recap-subs').addEventListener('click', function(){ if(state.selectedId) loadRecapSubs(state.selectedId); });
  document.getElementById('btn-recap-preview').addEventListener('click', function(){
    if(!state.selectedId) return toast('Select an event first','err');
    var pre=document.getElementById('rc-preview'); var meta=document.getElementById('rc-preview-meta');
    meta.textContent='Building preview…';
    api('/api/admin/events/'+state.selectedId+'/recap/preview').then(function(j){
      pre.classList.remove('hidden'); pre.textContent='Subject: '+j.subject+'\n\n'+j.body;
      meta.textContent='Recipients: '+j.recipients+(j.skipped?(' · skipped '+j.skipped):'')+(j.truncated?(' · capped at '+j.cap):'');
    }).catch(function(err){ meta.textContent=err.message||'Preview failed'; });
  });
  document.getElementById('btn-recap-send').addEventListener('click', function(){
    if(!state.selectedId) return toast('Select an event first','err');
    var btn=this; var st=document.getElementById('rc-send-status');
    if(!confirm('Send the recap email to all recipients now?')) return;
    btn.disabled=true; st.textContent='Sending…';
    api('/api/admin/events/'+state.selectedId+'/recap/send',{method:'POST', body:JSON.stringify({})}).then(function(j){
      st.textContent='Sent '+j.sent+' · failed '+j.failed+' · skipped '+j.skipped+(j.truncated?(' · capped at '+j.cap):'');
      toast(j.failed?('Recap sent with '+j.failed+' failure(s)'):'Recap sent');
    }).catch(function(err){ st.textContent=''; toast(err.message||'Send failed','err'); }).finally(function(){ btn.disabled=false; });
  });

  // branding / analytics / otel
  function loadBranding(){
    api('/api/admin/settings/branding').then(function(j){ document.getElementById('br-brand').value=j.brand||''; }).catch(function(){});
  }
  document.getElementById('form-branding').addEventListener('submit', function(e){
    e.preventDefault();
    var brand=document.getElementById('br-brand').value.trim();
    api('/api/admin/settings/branding',{method:'PUT', body:JSON.stringify({brand:brand})}).then(function(){ toast('Branding saved'); }).catch(function(err){ toast(err.message||'Failed','err'); });
  });
  function loadAnalytics(){
    api('/api/admin/settings/analytics').then(function(j){
      document.getElementById('an-url').value=j.umami_script_url||'';
      document.getElementById('an-id').value=j.umami_website_id||'';
      document.getElementById('an-enabled').checked=!!j.tracking_enabled;
    }).catch(function(){});
  }
  document.getElementById('form-analytics').addEventListener('submit', function(e){
    e.preventDefault();
    var payload={ umami_script_url: document.getElementById('an-url').value.trim(), umami_website_id: document.getElementById('an-id').value.trim(), tracking_enabled: document.getElementById('an-enabled').checked };
    api('/api/admin/settings/analytics',{method:'PUT', body:JSON.stringify(payload)}).then(function(){ toast('Analytics saved'); }).catch(function(err){ toast(err.message||'Failed','err'); });
  });
  function renderOtelStatus(j){
    var el=document.getElementById('otel-status');
    if(!el) return;
    el.textContent=''; // clear
    var eff=j.effective||{}, src=j.source||{};
    var rows=[
      ['enabled', String(!!j.enabled)],
      ['endpoint', eff.endpoint||'—'],
      ['service name', eff.service_name||'—'],
      ['source', 'endpoint: '+(src.endpoint||'default')+' · name: '+(src.service_name||'default')+' · headers: '+(src.headers||'default')],
      ['restart required', j.restart_required?'yes':'no']
    ];
    rows.forEach(function(r){
      var div=document.createElement('div'); div.style.display='flex'; div.style.justifyContent='space-between'; div.style.gap='10px';
      var k=document.createElement('strong'); k.textContent=r[0];
      var v=document.createElement('span'); v.textContent=r[1]; v.style.color='#D6DAEA';
      div.appendChild(k); div.appendChild(v); el.appendChild(div);
    });
    var note=document.getElementById('otel-restart');
    if(note) note.classList.toggle('hidden', !j.restart_required);
  }
  function loadOtel(){
    api('/api/admin/settings/otel').then(function(j){
      var stored=j.stored||{};
      document.getElementById('ot-endpoint').value=stored.endpoint||'';
      document.getElementById('ot-service').value=stored.service_name||'';
      document.getElementById('ot-headers').value=stored.headers||'';
      renderOtelStatus(j);
      var mini=document.getElementById('otel-mini');
      if(mini) mini.textContent='OTel: '+(j.enabled?'enabled':'disabled') + (j.endpoint? ' · '+j.endpoint:'');
    }).catch(function(){ var el=document.getElementById('otel-status'); if(el) el.textContent='Could not load OTel status.'; });
  }
  var otelForm=document.getElementById('form-otel');
  if(otelForm) otelForm.addEventListener('submit', function(e){
    e.preventDefault();
    var payload={
      endpoint: document.getElementById('ot-endpoint').value.trim(),
      service_name: document.getElementById('ot-service').value.trim(),
      headers: document.getElementById('ot-headers').value.trim()
    };
    api('/api/admin/settings/otel',{method:'PUT', body:JSON.stringify(payload)}).then(function(j){
      renderOtelStatus(j);
      toast(j.restart_required?'OTel settings saved — restart the server to apply':'OTel settings saved');
    }).catch(function(err){ toast(err.message||'Failed','err'); });
  });

  // initial boot
  boot();
})();
