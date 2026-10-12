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
      var circ=2*Math.PI*26;
      ring.style.strokeDasharray=circ+'';
      ring.style.strokeDashoffset=String(circ*(1-pct));
      if(pct<=0.25) ring.style.stroke='var(--danger)';
      else if(pct<=0.5) ring.style.stroke='var(--warn)';
      else ring.style.stroke='var(--accent)';
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
  function tickRing(){
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
    countdownTimer=setInterval(tickRing, 1000);
  }

  var currentState=null;
  var participantsData={count:0, participants:[]};
  function escText(s){ return String(s||''); }
  function renderWaitingRoster(){
    var c=document.getElementById('waiting-roster');
    if(!c) return;
    c.textContent='';
    var count=participantsData && typeof participantsData.count==='number' ? participantsData.count : (participantsData.participants?participantsData.participants.length:0);
    var list=(participantsData && Array.isArray(participantsData.participants)) ? participantsData.participants : [];
    var pill=document.createElement('div');
    pill.id='waiting-roster-count';
    pill.className='pill live';
    pill.style.cssText='display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;font-weight:700;font-size:.92rem;margin-top:14px';
    pill.textContent = count===0 ? 'No one has joined yet' : (count===1 ? '1 waiting' : count+' waiting');
    c.appendChild(pill);
    if(!list.length){
      if(count===0){
        var hint=document.createElement('div'); hint.style.cssText='color:var(--muted);font-size:.9rem;margin-top:10px'; hint.textContent='Share the QR code to invite the audience.';
        c.appendChild(hint);
      }
      return;
    }
    var chips=document.createElement('div'); chips.id='waiting-roster-chips';
    chips.style.cssText='display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-height:220px;overflow:auto;margin-top:14px;padding:4px';
    var cap=40;
    var visible=list.slice(0,cap);
    visible.forEach(function(p){
      var chip=document.createElement('span');
      chip.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-weight:600;font-size:.88rem;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)';
      var em=document.createElement('span'); em.textContent=p.emoji||''; em.style.fontSize='1rem';
      var nm=document.createElement('span'); nm.textContent=escText(p.name)||'Anonymous'; nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis';
      if(em.textContent) chip.appendChild(em);
      chip.appendChild(nm); chips.appendChild(chip);
    });
    c.appendChild(chips);
    if(list.length>cap){
      var more=document.createElement('div'); more.style.cssText='color:var(--muted);font-size:.84rem;margin-top:8px;font-weight:600'; more.textContent='+'+(list.length-cap)+' more';
      c.appendChild(more);
    }
  }
  function fetchParticipants(){
    if(!code) return;
    fetch('/api/events/'+encodeURIComponent(code)+'/participants',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      participantsData={count: j.count||0, participants: Array.isArray(j.participants)?j.participants:[]};
      renderWaitingRoster();
    }).catch(function(){});
  }
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
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var root=document.getElementById('confetti');
    if(!root) return;
    root.classList.remove('hidden'); root.textContent='';
    for(var i=0;i<12;i++){
      var el=document.createElement('i');
      el.style.left=(Math.random()*100)+'vw';
      el.style.top='-10px';
      el.style.background = i%3===0 ? 'var(--accent)' : (i%3===1 ? 'var(--surface-3)' : 'rgba(255,255,255,.9)');
      el.style.animationDelay=(Math.random()*0.35)+'s';
      el.style.transform='rotate('+(Math.random()*360)+'deg)';
      root.appendChild(el);
    }
    setTimeout(function(){ root.classList.add('hidden'); root.textContent=''; }, 1500);
  }

  function renderMedia(container, q){
    if(!q || !q.media_url) return;
    var wrap=document.createElement('div'); wrap.style.marginBottom='18px';
    var el;
    if(q.media_type==='video'){
      el=document.createElement('video'); el.controls=true; el.muted=true; el.autoplay=true; el.loop=true; el.playsInline=true; el.src=q.media_url;
      el.style.width='100%'; el.style.maxHeight='420px'; el.style.borderRadius='10px'; el.style.border='1px solid var(--border)';
    } else {
      el=document.createElement('img'); el.src=q.media_url; el.alt=q.prompt||'question media';
      el.style.maxWidth='100%'; el.style.maxHeight='420px'; el.style.borderRadius='10px'; el.style.border='1px solid var(--border)';
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
      var w=document.createElement('div'); w.className='waiting'; w.style.minHeight='380px';
      var orb=document.createElement('div'); orb.className='orb'; orb.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l7 4v8l-7 4-7-4V7z"/><circle cx="12" cy="12" r="3"/></svg>';
      var h=document.createElement('h3'); h.textContent='Waiting for the host…'; h.style.fontSize='1.45rem'; h.style.fontWeight='700'; h.style.letterSpacing='-.03em';
      var p=document.createElement('p'); p.textContent='The host will launch the next question. Results and Q&A update live.'; p.style.color='var(--muted)';
      w.appendChild(orb); w.appendChild(h); w.appendChild(p);
      var roster=document.createElement('div'); roster.id='waiting-roster'; roster.style.cssText='width:100%;display:flex;flex-direction:column;align-items:center;margin-top:2px';
      w.appendChild(roster); area.appendChild(w);
      if(counter) counter.textContent='— responses';
      try{ renderWaitingRoster(); }catch(e){}
      return;
    }
    renderMedia(area, active);
    var h2=document.createElement('h2'); h2.className='live-prompt big'; h2.textContent=active.prompt; area.appendChild(h2);
    var locked = active.status==='locked';
    var meta=document.createElement('div'); meta.className='live-meta'; meta.style.marginTop='16px';
    var pill=document.createElement('span'); pill.className='pill'; pill.style.fontSize='.78rem'; pill.textContent=locked ? 'locked' : active.kind;
    if(!locked) pill.className='pill live';
    var tot=document.createElement('span'); tot.style.cssText='color:var(--muted);font-size:.88rem;font-variant-numeric:tabular-nums';
    tot.textContent= locked ? 'Answers locked' : (canReveal(active) ? (active.total+' responses') : 'Results hidden until revealed');
    meta.appendChild(pill); meta.appendChild(tot); area.appendChild(meta);
    var cdWrap=document.createElement('div'); cdWrap.id='projector-countdown'; cdWrap.className='hidden';
    cdWrap.style.cssText='display:none;align-items:center;gap:14px;margin-top:16px;padding:12px 14px;border-radius:10px';
    var ringSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'); ringSvg.setAttribute('width','56'); ringSvg.setAttribute('height','56'); ringSvg.setAttribute('viewBox','0 0 60 60'); ringSvg.style.flexShrink='0'; ringSvg.style.transform='rotate(-90deg)';
    var bgCircle=document.createElementNS('http://www.w3.org/2000/svg','circle'); bgCircle.setAttribute('cx','30'); bgCircle.setAttribute('cy','30'); bgCircle.setAttribute('r','26'); bgCircle.setAttribute('fill','none'); bgCircle.setAttribute('stroke','var(--border)'); bgCircle.setAttribute('stroke-width','5');
    var fgCircle=document.createElementNS('http://www.w3.org/2000/svg','circle'); fgCircle.id='countdown-ring'; fgCircle.setAttribute('cx','30'); fgCircle.setAttribute('cy','30'); fgCircle.setAttribute('r','26'); fgCircle.setAttribute('fill','none'); fgCircle.setAttribute('stroke','var(--accent)'); fgCircle.setAttribute('stroke-width','5'); fgCircle.setAttribute('stroke-linecap','round'); fgCircle.style.transition='stroke-dashoffset .9s linear, stroke .3s'; fgCircle.style.transformOrigin='center';
    ringSvg.appendChild(bgCircle); ringSvg.appendChild(fgCircle);
    var cdInfo=document.createElement('div'); cdInfo.style.display='grid'; cdInfo.style.gap='2px';
    var cdLabel=document.createElement('div'); cdLabel.style.fontSize='.72rem'; cdLabel.style.color='var(--muted)'; cdLabel.style.fontWeight='600'; cdLabel.style.letterSpacing='.06em'; cdLabel.style.textTransform='uppercase'; cdLabel.textContent='Time left';
    var cdVal=document.createElement('div'); cdVal.id='projector-countdown-value'; cdVal.style.fontSize='1.35rem'; cdVal.style.fontWeight='800'; cdVal.style.letterSpacing='-.03em'; cdVal.style.fontVariantNumeric='tabular-nums'; cdVal.textContent='--:--';
    cdInfo.appendChild(cdLabel); cdInfo.appendChild(cdVal);
    cdWrap.appendChild(ringSvg); cdWrap.appendChild(cdInfo);
    area.appendChild(cdWrap);
    if(counter) counter.textContent = locked ? 'Answers locked' : (canReveal(active) ? (active.total+' responses') : 'Live');

    if(locked){
      var lock=document.createElement('div'); lock.className='waiting'; lock.style.minHeight='200px'; lock.style.padding='28px 18px';
      var lockOrb=document.createElement('div'); lockOrb.className='orb'; lockOrb.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><rect x="5" y="10" width="14" height="10" rx="2"/></svg>';
      var lockH=document.createElement('h3'); lockH.textContent="Time's up — answers locked"; lockH.style.fontSize='1.2rem';
      var lockP=document.createElement('p'); lockP.textContent='Waiting for the host to reveal the correct answer…'; lockP.style.color='var(--muted)';
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
        var hint=document.createElement('div'); hint.style.cssText='color:var(--success);font-size:.92rem;font-weight:700;margin-top:14px';
        hint.textContent='Correct answer: '+((active.kind==='yesno')?(cl.charAt(0).toUpperCase()+cl.slice(1)):cl); results.appendChild(hint);
      }
    }
  }

  function renderNpsBadge(container, active){
    if(!canReveal(active)) return;
    if(active.nps===null || active.nps===undefined) return;
    var b=document.createElement('div'); b.className='pill live'; b.style.cssText='margin-top:16px;font-size:.95rem;font-weight:700'; b.textContent='NPS '+active.nps;
    container.appendChild(b);
  }

  function renderRanking(container, active){
    if(!canReveal(active)) return;
    var res=active.results||[];
    if(!res.length) return;
    var max=Math.max.apply(null, res.map(function(r){return r.score||0}))||1;
    var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='10px'; wrap.style.marginTop='16px';
    res.forEach(function(r, idx){
      var row=document.createElement('div'); row.style.display='grid'; row.style.gap='6px';
      var head=document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.gap='12px'; head.style.fontSize='.9rem';
      var lab=document.createElement('strong'); lab.style.letterSpacing='-.02em'; lab.textContent=(idx+1)+'. '+r.label;
      var cnt=document.createElement('span'); cnt.style.color='var(--muted)'; cnt.style.fontVariantNumeric='tabular-nums'; cnt.textContent=(r.score||0)+' pts · avg '+(r.avg_rank?r.avg_rank.toFixed(1):'0');
      head.appendChild(lab); head.appendChild(cnt);
      var track=document.createElement('div'); track.className='track'; track.style.height='10px';
      var fill=document.createElement('div'); fill.className='fill'; fill.style.height='100%'; fill.style.width='0'; fill.style.background='var(--accent)'; fill.style.transition='width .85s var(--ease)';
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
    var wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gap='10px';
    res.forEach(function(r){
      var isCorrect = cl!==null && String(r.label).toLowerCase()===cl.toLowerCase();
      var row=document.createElement('div'); row.style.display='grid'; row.style.gap='6px';
      var head=document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.gap='12px'; head.style.fontSize='.92rem';
      var lab=document.createElement('strong'); lab.style.letterSpacing='-.02em'; lab.textContent= isCorrect ? (r.label+' ✓') : r.label;
      var pct = active.total ? Math.round(r.count/active.total*100) : 0;
      var cnt=document.createElement('span'); cnt.style.color='var(--muted)'; cnt.style.fontVariantNumeric='tabular-nums'; cnt.textContent= r.count+' · '+pct+'%';
      head.appendChild(lab); head.appendChild(cnt);
      var track=document.createElement('div'); track.className='track'; track.style.height='10px';
      var fill=document.createElement('div'); fill.className='fill'; fill.style.height='100%'; fill.style.width='0'; fill.style.transition='width .85s var(--ease)';
      fill.style.background = isCorrect ? 'var(--success)' : 'var(--accent)';
      if(isCorrect){ lab.style.color='var(--success)'; }
      track.appendChild(fill); row.appendChild(head); row.appendChild(track); wrap.appendChild(row);
      requestAnimationFrame(function(){ fill.style.width = pct+'%'; });
    });
    container.appendChild(wrap);
  }

  function renderCloud(container, active){
    if(!canReveal(active)) return;
    var res=(active.results||[]).filter(function(r){return r.count>0});
    var box=document.createElement('div'); box.className='cloud'; box.style.marginTop='16px'; box.style.minHeight='80px';
    if(!res.length){
      var e=document.createElement('span'); e.style.color='var(--muted)'; e.textContent='Word cloud will appear as answers come in…'; box.appendChild(e);
    } else {
      var max=Math.max.apply(null, res.map(function(r){return r.count}));
      res.sort(function(a,b){return b.count-a.count});
      res.forEach(function(r, i){
        var s=document.createElement('span'); s.className='cloud-item';
        var scale=1 + (r.count/max)*0.65;
        s.style.fontSize=(0.88*scale)+'rem';
        s.style.animationDelay=(i*26)+'ms';
        if(i===0){ s.style.background='var(--accent-soft)'; s.style.color='var(--accent)'; s.style.borderColor='rgba(79,124,255,.28)'; }
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
      var empty=document.createElement('div'); empty.style.color='var(--muted)'; empty.style.fontSize='.84rem'; empty.textContent='No questions yet.';
      root.appendChild(empty); return;
    }
    var sorted=list.slice().sort(function(a,b){return b.votes-a.votes}).slice(0,10);
    sorted.forEach(function(q, idx){
      var row=document.createElement('div'); row.className='qa-rank-item';
      var num=document.createElement('div'); num.className='qa-rank-num'; num.textContent=String(idx+1);
      var body=document.createElement('div'); body.style.flex='1'; body.style.minWidth='0';
      var txt=document.createElement('div'); txt.style.fontWeight='600'; txt.style.lineHeight='1.35'; txt.style.fontSize='.9rem'; txt.textContent=q.body;
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
    var head=document.createElement('h2'); head.style.cssText='font-size:1.75rem;font-weight:800;letter-spacing:-.03em;margin:0 0 6px';
    head.textContent='Leaderboard';
    area.appendChild(head);
    var entries=(data.leaderboard||[]).slice();
    if(!entries.length){
      var w=document.createElement('div'); w.className='waiting'; w.style.minHeight='280px';
      var wh=document.createElement('h3'); wh.textContent='No scores yet';
      var wp=document.createElement('p'); wp.textContent='Play a quiz question to populate the podium.'; wp.style.color='var(--muted)';
      w.appendChild(wh); w.appendChild(wp); area.appendChild(w);
      return;
    }
    var top=entries.slice(0,3);
    var rest=entries.slice(3);
    var order=[];
    if(top[1]) order.push(top[1]);
    if(top[0]) order.push(top[0]);
    if(top[2]) order.push(top[2]);
    var medals={1:{h:'176px',bg:'var(--surface-2)',medal:'1'},2:{h:'132px',bg:'var(--surface-1)',medal:'2'},3:{h:'108px',bg:'var(--surface-1)',medal:'3'}};
    var podium=document.createElement('div');
    podium.style.cssText='display:flex;align-items:flex-end;justify-content:center;gap:16px;margin:24px 0 10px;flex-wrap:wrap';
    order.forEach(function(e){
      var rank=e.rank||0;
      var m=medals[rank]||{h:'92px',bg:'var(--surface-1)',medal:String(rank)};
      var col=document.createElement('div'); col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px;min-width:156px';
      var emoji=document.createElement('div'); emoji.style.cssText='font-size:2rem;line-height:1'; emoji.textContent=e.emoji||'';
      var name=document.createElement('div'); name.style.cssText='font-weight:700;font-size:.98rem;text-align:center;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; name.textContent=e.name||'Anonymous';
      var block=document.createElement('div'); block.style.cssText='width:156px;height:'+m.h+';border-radius:10px 10px 0 0;background:'+m.bg+';border:1px solid var(--border);border-bottom:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px';
      if(rank===1){ block.style.borderColor='rgba(79,124,255,.35)'; block.style.background='var(--accent-soft)'; }
      var med=document.createElement('div'); med.style.cssText='font-size:.9rem;font-weight:800;color:var(--muted)'; med.textContent='#'+m.medal;
      if(rank===1) med.style.color='var(--accent)';
      var pts=document.createElement('div'); pts.style.cssText='font-weight:800;font-size:1.15rem;letter-spacing:-.02em'; pts.textContent=(e.points||0)+' pts';
      block.appendChild(med); block.appendChild(pts);
      if(emoji.textContent) col.appendChild(emoji);
      col.appendChild(name); col.appendChild(block); podium.appendChild(col);
    });
    area.appendChild(podium);
    if(rest.length){
      var list=document.createElement('div'); list.style.cssText='display:grid;gap:8px;max-width:560px;margin:10px auto 0';
      rest.forEach(function(e){
        var row=document.createElement('div'); row.style.cssText='display:flex;align-items:center;gap:12px;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:10px 14px';
        var rk=document.createElement('span'); rk.style.cssText='font-weight:700;color:var(--muted);width:2rem;font-variant-numeric:tabular-nums;font-size:.84rem'; rk.textContent='#'+(e.rank||0);
        var em=document.createElement('span'); em.style.cssText='font-size:1.1rem'; em.textContent=e.emoji||'';
        var nm=document.createElement('span'); nm.style.cssText='flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.92rem'; nm.textContent=e.name||'Anonymous';
        var pt=document.createElement('span'); pt.style.cssText='font-weight:700;font-variant-numeric:tabular-nums'; pt.textContent=(e.points||0)+' pts';
        row.appendChild(rk); if(em.textContent) row.appendChild(em); row.appendChild(nm); row.appendChild(pt); list.appendChild(row);
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
    if(active.status==='locked'){ pill.textContent='Locked'; return; }
    var diff=Math.max(0, dl-Date.now());
    pill.textContent='⏱ '+Math.ceil(diff/1000)+'s';
  }
  setInterval(tickCountdown, 250);

  var ws=null; var wsBackoff=1000; var wsTimer=null;
  function wsUrl(){ return (location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/events/'+encodeURIComponent(code)+'?observer=1'; }
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
        if(m.type==='participants' && m.data){
          participantsData={count: m.data.count||0, participants: Array.isArray(m.data.participants)?m.data.participants:[]};
          renderWaitingRoster();
          return;
        }
        if(m.type==='nav' && m.data && typeof m.data.index==='number'){
          return;
        }
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
    fetchState(); fetchParticipants(); connect();
  }
})();
