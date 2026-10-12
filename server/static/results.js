/* Public results page: fetches the published results snapshot for the event
   code in the URL and renders it read-only. No participant identifiers are
   ever present in the payload; everything here is aggregate data. */
(function(){
  'use strict';

  var code=(function(){
    var parts=location.pathname.split('/').filter(Boolean);
    return parts.length>1 ? decodeURIComponent(parts[parts.length-1]) : '';
  })();

  function el(tag, cls, text){
    var n=document.createElement(tag);
    if(cls) n.className=cls;
    if(text!==undefined && text!==null) n.textContent=String(text);
    return n;
  }
  function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); }
  function fmtDate(s){
    if(!s) return '';
    var d=new Date(s);
    if(isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  }
  function pct(count,total){ return total>0 ? Math.round((count/total)*100) : 0; }

  function showError(msg){
    var box=document.getElementById('results-error');
    box.textContent=msg;
    box.classList.remove('hidden');
    document.getElementById('results-content').classList.add('hidden');
    document.getElementById('results-name').textContent='Results';
  }

  function renderHeader(ev){
    document.title='Results — '+(ev.name||'Event');
    document.getElementById('results-name').textContent=ev.name||'Event';
    var meta=document.getElementById('results-meta');
    clear(meta);
    if(ev.code){
      var codePill=el('span','pill',ev.code);
      codePill.style.fontFamily='var(--font-mono)'; codePill.style.letterSpacing='.04em'; codePill.style.textTransform='none';
      meta.appendChild(codePill);
    }
    var d=fmtDate(ev.event_date);
    if(d) meta.appendChild(el('span',null,d));
    if(ev.description){
      var desc=el('span',null,ev.description);
      desc.style.color='var(--muted)';
      meta.appendChild(desc);
    }
  }

  function statCard(label,value){
    var card=el('div','glass','');
    card.style.padding='14px 16px';
    card.style.borderRadius='10px';
    var v=el('div',null,String(value));
    v.style.fontWeight='800'; v.style.fontSize='1.35rem'; v.style.letterSpacing='-.03em'; v.style.lineHeight='1'; v.style.fontVariantNumeric='tabular-nums';
    card.appendChild(v);
    var l=el('div',null,label); l.style.color='var(--muted)'; l.style.fontSize='.74rem'; l.style.fontWeight='600'; l.style.letterSpacing='.06em'; l.style.textTransform='uppercase'; l.style.marginTop='4px';
    card.appendChild(l);
    return card;
  }

  function renderStats(stats){
    var host=document.getElementById('results-stats');
    clear(host);
    var h=el('h2',null,'Participation'); h.className='section-h'; host.appendChild(h);
    var sub=el('p',null,'Headline totals across the event.'); sub.className='section-desc'; sub.style.marginBottom='12px'; host.appendChild(sub);
    var grid=el('div','grid','');
    grid.style.gridTemplateColumns='repeat(auto-fit,minmax(124px,1fr))';
    grid.style.gap='10px';
    grid.appendChild(statCard('Participants',stats.participants||0));
    grid.appendChild(statCard('Answers',stats.answers||0));
    grid.appendChild(statCard('Questions',stats.questions||0));
    grid.appendChild(statCard('Q&A',stats.qa||0));
    grid.appendChild(statCard('Upvotes',stats.votes||0));
    if(stats.response_rate){
      grid.appendChild(statCard('Response rate',Math.round(stats.response_rate)+'%'));
    }
    host.appendChild(grid);
  }

  function barRow(label,count,total,opts){
    opts=opts||{};
    var row=el('div','result-row','');
    var head=el('div',null,'');
    head.style.display='flex';
    head.style.justifyContent='space-between';
    head.style.gap='10px';
    head.style.fontSize='.86rem';
    var name=el('span',null,label);
    name.style.fontWeight='600';
    if(opts.correct) name.textContent=label+' ✓';
    if(opts.correct) name.style.color='var(--success)';
    head.appendChild(name);
    var val=el('span',null,count+(opts.suffix?' '+opts.suffix:''));
    val.style.color='var(--muted)'; val.style.fontVariantNumeric='tabular-nums';
    head.appendChild(val);
    row.appendChild(head);
    var track=el('div','track','');
    track.style.height='8px';
    var fill=el('div','fill','');
    fill.style.width=pct(count,total)+'%';
    fill.style.background = opts.correct ? 'var(--success)' : 'var(--accent)';
    track.appendChild(fill);
    row.appendChild(track);
    return row;
  }

  function renderQuestion(q){
    var card=el('div','q-card','');
    var head=el('div',null,'');
    head.style.display='flex';
    head.style.justifyContent='space-between';
    head.style.gap='10px';
    head.style.alignItems='flex-start';
    var prompt=el('h3',null,q.prompt||'Question');
    prompt.style.margin='0'; prompt.style.fontWeight='700'; prompt.style.letterSpacing='-.02em'; prompt.style.fontSize='1rem'; prompt.style.lineHeight='1.3';
    head.appendChild(prompt);
    var kindPill=el('span','pill',q.kind); kindPill.style.fontSize='.72rem'; kindPill.style.flexShrink='0';
    head.appendChild(kindPill);
    card.appendChild(head);

    var meta=el('div',null,(q.respondents||0)+' respondent'+((q.respondents===1)?'':'s')+' · '+(q.total||0)+' answer'+((q.total===1)?'':'s'));
    meta.style.color='var(--muted)';
    meta.style.fontSize='.78rem';
    meta.style.margin='4px 0 12px';
    card.appendChild(meta);

    var results=q.results||[];
    var total=q.total||0;

    if(q.kind==='wordcloud'){
      if(!results.length){ var p=el('p',null,'No answers yet.'); p.style.color='var(--muted)'; card.appendChild(p); return card; }
      var cloud=el('div','','');
      cloud.style.display='flex';
      cloud.style.flexWrap='wrap';
      cloud.style.gap='6px';
      var max=results[0].count||1;
      results.forEach(function(r){
        var chip=el('span','pill',r.label+' · '+r.count);
        chip.style.fontSize='.84rem'; chip.style.background='var(--surface-2)';
        cloud.appendChild(chip);
      });
      card.appendChild(cloud);
      return card;
    }

    if(q.kind==='nps'){
      if(q.nps!==undefined && q.nps!==null){
        var badge=el('div','pill live', 'NPS '+(q.nps>0?'+':'')+q.nps);
        badge.style.fontWeight='700'; badge.style.marginBottom='10px'; badge.style.display='inline-flex';
        card.appendChild(badge);
      }
      var npsWrap=el('div','grid','');
      npsWrap.style.gap='6px';
      results.forEach(function(r){ npsWrap.appendChild(barRow(r.label,r.count,total)); });
      card.appendChild(npsWrap);
      return card;
    }

    if(q.kind==='ranking'){
      if(!results.length){ var ep=el('p',null,'No answers yet.'); ep.style.color='var(--muted)'; card.appendChild(ep); return card; }
      var wrap=el('div','grid','');
      wrap.style.gap='6px';
      results.forEach(function(r){
        var suffix=Math.round(r.score||0)+' pts';
        if(r.avg_rank) suffix+=' · avg #'+(Math.round(r.avg_rank*10)/10);
        wrap.appendChild(barRow(r.label,r.count,total,{suffix:suffix}));
      });
      card.appendChild(wrap);
      return card;
    }

    if(!results.length){ var np=el('p',null,'No answers yet.'); np.style.color='var(--muted)'; card.appendChild(np); return card; }
    var list=el('div','grid','');
    list.style.gap='6px';
    results.forEach(function(r){
      var correct=typeof q.correct_index==='number' && (q.kind==='yesno'
        ? String(r.label).toLowerCase()===((q.correct_index===0)?'yes':'no')
        : String(r.label)===String((q.options||[])[q.correct_index]));
      list.appendChild(barRow(r.label,r.count,total,{correct:correct}));
    });
    card.appendChild(list);
    return card;
  }

  function renderQuestions(questions){
    var host=document.getElementById('results-questions');
    clear(host);
    var title=el('h2',null,'Questions'); title.className='section-h'; title.style.marginLeft='2px';
    var sub=el('p',null,'Per-question aggregates.'); sub.className='section-desc'; sub.style.margin='0 0 8px 2px';
    host.appendChild(title); host.appendChild(sub);
    var list=(questions||[]).filter(function(q){ return q.status!=='draft'; });
    if(!list.length){
      var empty=el('div','glass card-pad','No questions were asked at this event.');
      empty.style.color='var(--muted)';
      host.appendChild(empty);
      return;
    }
    list.forEach(function(q){ host.appendChild(renderQuestion(q)); });
  }

  function renderQA(qa){
    var host=document.getElementById('results-qa');
    clear(host);
    var h=el('h2',null,'Q&A highlights'); h.className='section-h'; host.appendChild(h);
    var sub=el('p',null,'Top audience questions by votes.'); sub.className='section-desc'; sub.style.marginBottom='10px'; host.appendChild(sub);
    if(!qa||!qa.length){
      var p=el('p',null,'No answered questions yet.'); p.style.color='var(--muted)';
      host.appendChild(p);
      return;
    }
    var list=el('div','grid','');
    list.style.gap='8px';
    qa.forEach(function(item){
      var row=el('div','qa-item','');
      row.style.padding='12px 14px';
      row.appendChild(el('div','qa-body',item.body||''));
      var meta=el('div','qa-meta','');
      meta.style.marginTop='6px';
      meta.style.color='var(--muted)';
      meta.style.fontSize='.78rem';
      var who=item.author?('— '+item.author):'— Anonymous';
      meta.textContent=who+' · '+(item.votes||0)+' upvote'+((item.votes===1)?'':'s')+(item.status==='answered'?' · answered':'');
      row.appendChild(meta);
      list.appendChild(row);
    });
    host.appendChild(list);
  }

  function renderLeaderboard(entries){
    var host=document.getElementById('results-leaderboard');
    clear(host);
    var h=el('h2',null,'Leaderboard'); h.className='section-h'; host.appendChild(h);
    var sub=el('p',null,'Top scores from quiz questions.'); sub.className='section-desc'; sub.style.marginBottom='10px'; host.appendChild(sub);
    if(!entries||!entries.length){
      var p=el('p',null,'No scores yet.'); p.style.color='var(--muted)';
      host.appendChild(p);
      return;
    }
    var list=el('div','grid','');
    list.style.gap='6px';
    entries.forEach(function(e){
      var row=el('div','','');
      row.style.display='flex';
      row.style.alignItems='center';
      row.style.gap='10px';
      row.style.padding='8px 10px';
      row.style.borderRadius='10px';
      row.style.background='var(--surface-1)';
      row.style.border='1px solid var(--border)';
      var rank=el('span',null, e.rank<=3 ? ('#'+e.rank) : ('#'+e.rank));
      rank.style.width='32px'; rank.style.fontWeight='700'; rank.style.fontSize='.84rem'; rank.style.color='var(--muted)'; rank.style.fontVariantNumeric='tabular-nums';
      if(e.rank===1) rank.style.color='var(--accent)';
      row.appendChild(rank);
      if(e.emoji) row.appendChild(el('span',null,e.emoji));
      var nm=el('span',null,e.name||'Anonymous'); nm.style.fontWeight='600'; nm.style.flex='1'; nm.style.minWidth='0'; nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.style.whiteSpace='nowrap';
      row.appendChild(nm);
      var pts=el('span',null,e.points+' pts');
      pts.style.fontWeight='700'; pts.style.fontVariantNumeric='tabular-nums';
      row.appendChild(pts);
      list.appendChild(row);
    });
    host.appendChild(list);
  }

  function render(data){
    renderHeader(data.event||{});
    renderStats(data.stats||{});
    renderQuestions(data.questions||[]);
    renderQA(data.qa||[]);
    renderLeaderboard(data.leaderboard||[]);
    document.getElementById('results-content').classList.remove('hidden');
    document.getElementById('results-error').classList.add('hidden');
  }

  if(!code){
    showError('No event code in this link.');
    return;
  }

  fetch('/api/events/'+encodeURIComponent(code)+'/results',{credentials:'same-origin'}).then(function(r){
    if(r.status===404){ throw {friendly:true,msg:'Results for this event are not published yet. Ask your host for the link after the event.'}; }
    if(!r.ok) throw {friendly:true,msg:'Could not load results right now. Please try again later.'};
    return r.json();
  }).then(function(data){
    render(data);
  }).catch(function(err){
    showError((err&&err.msg)||'Could not load results right now. Please try again later.');
  });
})();
