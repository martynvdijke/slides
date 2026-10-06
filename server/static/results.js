/* Public results page: fetches the published results snapshot for the event
   code in the URL and renders it read-only. No participant identifiers are
   ever present in the payload; everything here is aggregate data. */
(function(){
  'use strict';

  var code=(function(){
    var parts=location.pathname.split('/').filter(Boolean); // ["results", "<code>"]
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
    if(ev.code) meta.appendChild(el('span','pill',ev.code));
    var d=fmtDate(ev.event_date);
    if(d) meta.appendChild(el('span',null,d));
    if(ev.description) meta.appendChild(el('span',null,ev.description));
  }

  function statCard(label,value){
    var card=el('div','glass','');
    card.style.padding='12px 14px';
    card.appendChild(el('div','font-extrabold','')).textContent=String(value);
    var l=el('div',null,label); l.style.color='var(--muted)'; l.style.fontSize='.78rem';
    card.appendChild(l);
    return card;
  }

  function renderStats(stats){
    var host=document.getElementById('results-stats');
    clear(host);
    host.appendChild(el('h2','font-bold','Participation'));
    var grid=el('div','grid','');
    grid.style.gridTemplateColumns='repeat(auto-fit,minmax(120px,1fr))';
    grid.style.gap='10px';
    grid.style.marginTop='10px';
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
    if(opts.correct) name.textContent=label+' ✓';
    if(opts.correct) name.style.color='#6EE7B7';
    head.appendChild(name);
    var val=el('span',null,count+(opts.suffix?' '+opts.suffix:''));
    val.style.color='var(--muted)';
    head.appendChild(val);
    row.appendChild(head);
    var track=el('div','track','');
    var fill=el('div','fill','');
    fill.style.width=pct(count,total)+'%';
    if(opts.correct) fill.style.background='linear-gradient(135deg,#10B981,#22D3EE)';
    track.appendChild(fill);
    row.appendChild(track);
    return row;
  }

  function renderQuestion(q){
    var card=el('div','glass card-pad','');
    var head=el('div',null,'');
    head.style.display='flex';
    head.style.justifyContent='space-between';
    head.style.gap='10px';
    head.style.alignItems='baseline';
    var prompt=el('h3','font-bold',q.prompt||'Question');
    prompt.style.margin='0';
    head.appendChild(prompt);
    head.appendChild(el('span','pill',q.kind));
    card.appendChild(head);

    var meta=el('div',null,(q.respondents||0)+' respondent'+((q.respondents===1)?'':'s')+' · '+(q.total||0)+' answer'+((q.total===1)?'':'s'));
    meta.style.color='var(--muted)';
    meta.style.fontSize='.78rem';
    meta.style.margin='4px 0 10px';
    card.appendChild(meta);

    var results=q.results||[];
    var total=q.total||0;

    if(q.kind==='wordcloud'){
      if(!results.length){ card.appendChild(el('p',null,'No answers yet.')); return card; }
      var cloud=el('div','','');
      cloud.style.display='flex';
      cloud.style.flexWrap='wrap';
      cloud.style.gap='6px';
      var max=results[0].count||1;
      results.forEach(function(r){
        var chip=el('span','pill',r.label+' '+r.count);
        var scale=1+Math.round((r.count/max)*0.9*10)/10;
        chip.style.fontSize=Math.min(1.6,scale*0.9)+'rem';
        cloud.appendChild(chip);
      });
      card.appendChild(cloud);
      return card;
    }

    if(q.kind==='nps'){
      if(q.nps!==undefined && q.nps!==null){
        var badge=el('div',null,'NPS '+(q.nps>0?'+':'')+q.nps);
        badge.style.fontWeight='800';
        badge.style.fontSize='1.5rem';
        badge.style.color=q.nps>=0?'#6EE7B7':'#FCA5A5';
        card.appendChild(badge);
      }
      var npsWrap=el('div','grid','');
      npsWrap.style.gap='6px';
      results.forEach(function(r){ npsWrap.appendChild(barRow(r.label,r.count,total)); });
      card.appendChild(npsWrap);
      return card;
    }

    if(q.kind==='ranking'){
      if(!results.length){ card.appendChild(el('p',null,'No answers yet.')); return card; }
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

    // poll / rating / yesno / multi / open share the bar list.
    if(!results.length){ card.appendChild(el('p',null,'No answers yet.')); return card; }
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
    host.appendChild(el('h2','font-bold','Q&A'));
    if(!qa||!qa.length){
      var p=el('p',null,'No answered questions yet.'); p.style.color='var(--muted)';
      host.appendChild(p);
      return;
    }
    var list=el('div','grid','');
    list.style.gap='8px';
    list.style.marginTop='8px';
    qa.forEach(function(item){
      var row=el('div','qa-item','');
      row.style.padding='10px 12px';
      row.appendChild(el('div','qa-body',item.body||''));
      var meta=el('div','qa-meta','');
      meta.style.marginTop='4px';
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
    host.appendChild(el('h2','font-bold','Top scores'));
    if(!entries||!entries.length){
      var p=el('p',null,'No scores yet.'); p.style.color='var(--muted)';
      host.appendChild(p);
      return;
    }
    var list=el('div','grid','');
    list.style.gap='6px';
    list.style.marginTop='8px';
    var medals={1:'🥇',2:'🥈',3:'🥉'};
    entries.forEach(function(e){
      var row=el('div','lb-row','');
      row.style.display='flex';
      row.style.alignItems='center';
      row.style.gap='10px';
      row.style.padding='6px 8px';
      var rank=el('span',null,medals[e.rank]||('#'+e.rank));
      rank.style.width='34px';
      rank.style.fontWeight='700';
      row.appendChild(rank);
      row.appendChild(el('span',null,e.emoji||'🙂'));
      row.appendChild(el('span',null,e.name||'Anonymous'));
      var pts=el('span',null,e.points+' pts');
      pts.style.marginLeft='auto';
      pts.style.fontWeight='700';
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
