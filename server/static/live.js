/* live.js — projector big-screen */
(function(){
  function getCode(){
    var m=location.pathname.match(/\/live\/([^\/\?#]+)/);
    if(m) return decodeURIComponent(m[1]);
    return new URLSearchParams(location.search).get('code')||'';
  }
  var code=getCode();
  function initUmamiTracking(){
    fetch('/api/settings/analytics',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      if(j && j.tracking_enabled && j.umami_script_url && j.umami_website_id){
        var s=document.createElement('script'); s.async=true; s.defer=true; s.src=j.umami_script_url; s.setAttribute('data-website-id', j.umami_website_id); document.head.appendChild(s);
      }
    }).catch(function(){});
  }
  initUmamiTracking();

  // --- slide indicator ---
  function renderSlideIndicator(slide){
    var el=document.getElementById('slide-indicator');
    if(!el) return;
    if(!slide || slide.index===null || slide.index===undefined || slide.total===null || slide.total===undefined){
      el.classList.add('hidden'); el.style.display='none'; el.textContent='';
      return;
    }
    var txt='Slide '+slide.index+' / '+slide.total;
    if(slide.title) txt+=' \u00b7 '+slide.title;
    el.textContent=txt; el.classList.remove('hidden'); el.style.display='';
  }
  // --- countdown ring (projector) ---
  var countdownTimer=null; var countdownRemaining=0; var countdownDuration=0; var countdownActiveId=null;
  function formatCountdown(sec){
    sec=Math.max(0, Math.floor(sec));
    var m=Math.floor(sec/60); var s=sec%60;
    return m+':'+(s<10?'0':'')+s;
  }
  function clearCountdown(){
    if(countdownTimer){ clearInterval(countdownTimer); countdownTimer=null; }
    countdownRemaining=0; countdownDuration=0; countdownActiveId=null;
    var el=document.getElementById('projector-countdown'); if(el){ el.classList.add('hidden'); el.style.display='none'; }
  }
  function updateCountdownUI(){
    var wrap=document.getElementById('projector-countdown');
    var valEl=document.getElementById('projector-countdown-value');
    var ring=document.getElementById('countdown-ring');
    if(!wrap || !valEl) return;
    if(countdownRemaining<=0){
      valEl.textContent="Time's up";
      wrap.style.opacity='0.9';
      if(ring){ ring.style.strokeDashoffset='0'; ring.style.opacity='0.35'; }
      return;
    }
    wrap.style.display='flex'; wrap.classList.remove('hidden'); wrap.style.opacity='1';
    valEl.textContent=formatCountdown(countdownRemaining);
    if(ring && countdownDuration>0){
      var pct=Math.max(0, Math.min(1, countdownRemaining/countdownDuration));
      var circ=2*Math.PI*26; // r=26
      ring.style.strokeDasharray=circ+'';
      ring.style.strokeDashoffset=String(circ*(1-pct));
      if(pct<=0.25) ring.style.stroke='#F43F5E';
      else if(pct<=0.5) ring.style.stroke='#F59E0B';
      else ring.style.stroke='#7C6BFF';
    }
  }
  function applyCountdownExpired(){
    var wrap=document.getElementById('projector-countdown');
    if(wrap){
      var valEl=document.getElementById('projector-countdown-value');
      if(valEl) valEl.textContent="Time's up";
      wrap.style.opacity='0.9';
      var ring=document.getElementById('countdown-ring');
      if(ring){ ring.style.strokeDashoffset='0'; ring.style.opacity='0.35'; }
    }
  }
  function tickCountdown(){
    if(countdownRemaining<=0){ applyCountdownExpired(); if(countdownTimer){clearInterval(countdownTimer); countdownTimer=null;} return; }
    countdownRemaining-=1;
    if(countdownRemaining<=0){ countdownRemaining=0; updateCountdownUI(); applyCountdownExpired(); if(countdownTimer){clearInterval(countdownTimer); countdownTimer=null;} }
    else { updateCountdownUI(); }
  }
  function syncCountdown(active){
    if(countdownTimer){ clearInterval(countdownTimer); countdownTimer=null; }
    var hasTimer = active && typeof active.remaining_sec==='number' && active.remaining_sec!==null && active.remaining_sec!==undefined;
    if(!hasTimer){ clearCountdown(); return; }
    countdownRemaining=Math.max(0, Math.floor(active.remaining_sec));
    countdownDuration = (typeof active.duration_sec==='number' && active.duration_sec>0) ? active.duration_sec : countdownRemaining;
    countdownActiveId=active.id;
    updateCountdownUI();
    if(countdownRemaining<=0){ applyCountdownExpired(); return; }
    countdownTimer=setInterval(tickCountdown, 1000);
  }

  var currentState=null;
  // Result bars/answers are only shown when the question is revealed, or when
  // the host enabled results on a question that is not locked.
  function canReveal(active){
    if(!active) return false;
    if(active.status==='locked') return false;
    return active.status==='revealed' || !!active.show_results;
  }
  function deadlineMs(active){
    if(!active) return null;
    if(active.deadline_at) return active.deadline_at;
    if(active.time_limit_s>0 && active.activated_at) return active.activated_at + active.time_limit_s*1000;
    return null;
  }
  function correctLabel(active){
    if(!active || active.correct_index===null || active.correct_index===undefined) return null;
    if(active.kind==='poll'){ var opts=active.options||[]; return opts[active.correct_index]||null; }
    if(active.kind==='yesno') return active.correct_index===0 ? 'yes' : 'no';
    return null;
  }

  var prevFeedbackOpen=false;
  function confettiBurst(){
    var root=document.getElementById('confetti');
    if(!root) return;
    root.classList.remove('hidden'); root.textContent='';
    var colors=['#6366F1','#A855F7','#EC4899','#22D3EE','#F59E0B'];
    for(var i=0;i<22;i++){
      var el=document.createElement('i');
      el.style.left=(Math.random()*100)+'vw';
      el.style.top='-10px';
      el.style.background=colors[i%colors.length];
      el.style.animationDelay=(Math.random()*0.35)+'s';
      el.style.transform='rotate('+(Math.random()*360)+'deg)';
      root.appendChild(el);
    }
    setTimeout(function(){ root.classList.add('hidden'); root.textContent=''; }, 1700);
  }

  function renderMedia(container, q){
    if(!q || !q.media_url) return;
    var wrap=document.createElement('div'); wrap.style.marginBottom='18px';
    var el;
    if(q.media_type==='video'){
      el=document.createElement('video'); el.controls=true; el.muted=true; el.autoplay=true; el.loop=true; el.playsInline=true; el.src=q.media_url;
      el.style.width='100%'; el.style.maxHeight='420px'; el.style.borderRadius='16px';
    } else {
      el=document.createElement('img'); el.src=q.media_url; el.alt=q.prompt||'question media';
      el.style.maxWidth='100%'; el.style.maxHeight='420px'; el.style.borderRadius='16px';
    }
    wrap.appendChild(el); container.appendChild(wrap);
  }

  function renderPrompt(active){
    var area=document.getElementById('prompt-area');
    var results=document.getElementById('results-area');
    var cloud=document.getElementById('cloud-area');
    area.textContent=''; results.textContent=''; cloud.textContent='';
    var counter=document.getElementById('counter');
    if(!active){
      var w=document.createElement('div'); w.className='waiting'; w.style.minHeight='360px';
      var orb=document.createElement('div'); orb.className='orb'; orb.innerHTML='<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7"><path d="M12 3l7 4v8l-7 4-7-4V7z"/><circle cx="12" cy="12" r="3"/></svg>';
      var h=document.createElement('h3'); h.textContent='Waiting for the host…'; h.style.fontSize='1.6rem';
      var p=document.createElement('p'); p.textContent='The host will launch the next question. Results and Q&A update live.';
      w.appendChild(orb); w.appendChild(h); w.appendChild(p); area.appendChild(w);
      if(counter) counter.textContent='— responses';
      return;
    }
    renderMedia(area, active);
    var h2=document.createElement('h2'); h2.className='live-prompt big'; h2.textContent=active.prompt; area.appendChild(h2);
    var locked = active.status==='locked';
    var meta=document.createElement('div'); meta.className='live-meta'; meta.style.marginTop='14px';
    var pill=document.createElement('span'); pill.className='pill live'; pill.textContent=locked ? 'locked' : active.kind;
    var tot=document.createElement('span'); tot.className='counter'; tot.textContent= locked ? 'Answers locked' : (canReveal(active) ? (active.total+' responses') : 'Results hidden');
    meta.appendChild(pill); meta.appendChild(tot); area.appendChild(meta);
    // countdown ring/indicator near prompt
    var cdWrap=document.createElement('div'); cdWrap.id='projector-countdown'; cdWrap.className='hidden';
    cdWrap.style.cssText='display:none;align-items:center;gap:14px;margin-top:16px;padding:12px 14px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.06)';
    var ringSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'); ringSvg.setAttribute('width','58'); ringSvg.setAttribute('height','58'); ringSvg.setAttribute('viewBox','0 0 60 60'); ringSvg.style.flexShrink='0'; ringSvg.style.transform='rotate(-90deg)';
    var bgCircle=document.createElementNS('http://www.w3.org/2000/svg','circle'); bgCircle.setAttribute('cx','30'); bgCircle.setAttribute('cy','30'); bgCircle.setAttribute('r','26'); bgCircle.setAttribute('fill','none'); bgCircle.setAttribute('stroke','rgba(255,255,255,.12)'); bgCircle.setAttribute('stroke-width','5');
    var fgCircle=document.createElementNS('http://www.w3.org/2000/svg','circle'); fgCircle.id='countdown-ring'; fgCircle.setAttribute('cx','30'); fgCircle.setAttribute('cy','30'); fgCircle.setAttribute('r','26'); fgCircle.setAttribute('fill','none'); fgCircle.setAttribute('stroke','#7C6BFF'); fgCircle.setAttribute('stroke-width','5'); fgCircle.setAttribute('stroke-linecap','round'); fgCircle.style.transition='stroke-dashoffset .9s linear, stroke .3s'; fgCircle.style.transformOrigin='center';
    ringSvg.appendChild(bgCircle); ringSvg.appendChild(fgCircle);
    var cdInfo=document.createElement('div'); cdInfo.style.display='grid'; cdInfo.style.gap='2px';
    var cdLabel=document.createElement('div'); cdLabel.style.fontSize='.78rem'; cdLabel.style.color='var(--muted)'; cdLabel.style.fontWeight='600'; cdLabel.style.letterSpacing='.04em'; cdLabel.style.textTransform='uppercase'; cdLabel.textContent='Time left';
    var cdVal=document.createElement('div'); cdVal.id='projector-countdown-value'; cdVal.style.fontSize='1.35rem'; cdVal.style.fontWeight='800'; cdVal.style.letterSpacing='-.03em'; cdVal.style.fontVariantNumeric='tabular-nums'; cdVal.textContent='--:--';
    cdInfo.appendChild(cdLabel); cdInfo.appendChild(cdVal);
    cdWrap.appendChild(ringSvg); cdWrap.appendChild(cdInfo);
    area.appendChild(cdWrap);
    if(counter) counter.textContent = locked ? 'Answers locked' : (canReveal(active) ? (active.total+' responses') : 'Live');

    if(locked){
      var lock=document.createElement('div'); lock.className='waiting'; lock.style.minHeight='220px';
      var lockOrb=document.createElement('div'); lockOrb.className='orb'; lockOrb.innerHTML='<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><rect x="5" y="10" width="14" height="10" rx="2"/></svg>';
      var lockH=document.createElement('h3'); lockH.textContent="Time's up — answers locked"; lockH.style.fontSize='1.5rem';
      var lockP=document.createElement('p'); lockP.textContent='Waiting for the host to reveal the correct answer…';
      lock.appendChild(lockOrb); lock.appendChild(lockH); lock.appendChild(lockP); results.appendChild(lock);
      return;
    }

    if(active.kind==='wordcloud'){
      renderCloud(cloud, active);
    }
    if(active.kind==='ranking'){
      renderRanking(results, active);
    } else {
      if(active.kind==='nps') renderNpsBadge(results, active);
      renderBars(results, active);
      var cl=correctLabel(active);
      if(canReveal(active) && cl){
        var hint=document.createElement('div'); hint.style.cssText='color:#6EE7B7;font-size:1rem;font-weight:700;margin-top:14px';
        hint.textContent='Correct answer: '+((active.kind==='yesno')?(cl.charAt(0).toUpperCase()+cl.slice(1)):cl); results.appendChild(hint);
      }
    }
  }

  function renderNpsBadge(container, active){
    if(!canReveal(active)) return;
    if(active.nps===null || active.nps===undefined) return;
    var b=document.createElement('div'); b.className='pill live'; b.style.cssText='margin-top:18px;font-size:1.05rem'; b.textContent='NPS '+active.nps;
    container.appendChild(b);
  }

  function renderRanking(container, active){
    if(!canReveal(active)) return;
    var res=active.results||[];
    if(!res.length) return;
    var max=Math.max.apply(null, res.map(function(r){return r.score||0}))||1;
    var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='12px'; wrap.style.marginTop='18px';
    res.forEach(function(r, idx){
      var row=document.createElement('div'); row.style.display='grid'; row.style.gap='6px';
      var head=document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.gap='12px'; head.style.fontSize='.95rem';
      var lab=document.createElement('strong'); lab.style.letterSpacing='-.02em'; lab.textContent=(idx+1)+'. '+r.label;
      var cnt=document.createElement('span'); cnt.style.color='var(--muted)'; cnt.style.fontVariantNumeric='tabular-nums'; cnt.textContent=(r.score||0)+' pts · avg '+(r.avg_rank?r.avg_rank.toFixed(1):'0');
      head.appendChild(lab); head.appendChild(cnt);
      var track=document.createElement('div'); track.style.height='18px'; track.style.borderRadius='999px'; track.style.background='rgba(255,255,255,.07)'; track.style.overflow='hidden'; track.style.border='1px solid rgba(255,255,255,.08)';
      var fill=document.createElement('div'); fill.style.height='100%'; fill.style.borderRadius='999px'; fill.style.background='linear-gradient(135deg,#6366F1,#A855F7 45%,#EC4899 75%,#22D3EE)'; fill.style.width='0'; fill.style.transition='width .9s cubic-bezier(.16,1,.3,1)';
      track.appendChild(fill); row.appendChild(head); row.appendChild(track); wrap.appendChild(row);
      requestAnimationFrame(function(){ fill.style.width=((r.score||0)/max*100)+'%'; });
    });
    container.appendChild(wrap);
  }

  function renderBars(container, active){
    if(!canReveal(active)) return;
    var res=active.results||[];
    if(!res.length) return;
    var cl=correctLabel(active);
    var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='12px';
    var max=active.total || Math.max.apply(null, res.map(function(r){return r.count})) || 1;
    res.forEach(function(r){
      var isCorrect = cl!==null && String(r.label).toLowerCase()===cl.toLowerCase();
      var row=document.createElement('div'); row.style.display='grid'; row.style.gap='6px';
      var head=document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.gap='12px'; head.style.fontSize='.95rem';
      var lab=document.createElement('strong'); lab.style.letterSpacing='-.02em'; lab.textContent= isCorrect ? (r.label+' ✓') : r.label;
      var pct = active.total ? Math.round(r.count/active.total*100) : 0;
      var cnt=document.createElement('span'); cnt.style.color='var(--muted)'; cnt.style.fontVariantNumeric='tabular-nums'; cnt.textContent= r.count+' · '+pct+'%';
      head.appendChild(lab); head.appendChild(cnt);
      var track=document.createElement('div'); track.style.height='18px'; track.style.borderRadius='999px'; track.style.background='rgba(255,255,255,.07)'; track.style.overflow='hidden'; track.style.border='1px solid rgba(255,255,255,.08)';
      var fill=document.createElement('div'); fill.style.height='100%'; fill.style.borderRadius='999px'; fill.style.background= isCorrect ? 'linear-gradient(135deg,#10B981,#22D3EE)' : 'linear-gradient(135deg,#6366F1,#A855F7 45%,#EC4899 75%,#22D3EE)'; fill.style.width='0'; fill.style.transition='width .9s cubic-bezier(.16,1,.3,1)';
      if(isCorrect){ lab.style.color='#6EE7B7'; }
      track.appendChild(fill); row.appendChild(head); row.appendChild(track); wrap.appendChild(row);
      requestAnimationFrame(function(){ fill.style.width = pct+'%'; });
    });
    container.appendChild(wrap);
  }

  function renderCloud(container, active){
    if(!canReveal(active)) return;
    var res=(active.results||[]).filter(function(r){return r.count>0});
    var box=document.createElement('div'); box.className='cloud'; box.style.marginTop='18px'; box.style.minHeight='90px';
    if(!res.length){
      var e=document.createElement('span'); e.style.color='var(--muted)'; e.textContent='Word cloud will appear as answers come in…'; box.appendChild(e);
    } else {
      var max=Math.max.apply(null, res.map(function(r){return r.count}));
      res.sort(function(a,b){return b.count-a.count});
      res.forEach(function(r, i){
        var s=document.createElement('span'); s.className='cloud-item';
        var scale=1 + (r.count/max)*1.1;
        s.style.fontSize=(scale)+'rem';
        s.style.animationDelay=(i*30)+'ms';
        if(i===0){ s.style.background='linear-gradient(135deg,#6366F1,#EC4899)'; s.style.color='#fff'; s.style.borderColor='transparent'; }
        s.textContent=r.label;
        box.appendChild(s);
      });
    }
    container.appendChild(box);
  }

  function renderQATop(list){
    var root=document.getElementById('qa-top');
    root.textContent='';
    if(!list || !list.length){
      var empty=document.createElement('div'); empty.style.color='var(--muted)'; empty.style.fontSize='.88rem'; empty.textContent='No questions yet.';
      root.appendChild(empty); return;
    }
    var sorted=list.slice().sort(function(a,b){return b.votes-a.votes}).slice(0,10);
    sorted.forEach(function(q, idx){
      var row=document.createElement('div'); row.className='qa-rank-item';
      var num=document.createElement('div'); num.className='qa-rank-num'; num.textContent=String(idx+1);
      var body=document.createElement('div'); body.style.flex='1'; body.style.minWidth='0';
      var txt=document.createElement('div'); txt.style.fontWeight='600'; txt.style.lineHeight='1.35'; txt.style.fontSize='.92rem'; txt.textContent=q.body;
      var meta=document.createElement('div'); meta.style.color='var(--muted)'; meta.style.fontSize='.78rem'; meta.style.marginTop='4px'; meta.textContent=(q.author||'Anonymous')+' · '+q.votes+' votes';
      body.appendChild(txt); body.appendChild(meta);
      row.appendChild(num); row.appendChild(body); root.appendChild(row);
    });
  }

  function renderPodium(data){
    var area=document.getElementById('prompt-area');
    var results=document.getElementById('results-area');
    var cloud=document.getElementById('cloud-area');
    area.textContent=''; results.textContent=''; cloud.textContent='';
    var counter=document.getElementById('counter'); if(counter) counter.textContent='Podium';
    var head=document.createElement('h2'); head.style.cssText='font-size:1.9rem;font-weight:800;letter-spacing:-.03em;margin:0 0 6px';
    head.textContent='🏆 Leaderboard';
    area.appendChild(head);
    var entries=(data.leaderboard||[]).slice();
    if(!entries.length){
      var w=document.createElement('div'); w.className='waiting'; w.style.minHeight='300px';
      var wh=document.createElement('h3'); wh.textContent='No scores yet';
      var wp=document.createElement('p'); wp.textContent='Play a quiz question to populate the podium.';
      w.appendChild(wh); w.appendChild(wp); area.appendChild(w);
      return;
    }
    var top=entries.slice(0,3);
    var rest=entries.slice(3);
    var order=[];
    if(top[1]) order.push(top[1]);
    if(top[0]) order.push(top[0]);
    if(top[2]) order.push(top[2]);
    var medals={1:{h:'190px',bg:'linear-gradient(180deg,#FBBF24,#B45309)',medal:'🥇'},2:{h:'145px',bg:'linear-gradient(180deg,#D1D5DB,#6B7280)',medal:'🥈'},3:{h:'115px',bg:'linear-gradient(180deg,#F59E0B,#92400E)',medal:'🥉'}};
    var podium=document.createElement('div');
    podium.style.cssText='display:flex;align-items:flex-end;justify-content:center;gap:18px;margin:28px 0 10px;flex-wrap:wrap';
    order.forEach(function(e){
      var rank=e.rank||0;
      var m=medals[rank]||{h:'100px',bg:'rgba(255,255,255,.12)',medal:'#'+rank};
      var col=document.createElement('div'); col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px;min-width:170px';
      var emoji=document.createElement('div'); emoji.style.cssText='font-size:2.4rem;line-height:1'; emoji.textContent=e.emoji||'🙂';
      var name=document.createElement('div'); name.style.cssText='font-weight:800;font-size:1.05rem;text-align:center;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; name.textContent=e.name||'Anonymous';
      var block=document.createElement('div'); block.style.cssText='width:170px;height:'+m.h+';border-radius:18px 18px 0 0;background:'+m.bg+';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;box-shadow:0 18px 40px rgba(0,0,0,.35)';
      var med=document.createElement('div'); med.style.cssText='font-size:1.6rem'; med.textContent=m.medal;
      var pts=document.createElement('div'); pts.style.cssText='font-weight:900;font-size:1.25rem;color:#0B1020'; pts.textContent=(e.points||0)+' pts';
      block.appendChild(med); block.appendChild(pts);
      col.appendChild(emoji); col.appendChild(name); col.appendChild(block); podium.appendChild(col);
    });
    area.appendChild(podium);
    if(rest.length){
      var list=document.createElement('div'); list.style.cssText='display:grid;gap:8px;max-width:560px;margin:10px auto 0';
      rest.forEach(function(e){
        var row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:10px 14px';
        var rk=document.createElement('span'); rk.style.cssText='font-weight:800;color:var(--muted);width:2.2rem'; rk.textContent='#'+(e.rank||0);
        var em=document.createElement('span'); em.style.cssText='font-size:1.2rem'; em.textContent=e.emoji||'🙂';
        var nm=document.createElement('span'); nm.style.cssText='flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; nm.textContent=e.name||'Anonymous';
        var pt=document.createElement('span'); pt.style.cssText='font-weight:800'; pt.textContent=(e.points||0)+' pts';
        row.appendChild(rk); row.appendChild(em); row.appendChild(nm); row.appendChild(pt); list.appendChild(row);
      });
      area.appendChild(list);
    }
  }

  function applyState(data){
    if(!data) return;
    var evt=data.event;
    if(evt){
      var nameEl=document.getElementById('event-name'); if(nameEl) nameEl.textContent=evt.name || evt.code;
      var codeEl=document.getElementById('event-code'); if(codeEl) codeEl.textContent=evt.code;
      document.title=(evt.name||'Live')+' — Projector';
      // QR
      var qrImg=document.getElementById('qr-img');
      var qrPlace=document.getElementById('qr-placeholder');
      var qrUrlEl=document.getElementById('qr-url');
      var joinUrl= location.origin + '/e/' + encodeURIComponent(evt.code);
      if(qrUrlEl) qrUrlEl.textContent=joinUrl;
      if(qrImg){
        var src='/api/events/'+encodeURIComponent(evt.code)+'/qr.png';
        if(qrImg.getAttribute('src')!==src){
          qrImg.src=src;
          qrImg.onload=function(){ qrImg.style.display='block'; if(qrPlace) qrPlace.style.display='none'; };
          qrImg.onerror=function(){ qrImg.style.display='none'; if(qrPlace) qrPlace.style.display='grid'; };
        }
      }
      // feedback open confetti
      var fbOpen = data.feedback && data.feedback.open;
      if(fbOpen && !prevFeedbackOpen) confettiBurst();
      prevFeedbackOpen = !!fbOpen;
    }
    currentState=data;
    if(evt && evt.show_podium){
      renderPodium(data);
    } else {
      renderPrompt(data.active_question || null);
    }
    renderQATop(data.qa || []);
    syncCountdown(data.active_question || null);
    var slide=data.current_slide || data.currentSlide || null;
    renderSlideIndicator(slide);
    tickCountdown();
  }

  function tickCountdown(){
    var pill=document.getElementById('countdown-pill');
    if(!pill) return;
    var active=currentState && currentState.active_question;
    var dl=deadlineMs(active);
    var hidden = !active || !dl || active.time_limit_s<=0 || active.status==='revealed' || active.status==='closed'
      || (currentState && currentState.event && currentState.event.show_podium);
    if(hidden){ pill.classList.add('hidden'); return; }
    pill.classList.remove('hidden');
    if(active.status==='locked'){ pill.textContent='⏱ Locked'; return; }
    var diff=Math.max(0, dl-Date.now());
    pill.textContent='⏱ '+Math.ceil(diff/1000)+'s';
  }
  setInterval(tickCountdown, 250);

  var ws=null; var wsBackoff=1000; var wsTimer=null;
  function wsUrl(){ return (location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/events/'+encodeURIComponent(code); }
  function fetchState(){
    if(!code) return;
    fetch('/api/events/'+encodeURIComponent(code)+'/state',{credentials:'same-origin'}).then(function(r){return r.json()}).then(applyState).catch(function(){});
  }
  var pollTimer=null;
  function startPollFallback(){
    if(pollTimer) return;
    pollTimer=setInterval(fetchState, 5000);
  }
  function stopPollFallback(){
    if(pollTimer){ clearInterval(pollTimer); pollTimer=null; }
  }
  function connect(){
    if(!code) return;
    if(typeof WebSocket==='undefined'){ startPollFallback(); return; }
    if(wsTimer){ clearTimeout(wsTimer); wsTimer=null; }
    try{ ws=new WebSocket(wsUrl()); }catch(e){ startPollFallback(); return; }
    ws.onopen=function(){ wsBackoff=1000; stopPollFallback(); };
    ws.onmessage=function(ev){
      try{
        var m=JSON.parse(ev.data);
        if(m.type==='slide'){
          var sd=m.data || m;
          var slide={index:sd.index, total:sd.total, title:sd.title||''};
          if(typeof slide.index==='number' && typeof slide.total==='number') renderSlideIndicator(slide);
          return;
        }
        if(m.type==='state' && m.data) applyState(m.data);
        else if(m.type==='ping'){ try{ ws.send(JSON.stringify({type:'pong'})); }catch(e){} }
      }catch(err){}
    };
    ws.onclose=function(){
      ws=null;
      if(!code) return;
      wsTimer=setTimeout(function(){ wsBackoff=Math.min(wsBackoff*2, 10000); connect(); }, wsBackoff);
    };
    ws.onerror=function(){ try{ ws.close(); }catch(e){} };
  }

  if(!code){
    document.getElementById('prompt-area').textContent='No code in URL. Open /live/YOURCODE';
  } else {
    document.getElementById('event-code').textContent=code;
    fetchState(); connect();
  }
})();
