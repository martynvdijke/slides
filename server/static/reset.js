(function(){
  var token=new URLSearchParams(location.search).get('token')||'';
  var form=document.getElementById('form-reset');
  var msg=document.getElementById('reset-msg');
  var input=document.getElementById('np');
  var help=document.getElementById('np-help');
  function setMsg(text, kind){
    msg.textContent=text;
    msg.className='msg'+(kind?' '+kind:'');
    if(help) help.style.display=text?'none':'';
  }
  if(!token){
    setMsg('Missing or invalid reset link. Request a new one from the sign-in page.','err');
    if(form) form.style.display='none';
    return;
  }
  if(input){
    input.addEventListener('input', function(){
      var v=input.value;
      if(!v) { if(help) help.textContent='Must be 8+ characters.'; setMsg('',''); return; }
      if(v.length<8) { if(help) {help.style.display=''; help.textContent=v.length+'/8 characters — keep typing.';} }
      else { if(help) {help.style.display=''; help.textContent='Looks good.'; help.style.color='var(--success)';} }
    });
  }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var pw=document.getElementById('np').value;
    if(pw.length<8){ setMsg('Password must be at least 8 characters','err'); input.focus(); return; }
    var btn=form.querySelector('button[type="submit"]');
    if(btn) { btn.disabled=true; btn.textContent='Saving…'; }
    setMsg('Saving…','');
    fetch('/api/auth/reset-password',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token:token,new_password:pw})}).then(function(r){
      return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'failed'); return j; });
    }).then(function(){
      setMsg('Password updated — redirecting to sign in…','ok');
      if(btn) btn.textContent='Done';
      setTimeout(function(){ location.href='/admin'; },1200);
    }).catch(function(err){
      setMsg(err.message||'Failed to reset — the link may have expired. Request a new one.','err');
      if(btn){ btn.disabled=false; btn.textContent='Set new password'; }
    });
  });
})();
