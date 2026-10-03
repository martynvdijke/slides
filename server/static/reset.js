 (function(){
  var token=new URLSearchParams(location.search).get('token')||'';
  var form=document.getElementById('form-reset');
  var msg=document.getElementById('reset-msg');
  if(!token){ msg.textContent='Missing token.'; form.style.display='none'; return; }
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var pw=document.getElementById('np').value;
    if(pw.length<8){ msg.textContent='Password must be at least 8 characters'; return; }
    msg.textContent='Saving…';
    fetch('/api/auth/reset-password',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token:token,new_password:pw})}).then(function(r){
      return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'failed'); return j; });
    }).then(function(){ msg.textContent='Password updated — you can now log in.'; setTimeout(function(){ location.href='/admin'; },1200); }).catch(function(err){ msg.textContent=err.message||'Failed'; });
  });
})();
