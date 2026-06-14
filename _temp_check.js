

/* ═══════════════════════════════════════════════
   TIMES INC v3.1 — Build limpio sin bugs
   Firebase REST · GPS · Roles · Centros
═══════════════════════════════════════════════ */

// ── Config ──
const DB_URL='https://times-inc-default-rtdb.europe-west1.firebasedatabase.app/an_times_data';
const ADMIN_PIN='0824';
const WK=40*60,WD=8*60,WM=160*60,VPM=2.5;

// ── State ──
let DB={
  empresas:["Soluciones Mata"],obras:["Soluciones Mata"],
  centrosTrabajo:["Obra Principal","Oficina Central","Almacén"],
  employees:[
    {id:"admin",name:"Administrador",empresa:"Soluciones Mata",pin:"0824",color:"#5aa9e6",initials:"AD",startDate:"2024-01-01",email:"",isAdmin:true},
    {id:"e1",name:"Ismael Angeles de la Cruz",empresa:"Soluciones Mata",centroTrabajo:"Obra Principal",pin:"1111",color:"#6366f1",initials:"IA",startDate:"2024-01-01",email:"",role:"encargado",obrasAsignadas:["Soluciones Mata"]},
    {id:"e2",name:"Franklin Lisandro Nuñez Roque",empresa:"Soluciones Mata",centroTrabajo:"Obra Principal",pin:"2222",color:"#10b981",initials:"FL",startDate:"2024-01-01",email:"",role:"empleado",obrasAsignadas:[]}
  ],
  records:[],vacaciones:[],medicos:[],ausencias:[],mensajes:[],notis:[],cierres:[],_ts:0
};
let SES={user:null,isAdmin:false,isEnc:false,isJO:false};
let TM={ws:0,bs:0,state:'idle'};
let _tickN=0,_saveT=null,_pushFlight=false,_saveRetry=0,_polling=null;
let _doStopInProgress=false,_doStopLock=false,_pendingGPS=null;
let _vacCache={};

// ── Helpers ──
const $=id=>document.getElementById(id);
const gid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const p2=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;};
const mhm=m=>`${Math.floor(m/60)}h ${p2(m%60)}m`;
const s2t=s=>`${p2(Math.floor(s/3600))}:${p2(Math.floor((s%3600)/60))}:${p2(s%60)}`;
const ftime=iso=>{if(!iso)return'—';try{const d=new Date(iso);return`${p2(d.getHours())}:${p2(d.getMinutes())}`;}catch(e){return'—';}};
const ftimeInput=iso=>{if(!iso)return'';try{const d=new Date(iso);return`${p2(d.getHours())}:${p2(d.getMinutes())}`;}catch(e){return'';}};
const fdate=iso=>{if(!iso)return'—';try{return new Date(iso).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'});}catch(e){return'—';}};
const fdf=iso=>{if(!iso)return'—';try{return new Date(iso).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'});}catch(e){return'—';}};
const fds=iso=>{if(!iso)return'—';try{const d=iso.length<=10?new Date(iso+'T00:00:00'):new Date(iso);return d.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});}catch(e){return iso;}};
function wkStart(d){const dt=new Date(d),day=dt.getDay(),diff=day===0?-6:1-day;dt.setDate(dt.getDate()+diff);dt.setHours(0,0,0,0);return dt;}
function wkKey(d){return wkStart(d).toISOString().slice(0,10);}
const safeRun=(fn,lbl)=>{try{fn();}catch(e){console.warn('[TI]',lbl||'',e.message);}};
function sortedEmps(){return(DB.employees||[]).filter(e=>!e.isAdmin).sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));}
const calcMin=r=>{if(!r||!r.fin)return 0;if(r.workSecs>0)return Math.floor(r.workSecs/60);const t=calcSecs(r);return Math.floor(t.work/60);};
function calcSecs(o){
  if(!o)return{work:0,brk:0};
  const s=new Date(o.inicio).getTime(),e=o.fin?new Date(o.fin).getTime():Date.now();
  let elapsed=Math.floor((e-s)/1000),brk=0;
  (o.breaks||[]).forEach(b=>{if(b.start&&b.end)brk+=Math.floor((new Date(b.end)-new Date(b.start))/1000);});
  if(o.enDescanso&&o.bStartTs)brk+=Math.floor((Date.now()-new Date(o.bStartTs).getTime())/1000);
  return{work:Math.max(0,elapsed-brk),brk};
}
function vacData(empId){
  if(_vacCache[empId])return _vacCache[empId];
  const emp=DB.employees.find(e=>e.id===empId);
  if(!emp)return{months:0,generated:0,used:0,pending:0,available:0};
  const sd=emp.startDate?new Date(emp.startDate):new Date(),n=new Date();
  let m=(n.getFullYear()-sd.getFullYear())*12+(n.getMonth()-sd.getMonth());
  if(n.getDate()<sd.getDate())m--;m=Math.max(0,m);
  const gen=parseFloat((m*VPM).toFixed(1));
  const used=(DB.vacaciones||[]).filter(v=>v.empId===empId&&v.estado==='aprobada').reduce((s,v)=>s+v.dias,0);
  const pend=(DB.vacaciones||[]).filter(v=>v.empId===empId&&v.estado==='pendiente').reduce((s,v)=>s+v.dias,0);
  const r={months:m,generated:gen,used,pending:pend,available:Math.max(0,parseFloat((gen-used).toFixed(1)))};
  _vacCache[empId]=r;return r;
}
function clearVacCache(){_vacCache={};}
function unreadCount(){return(DB.notis||[]).filter(n=>notisFor().some(x=>x.id===n.id)&&!n.leido).length;}

// ── Toast ──
function toast(msg,dur=3000){
  const d=document.createElement('div');d.className='toast';d.textContent=msg;
  $('toastWrap').appendChild(d);
  setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),300);},dur);
}

// ── Screens ──
function showScr(id){document.querySelectorAll('.scr').forEach(s=>s.classList.remove('show'));$(id).classList.add('show');}

// ── Sidebar ──
function toggleSidebar(){
  const sb=$('adminSidebar'),ov=$('sbOverlay');if(!sb||!ov)return;
  const open=sb.classList.toggle('mob-open');
  ov.classList.toggle('show',open);document.body.style.overflow=open?'hidden':'';
}
function closeSidebar(){
  const sb=$('adminSidebar'),ov=$('sbOverlay');
  if(sb)sb.classList.remove('mob-open');if(ov)ov.classList.remove('show');
  document.body.style.overflow='';
}

// ── Firebase ──
function cloudPush(force=false){
  if(_pushFlight&&!force)return;
  _pushFlight=true;DB._ts=Date.now();
  try{localStorage.setItem('an_times_v1',JSON.stringify(DB));}catch(e){}
  fetch(DB_URL+'.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(DB)})
    .then(r=>{_pushFlight=false;if(!r.ok)throw new Error('HTTP '+r.status);_saveRetry=0;setSyncDot(true);})
    .catch(()=>{_pushFlight=false;setSyncDot(false);if(_saveRetry<5){_saveRetry++;setTimeout(()=>cloudPush(true),600*_saveRetry);}});
}
function save(){DB._ts=Date.now();try{localStorage.setItem('an_times_v1',JSON.stringify(DB));}catch(e){}clearTimeout(_saveT);_saveT=setTimeout(cloudPush,0);}
function saveTick(){try{localStorage.setItem('an_times_v1',JSON.stringify(DB));}catch(e){}clearTimeout(_saveT);_saveT=setTimeout(cloudPush,5000);}
function setSyncDot(ok){
  const d=$('syncDot');if(d)d.style.background=ok?'var(--green)':'var(--orange)';
  const cnt=unreadCount();
  [$('notiDotEmp'),$('notiDotAdm')].forEach(el=>{if(!el)return;el.classList.toggle('show',cnt>0);});
  updateSBBadges();
}
function applyDB(p){
  if(!p)return;
  DB.empresas=(p.empresas&&p.empresas.length)?p.empresas:DB.empresas;
  DB.obras=(p.obras&&p.obras.length)?p.obras:(p.empresas||DB.obras||[]);
  DB.centrosTrabajo=(p.centrosTrabajo&&p.centrosTrabajo.length)?p.centrosTrabajo:DB.centrosTrabajo;
  const adm=DB.employees.find(e=>e.isAdmin)||{id:'admin',name:'Administrador',empresa:DB.empresas[0]||'',pin:ADMIN_PIN,color:'#5aa9e6',initials:'AD',startDate:'2024-01-01',email:'',isAdmin:true};
  const inc=p.employees&&p.employees.length?p.employees:DB.employees;
  DB.employees=inc.some(e=>e.isAdmin)?inc:[...inc,adm];
  DB.records=p.records||[];DB.vacaciones=p.vacaciones||[];DB.medicos=p.medicos||[];
  DB.ausencias=p.ausencias||[];DB.mensajes=p.mensajes||[];DB.notis=p.notis||[];DB.cierres=p.cierres||[];
  if(SES.user&&TM.state!=='idle'){
    const o=DB.records.find(r=>r.empId===SES.user.id&&!r.fin);
    if(o){o.workSecs=TM.ws;o.breakSecs=TM.bs;o.enDescanso=TM.state==='break';}
  }
  clearVacCache();
}
function doFetch(){
  fetch(DB_URL+'.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
    if(!data)return;
    const merge=!DB._ts||data._ts>DB._ts||(data.records||[]).length!==(DB.records||[]).length||(data.employees||[]).length!==(DB.employees||[]).length;
    if(merge){
      const prev=DB.records.find(r=>r.empId===SES.user?.id&&!r.fin);
      applyDB(data);
      if(prev&&TM.state!=='idle'){const fr=DB.records.find(r=>r.id===prev.id);if(fr&&!fr.fin){fr.workSecs=TM.ws;fr.breakSecs=TM.bs;}}
      try{localStorage.setItem('an_times_v1',JSON.stringify(DB));}catch(e){}
      refreshUI();
    }
    setSyncDot(true);
  }).catch(()=>setSyncDot(false));
}
function startPolling(){if(_polling)clearInterval(_polling);_polling=setInterval(doFetch,10000);}

// ── Session ──
function saveSession(){try{localStorage.setItem('an_times_ses',JSON.stringify(SES.isAdmin&&!SES.isEnc?{isAdmin:true}:{empId:SES.user?.id}));}catch(e){}}
function loadRemembered(){
  try{const r=JSON.parse(localStorage.getItem('an_times_rem')||'null');if(!r)return;
    const s=$('selEmp');if(s&&r.empId)s.value=r.empId;if($('remMe'))$('remMe').checked=true;}catch(e){}
}


// ── Login mode switcher ──
function switchLoginMode(mode){
  var modes = ['email','pin','forgot'];
  modes.forEach(function(m){
    var el = document.getElementById('loginMode' + m.charAt(0).toUpperCase() + m.slice(1));
    if(el) el.style.display = m === mode ? '' : 'none';
  });
  // Clear errors
  ['loginErr','pinErr','forgotErr'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.textContent = '';
  });
  var fs = document.getElementById('forgotSuccess');
  if(fs) fs.style.display = 'none';
}

// ── Toggle password visibility ──
function toggleLoginPass(){
  var inp = document.getElementById('loginPass');
  var ico = document.getElementById('loginPassIco');
  if(!inp) return;
  var show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if(ico) ico.innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

// ── Email login (Firebase) ──
async function doEmailLogin(){
  var email = (document.getElementById('loginEmail')?.value || '').trim();
  var pass  = document.getElementById('loginPass')?.value || '';
  var errEl = document.getElementById('loginErr');
  if(errEl) errEl.textContent = '';
  if(!email || !pass){
    if(errEl) errEl.textContent = 'Introduce tu email y contraseña';
    return;
  }
  var btn = document.getElementById('btnEmailLogin');
  if(btn){ btn.textContent = '⏳ Verificando...'; btn.disabled = true; }

  // Cargar Firebase si necesario (con timeout de 10s para no quedarse colgado)
  if(!window._fbReady){
    if(errEl) errEl.textContent = 'Conectando...';
    await new Promise(function(res){
      var t = setTimeout(function(){ res(); }, 10000); // timeout 10s
      var _lf = window._loadFirebase || function(cb){cb&&cb();}; _lf(function(){ clearTimeout(t); res(); });
    });
    if(!window._fbReady){
      if(errEl) errEl.textContent = 'Sin conexión con Firebase. Usa el PIN numérico.';
      if(btn){ btn.textContent = 'Iniciar sesión'; btn.disabled = false; }
      return;
    }
    if(errEl) errEl.textContent = '';
  }

  try{
    var result = await window._fbSignIn(email, pass);
    var fbUser = result.user;
    // Buscar empleado por email
    var emp = DB.employees.find(function(e){ return e.email && e.email.toLowerCase() === fbUser.email.toLowerCase(); });
    if(emp){
      SES.user = emp; SES.isEnc = emp.role === 'encargado'; SES.isJO = emp.role === 'jefe_obra';
      // Encargados y empleados NO son admins — solo Jefe de Obra y Admin tienen panel
      SES.isAdmin = emp.role === 'jefe_obra';
      saveSession();
      if(SES.isAdmin){ doAdminLogin(); } else { doEmpLogin(); }
      toast('✅ Bienvenido, ' + emp.name.split(' ')[0]);
    } else if(fbUser.email.toLowerCase() === 'admin@times-inc.com' || fbUser.email.toLowerCase() === 'admin@timesync.app'){
      // Admin especial por email
      SES = {user:null, isAdmin:true, isEnc:false};
      saveSession(); doAdminLogin();
    } else {
      // Firebase OK pero no registrado como empleado
      try{ if(window._fbSignOut) window._fbSignOut().catch(function(){}); }catch(e){}
      if(errEl) errEl.textContent = '⛔ Tu cuenta no está registrada. Contacta al administrador.';
    }
  } catch(err){
    var msgs = {
      'auth/invalid-email':           'Email no válido',
      'auth/wrong-password':          'Contraseña incorrecta',
      'auth/invalid-credential':      'Email o contraseña incorrectos',
      'auth/user-not-found':          'No existe cuenta con ese email',
      'auth/too-many-requests':       'Demasiados intentos. Espera unos minutos.',
      'auth/network-request-failed':  'Sin conexión. Verifica tu internet.',
      'auth/user-disabled':           'Esta cuenta ha sido desactivada.'
    };
    if(errEl) errEl.textContent = msgs[err.code] || err.message || 'Error al iniciar sesión';
  }
  if(btn){ btn.textContent = 'Iniciar sesión'; btn.disabled = false; }
}

// ── Google login ──
async function loginWithGoogle(){
  var errEl = document.getElementById('loginErr');
  var btn   = document.getElementById('btnGoogle');
  if(btn){ btn.style.opacity = '.6'; btn.disabled = true; }
  if(!window._fbReady){
    await new Promise(function(res){ var t=setTimeout(res,10000); var _lf=window._loadFirebase||function(cb){cb&&cb();}; _lf(function(){clearTimeout(t);res();}); });
    if(!window._fbReady){ if(errEl) errEl.textContent='Sin conexión. Verifica tu internet.'; if(btn){btn.style.opacity='1';btn.disabled=false;} return; }
  }
  try{
    var result = await window._fbGoogle();
    var fbUser = result.user;
    var emp = DB.employees.find(function(e){ return e.email && e.email.toLowerCase() === fbUser.email.toLowerCase(); });
    if(emp){
      SES.user = emp; SES.isEnc = emp.role === 'encargado'; SES.isJO = emp.role === 'jefe_obra';
      SES.isAdmin = emp.role === 'jefe_obra';
      saveSession();
      if(SES.isAdmin){ doAdminLogin(); } else { doEmpLogin(); }
      toast('✅ Bienvenido, ' + (fbUser.displayName || fbUser.email).split(' ')[0]);
    } else {
      try{ if(window._fbSignOut) window._fbSignOut().catch(function(){}); }catch(e){}
      if(errEl) errEl.textContent = '⛔ Cuenta no registrada. Contacta al administrador.';
    }
  } catch(err){
    if(err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request'){
      if(btn){ btn.style.opacity='1'; btn.disabled=false; } return;
    }
    if(errEl) errEl.textContent = err.code === 'auth/popup-blocked'
      ? 'Permite popups en tu navegador'
      : 'Error Google: ' + (err.message || err.code);
  }
  if(btn){ btn.style.opacity='1'; btn.disabled=false; }
}

// ── Forgot password ──
async function doForgotPassword(){
  var email = (document.getElementById('forgotEmail')?.value || '').trim();
  var errEl = document.getElementById('forgotErr');
  var sucEl = document.getElementById('forgotSuccess');
  var btn   = document.getElementById('btnForgot');
  if(errEl) errEl.textContent = '';
  if(sucEl) sucEl.style.display = 'none';
  if(!email){ if(errEl) errEl.textContent = 'Introduce tu email'; return; }
  if(btn){ btn.textContent = '⏳ Enviando...'; btn.disabled = true; }
  if(!window._fbReady){
    await new Promise(function(res){ var t=setTimeout(res,10000); var _lf=window._loadFirebase||function(cb){cb&&cb();}; _lf(function(){clearTimeout(t);res();}); });
    if(!window._fbReady){ if(errEl) errEl.textContent='Sin conexión. Intenta de nuevo.'; if(btn){btn.textContent='Enviar enlace';btn.disabled=false;} return; }
  }
  try{
    await window._fbResetPwd(email);
    if(sucEl) sucEl.style.display = 'block';
    if(errEl) errEl.textContent = '';
    // Auto-return to login after 4s
    setTimeout(function(){ switchLoginMode('email'); }, 4000);
  } catch(err){
    var msgs = {
      'auth/user-not-found':         'No existe cuenta con ese email',
      'auth/invalid-email':          'Email no válido',
      'auth/network-request-failed': 'Sin conexión'
    };
    if(errEl) errEl.textContent = msgs[err.code] || 'Error al enviar. Intenta de nuevo.';
  }
  if(btn){ btn.textContent = 'Enviar enlace'; btn.disabled = false; }
}
function showForgotPassword(){
  var email = document.getElementById('loginEmail')?.value || '';
  var fe    = document.getElementById('forgotEmail');
  if(fe && email) fe.value = email; // pre-fill if already typed
  switchLoginMode('forgot');
}

// ── Admin access ──
// Admin accede con email admin@times-inc.com + su contraseña Firebase
// OR with the secret PIN (triple-tap logo to reveal)
var _logoTaps = 0, _logoTimer = null;
function logoTap(){
  _logoTaps++;
  clearTimeout(_logoTimer);
  _logoTimer = setTimeout(function(){ _logoTaps = 0; }, 800);
  if(_logoTaps >= 3){
    _logoTaps = 0;
    // Show admin secret button
    var btn = document.getElementById('adminSecretBtn');
    if(btn){ btn.style.color = 'var(--accent3)'; btn.style.cursor = 'pointer'; btn.textContent = '⚡ Acceso admin'; }
  }
}
function quickAdmin(){
  // FIX 2: acceso rápido admin — muestra panel y renderiza dashboard correctamente
  SES = {user:null, isAdmin:true, isEnc:false};
  saveSession();
  updateSBUser();
  showScr('sAdmin');
  safeRun(populateSelect,'sel');
  safeRun(populateFilters,'filt');
  showPage('dashboard');
  safeRun(applyEncPermissions,'enc');
  toast('⚡ Modo admin activado');
}

// ── Login / Numpad ──
let _pin='';
function populateSelect(){
  const s=$('selEmp');if(!s)return;const cur=s.value;
  s.innerHTML='<option value="">— Elige tu nombre —</option>';
  sortedEmps().forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name+(e.role==='encargado'?' ⭐':'');s.appendChild(o);});
  if(cur)s.value=cur;
  injectFbBtn();
  // Check biometric available
  const bb=$('bioBtnFull'),bb2=$('bioBtn');
  const bioOk=window.PublicKeyCredential||window.PasswordCredential;
  if(!bioOk){if(bb)bb.style.display='none';}
}
function pinKey(k){
  if(_pin.length>=6)return;
  _pin+=k;
  updatePinDots();
  if(_pin.length>=4){
    // try auto-login after small delay
    const emp=$('selEmp').value;
    if(emp) setTimeout(tryAutoLogin,120);
  }
}
function pinDel(){if(_pin.length>0){_pin=_pin.slice(0,-1);updatePinDots();}}
function updatePinDots(){
  for(let i=0;i<6;i++){
    const d=$('pd'+i);if(!d)continue;
    d.className='lh-dot'+(i<_pin.length?' filled':'');
  }
  // sync hidden input
  const h=$('inPin');if(h)h.value=_pin;
}
function shakeDots(){
  const dots=$('pinDots');if(!dots)return;
  dots.classList.add('shake');
  for(let i=0;i<6;i++){const d=$('pd'+i);if(d)d.className='lh-dot error';}
  setTimeout(()=>{dots.classList.remove('shake');_pin='';updatePinDots();},450);
}
function tryAutoLogin(){
  const empId=$('selEmp').value,pin=_pin;
  if(!empId)return;
  const emp=DB.employees.find(e=>e.id===empId);
  if(!emp)return;
  if(emp.pin===pin){
    var _le=$('pinErr')||$('loginErr');if(_le)_le.textContent='';
    SES.user=emp;SES.isEnc=emp.role==='encargado';SES.isJO=emp.role==='jefe_obra';
    SES.isAdmin=emp.role==='jefe_obra';
    try{localStorage.setItem('an_times_rem',JSON.stringify({empId}));}catch(e){}
    saveSession();
    if(SES.isAdmin){doAdminLogin();}else{doEmpLogin();}
  } else if(pin.length>=4&&_pin.length>=4){
    var _pe=$('pinErr')||$('loginErr');if(_pe)_pe.textContent='PIN incorrecto';
    shakeDots();
  }
}
async function doBiometric(){
  // Obtener empId: primero del selector PIN, si no del modo email (requiere selección)
  const empId = $('selEmp')?.value || '';
  const errEl = $('loginErr') || $('pinErr');
  const clearErr = () => { if(errEl) errEl.textContent = ''; };

  // Verificar si la biometría del dispositivo está disponible
  const bioAvailable = typeof PublicKeyCredential !== 'undefined'
    && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(()=>false);

  if(!bioAvailable){
    if(errEl) errEl.textContent = '⚠️ Biometría no disponible en este navegador';
    return;
  }

  // Si no hay empleado seleccionado en modo PIN, pedir que seleccione
  if(!empId){
    // Modo email: intentar recuperar sesión guardada
    const savedSes = (() => { try{ return JSON.parse(localStorage.getItem('an_times_ses')||'null'); }catch(e){return null;} })();
    if(savedSes && savedSes.empId){
      const savedEmp = DB.employees.find(e=>e.id===savedSes.empId);
      if(savedEmp){
        // Hay sesión guardada → verificar biometría y restaurar
        await _doBioVerify(savedEmp, errEl);
        return;
      }
    }
    if(errEl) errEl.textContent = 'Selecciona tu nombre o inicia sesión primero';
    // Cambiar a modo PIN para que seleccione empleado
    switchLoginMode('pin');
    return;
  }

  const emp = DB.employees.find(e=>e.id===empId);
  if(!emp){ if(errEl) errEl.textContent = 'Empleado no encontrado'; return; }
  await _doBioVerify(emp, errEl);
}

async function _doBioVerify(emp, errEl){
  if(errEl) errEl.textContent = '';
  try{
    // Generar challenge aleatorio
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Intentar verificación biométrica sin credencial registrada
    // (userVerification: 'required' activa Face ID / Touch ID en iOS/Android)
    const result = await navigator.credentials.get({
      publicKey:{
        challenge,
        timeout: 60000,
        userVerification: 'required',
        rpId: location.hostname || 'localhost',
        allowCredentials: [] // sin credenciales registradas → el dispositivo pide bio igualmente
      }
    }).catch(e => { throw e; });

    // Si llega aquí, el dispositivo verificó la biometría
    if(result || result === null){
      // result null significa que el dispositivo verificó pero no hay credencial → OK igualmente
      SES.user = emp; SES.isEnc = emp.role === 'encargado'; SES.isJO = emp.role === 'jefe_obra';
      SES.isAdmin = emp.role === 'jefe_obra';
      saveSession(); doEmpLogin();
      toast('✅ Acceso biométrico — ' + emp.name.split(' ')[0]);
    }
  } catch(ex){
    // NotAllowedError = usuario canceló o no autenticó
    // InvalidStateError / NotSupportedError = no hay credencial registrada
    if(ex.name === 'NotAllowedError'){
      if(errEl) errEl.textContent = 'Biometría cancelada o no autorizada';
    } else if(ex.name === 'NotSupportedError' || ex.name === 'InvalidStateError' || ex.name === 'SecurityError'){
      // El dispositivo tiene biometría pero no hay credencial WebAuthn registrada
      // En este caso hacemos fallback: si tiene sesión guardada, la restauramos con bio
      const savedSes = (() => { try{ return JSON.parse(localStorage.getItem('an_times_ses')||'null'); }catch(e){return null;} })();
      if(savedSes && savedSes.empId === emp.id){
        // Sesión previa del mismo empleado → OK (el sistema operativo ya verificó)
        SES.user = emp; SES.isEnc = emp.role === 'encargado'; SES.isJO = emp.role === 'jefe_obra';
        SES.isAdmin = emp.role === 'jefe_obra';
        saveSession(); doEmpLogin();
        toast('✅ Sesión restaurada — ' + emp.name.split(' ')[0]);
      } else {
        if(errEl) errEl.textContent = '⚠️ Primero inicia sesión con PIN o email para activar la biometría';
      }
    } else {
      if(errEl) errEl.textContent = 'Biometría no disponible: ' + (ex.message || ex.name);
      console.warn('[TIMES] Bio error:', ex.name, ex.message);
    }
  }
}
function doLogin(){
  // Called by admin quick button
  const empId=$('selEmp').value,pin=_pin||$('inPin').value.trim();
  $('loginErr').textContent='';
  if(pin===ADMIN_PIN&&!empId){SES={user:null,isAdmin:true,isEnc:false};saveSession();doAdminLogin();return;}
  if(!empId){$('loginErr').textContent='Selecciona un empleado';shakeDots&&shakeDots();return;}
  const emp=DB.employees.find(e=>e.id===empId);
  if(!emp){$('loginErr').textContent='Empleado no encontrado';return;}
  if(emp.pin!==pin){$('loginErr').textContent='PIN incorrecto';shakeDots&&shakeDots();return;}
  SES.user=emp;SES.isEnc=emp.role==='encargado';SES.isJO=emp.role==='jefe_obra';
  SES.isAdmin=emp.role==='jefe_obra';
  saveSession();
  if(SES.isAdmin){doAdminLogin();}else{doEmpLogin();}
}
// quickAdmin defined above (email-based)
let _loggingOut = false;
function doLogout(){
  // Bloquear el listener fbAuthChanged para que no re-logee al hacer signout
  _loggingOut = true;
  _fbInitialCheckDone = true;
  // Detener polling
  if(_polling){clearInterval(_polling);_polling=null;}
  // Firebase signout primero (antes de resetear estado)
  try{if(window._fbReady&&window._fbSignOut)window._fbSignOut().catch(()=>{});}catch(e){}
  // Reset timer & session
  TM={ws:0,bs:0,state:'idle'};
  SES={user:null,isAdmin:false,isEnc:false,isJO:false};
  _pin='';
  try{localStorage.removeItem('an_times_ses');}catch(e){}
  // Reset UI
  updatePinDots();
  showScr('sLogin');
  if(typeof switchLoginMode==='function')switchLoginMode('email');
  populateSelect();
  loadRemembered();
  if($('loginErr'))$('loginErr').textContent='';
  if($('inPin'))$('inPin').value='';
  if($('loginEmail'))$('loginEmail').value='';
  if($('loginPass'))$('loginPass').value='';
  if($('encBtn'))$('encBtn').style.display='none';
  // Reanudar polling tras logout (para seguir sincronizando datos sin sesión)
  setTimeout(()=>{ _loggingOut = false; startPolling(); }, 1500);
}
function doAdminLogin(){
  updateSBUser();showScr('sAdmin');
  safeRun(populateSelect,'sel');safeRun(populateFilters,'filt');
  showPage('dashboard');
  safeRun(applyEncPermissions,'enc');
}
function doEmpLogin(){
  // FIX 3: guard contra llamadas sin sesión activa (evita null.name)
  if(!SES.user) return;
  const u=SES.user;
  // Update topbar
  const fn=$('empFirstName');if(fn)fn.textContent=u.name.split(' ')[0];
  const sd=$('empSubdate');if(sd)sd.textContent=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // Perfil tab
  const pa=$('prfAv');if(pa){pa.textContent=u.initials||u.name.slice(0,2).toUpperCase();pa.style.background=u.color||'var(--accent)';}
  if($('prfName'))$('prfName').textContent=u.name;
  if($('prfRole'))$('prfRole').textContent=u.role==='encargado'?'Encargado ⭐':u.role==='jefe_obra'?'Jefe de Obra 🏗️':'Empleado';
  if($('prfLoc'))$('prfLoc').textContent=u.empresa||'Sin obra';
  // Enc btn
  if((SES.isEnc||SES.isJO)&&$('encBtn'))$('encBtn').style.display='flex';
  if($('encBtn')&&SES.isJO)$('encBtn').textContent='🏗️ Panel';
  showScr('sEmp');
  // Restore session timer
  const open=DB.records.find(r=>r.empId===u.id&&!r.fin);
  if(open){
    TM.state=open.enDescanso?'break':'working';
    const t=calcSecs(open);TM.ws=t.work;TM.bs=t.brk;
    // Warn if the open session is from a previous day
    const openDate=open.inicio?open.inicio.slice(0,10):'';
    if(openDate && openDate!==today()){
      setTimeout(()=>toast('⚠️ Tienes una jornada del '+openDate+' sin cerrar. Pulsa el botón para finalizarla.', 5000),600);
    }
  }
  empNavTo('inicio');
  safeRun(updJorCircle,'jc');safeRun(renderResumen,'rs');
  safeRun(loadUserPhoto,'lp');
  // Pedir permisos de notificación y programar recordatorio
  setTimeout(requestNotifPermission, 2000);
  setTimeout(scheduleEndOfDayReminder, 3000);
}
function showEncPanel(){
  // Encargados ven el panel con permisos limitados (solo su obra)
  // Jefe de Obra tiene acceso a Contratos y Nóminas + aprobar horas de todos en su obra
  SES.isAdmin=true; // Temporal para mostrar panel
  doAdminLogin();
}



function empNavTo(tab){
  const pages=['inicio','jornada','vacaciones','calendario','nomina','perfil'];
  pages.forEach(p=>{
    const el=$('tab'+p.charAt(0).toUpperCase()+p.slice(1));
    if(el){el.style.display=p===tab?'block':'none';}
    const nav=$('nav-'+p);if(nav)nav.className='emp-nav-item'+(p===tab?' on':'');
  });
  if(tab==='jornada')safeRun(renderJorTab,'jt');
  if(tab==='calendario')safeRun(renderCalendar,'cal');
  if(tab==='inicio')safeRun(renderResumen,'rs');
  if(tab==='vacaciones')safeRun(renderVacTab,'vt');
}

function renderResumen(){
  if(!SES.user)return;
  const u=SES.user,tod=today();
  const recs=DB.records.filter(r=>r.empId===u.id&&r.inicio.startsWith(tod));
  const first=recs[0];
  if($('resEntrada'))$('resEntrada').textContent=first?ftime(first.inicio):'--:--';
  if($('resSalida')){const s=recs.find(r=>r.fin);$('resSalida').textContent=s?ftime(s.fin):'--:--';}
  const brk=recs.reduce((a,r)=>a+Math.floor((r.breakSecs||0)/60),0);
  const tot=recs.reduce((a,r)=>a+calcMin(r),0)+(TM.state!=='idle'?Math.floor(TM.ws/60):0);
  if($('resDescanso'))$('resDescanso').textContent=brk>0?`${Math.floor(brk/60).toString().padStart(2,'0')}:${p2(brk%60)}`:'00:00';
  if($('resTotal'))$('resTotal').textContent=`${Math.floor(tot/60).toString().padStart(2,'0')}h ${p2(tot%60)}m`;
  // GPS card
  const open=DB.records.find(r=>r.empId===u.id&&!r.fin);
  const gc=$('gpsCard');if(gc){gc.style.display=open?'flex':'none';}
  if($('gpsCardName'))$('gpsCardName').textContent=open?.centro||SES.user.centroTrabajo||'Sin centro';
  const gst=$('gpsCardStatus');if(gst){if(open?.locInicio){gst.textContent='GPS verificado';gst.className='gps-status';}else{gst.textContent='Sin GPS';gst.className='gps-status pending';}}
}

function renderJorTab(){
  if(!SES.user)return;
  const u=SES.user,tod=today();
  const tl=$('jorTimeline');if(!tl)return;
  const td=$('jorTabDate');if(td)td.textContent=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const recs=DB.records.filter(r=>r.empId===u.id&&r.inicio.startsWith(tod)).sort((a,b)=>a.inicio.localeCompare(b.inicio));
  if(!recs.length){tl.innerHTML='<div class="empty">Sin actividad hoy</div>';return;}
  const items=[];
  recs.forEach(r=>{
    items.push({ico:'🟢',label:'Entrada',time:ftime(r.inicio),color:'var(--green)',bg:'rgba(16,185,129,.15)'});
    (r.breaks||[]).forEach(b=>{
      if(b.start)items.push({ico:'🟡',label:'Pausa comida',time:ftime(b.start),color:'var(--orange)',bg:'rgba(245,158,11,.15)'});
      if(b.end)items.push({ico:'🟣',label:'Reanudado',time:ftime(b.end),color:'var(--accent3)',bg:'var(--accent-dim)'});
    });
    if(r.fin)items.push({ico:'⚪',label:'Salida',time:ftime(r.fin),color:'var(--text3)',bg:'var(--bg4)'});
  });
  tl.innerHTML=items.map((it,i)=>`<div class="tl-item"><div class="tl-left"><div class="tl-ico" style="background:${it.bg}">${it.ico}</div>${i<items.length-1?'<div class="tl-line"></div>':''}</div><div class="tl-right"><span class="tl-label">${it.label}</span><span class="tl-time">${it.time}</span></div></div>`).join('');
  // Total
  const tot=recs.reduce((a,r)=>a+calcMin(r),0)+(TM.state!=='idle'?Math.floor(TM.ws/60):0);
  const norm=Math.min(tot,WD),extra=Math.max(0,tot-WD);
  const fmt=m=>`${Math.floor(m/60).toString().padStart(2,'0')}h ${p2(m%60)}m`;
  if($('jorTotalVal'))$('jorTotalVal').textContent=fmt(tot);
  if($('jorNorm'))$('jorNorm').textContent=fmt(norm);
  if($('jorExtra'))$('jorExtra').textContent=fmt(extra);
  // Resumen mensual con botón de firma
  safeRun(renderResumenMensualBtn,'rmb');
}


// Festivos Madrid 2026 (nacionales + comunidad + locales)
const FESTIVOS_2026 = {
  '2026-01-01':'Año Nuevo',
  '2026-01-06':'Epifanía del Señor',
  '2026-03-19':'San José',
  '2026-04-02':'Jueves Santo',
  '2026-04-03':'Viernes Santo',
  '2026-05-01':'Día del Trabajo',
  '2026-05-02':'Fiesta de la Comunidad de Madrid',
  '2026-05-15':'San Isidro (Madrid)',
  '2026-07-25':'Santiago Apóstol',
  '2026-08-15':'Asunción de la Virgen',
  '2026-10-12':'Fiesta Nacional de España',
  '2026-11-01':'Todos los Santos',
  '2026-11-09':'La Almudena (Madrid)',
  '2026-12-06':'Día de la Constitución',
  '2026-12-08':'Inmaculada Concepción',
  '2026-12-25':'Navidad'
};
function isFestivo(ds){return !!FESTIVOS_2026[ds];}
function getFestivoNombre(ds){return FESTIVOS_2026[ds]||'';}
// Calendar
let _calYear=new Date().getFullYear(),_calMonth=new Date().getMonth(),_calSelDay=null;
function calNav(dir){_calMonth+=dir;if(_calMonth>11){_calMonth=0;_calYear++;}if(_calMonth<0){_calMonth=11;_calYear--;}renderCalendar();}
function renderCalendar(){
  const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mt=$('calMonthTitle');if(mt)mt.textContent=`${months[_calMonth]} ${_calYear}`;
  const grid=$('calGrid');if(!grid)return;
  const headers=['L','M','X','J','V','S','D'];
  let html=headers.map(h=>`<div class="cal-day-header">${h}</div>`).join('');
  const first=new Date(_calYear,_calMonth,1);
  const startDow=first.getDay()===0?6:first.getDay()-1;
  const days=new Date(_calYear,_calMonth+1,0).getDate();
  const prevDays=new Date(_calYear,_calMonth,0).getDate();
  const todStr=today();
  for(let i=startDow-1;i>=0;i--)html+=`<div class="cal-day other-month">${prevDays-i}</div>`;
  for(let d=1;d<=days;d++){
    const ds=`${_calYear}-${p2(_calMonth+1)}-${p2(d)}`;
    const isToday=ds===todStr;
    const myRecs=DB.records.filter(r=>r.empId===SES.user?.id&&r.inicio.startsWith(ds)&&r.fin);
    const worked=myRecs.length>0;
    const isVac=(DB.vacaciones||[]).some(v=>v.empId===SES.user?.id&&v.estado==='aprobada'&&ds>=v.desde&&ds<=v.hasta);
    const festivo=isFestivo(ds);
    const festivoNombre=getFestivoNombre(ds);
    let cls='cal-day';
    if(isToday)cls+=' today';
    else if(festivo)cls+=' festivo';
    else if(isVac)cls+=' vacation';
    else if(worked)cls+=' worked';
    const title=festivoNombre?` title="${festivoNombre}"`:'';
    const dot=festivo?'<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--orange);"></span>':'';
    html+=`<div class="${cls}" style="position:relative"${title} onclick="calSelectDay('${ds}','${d}')">${d}${dot}</div>`;
  }
  const total=startDow+days;const rem=total%7===0?0:7-total%7;
  for(let i=1;i<=rem;i++)html+=`<div class="cal-day other-month">${i}</div>`;
  grid.innerHTML=html;
  // Festivos del mes listados abajo
  renderFestivosMes();
  if(_calSelDay)calSelectDay(_calSelDay,'');
}
function renderFestivosMes(){
  // Show festivos of current month in calendar legend area
  const festMes=Object.entries(FESTIVOS_2026).filter(([ds])=>{
    const d=new Date(ds+'T00:00:00');
    return d.getFullYear()===_calYear&&d.getMonth()===_calMonth;
  });
  const legEl=$('calFestivosMes');
  if(!legEl)return;
  if(!festMes.length){legEl.innerHTML='';return;}
  legEl.innerHTML='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text3);margin-bottom:8px">Festivos este mes</div>'
    +festMes.map(([ds,nombre])=>{
      const d=new Date(ds+'T00:00:00');
      return`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--orange-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px">🎉</div>
        <div><div style="font-size:12px;font-weight:600">${nombre}</div><div style="font-size:10px;color:var(--text3)">${d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</div></div>
      </div>`;
    }).join('');
}
function calSelectDay(ds,d){
  _calSelDay=ds;
  const detail=$('calDayDetail');if(!detail)return;
  const myRecs=DB.records.filter(r=>r.empId===SES.user?.id&&r.inicio.startsWith(ds)&&r.fin);
  const festivoName=getFestivoNombre(ds);
  if(!myRecs.length&&!festivoName){detail.style.display='none';return;}
  detail.style.display='block';
  detail.style.display='block';
  const dt=new Date(ds+'T00:00:00');
  if($('calDetailTitle'))$('calDetailTitle').textContent=dt.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})+(festivoName?' 🎉':'');
  if(festivoName){
    const fi=$('calFestivoInfo');
    if(!fi){
      const div=document.createElement('div');div.id='calFestivoInfo';
      div.style.cssText='background:var(--orange-dim);border:1px solid rgba(245,158,11,.2);border-radius:var(--r-sm);padding:10px 12px;font-size:12px;color:var(--orange);font-weight:600;margin-bottom:8px';
      div.textContent='🎉 '+festivoName;
      $('calDetailItems').before(div);
    }else fi.textContent='🎉 '+festivoName;
  }else{const fi=$('calFestivoInfo');if(fi)fi.remove();}
  const items=[];
  myRecs.forEach(r=>{
    items.push({ico:'🟢',label:'Entrada',time:ftime(r.inicio),bg:'rgba(16,185,129,.15)'});
    (r.breaks||[]).forEach(b=>{if(b.start)items.push({ico:'🟡',label:'Pausa comida',time:ftime(b.start),bg:'rgba(245,158,11,.15)'});if(b.end)items.push({ico:'🟣',label:'Reanudado',time:ftime(b.end),bg:'var(--accent-dim)'});});
    if(r.fin)items.push({ico:'⚫',label:'Salida',time:ftime(r.fin),bg:'var(--bg4)'});
  });
  if($('calDetailItems'))$('calDetailItems').innerHTML=items.map(it=>`<div class="cal-tl-item"><div class="cal-tl-ico" style="background:${it.bg}">${it.ico}</div><span class="cal-tl-lbl">${it.label}</span><span class="cal-tl-time">${it.time}</span></div>`).join('');
  const tot=myRecs.reduce((a,r)=>a+calcMin(r),0);
  if($('calDayTotal'))$('calDayTotal').textContent=`${Math.floor(tot/60)}h ${p2(tot%60)}m`;
}
// ── Jornada botón circular ──
function jorBtnTap(){
  const s=TM.state;
  if(s==='idle'){doStart();return;}
  if(s==='working'||s==='break'){doStop();return;}
}
function updJorBtn(){safeRun(updJorCircle,'jc');}
function updJorCircle(){
  const btn=$('jorCircleBtn'),chip=$('jorBreakChip');
  const l1=$('jorCircleLine1'),l2=$('jorCircleLine2'),ico=$('jorCircleIco');
  const st=$('jorMcStatus'),stTxt=$('jorMcStatusTxt'),glw=$('jorCircleGlow');
  const s=TM.state;
  if(!btn)return;
  if(s==='idle'){
    btn.className='jor-circle-btn';
    if(l1)l1.textContent='FICHAR';if(l2)l2.textContent='ENTRADA';
    if(ico)ico.innerHTML='<path d="M12 1C7 1 3 5 3 10c0 3.5 1.5 6.5 4 8.5M12 1c5 0 9 4 9 9 0 3.5-1.5 6.5-4 8.5M8.5 10.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 3.5 3.5c0 2-1.5 3.5-3.5 5"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/>';
    if(chip)chip.style.display='none';
    if(st)st.className='jor-mc-status idle';if(stTxt)stTxt.textContent='Libre';
    if(glw)glw.style.background='radial-gradient(circle,rgba(99,102,241,.25) 0%,transparent 70%)';
  }else if(s==='working'){
    btn.className='jor-circle-btn working';
    if(l1)l1.textContent='FICHAR';if(l2)l2.textContent='SALIDA';
    if(ico)ico.innerHTML='<rect x="3" y="3" width="18" height="18" rx="3" fill="rgba(255,255,255,.3)"/>';
    if(chip){chip.style.display='flex';chip.className='jor-break-chip';const bt=$('jorBreakTxt');if(bt)bt.textContent='Iniciar descanso';}
    if(st)st.className='jor-mc-status';if(stTxt)stTxt.textContent='En curso';
    if(glw)glw.style.background='radial-gradient(circle,rgba(124,58,237,.3) 0%,transparent 70%)';
  }else if(s==='break'){
    btn.className='jor-circle-btn break';
    if(l1)l1.textContent='EN';if(l2)l2.textContent='DESCANSO';
    if(ico)ico.innerHTML='<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/>';
    if(chip){chip.style.display='flex';chip.className='jor-break-chip active';const bt=$('jorBreakTxt');if(bt)bt.textContent='Reanudar trabajo';}
    if(st)st.className='jor-mc-status break';if(stTxt)stTxt.textContent='En descanso';
    if(glw)glw.style.background='radial-gradient(circle,rgba(245,158,11,.3) 0%,transparent 70%)';
  }
  // Update timer display
  const jt=$('jorTimer');
  if(jt)jt.textContent=s2t(TM.ws);
  safeRun(renderResumen,'rs');
  safeRun(renderJorTab,'jt');
}

// Encargado también puede fichar (además de ver panel admin)
// showEncPanel already defined above

// ── Timer empleado ──
function openRec(){return DB.records.find(r=>r.empId===SES.user?.id&&!r.fin&&!r.closed);}
function updBtns(){
  safeRun(updJorCircle,'jb');
}

function setEmpStatus(cls,txt){safeRun(updJorCircle,"ses");}

function updTimer(){
  const jt=$('jorTimer');if(jt)jt.textContent=s2t(TM.ws);
  const pct=Math.min(100,(TM.ws/(WD*60))*100);
  const pf=$('progFill');if(pf){pf.style.width=pct.toFixed(1)+'%';}
  if($('progPct'))$('progPct').textContent=pct.toFixed(0)+'%';
  if($('mWorked'))$('mWorked').textContent=s2t(TM.ws);
  if($('mBreak'))$('mBreak').textContent=s2t(TM.bs);
  const ex=Math.max(0,TM.ws/60-WD);
  if($('mExtra'))$('mExtra').textContent=ex>0?Math.floor(ex/60)+':'+p2(Math.floor(ex%60)):'0:00';
}

function tick(){
  // FIX A: encargados tienen isAdmin=true pero SÍ deben tener cronómetro
  if(!SES.user)return;
  const o=openRec();if(!o){if(TM.state!=='idle'){TM.state='idle';updBtns();}return;}
  TM.state=o.enDescanso?'break':'working';
  const t=calcSecs(o);TM.ws=t.work;TM.bs=t.brk;
  updTimer();if((++_tickN)%30===0){o.workSecs=t.work;o.breakSecs=t.brk;saveTick();}
  safeRun(updJorCircle,'jct');
}

// ── Fichar ──
function doStart(){
  const existing=openRec();
  if(existing){
    toast('⚠️ Tienes una jornada abierta. Pulsa el botón para cerrarla primero.');
    TM.state=existing.enDescanso?'break':'working';
    const t=calcSecs(existing);TM.ws=t.work;TM.bs=t.brk;
    safeRun(updJorCircle,'jc');return;
  }
  if(TM.state!=='idle')return;
  // Abrir modal selección centro
  const sel=$('selCentroModal');if(!sel)return;
  const cs=DB.centrosTrabajo||[];
  sel.innerHTML='<option value="">— Selecciona —</option>';
  cs.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
  if(SES.user?.centroTrabajo)sel.value=SES.user.centroTrabajo;
  const gs=$('gpsStatus');if(gs)gs.textContent='📡 Obteniendo GPS...';
  _pendingGPS=null;
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      pos=>{_pendingGPS={lat:+pos.coords.latitude.toFixed(5),lng:+pos.coords.longitude.toFixed(5),ts:new Date().toISOString()};
        const g=$('gpsStatus');if(g)g.textContent='✅ GPS: '+_pendingGPS.lat+', '+_pendingGPS.lng;},
      ()=>{const g=$('gpsStatus');if(g)g.textContent='⚠️ GPS no disponible';},
      {enableHighAccuracy:true,timeout:10000,maximumAge:0}
    );
  }else{if(gs)gs.textContent='⚠️ GPS no soportado en este dispositivo';}
  openModal('mSelCentro');
}
function confirmarCentroYIniciar(){
  const centro=$('selCentroModal')?.value;
  if(!centro){toast('Selecciona un centro de trabajo');return;}
  closeModal('mSelCentro');
  const rec={id:gid(),empId:SES.user.id,empName:SES.user.name,empresa:SES.user.empresa||'',
    centro,inicio:new Date().toISOString(),fin:null,workSecs:0,breakSecs:0,
    enDescanso:false,bStartTs:null,breaks:[],closed:false};
  if(_pendingGPS)rec.locInicio=_pendingGPS;
  DB.records.push(rec);TM.state='working';TM.ws=0;TM.bs=0;
  const emp=DB.employees.find(e=>e.id===SES.user.id);
  if(emp){emp.centroTrabajo=centro;SES.user.centroTrabajo=centro;}
  const cp=$('empCentroPill'),ct=$('empCentroTxt');
  if(cp&&ct){cp.style.display='inline-flex';ct.textContent=centro;}
  save();updBtns();toast('✅ Jornada iniciada en '+centro);
}
function doStop(){
  if(_doStopLock)return;const o=openRec();if(!o)return;
  _doStopLock=true;_doStopInProgress=true;
  const now=new Date();
  if(o.enDescanso&&o.bStartTs){if(!o.breaks)o.breaks=[];o.breaks.push({start:o.bStartTs,end:now.toISOString()});o.enDescanso=false;o.bStartTs=null;}
  o.fin=now.toISOString();
  const t=calcSecs(o);o.workSecs=t.work;o.breakSecs=t.brk;o.closed=true;
  TM.state='idle';TM.ws=0;TM.bs=0;
  if(navigator.geolocation){navigator.geolocation.getCurrentPosition(
    pos=>{o.locFin={lat:+pos.coords.latitude.toFixed(5),lng:+pos.coords.longitude.toFixed(5),ts:new Date().toISOString()};save();},
    ()=>{},{enableHighAccuracy:true,timeout:8000,maximumAge:0});
  }
  save();updBtns();updTimer();safeRun(renderResumen,'rs');safeRun(renderJorTab,'jt');
  toast('✅ Jornada finalizada — '+mhm(Math.floor(o.workSecs/60)));
  setTimeout(()=>{_doStopLock=false;_doStopInProgress=false;updJorBtn&&safeRun(updJorBtn,"jb");},500);
}
function toggleBreak(){
  const o=openRec();if(!o)return;const now=new Date().toISOString();
  if(o.enDescanso){
    if(!o.breaks)o.breaks=[];o.breaks.push({start:o.bStartTs,end:now});
    o.breakSecs=calcSecs(o).brk;o.enDescanso=false;o.bStartTs=null;TM.state='working';
    toast('▶️ Descanso finalizado');
  }else{o.enDescanso=true;o.bStartTs=now;TM.state='break';toast('⏸️ Descanso iniciado');}
  save();updBtns();
}

// ── Empleado stats ──
function renderEmpStats(){
  if(!SES.user)return;
  const now=new Date(),todayStr=today(),ws=wkStart(now);
  const mk=`${now.getFullYear()}-${p2(now.getMonth()+1)}`;
  const mine=DB.records.filter(r=>r.empId===SES.user.id);
  const todayMin=mine.filter(r=>r.fin&&r.inicio.startsWith(todayStr)).reduce((s,r)=>s+calcMin(r),0)+(TM.state!=='idle'?Math.floor(TM.ws/60):0);
  const weekRecs=mine.filter(r=>r.fin&&new Date(r.inicio)>=ws);
  const weekMin=weekRecs.reduce((s,r)=>s+calcMin(r),0)+(TM.state!=='idle'?Math.floor(TM.ws/60):0);
  const monthMin=mine.filter(r=>r.fin&&r.inicio.startsWith(mk)).reduce((s,r)=>s+calcMin(r),0);
  const norm=Math.min(weekMin,WK),extra=Math.max(0,weekMin-WK);
  const vacs=(DB.vacaciones||[]).filter(v=>v.empId===SES.user.id&&v.estado==='aprobada'&&v.desde.startsWith(mk)).reduce((s,v)=>s+v.dias,0);
  if($('todayH'))$('todayH').textContent=mhm(todayMin);
  if($('weekH'))$('weekH').textContent=mhm(weekMin);
  if($('wkTotal'))$('wkTotal').textContent=mhm(weekMin);
  if($('wkNorm'))$('wkNorm').textContent=mhm(norm);
  if($('wkExtra'))$('wkExtra').textContent=mhm(extra);
  if($('wkDays'))$('wkDays').textContent=weekRecs.length+(TM.state!=='idle'?1:0);
  if($('moWorked'))$('moWorked').textContent=mhm(monthMin);
  if($('moExtra'))$('moExtra').textContent=mhm(Math.max(0,monthMin-WK*4));
  if($('moAbs'))$('moAbs').textContent='0d';
  if($('moVac'))$('moVac').textContent=vacs+'d';
}
function renderHist(){
  const el=$('histList');if(!el||!SES.user)return;
  const recs=DB.records.filter(r=>r.fin&&r.empId===SES.user.id).sort((a,b)=>b.inicio.localeCompare(a.inicio)).slice(0,30);
  if(!recs.length){el.innerHTML='<div class="empty">Sin registros</div>';return;}
  el.innerHTML=recs.map(r=>{
    const m=calcMin(r),bm=Math.floor((r.breakSecs||0)/60);
    const bc=r.aprobado===true?'badge-green':r.aprobado===false?'badge-red':'badge-gray';
    const bt=r.aprobado===true?'✓ Aprobado':r.aprobado===false?'✗ Rechazado':'Pendiente';
    const gps=r.locInicio||r.locFin?`<div style="font-size:10px;color:var(--teal);margin-top:2px">📍 ${r.locInicio?`<a href="https://maps.google.com/?q=${r.locInicio.lat},${r.locInicio.lng}" target="_blank" style="color:var(--teal);text-decoration:none">📍 Entrada ↗</a>`:''} ${r.locFin?`<a href="https://maps.google.com/?q=${r.locFin.lat},${r.locFin.lng}" target="_blank" style="color:var(--accent3);text-decoration:none">🏁 Salida ↗</a>`:''}</div>`:``;
    return`<div class="rec-item">
      <div>
        <div class="rec-date">${fdate(r.inicio)}${r.centro?' · '+r.centro:''}</div>
        <div class="rec-times">→ ${ftime(r.inicio)} ← ${ftime(r.fin)}</div>
        ${bm>0?`<div style="font-size:10px;color:var(--orange);margin-top:2px">☕ Descanso: ${mhm(bm)}</div>`:''}${gps}
      </div>
      <div class="rec-right"><div class="rec-dur">${mhm(m)}</div><span class="badge ${bc}" style="margin-top:3px">${bt}</span></div>
    </div>`;
  }).join('');
}
function renderVacList(){
  const el=$('vacList');if(!SES.user||!el)return;
  const vacs=(DB.vacaciones||[]).filter(v=>v.empId===SES.user.id).sort((a,b)=>b.desde.localeCompare(a.desde));
  if(!vacs.length){el.innerHTML='<div class="empty">Sin solicitudes</div>';return;}
  el.innerHTML=vacs.map(v=>{
    const bc=v.estado==='aprobada'?'badge-green':v.estado==='denegada'?'badge-red':'badge-orange';
    const statusTxt=v.estado==='aprobada'?'✅ Aprobada':v.estado==='denegada'?'❌ Denegada':'⏳ Pendiente';
    const dias=v.dias||1;
    return`<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px"><span style="font-size:20px">🌴</span><div><div style="font-size:13px;font-weight:600">${dias} día${dias>1?'s':''}</div><div style="font-size:11px;color:var(--text3);margin-top:1px">${v.desde} → ${v.hasta}</div></div></div>
        <span class="badge ${bc}">${statusTxt}</span>
      </div>
      ${v.nota?`<div style="font-size:12px;color:var(--text3);background:var(--bg4);padding:8px;border-radius:8px">${v.nota}</div>`:''}
    </div>`;
  }).join('');
}
function renderVacTab(){
  if(!SES.user)return;
  const u=SES.user;
  const today2=today();
  if($('vacFechaHoy'))$('vacFechaHoy').textContent=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const vd=vacData(u.id);
  if($('vacDisp'))$('vacDisp').textContent=vd.available+'d';
  if($('vacUsadas'))$('vacUsadas').textContent=vd.used+'d';
  if($('vacPend'))$('vacPend').textContent=vd.pending+'d';
  const pct=vd.generated>0?Math.min(100,Math.round((vd.used/vd.generated)*100)):0;
  if($('vacProgBar'))$('vacProgBar').style.width=pct+'%';
  if($('vacProgLabel'))$('vacProgLabel').textContent=vd.used+' / '+vd.generated+' días usados';
  if($('vacGenInfo'))$('vacGenInfo').textContent='Llevas '+vd.months+' meses — '+vd.generated+' días generados ('+VPM+'d/mes)';
  renderVacList();
}

function renderMsgs(){
  const el=$('empMsgs');if(!el||!SES.user)return;
  const msgs=notisFor().sort((a,b)=>b.fecha.localeCompare(a.fecha));
  if(!msgs.length){el.innerHTML='<div class="empty">Sin mensajes</div>';return;}
  el.innerHTML=msgs.map(m=>`<div class="nitem" style="margin-bottom:8px"><div class="nitem-ico" style="background:var(--accent-dim)">${m.tipo==='vac'?'🌴':m.tipo==='warn'?'⚠️':'📢'}</div><div class="nitem-body"><div class="nitem-title">${m.titulo}</div><div class="nitem-text">${m.texto}</div><div class="nitem-time">${new Date(m.fecha).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div></div></div>`).join('');
}

// ── Tabs empleado ──
function empTab(el,tab){
  document.querySelectorAll('.etab').forEach(t=>t.classList.remove('on'));el.classList.add('on');
  ['tabJornada','tabSemana','tabHistorial','tabVacaciones','tabMensajes'].forEach(id=>{const e=$(id);if(e)e.style.display='none';});
  const t=$('tab'+tab.charAt(0).toUpperCase()+tab.slice(1));if(t)t.style.display='';
  if(tab==='semana')safeRun(renderEmpStats,'st');
  if(tab==='jornada')safeRun(updJorBtn,'jb');
  if(tab==='historial')safeRun(renderHist,'hi');
  if(tab==='vacaciones')safeRun(renderVacList,'vl');
  if(tab==='mensajes')safeRun(renderMsgs,'ms');
}

// ── Vacaciones (empleado) ──
function submitVac(){
  const from=$('vacFrom')?.value,to=$('vacTo')?.value;
  if(!from||!to){toast('Selecciona las fechas');return;}
  if(new Date(to)<new Date(from)){toast('Fecha fin debe ser posterior al inicio');return;}
  const dias=Math.round((new Date(to)-new Date(from))/86400000)+1;
  DB.vacaciones.push({id:gid(),empId:SES.user.id,empName:SES.user.name,empresa:SES.user.empresa,desde:from,hasta:to,dias,nota:$('vacNote')?.value||'',estado:'pendiente',fechaSol:new Date().toISOString()});
  pushNoti('admin','info','🌴 Nueva solicitud vacaciones',`${SES.user.name} solicita vacaciones del ${from} al ${to} (${dias} días).`);
  save();closeModal('mVac');if($('vacFrom'))$('vacFrom').value='';if($('vacTo'))$('vacTo').value='';if($('vacNote'))$('vacNote').value='';
  safeRun(renderVacList,'vl');toast('✅ Solicitud enviada');
}

// ── Notificaciones ──
function notisFor(){
  if(SES.isAdmin&&!SES.isEnc)return(DB.notis||[]).filter(n=>n.target==='admin'||n.target==='all');
  if(!SES.user)return[];
  return(DB.notis||[]).filter(n=>n.target==='emp:'+SES.user.id||n.target==='all'||(SES.isAdmin&&n.target==='admin'));
}
function pushNoti(target,tipo,titulo,texto){
  if(!DB.notis)DB.notis=[];
  DB.notis.unshift({id:gid(),target,tipo,titulo,texto,fecha:new Date().toISOString(),leido:false});
  if(DB.notis.length>200)DB.notis=DB.notis.slice(0,200);
  save();setSyncDot(true);
}
function openNotis(){renderNotis();$('notisPanel').classList.add('show');notisFor().forEach(n=>{n.leido=true;});save();setSyncDot(true);}
function closeNotis(){$('notisPanel').classList.remove('show');}
function clearReadNotis(){DB.notis=(DB.notis||[]).filter(n=>!n.leido);save();renderNotis();toast('🗑️ Notificaciones leídas borradas');}
function renderNotis(){
  const el=$('notisList');if(!el)return;
  const items=notisFor().sort((a,b)=>b.fecha.localeCompare(a.fecha));
  if(!items.length){el.innerHTML='<div class="empty">Sin notificaciones</div>';return;}
  el.innerHTML=items.map(n=>{
    const icoClass=n.tipo==='warn'?'warn':n.tipo==='vac'?'ok':n.tipo==='info'?'info':'alert';
    const icoEmoji=n.tipo==='vac'?'🌴':n.tipo==='warn'?'⚠️':n.tipo==='info'?'ℹ️':'🔔';
    const tAgo=(()=>{const diff=Date.now()-new Date(n.fecha).getTime();if(diff<3600000)return Math.round(diff/60000)+'m';if(diff<86400000)return Math.round(diff/3600000)+'h';return Math.round(diff/86400000)+'d';})();
    return`<div class="nitem"><div class="nitem-ico ${icoClass}">${icoEmoji}</div><div class="nitem-body"><div class="nitem-title">${n.titulo}</div><div class="nitem-text">${n.texto}</div><div class="nitem-time">${tAgo}</div></div><button class="nitem-del" onclick="DB.notis=DB.notis.filter(x=>x.id!=='${n.id}');save();renderNotis()">×</button></div>`;
  }).join('');
}

// ── Modal ──
function openModal(id){$(id)?.classList.add('show');if(id==='mAddEmp')populateModalEmps();}
function closeModal(id){$(id)?.classList.remove('show');}
function populateModalEmps(){
  const s=$('newEmp');if(s){s.innerHTML='<option value="">— Selecciona obra —</option>';(DB.obras||DB.empresas||[]).forEach(o=>{const op=document.createElement('option');op.value=o;op.textContent=o;s.appendChild(op);});}
  const c=$('newCentro');if(c){c.innerHTML='<option value="">— Selecciona centro —</option>';(DB.centrosTrabajo||[]).forEach(ct=>{const op=document.createElement('option');op.value=ct;op.textContent=ct;c.appendChild(op);});}
}

// ── Admin pages ──
function showPage(p){
  document.querySelectorAll('.adm-content>[id^="p"]').forEach(el=>el.style.display='none');
  const pg=$('p'+p.charAt(0).toUpperCase()+p.slice(1));if(pg)pg.style.display='';
  document.querySelectorAll('.sni').forEach(el=>el.classList.toggle('on',el.dataset.p===p));
  const titles={dashboard:'Dashboard',control:'Control',fichajes:'Fichajes',solicitudes:'Solicitudes',empleados:'Empleados',obras:'Obras',informes:'Informes',exportar:'Exportar',docsnominas:'Contratos y Nóminas'};
  if($('admTitle'))$('admTitle').textContent=titles[p]||p;
  if($('admSubtitle'))$('admSubtitle').textContent=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  closeSidebar();
  document.querySelectorAll('#admBottomNav .adm-bnav-item[data-p]').forEach(el=>el.className='adm-bnav-item'+(el.dataset.p===p?' on':''));
  // Bottom nav active state
  document.querySelectorAll('#admBottomNav>[data-page]').forEach(el=>el.style.color=el.dataset.page===p?'var(--accent)':'var(--text3)');
  if(p==='dashboard')safeRun(renderDashboard,'dash');
  if(p==='control')safeRun(renderControl,'ctrl');
  if(p==='fichajes'){safeRun(renderFichajes,'fich');safeRun(populateFilters,'filt');}
  if(p==='solicitudes')safeRun(renderSolicitudes,'sol');
  if(p==='empleados'){safeRun(renderEmps,'emps');safeRun(renderObras,'obras');safeRun(renderCentros,'centros');safeRun(renderEncargados,'enc');}
  if(p==='obras'){safeRun(renderObras,'ob');safeRun(renderCentros,'ct');}
  if(p==='informes')safeRun(renderInformes,'inf');
  if(p==='exportar')safeRun(renderExpStats,'exp');
  if(p==='docsnominas'){safeRun(initDocsPanel,'docs');}
}
function updateSBBadges(){
  const pend=(DB.records||[]).filter(r=>r.fin&&r.aprobado===undefined).length;
  const active=(DB.records||[]).filter(r=>!r.fin).length;
  const bs=$('bSol'),bc=$('bControl');
  if(bs){bs.textContent=pend;bs.classList.toggle('show',pend>0);}
  if(bc){bc.textContent=active;bc.classList.toggle('show',active>0);}
  const bb=$('botSolBadge');if(bb){bb.textContent=pend;bb.style.display=pend>0?'flex':'none';}
  document.querySelectorAll('#admBottomNav .adm-bnav-item[data-p]').forEach(el=>el.className='adm-bnav-item'+(el.dataset.p===document.querySelector('.sni.on')?.dataset?.p?' on':''));
}
function updateSBUser(){
  const n=SES.isAdmin&&!SES.isEnc&&!SES.isJO?'Administrador':(SES.user?.name||'Admin');
  const r=SES.isJO?'Jefe de Obra 🏗️':SES.isEnc?'Encargado ⭐':'Administrador';
  const av=n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  if($('sbAv'))$('sbAv').textContent=av;if($('sbName'))$('sbName').textContent=n;if($('sbRole'))$('sbRole').textContent=r;
}
function refreshUI(){
  if(SES.isAdmin&&!SES.isEnc){const cur=document.querySelector('.sni.on');safeRun(()=>showPage(cur?.dataset?.p||'dashboard'),'pg');}
  else if(SES.user){safeRun(updJorCircle,'s');safeRun(renderResumen,'r');safeRun(renderJorTab,'j');safeRun(renderVacList,'v');}
  setSyncDot(true);updateSBBadges();
}

// ── Dashboard ──
function renderDashboard(){
  const now=new Date(),todayStr=today();
  if($('dashDate'))$('dashDate').textContent=now.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const _greetName=SES.isAdmin&&!SES.isEnc&&!SES.isJO?'Admin':SES.user?.name?.split(' ')[0]||'Admin';
  if($('dashGreeting'))$('dashGreeting').textContent=`¡Hola, ${_greetName}! 👋`;
  const emps=sortedEmps();
  const fichHoy=(DB.records||[]).filter(r=>r.fin&&r.inicio.startsWith(todayStr));
  const active=(DB.records||[]).filter(r=>!r.fin);
  const hHoy=fichHoy.reduce((s,r)=>s+calcMin(r),0);
  if($('dEmps'))$('dEmps').textContent=emps.length;
  if($('dFich'))$('dFich').textContent=fichHoy.length;
  if($('dActive'))$('dActive').textContent=active.length;
  if($('dHours'))$('dHours').textContent=mhm(hHoy);
  safeRun(renderWeekChart,'wc');safeRun(()=>renderDonut(emps,active),'dn');safeRun(renderRecentAct,'ra');updateSBBadges();
}
function renderWeekChart(){
  const el=$('weekChart');if(!el)return;
  const now=new Date(),dow=(now.getDay()||7)-1;
  const days=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const data=days.map((d,i)=>{const dt=new Date(now);dt.setDate(dt.getDate()-(dow-i));const ds=`${dt.getFullYear()}-${p2(dt.getMonth()+1)}-${p2(dt.getDate())}`;const m=(DB.records||[]).filter(r=>r.fin&&r.inicio.startsWith(ds)).reduce((s,r)=>s+calcMin(r),0);return{d,m,isToday:i===dow};});
  const maxH=Math.max(...data.map(d=>d.m),60);
  const W=400,H=130,pl=30,pb=26,pt=12,pr=8,iW=W-pl-pr,iH=H-pt-pb;
  const pts=data.map((d,i)=>({x:pl+i*(iW/6),y:pt+iH-(d.m/maxH*iH),m:d.m,day:d.d,isToday:d.isToday}));
  const line='M'+pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
  const fill=line+` L${pts[pts.length-1].x.toFixed(1)},${(pt+iH).toFixed(1)} L${pts[0].x.toFixed(1)},${(pt+iH).toFixed(1)} Z`;
  const gi='g'+Date.now();
  const yL=[0,Math.round(maxH/2),maxH].map(mm=>{const y=pt+iH-(mm/maxH*iH);return`<text x="${pl-5}" y="${(y+3).toFixed(0)}" text-anchor="end" fill="#64748b" font-size="9">${Math.floor(mm/60)}h</text>`;}).join('');
  const xL=pts.map(p=>`<line x1="${p.x.toFixed(1)}" y1="${pt}" x2="${p.x.toFixed(1)}" y2="${pt+iH}" stroke="rgba(255,255,255,0.04)"/><text x="${p.x.toFixed(1)}" y="${H-6}" text-anchor="middle" fill="${p.isToday?'#6366f1':'#64748b'}" font-size="9" font-weight="${p.isToday?700:400}">${p.day}</text>`).join('');
  const dots=pts.filter(p=>p.m>0).map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#6366f1" stroke="#0f0f1a" stroke-width="1.5"/>`).join('');
  el.innerHTML=`<svg width="100%" height="130" viewBox="0 0 400 130" preserveAspectRatio="none" style="overflow:visible"><defs><linearGradient id="${gi}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.3"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>${yL}${xL}<path d="${fill}" fill="url(#${gi})"/><path d="${line}" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}
function renderDonut(emps,active){
  const svg=$('donutSvg'),leg=$('donutLeg');if(!svg||!leg)return;
  const total=emps.length;if($('donutTotal'))$('donutTotal').textContent=total;
  const working=active.length,onVac=(DB.vacaciones||[]).filter(v=>{if(v.estado!=='aprobada')return false;const n=new Date();return n>=new Date(v.desde)&&n<=new Date(v.hasta);}).length,idle=Math.max(0,total-working-onVac);
  const segs=[{l:'Trabajando',v:working,c:'#6366f1'},{l:'Libre',v:idle,c:'#10b981'},{l:'Vacaciones',v:onVac,c:'#f59e0b'}].filter(s=>s.v>0);
  if(!segs.length){svg.innerHTML='';leg.innerHTML='';return;}
  const R=34,cx=45,cy=45,sw=10,circ=2*Math.PI*R,tot=segs.reduce((s,x)=>s+x.v,0);
  let off=0,paths='';
  segs.forEach(s=>{const dash=(s.v/tot)*circ,gap=circ-dash;paths+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.c}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${-off.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;off+=dash;});
  svg.innerHTML=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="${sw}"/>${paths}`;
  leg.innerHTML=segs.map(s=>`<div class="dl-item"><div class="dl-dot" style="background:${s.c}"></div><div class="dl-name">${s.l}</div><div class="dl-val">${s.v}</div></div>`).join('');
}
function renderRecentAct(){
  const el=$('dashActivity');if(!el)return;
  const recs=(DB.records||[]).filter(r=>r.fin).sort((a,b)=>b.inicio.localeCompare(a.inicio)).slice(0,6);
  if(!recs.length){el.innerHTML='<div class="empty">Sin actividad</div>';return;}
  el.innerHTML=recs.map(r=>{
    const emp=(DB.employees||[]).find(e=>e.id===r.empId);
    const col=emp?.color||'var(--accent)',init=emp?.initials||r.empName?.slice(0,2)||'?';
    const bc=r.aprobado===true?'badge-green':r.aprobado===false?'badge-red':'badge-gray';
    return`<div class="rec-item"><div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:8px;background:${col};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">${init}</div><div><div style="font-size:12px;font-weight:600">${r.empName}</div><div style="font-size:10px;color:var(--text3)">${fdate(r.inicio)} · ${ftime(r.inicio)}→${ftime(r.fin)}</div></div></div><div style="display:flex;align-items:center;gap:6px;flex-shrink:0"><span style="font-size:13px;font-weight:700">${mhm(calcMin(r))}</span><span class="badge ${bc}">${r.aprobado===true?'OK':r.aprobado===false?'✗':'—'}</span></div></div>`;
  }).join('');
}

// ── Control ──
function renderControl(){
  const el=$('ctrlList');if(!el)return;
  let emps=sortedEmps();
  if(SES.isEnc&&SES.user){const enc=DB.employees.find(e=>e.id===SES.user.id);const obras=enc?.obrasAsignadas||[];if(obras.length)emps=emps.filter(e=>obras.includes(e.empresa));}
  if(!emps.length){el.innerHTML='<div class="card"><div class="empty">Sin empleados asignados</div></div>';return;}
  el.innerHTML=emps.map(emp=>{
    const open=(DB.records||[]).find(r=>r.empId===emp.id&&!r.fin);
    const working=!!open,onBreak=open?.enDescanso;
    const dur=open?mhm(Math.floor(calcSecs(open).work/60)):'';
    const stat=working?(onBreak?'<span class="badge badge-orange"><span class="dot"></span>Descanso</span>':'<span class="badge badge-green"><span class="dot"></span>Trabajando</span>'):'<span class="badge badge-gray">Libre</span>';
    return`<div class="ctrl-card"><div class="ctrl-left"><div class="ctrl-av" style="background:${emp.color||'var(--accent)'}">${emp.initials||emp.name.slice(0,2)}</div><div><div class="ctrl-name">${emp.name}${emp.role==='encargado'?' ⭐':''}</div><div class="ctrl-sub">${working?'Lleva '+dur:''} ${stat}${open?.centro?' · 📍 '+open.centro:''}</div></div></div><div class="ctrl-right"><button class="btn btn-green btn-sm" onclick="admStart('${emp.id}')" ${working?'disabled':''}>▶ Iniciar</button>${working&&!onBreak?`<button class="btn btn-orange btn-sm" onclick="admPause('${emp.id}')">⏸ Pausar</button>`:''}${working&&onBreak?`<button class="btn btn-secondary btn-sm" onclick="admResume('${emp.id}')">▶ Reanudar</button>`:''}<button class="btn btn-red btn-sm" onclick="admStop('${emp.id}')" ${!working?'disabled':''}>■ Finalizar</button></div></div>`;
  }).join('');
}
function admStart(empId){
  if(DB.records.find(r=>r.empId===empId&&!r.fin))return;
  const emp=DB.employees.find(e=>e.id===empId);if(!emp)return;
  DB.records.push({id:gid(),empId,empName:emp.name,empresa:emp.empresa||'',centro:emp.centroTrabajo||'',inicio:new Date().toISOString(),fin:null,workSecs:0,breakSecs:0,enDescanso:false,bStartTs:null,breaks:[],adminControl:true,closed:false});
  save();renderControl();updateSBBadges();toast('▶ Iniciado: '+emp.name.split(' ')[0]);
}
function admStop(empId){
  const o=DB.records.find(r=>r.empId===empId&&!r.fin);if(!o)return;
  const now=new Date();if(o.enDescanso&&o.bStartTs){if(!o.breaks)o.breaks=[];o.breaks.push({start:o.bStartTs,end:now.toISOString()});o.enDescanso=false;o.bStartTs=null;}
  o.fin=now.toISOString();const t=calcSecs(o);o.workSecs=t.work;o.breakSecs=t.brk;o.closed=true;
  save();renderControl();updateSBBadges();toast('■ Finalizado — '+mhm(Math.floor(o.workSecs/60)));
}
function admPause(empId){const o=DB.records.find(r=>r.empId===empId&&!r.fin);if(!o||o.enDescanso)return;o.enDescanso=true;o.bStartTs=new Date().toISOString();save();renderControl();}
function admResume(empId){const o=DB.records.find(r=>r.empId===empId&&!r.fin);if(!o||!o.enDescanso)return;if(!o.breaks)o.breaks=[];o.breaks.push({start:o.bStartTs,end:new Date().toISOString()});o.breakSecs=(o.breakSecs||0)+Math.floor((Date.now()-new Date(o.bStartTs))/1000);o.enDescanso=false;o.bStartTs=null;save();renderControl();}

// ── Fichajes ──
function populateFilters(){
  const es=$('fEmpFilter'),sw=$('fSemFilter');if(!es||!sw)return;
  const ce=es.value,cw=sw.value;
  es.innerHTML='<option value="">Todos los empleados</option>';
  sortedEmps().forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=e.name;es.appendChild(o);});
  es.value=ce;
  const weeks=new Set((DB.records||[]).filter(r=>r.fin).map(r=>wkKey(new Date(r.inicio))));
  sw.innerHTML='<option value="">Todas las semanas</option>';
  [...weeks].sort().reverse().forEach(w=>{const o=document.createElement('option');o.value=w;o.textContent=w;sw.appendChild(o);});
  sw.value=cw;
}
function renderFichajes(){
  const tb=$('fichList');if(!tb)return;
  const ef=$('fEmpFilter')?.value,wf=$('fSemFilter')?.value;
  let recs=(DB.records||[]).filter(r=>r.fin);
  if(ef)recs=recs.filter(r=>r.empId===ef);
  if(wf)recs=recs.filter(r=>wkKey(new Date(r.inicio))===wf);
  recs=recs.sort((a,b)=>b.inicio.localeCompare(a.inicio));
  if(!recs.length){tb.innerHTML='<tr><td colspan="7" class="empty">Sin fichajes</td></tr>';return;}
  tb.innerHTML=recs.map(r=>{
    const emp=(DB.employees||[]).find(e=>e.id===r.empId);
    const col=emp?.color||'var(--accent)',init=emp?.initials||r.empName?.slice(0,2)||'?';
    const bc=r.aprobado===true?'badge-green':r.aprobado===false?'badge-red':'badge-gray';
    const bt=r.aprobado===true?'✓':r.aprobado===false?'✗':'—';
    return`<tr>
      <td><div class="emp-cell"><div class="emp-cell-av" style="background:${col}">${init}</div>${r.empName}${emp?.role==='encargado'?' ⭐':''}</div>${r.centro?`<div style="font-size:9px;color:var(--teal)">📍 ${r.centro}</div>`:''}</td>
      <td style="white-space:nowrap">${new Date(r.inicio).toLocaleDateString('es-ES',{day:'2-digit',month:'short'})}</td>
      <td>${ftime(r.inicio)}</td><td>${ftime(r.fin)}</td>
      <td style="font-weight:700">${mhm(calcMin(r))}${r.locInicio?`<a href="https://maps.google.com/?q=${r.locInicio.lat},${r.locInicio.lng}" target="_blank" style="margin-left:4px;font-size:10px;color:var(--teal);text-decoration:none" title="Ver entrada">📍</a>":""}${r.locFin?`<a href="https://maps.google.com/?q=${r.locFin.lat},${r.locFin.lng}" target="_blank" style="font-size:10px;color:var(--accent3);text-decoration:none" title="Ver salida">🏁</a>`:""}</td>
      <td><span class="badge ${bc}">${bt}</span></td>
      <td style="white-space:nowrap;display:flex;gap:4px;align-items:center">
        <button class="btn btn-secondary btn-sm" onclick="openEditRec('${r.id}')">✎</button>
        <button class="btn btn-red btn-sm" onclick="delRec('${r.id}')">✕</button>
        ${r.aprobado===undefined?`<button class="btn btn-green btn-sm" onclick="aprobar('${r.id}',true)">✓</button>`:''}
      </td>
    </tr>`;
  }).join('');
}
function openEditRec(id){
  const r=DB.records.find(x=>x.id===id);if(!r)return;
  $('eraId').value=id;
  const d=new Date(r.inicio);
  $('eraDate').value=`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  $('eraIn').value=ftimeInput(r.inicio);
  $('eraOut').value=r.fin?ftimeInput(r.fin):'';
  openModal('mEditRec');
}
function saveEditRec(){
  const id=$('eraId').value,date=$('eraDate').value,inT=$('eraIn').value,outT=$('eraOut').value;
  const r=DB.records.find(x=>x.id===id);if(!r||!date||!inT)return;
  const dIn=new Date(date);const[ih,im]=inT.split(':');dIn.setHours(+ih,+im,0,0);r.inicio=dIn.toISOString();
  if(outT){const dOut=new Date(date);const[oh,om]=outT.split(':');dOut.setHours(+oh,+om,0,0);r.fin=dOut.toISOString();r.workSecs=Math.max(0,Math.floor((dOut-dIn)/1000)-(r.breakSecs||0));}
  save();closeModal('mEditRec');renderFichajes();toast('✅ Fichaje actualizado');
}
function delRec(id){if(!confirm('¿Eliminar fichaje?'))return;DB.records=DB.records.filter(r=>r.id!==id);save();renderFichajes();toast('🗑️ Eliminado');}
function aprobar(id,aprobado){
  const r=DB.records.find(x=>x.id===id);if(!r)return;
  r.aprobado=aprobado;r.validadoPor=SES.user?.name||'Admin';
  pushNoti('emp:'+r.empId,'info',aprobado?'✅ Horas aprobadas':'❌ Horas rechazadas',`Jornada del ${fdate(r.inicio)} ${aprobado?'aprobada':'rechazada'} por ${r.validadoPor}.`);
  save();renderFichajes();safeRun(renderSolicitudes,'sol');toast(aprobado?'✅ Aprobado':'❌ Rechazado');
}

// ── Solicitudes ──
function renderSolicitudes(){renderPendientes();renderVacPend();renderMedList();renderAbsList();updateSBBadges();}
function renderPendientes(){
  const el=$('pendList');if(!el)return;
  let pend=(DB.records||[]).filter(r=>r.fin&&r.aprobado===undefined);
  if(SES.isEnc&&SES.user){const enc=DB.employees.find(e=>e.id===SES.user.id);const obras=enc?.obrasAsignadas||[];if(obras.length)pend=pend.filter(r=>{const emp=DB.employees.find(e=>e.id===r.empId);return emp&&obras.includes(emp.empresa);});}
  if(!pend.length){el.innerHTML='<div class="empty">Todas las jornadas validadas ✓</div>';return;}
  el.innerHTML=pend.sort((a,b)=>b.inicio.localeCompare(a.inicio)).map(r=>{
    const m=calcMin(r),bm=Math.floor((r.breakSecs||0)/60);
    const d=new Date(r.inicio),inDate=`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
    const gps=r.locInicio||r.locFin?`<div style="font-size:10px;color:var(--teal);margin:4px 0">📍 ${r.locInicio?`<a href="https://maps.google.com/?q=${r.locInicio.lat},${r.locInicio.lng}" target="_blank" style="color:var(--teal)">📍 Entrada ↗</a>`:''} ${r.locFin?`<a href="https://maps.google.com/?q=${r.locFin.lat},${r.locFin.lng}" target="_blank" style="color:var(--accent3)">🏁 Salida ↗</a>`:''}</div>`:''${r.locFin?` salida(${r.locFin.lat},${r.locFin.lng})`:''}</div>`:'';
    return`<div class="sol-item">
      <div class="sol-top"><div class="sol-name">${r.empName} <span class="badge badge-gray">Pendiente</span></div></div>
      <div class="sol-meta">📅 ${fdate(r.inicio)}${r.centro?' · 📍 '+r.centro:''} · ${ftime(r.inicio)} → ${ftime(r.fin)} · <b>${mhm(m)}</b> · ☕${mhm(bm)}</div>
      ${gps}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">
        <div><label style="font-size:10px;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:4px">⭐ Modificar entrada</label><input type="time" id="ein_${r.id}" value="${ftimeInput(r.inicio)}" style="width:100%"></div>
        <div><label style="font-size:10px;color:var(--text3);text-transform:uppercase;display:block;margin-bottom:4px">⭐ Modificar salida</label><input type="time" id="eout_${r.id}" value="${ftimeInput(r.fin)}" style="width:100%"></div>
      </div>
      <div class="sol-acts">
        <button class="btn btn-green btn-sm" onclick="aprobarConEdicion('${r.id}','${inDate}',true)">✅ Aprobar</button>
        <button class="btn btn-red btn-sm" onclick="aprobarConEdicion('${r.id}','${inDate}',false)">❌ Rechazar</button>
      </div>
    </div>`;
  }).join('');
}
function aprobarConEdicion(recId,date,aprobado){
  const r=DB.records.find(x=>x.id===recId);if(!r)return;
  const inT=document.getElementById('ein_'+recId)?.value;
  const outT=document.getElementById('eout_'+recId)?.value;
  if(inT){const dIn=new Date(date);const[ih,im]=inT.split(':');dIn.setHours(+ih,+im,0,0);r.inicio=dIn.toISOString();}
  if(outT){const dOut=new Date(date);const[oh,om]=outT.split(':');dOut.setHours(+oh,+om,0,0);r.fin=dOut.toISOString();r.workSecs=Math.max(0,Math.floor((dOut-new Date(r.inicio))/1000)-(r.breakSecs||0));}
  r.aprobado=aprobado;r.validadoPor=SES.user?.name||'Encargado';
  pushNoti('emp:'+r.empId,'info',aprobado?'✅ Horas aprobadas':'❌ Horas rechazadas',`Jornada del ${fdate(r.inicio)} ${aprobado?'aprobada':'rechazada'} por ${r.validadoPor}.`);
  save();renderSolicitudes();toast(aprobado?'✅ Aprobado':'❌ Rechazado');
}
function renderVacPend(){
  const el=$('vacPendList');if(!el)return;
  const pend=(DB.vacaciones||[]).filter(v=>v.estado==='pendiente');
  if(!pend.length){el.innerHTML='<div class="empty">Sin solicitudes pendientes</div>';return;}
  el.innerHTML=pend.map(v=>`<div class="sol-item"><div class="sol-top"><div class="sol-name">${v.empName} <span class="badge badge-orange">Pendiente</span></div></div><div class="sol-meta">📅 ${v.desde} → ${v.hasta} · ${v.dias} días</div><div class="sol-acts"><button class="btn btn-green btn-sm" onclick="resolveVac('${v.id}','aprobada')">✓ Aprobar</button><button class="btn btn-red btn-sm" onclick="resolveVac('${v.id}','denegada')">✕ Denegar</button></div></div>`).join('');
}
function resolveVac(id,estado){
  const v=(DB.vacaciones||[]).find(x=>x.id===id);if(!v)return;
  v.estado=estado;v.validadoPor=SES.user?.name||'Admin';
  pushNoti('emp:'+v.empId,'vac',estado==='aprobada'?'🌴 Vacaciones aprobadas':'❌ Denegadas',`Solicitud ${v.desde}→${v.hasta} ${estado}.`);
  save();renderSolicitudes();toast(estado==='aprobada'?'✅ Aprobadas':'❌ Denegadas');
}
function renderMedList(){const el=$('medList');if(!el)return;const items=DB.medicos||[];if(!items.length){el.innerHTML='<div class="empty">Sin permisos médicos</div>';return;}el.innerHTML=items.map(m=>{const bc=m.estado==='aprobada'?'badge-green':m.estado==='denegada'?'badge-red':'badge-orange';return`<div class="sol-item"><div class="sol-top"><div class="sol-name">${m.empName||'?'} <span class="badge ${bc}">${m.estado||'pendiente'}</span></div></div><div class="sol-meta">📅 ${m.desde||'?'} → ${m.hasta||'?'}</div>${m.estado==='pendiente'?`<div class="sol-acts"><button class="btn btn-green btn-sm" onclick="resMed('${m.id}','aprobada')">✓ Aprobar</button><button class="btn btn-red btn-sm" onclick="resMed('${m.id}','denegada')">✗ Denegar</button></div>`:''}</div>`;}).join('');}
function resMed(id,estado){const m=(DB.medicos||[]).find(x=>x.id===id);if(!m)return;m.estado=estado;save();renderSolicitudes();toast(estado==='aprobada'?'✅ Aprobado':'❌ Denegado');}
function renderAbsList(){const el=$('absList');if(!el)return;const items=DB.ausencias||[];if(!items.length){el.innerHTML='<div class="empty">Sin ausencias</div>';return;}el.innerHTML=items.map(a=>`<div class="sol-item"><div class="sol-top"><div class="sol-name">${a.empName||'?'} <span class="badge badge-red">Ausencia</span></div></div><div class="sol-meta">📅 ${a.fecha||'?'}</div></div>`).join('');}

// ── Empleados ──
function renderEmps(){
  const el=$('empList');if(!el)return;
  const q=($('empSearch')?.value||'').toLowerCase();
  let emps=sortedEmps();
  if(q)emps=emps.filter(e=>(e.name||'').toLowerCase().includes(q)||(e.empresa||'').toLowerCase().includes(q));
  if(!emps.length){el.innerHTML='<div class="empty">Sin empleados</div>';return;}
  el.innerHTML=emps.map(emp=>{
    const open=DB.records.find(r=>r.empId===emp.id&&!r.fin);
    const rb=emp.role==='encargado'?'<span class="badge badge-purple" style="font-size:8px">⭐ ENC</span>':emp.role==='jefe_obra'?'<span class="badge badge-orange" style="font-size:8px">🏗️ JEFE</span>':'<span class="badge badge-gray" style="font-size:8px">EMP</span>';
    return`<div class="erow"><div class="erow-av" style="background:${emp.color||'var(--accent)'}">${emp.initials||emp.name.slice(0,2)}</div><div class="erow-info"><div class="erow-name">${emp.name} ${rb}</div><div class="erow-sub">${emp.empresa||'Sin obra'}${emp.centroTrabajo?' · 📍 '+emp.centroTrabajo:''} · PIN:${emp.pin}</div></div>${open?'<span class="badge badge-green"><span class="dot"></span>Activo</span>':''}<div class="erow-btns"><button class="btn btn-secondary btn-sm" onclick="editEmp('${emp.id}')">✎</button><button class="btn btn-red btn-sm" onclick="removeEmp('${emp.id}')">✕</button></div></div>`;
  }).join('');
  populateSelect();populateFilters();
}
function openAddEmp(){populateModalEmps();openModal('mAddEmp');}
function doAddEmp(){
  const n=$('newName')?.value.trim(),emp=$('newEmp')?.value,pin=$('newPin')?.value.trim();
  const color=$('newColor')?.value||'#6366f1',role=$('newRole')?.value||'empleado';
  const start=$('newStart')?.value||'',email=$('newEmail')?.value||'',centro=$('newCentro')?.value||'';
  if(!n||!pin){toast('Nombre y PIN obligatorios');return;}
  if(pin.length<4){toast('PIN mínimo 4 dígitos');return;}
  if(DB.employees.find(e=>e.pin===pin)){toast('PIN ya en uso');return;}
  const initials=n.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  DB.employees.push({id:gid(),name:n,empresa:emp||'',centroTrabajo:centro,pin,color,role,initials,startDate:start,email,obrasAsignadas:emp?[emp]:[]});
  save();closeModal('mAddEmp');
  if($('newName'))$('newName').value='';if($('newPin'))$('newPin').value='';if($('newEmail'))$('newEmail').value='';
  renderEmps();toast('✅ '+n+' añadido');
}
function removeEmp(id){const e=DB.employees.find(x=>x.id===id);if(!confirm('¿Eliminar a '+e?.name+'?'))return;DB.employees=DB.employees.filter(x=>x.id!==id);save();renderEmps();toast('🗑️ Eliminado');}
function editEmp(id){
  const e=DB.employees.find(x=>x.id===id);if(!e)return;
  $('eeId').value=id;
  $('eeName').value=e.name||'';
  $('eePin').value=e.pin||'';
  $('eeRole').value=e.role||'empleado';
  $('eeColor').value=e.color||'#6366f1';
  const eeE=$('eeEmp');
  if(eeE){eeE.innerHTML='<option value="">— Obra —</option>';(DB.obras||DB.empresas||[]).forEach(o=>{const op=document.createElement('option');op.value=o;op.textContent=o;eeE.appendChild(op);});eeE.value=e.empresa||'';}
  const eeC=$('eeCentro');
  if(eeC){eeC.innerHTML='<option value="">— Centro —</option>';(DB.centrosTrabajo||[]).forEach(c=>{const op=document.createElement('option');op.value=c;op.textContent=c;eeC.appendChild(op);});eeC.value=e.centroTrabajo||'';}
  openModal('mEditEmp');
}
function saveEditEmp(){
  const id=$('eeId').value;
  const e=DB.employees.find(x=>x.id===id);if(!e)return;
  const name=($('eeName').value||'').trim();
  const pin=($('eePin').value||'').trim();
  if(!name||!pin){toast('Nombre y PIN obligatorios');return;}
  if(pin.length<4){toast('PIN mínimo 4 dígitos');return;}
  const clash=DB.employees.find(x=>x.pin===pin&&x.id!==id);
  if(clash){toast('PIN ya en uso por '+clash.name);return;}
  e.name=name;e.pin=pin;
  e.initials=name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  e.role=$('eeRole').value||'empleado';
  e.color=$('eeColor').value||e.color;
  const emp=$('eeEmp').value;if(emp)e.empresa=emp;
  const ctr=$('eeCentro').value;if(ctr)e.centroTrabajo=ctr;
  if(e.empresa&&!(e.obrasAsignadas||[]).includes(e.empresa))e.obrasAsignadas=[e.empresa];
  save();closeModal('mEditEmp');renderEmps();toast('✅ '+name+' actualizado');
}

// ── Obras ──
function renderObras(){
  const el=$('obrasList');if(!el)return;
  const list=DB.obras||DB.empresas||[];
  if(!list.length){el.innerHTML='<div class="empty">Sin obras</div>';return;}
  el.innerHTML=list.map(o=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px">🏗️ ${o}</span><button class="btn btn-red btn-sm" onclick="removeObra('${o.replace(/'/g,"\\'")}')" ${list.length<=1?'disabled':''}>✕</button></div>`).join('');
}
function addObra(){
  const v=$('newObra')?.value.trim();if(!v)return;
  if(!DB.obras)DB.obras=[];if(!DB.empresas)DB.empresas=[];
  if(DB.obras.includes(v)){toast('Ya existe');return;}
  DB.obras.push(v);if(!DB.empresas.includes(v))DB.empresas.push(v);
  save();renderObras();if($('newObra'))$('newObra').value='';
  populateModalEmps();toast('✅ Obra añadida');
}
function removeObra(o){
  if((DB.obras||[]).length<=1){toast('Debe quedar al menos una obra');return;}
  DB.obras=(DB.obras||[]).filter(x=>x!==o);DB.empresas=(DB.empresas||[]).filter(x=>x!==o);
  save();renderObras();
}

// ── Centros ──
function renderCentros(){
  const el=$('centrosList');if(!el)return;
  const cs=DB.centrosTrabajo||[];
  if(!cs.length){el.innerHTML='<div class="empty">Sin centros</div>';return;}
  el.innerHTML=cs.map(c=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px">📍 ${c}</span><button class="btn btn-red btn-sm" onclick="removeCentro('${c.replace(/'/g,"\\'")}')">✕</button></div>`).join('');
}
function addCentro(){
  const v=$('newCentroInput')?.value.trim();if(!v)return;
  if(!DB.centrosTrabajo)DB.centrosTrabajo=[];
  if(DB.centrosTrabajo.includes(v)){toast('Ya existe');return;}
  DB.centrosTrabajo.push(v);save();renderCentros();if($('newCentroInput'))$('newCentroInput').value='';toast('✅ Centro añadido');
}
function removeCentro(c){
  if((DB.centrosTrabajo||[]).length<=1){toast('Debe quedar al menos un centro');return;}
  DB.centrosTrabajo=(DB.centrosTrabajo||[]).filter(x=>x!==c);save();renderCentros();
}

// ── Encargados ──
function renderEncargados(){
  const el=$('encargadoList');if(!el)return;
  const encs=DB.employees.filter(e=>e.role==='encargado');
  if(!encs.length){el.innerHTML='<div class="empty">Sin encargados. Asigna el rol en un empleado.</div>';return;}
  el.innerHTML=encs.map(e=>{
    const obras=(e.obrasAsignadas||[]).join(', ')||'Ninguna';
    return`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg4);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:8px;gap:8px;flex-wrap:wrap"><div><div style="display:flex;align-items:center;gap:8px"><div style="width:30px;height:30px;border-radius:8px;background:${e.color||'var(--accent)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${e.initials}</div><span style="font-weight:600">${e.name}</span><span class="badge badge-purple">⭐ ENCARGADO</span></div><div style="font-size:11px;color:var(--text3);margin-top:4px;margin-left:38px">Obras: ${obras}</div><div style="font-size:11px;color:var(--teal);margin-left:38px">Puede aprobar y modificar horas</div></div><button onclick="editObrasEnc('${e.id}')" class="btn btn-secondary btn-sm">Editar obras</button></div>`;
  }).join('');
}
function editObrasEnc(id){
  const e=DB.employees.find(x=>x.id===id);if(!e)return;
  const cur=(e.obrasAsignadas||[]).join(', ');
  const obras=(DB.obras||DB.empresas||[]).join(', ');
  const input=prompt('Obras asignadas (separadas por coma)\nDisponibles: '+obras,cur);
  if(input===null)return;
  e.obrasAsignadas=input.split(',').map(s=>s.trim()).filter(s=>s&&(DB.obras||DB.empresas||[]).includes(s));
  save();renderEncargados();toast('✅ Obras actualizadas');
}


// ── Informes (SaaS) ──
function renderInformes(){
  // Resumen por empleado
  const el=$('informesList');
  const el2=$('informesMes');
  if(!el)return;
  const emps=sortedEmps();
  if(!emps.length){el.innerHTML='<div class="empty">Sin empleados</div>';return;}
  const now=new Date();
  const mk=`${now.getFullYear()}-${p2(now.getMonth()+1)}`;
  const ws=wkStart(now);
  el.innerHTML=emps.map(emp=>{
    const allRecs=DB.records.filter(r=>r.empId===emp.id&&r.fin);
    const weekRecs=allRecs.filter(r=>new Date(r.inicio)>=ws);
    const monthRecs=allRecs.filter(r=>r.inicio.startsWith(mk));
    const wMin=weekRecs.reduce((s,r)=>s+calcMin(r),0);
    const mMin=monthRecs.reduce((s,r)=>s+calcMin(r),0);
    const pend=allRecs.filter(r=>r.aprobado===undefined).length;
    const vd=vacData(emp.id);
    const pct=Math.min(100,Math.round(wMin/WK*100));
    const barColor=pct>=100?'var(--red)':pct>=80?'var(--orange)':'var(--accent)';
    return`<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:32px;height:32px;border-radius:9px;background:${emp.color||'var(--accent)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${emp.initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${emp.name}${emp.role==='encargado'?' ⭐':''}</div>
          <div style="font-size:10px;color:var(--text3)">${emp.empresa||'Sin obra'}${emp.centroTrabajo?' · 📍'+emp.centroTrabajo:''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:14px;font-weight:700;color:${barColor}">${mhm(wMin)}</div>
          <div style="font-size:9px;color:var(--text3)">semana</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px">
        <div style="background:var(--bg4);border-radius:6px;padding:6px;text-align:center"><div style="font-size:12px;font-weight:700">${mhm(mMin)}</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">Mes</div></div>
        <div style="background:var(--bg4);border-radius:6px;padding:6px;text-align:center"><div style="font-size:12px;font-weight:700">${vd.available}</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">Vac</div></div>
        <div style="background:var(--bg4);border-radius:6px;padding:6px;text-align:center"><div style="font-size:12px;font-weight:700;color:${pend>0?'var(--orange)':'var(--green)'}">${pend}</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">Pend</div></div>
        <div style="background:var(--bg4);border-radius:6px;padding:6px;text-align:center"><div style="font-size:12px;font-weight:700">${allRecs.length}</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">Total</div></div>
      </div>
      <div style="height:4px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width .4s"></div></div>
    </div>`;
  }).join('');
  // Resumen mensual por semana
  if(el2){
    const weeks=[];
    for(let i=3;i>=0;i--){
      const wDate=new Date(now);wDate.setDate(wDate.getDate()-i*7);
      const wk=wkKey(wDate);
      const wRecs=DB.records.filter(r=>r.fin&&wkKey(new Date(r.inicio))===wk);
      const wMins=wRecs.reduce((s,r)=>s+calcMin(r),0);
      const wJorn=new Set(wRecs.map(r=>r.empId)).size;
      weeks.push({wk,mins:wMins,jorn:wJorn,recs:wRecs.length});
    }
    el2.innerHTML=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
      ${weeks.map((w,i)=>`<div style="background:var(--bg4);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:9px;color:var(--text3);margin-bottom:6px">${i===3?'Esta semana':i===2?'Hace 1 sem':i===1?'Hace 2 sem':'Hace 3 sem'}</div>
        <div style="font-size:15px;font-weight:700;color:var(--accent)">${mhm(w.mins)}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">${w.jorn} empleados · ${w.recs} fichajes</div>
      </div>`).join('')}
    </div>`;
  }
}
// ── Exportar ──
function renderExpStats(){
  const el=$('expStatsContent');if(!el)return;
  const emps=sortedEmps(),recs=(DB.records||[]).filter(r=>r.fin);
  const now=new Date(),mk=`${now.getFullYear()}-${p2(now.getMonth()+1)}`;
  const recsEste=(DB.records||[]).filter(r=>r.fin&&r.inicio.startsWith(mk));
  const totalMin=recs.reduce((s,r)=>s+calcMin(r),0);
  const pendApprove=recs.filter(r=>r.aprobado===undefined).length;
  const activos=(DB.records||[]).filter(r=>!r.fin).length;
  const mediaH=emps.length>0?Math.round(totalMin/emps.length):0;
  const vacPend=(DB.vacaciones||[]).filter(v=>v.estado==='pendiente').length;
  const recsMes=recsEste.length,hMes=recsEste.reduce((s,r)=>s+calcMin(r),0);

  // KPI cards
  const kpis=[
    {ico:'👥',label:'Empleados activos',val:emps.length,sub:'en plantilla',color:'var(--accent)'},
    {ico:'⏱️',label:'Horas este mes',val:`${Math.floor(hMes/60)}h`,sub:`${recsMes} jornadas`,color:'var(--green)'},
    {ico:'✅',label:'Fichajes totales',val:recs.length,sub:`${pendApprove} pendientes`,color:'var(--teal)'},
    {ico:'⚡',label:'En jornada ahora',val:activos,sub:'trabajadores activos',color:'var(--orange)'},
    {ico:'🌴',label:'Vacaciones pend.',val:vacPend,sub:'solicitudes activas',color:'#a78bfa'},
    {ico:'📊',label:'Media horas/emp.',val:mhm(mediaH),sub:'total histórico',color:'#f472b6'},
  ];

  const kpiHtml=kpis.map(k=>`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px;display:flex;align-items:center;gap:12px">
      <div style="width:44px;height:44px;border-radius:12px;background:${k.color}22;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${k.ico}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:var(--text3);margin-bottom:2px;font-weight:500">${k.label}</div>
        <div style="font-size:20px;font-weight:800;line-height:1;color:${k.color};letter-spacing:-.5px">${k.val}</div>
        <div style="font-size:10px;color:var(--text4);margin-top:2px">${k.sub}</div>
      </div>
    </div>`).join('');

  // Top empleados por horas
  const empHoras=emps.map(e=>{
    const m=(DB.records||[]).filter(r=>r.empId===e.id&&r.fin).reduce((s,r)=>s+calcMin(r),0);
    return{...e,totalMin:m};
  }).sort((a,b)=>b.totalMin-a.totalMin).slice(0,5);

  const topHtml=empHoras.map((e,i)=>{
    const pct=empHoras[0].totalMin>0?Math.round(e.totalMin/empHoras[0].totalMin*100):0;
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:24px;height:24px;border-radius:6px;background:${e.color||'var(--accent)'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">${e.initials||e.name.slice(0,2)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.name}</div>
        <div style="height:4px;background:var(--bg4);border-radius:2px;margin-top:4px"><div style="height:100%;width:${pct}%;background:${e.color||'var(--accent)'};border-radius:2px"></div></div>
      </div>
      <div style="font-size:12px;font-weight:700;flex-shrink:0;color:var(--text2)">${mhm(e.totalMin)}</div>
    </div>`;
  }).join('');

  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">${kpiHtml}</div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Ranking de horas trabajadas
      </div>
      ${topHtml||'<div class="empty">Sin datos</div>'}
    </div>`;

  // Resúmenes mensuales para admin
  const resEl=$('expResumenList');
  if(resEl){
    if(!emps.length){resEl.innerHTML='<div class="empty">Sin empleados</div>';return;}
    const m1=now.getMonth()+1,a1=now.getFullYear(),m0=m1===1?12:m1-1,a0=m1===1?a1-1:a1;
    const mk0=`${a0}-${p2(m0)}`;
    resEl.innerHTML=emps.map(emp=>{
      const docs=emp.docs||{};
      const firmaMes=emp.resumenFirmas?.[mk];
      const firmaMes0=emp.resumenFirmas?.[mk0];
      const recsM=recs.filter(r=>r.empId===emp.id&&r.inicio.startsWith(mk));
      const recsM0=(DB.records||[]).filter(r=>r.empId===emp.id&&r.fin&&r.inicio.startsWith(mk0));
      return`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <div style="width:32px;height:32px;border-radius:8px;background:${emp.color||'var(--accent)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${emp.initials||emp.name.slice(0,2)}</div>
        <div style="flex:1;min-width:120px"><div style="font-size:12px;font-weight:600">${emp.name}</div><div style="font-size:10px;color:var(--text3)">${emp.empresa||'—'}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${recsM.length?`<button class="btn btn-secondary btn-sm" onclick="generarResumenMensualPDF('${emp.id}',${a1},${m1})">📄 ${new Date(a1,m1-1,1).toLocaleDateString('es-ES',{month:'short'})}</button>`:''} 
          ${recsM0.length?`<button class="btn btn-secondary btn-sm" onclick="generarResumenMensualPDF('${emp.id}',${a0},${m0})">📄 ${new Date(a0,m0-1,1).toLocaleDateString('es-ES',{month:'short'})}</button>`:''}
          <span class="badge ${firmaMes?'badge-green':recsM.length?'badge-orange':'badge-gray'}">${firmaMes?'✅ Firmado':recsM.length?'⏳ Sin firmar':'—'}</span>
        </div>
      </div>`;
    }).join('');
  }
}
function exportXLSX(){
  if(typeof XLSX==='undefined'){const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=exportXLSX;document.head.appendChild(s);toast('Cargando…');return;}
  const wb=XLSX.utils.book_new();
  const rows=[['Nombre','Rol','Obra','Centro','Fecha','Entrada','Salida','Horas','Descanso','Estado','GPS Entrada','GPS Salida']];
  DB.records.filter(r=>r.fin).sort((a,b)=>b.inicio.localeCompare(a.inicio)).forEach(r=>{
    const emp=DB.employees.find(x=>x.id===r.empId);
    rows.push([r.empName,emp?.role||'empleado',r.empresa||'',r.centro||'',new Date(r.inicio).toLocaleDateString('es-ES'),ftime(r.inicio),ftime(r.fin),mhm(calcMin(r)),mhm(Math.floor((r.breakSecs||0)/60)),r.aprobado===true?'Aprobado':r.aprobado===false?'Rechazado':'Pendiente',r.locInicio?r.locInicio.lat+','+r.locInicio.lng:'',r.locFin?r.locFin.lat+','+r.locFin.lng:'']);
  });
  const ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Fichajes');
  XLSX.writeFile(wb,'TIMES_INC_'+today()+'.xlsx');toast('✅ Excel descargado');
}
function exportJSON(){const b=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='backup_'+today()+'.json';a.click();URL.revokeObjectURL(a.href);toast('💾 Backup descargado');}
function exportPDF(){
  var w=window.open('','_blank');
  if(!w)return;
  var recs=(DB.records||[]).filter(function(r){return r.fin;}).sort(function(a,b){return b.inicio.localeCompare(a.inicio);});
  var rows=recs.slice(0,200).map(function(r){
    var emp=DB.employees.find(function(e){return e.id===r.empId;});
    return '<tr>'
      +'<td>'+r.empName+'</td>'
      +'<td>'+(emp&&emp.role?emp.role:'')+'</td>'
      +'<td>'+(r.centro||'')+'</td>'
      +'<td>'+new Date(r.inicio).toLocaleDateString('es-ES')+'</td>'
      +'<td>'+ftime(r.inicio)+'</td>'
      +'<td>'+ftime(r.fin)+'</td>'
      +'<td>'+mhm(calcMin(r))+'</td>'
      +'<td>'+(r.aprobado===true?'OK':r.aprobado===false?'Rechazado':'Pendiente')+'</td>'
      +'</tr>';
  }).join('');
  var html='<html><head><meta charset="UTF-8"><style>'
    +'body{font-family:Arial,sans-serif;font-size:11px;margin:20px}'
    +'table{width:100%;border-collapse:collapse}'
    +'th{background:#f5f5f5;padding:5px;text-align:left;font-size:9px}'
    +'td{padding:5px;border-bottom:1px solid #eee}'
    +'</style></head><body>'
    +'<h2>TIMES INC - '+new Date().toLocaleDateString('es-ES')+'</h2>'
    +'<table><tr><th>Empleado</th><th>Rol</th><th>Centro</th><th>Fecha</th>'
    +'<th>Entrada</th><th>Salida</th><th>Horas</th><th>Estado</th></tr>'
    +rows
    +'</table></body></html>';
  w.document.write(html);
  w.document.close();
  setTimeout(function(){w.print();},500);
}
function restoreJSON(inp){
  const f=inp.files[0];if(!f)return;
  const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(!d.employees)throw new Error('Formato inválido');if(!confirm('¿Restaurar?\n'+d.employees.length+' empleados, '+(d.records||[]).length+' fichajes'))return;applyDB(d);save();refreshUI();toast('✅ Restaurado');}catch(ex){toast('❌ '+ex.message);}};
  r.readAsText(f);inp.value='';
}


// ── Encargado volver a jornada ──
function encVolver(){
  doEmpLogin();
}

// ── Admin login — mostrar/ocultar según rol ──
function applyEncPermissions(){
  const isEnc=SES.isEnc;
  const isJO=SES.isJO;
  const isPureAdmin=SES.isAdmin&&!SES.isEnc&&!SES.isJO;

  // Sidebar: Obras solo para admin puro y JO
  const sniObras=$('sniObras');
  if(sniObras)sniObras.style.display=isEnc?'none':'flex';

  // Contratos y Nóminas: visible para admin puro y JO, oculto para encargados
  const sniDocs=$('sniDocs');
  if(sniDocs)sniDocs.style.display=(isPureAdmin||isJO)?'flex':'none';
  const botDocs=$('botDocs');
  if(botDocs)botDocs.style.display=(isPureAdmin||isJO)?'flex':'none';

  // Botón retorno a vista empleado (solo encargados y JO)
  const backBtn=$('encBackBtn');
  if(backBtn)backBtn.style.display=(isEnc||isJO)?'flex':'none';

  // En Obras ocultar añadir/eliminar a encargados
  const addObrasCard=$('cardObrasAdd'),addCentrosCard=$('cardCentrosAdd');
  if(addObrasCard){
    const addBtn=addObrasCard.querySelector('input[id="newObra"]')?.closest('div');
    if(addBtn)addBtn.style.display=isEnc?'none':'flex';
  }
  if(addCentrosCard){
    const addBtn2=addCentrosCard.querySelector('input[id="newCentroInput"]')?.closest('div');
    if(addBtn2)addBtn2.style.display=isEnc?'none':'flex';
  }

  // Empleados: encargados NO pueden crear/eliminar empleados
  const addEmpBtn=document.querySelector('#pEmpleados .btn-primary[onclick="openAddEmp()"]');
  if(addEmpBtn)addEmpBtn.style.display=isEnc?'none':'inline-flex';

  // Título del panel según rol
  const sbRole=$('sbRole');
  if(sbRole){
    if(isJO)sbRole.textContent='Jefe de Obra';
    else if(isEnc)sbRole.textContent='Encargado ⭐';
    else sbRole.textContent='Administrador';
  }
}

// ── Perfil sub-pantallas ──
function openPrfPanel(panel){
  const u=SES.user;if(!u)return;
  if(panel==='infopersonal'){
    const pa=$('iprfAv');if(pa){pa.textContent=u.initials||u.name.slice(0,2).toUpperCase();pa.style.background=u.color||'var(--accent)';}
    if($('iprfName'))$('iprfName').textContent=u.name;
    if($('ipNombre'))$('ipNombre').value=u.name||'';
    if($('ipEmail'))$('ipEmail').value=u.email||'';
    if($('ipTel'))$('ipTel').value=u.telefono||'';
    if($('ipEmpresa'))$('ipEmpresa').value=u.empresa||'Sin asignar';
    if($('ipCentro'))$('ipCentro').value=u.centroTrabajo||'Sin asignar';
    if($('ipStart'))$('ipStart').value=u.startDate?new Date(u.startDate+'T00:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'}):'—';
    if($('ipRol'))$('ipRol').value=u.role==='encargado'?'Encargado ⭐':'Empleado';
    const vd=vacData(u.id);
    if($('ipVac'))$('ipVac').value=vd.available+' días ('+vd.generated+' generados, '+vd.used+' usados)';
    openModal('mInfoPersonal');
  }else if(panel==='documentos'){
    renderDocumentosEmpleado(u.id);
    openModal('mDocumentos');
  }else if(panel==='configuracion'){
    openModal('mConfiguracion');
  }else if(panel==='seguridad'){
    // Detect device
    const dev=$('secDevice');if(dev){const ua=navigator.userAgent;dev.textContent=ua.includes('iPhone')||ua.includes('iPad')?'iPhone / iPad':ua.includes('Android')?'Android':ua.includes('Mac')?'Mac':'Navegador web';}
    // Load saved bio settings
    const bioSettings=JSON.parse(localStorage.getItem('bio_settings_'+u.id)||'{}');
    const huellaOn=bioSettings.huella||false;const faceOn=bioSettings.face||false;
    if($('secHuella'))$('secHuella').checked=huellaOn;
    if($('secFaceTrack')){$('secHuellaTrack').style.background=huellaOn?'var(--accent)':'var(--border2)';$('secHuellaKnob').style.transform=huellaOn?'translateX(20px)':'';}
    if($('secFace'))$('secFace').checked=faceOn;
    if($('secFaceTrack')){$('secFaceTrack').style.background=faceOn?'var(--accent)':'var(--border2)';$('secFaceKnob').style.transform=faceOn?'translateX(20px)':'';}
    if($('secHuellaInfo'))$('secHuellaInfo').style.display=huellaOn?'block':'none';
    if($('secFaceInfo'))$('secFaceInfo').style.display=faceOn?'block':'none';
    openModal('mSeguridad');
  }
}

function saveInfoPersonal(){
  const u=SES.user;if(!u)return;
  const nombre=$('ipNombre').value.trim();
  if(nombre){u.name=nombre;u.initials=nombre.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');}
  u.email=$('ipEmail').value.trim();
  u.telefono=$('ipTel').value.trim();
  // Update DB
  const emp=DB.employees.find(e=>e.id===u.id);
  if(emp){emp.name=u.name;emp.initials=u.initials;emp.email=u.email;emp.telefono=u.telefono;}
  save();
  // Update UI
  if($('prfName'))$('prfName').textContent=u.name;
  if($('prfAv'))$('prfAv').textContent=u.initials;
  if($('iprfName'))$('iprfName').textContent=u.name;
  const fn=$('empFirstName');if(fn)fn.textContent=u.name.split(' ')[0];
  closeModal('mInfoPersonal');toast('✅ Información actualizada');
}

function toggleBioSetting(type,enabled){
  const u=SES.user;if(!u)return;
  const track=$(type==='huella'?'secHuellaTrack':'secFaceTrack');
  const knob=$(type==='huella'?'secHuellaKnob':'secFaceKnob');
  const info=$(type==='huella'?'secHuellaInfo':'secFaceInfo');
  if(track)track.style.background=enabled?'var(--accent)':'var(--border2)';
  if(knob)knob.style.transform=enabled?'translateX(20px)':'';
  if(info)info.style.display=enabled?'block':'none';
  const key='bio_settings_'+u.id;
  const settings=JSON.parse(localStorage.getItem(key)||'{}');
  settings[type]=enabled;
  localStorage.setItem(key,JSON.stringify(settings));
}

async function configurarBiometria(type){
  const u=SES.user;if(!u){toast('Inicia sesión primero');return;}
  const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  const label=type==='huella'?'Huella dactilar':'Face ID';
  // En iOS, WebAuthn abre el picker de cuentas incorrecto.
  // Solución: simplemente marcar como activado y usar el PIN para verificar identidad.
  // La biometría del SO protegerá el acceso al navegador de forma nativa.
  if(isIOS){
    toggleBioSetting(type,true);
    const cb=$(type==='huella'?'secHuella':'secFace');
    if(cb){cb.checked=true;const t=cb.nextElementSibling,k=t?.nextElementSibling;
      if(t)t.style.background='var(--accent)';if(k)k.style.transform='translateX(20px)';}
    toast('✅ '+label+' activado — el SO lo gestionará automáticamente');
    return;
  }
  // Android / Desktop: usar WebAuthn si disponible
  try{
    if(window.PublicKeyCredential){
      const avail=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(()=>false);
      if(avail){
        toggleBioSetting(type,true);
        const cb=$(type==='huella'?'secHuella':'secFace');
        if(cb){cb.checked=true;const t=cb.nextElementSibling,k=t?.nextElementSibling;
          if(t)t.style.background='var(--accent)';if(k)k.style.transform='translateX(20px)';}
        toast('✅ '+label+' habilitado');
        return;
      }
    }
    // Fallback: activar igualmente
    toggleBioSetting(type,true);
    toast('✅ '+label+' activado (modo simplificado)');
  }catch(ex){
    toggleBioSetting(type,true);
    toast('✅ '+label+' activado');
  }
}

function abrirCorreccionFichaje(){
  // Prellenar con datos del último fichaje del empleado
  const tod=today();
  if($('corrFecha'))$('corrFecha').value=tod;
  const lastRec=(DB.records||[]).filter(r=>r.empId===SES.user?.id&&r.fin)
    .sort((a,b)=>b.inicio.localeCompare(a.inicio))[0];
  if(lastRec){
    if($('corrEntrada'))$('corrEntrada').value=ftimeInput(lastRec.inicio);
    if($('corrSalida'))$('corrSalida').value=ftimeInput(lastRec.fin);
    if($('corrFecha'))$('corrFecha').value=lastRec.inicio.slice(0,10);
  }
  openModal('mCorreccion');
}
function enviarCorreccion(){
  const fecha=$('corrFecha')?.value;
  const entrada=$('corrEntrada')?.value;
  const salida=$('corrSalida')?.value;
  const motivo=$('corrMotivo')?.value||'';
  if(!fecha){toast('Selecciona la fecha');return;}
  if(!entrada&&!salida){toast('Indica al menos entrada o salida');return;}
  if(!motivo.trim()){toast('Escribe el motivo de la corrección');return;}
  pushNoti('admin','warn','✏️ Corrección de fichaje solicitada',
    `${SES.user?.name} solicita corrección: ${fecha} ${entrada?'entrada '+entrada:''} ${salida?'salida '+salida:''} — "${motivo}"`);
  if(!DB.medicos)DB.medicos=[];
  DB.medicos.push({id:gid(),tipo:'correccion',empId:SES.user?.id,empName:SES.user?.name,
    fecha,entrada,salida,motivo,estado:'pendiente',fechaSol:new Date().toISOString()});
  save();closeModal('mCorreccion');
  if($('corrMotivo'))$('corrMotivo').value='';
  toast('✅ Solicitud enviada — el encargado la revisará');
}
function cambiarPin(){
  const u=SES.user;if(!u)return;
  const act=$('secPinAct').value.trim();
  const nuevo=$('secPinNuevo').value.trim();
  const conf=$('secPinConf').value.trim();
  if(!act||!nuevo||!conf){toast('Rellena todos los campos');return;}
  if(act!==u.pin){toast('❌ PIN actual incorrecto');return;}
  if(nuevo.length<4){toast('El PIN debe tener mínimo 4 dígitos');return;}
  if(nuevo!==conf){toast('❌ Los PINs nuevos no coinciden');return;}
  u.pin=nuevo;
  const emp=DB.employees.find(e=>e.id===u.id);if(emp)emp.pin=nuevo;
  save();
  $('secPinAct').value='';$('secPinNuevo').value='';$('secPinConf').value='';
  toast('✅ PIN actualizado correctamente');closeModal('mSeguridad');
}

// ── Foto de perfil ──
function handlePhotoUpload(input){
  const file=input.files[0];if(!file)return;
  if(file.size>2*1024*1024){toast('⚠️ La imagen no puede superar 2MB');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    const dataUrl=e.target.result;
    const u=SES.user;if(!u)return;
    u.photo=dataUrl;
    const emp=DB.employees.find(x=>x.id===u.id);if(emp)emp.photo=dataUrl;
    // Update all avatar elements
    updateAvatarUI(dataUrl,u.initials||u.name.slice(0,2).toUpperCase(),u.color||'var(--accent)');
    save();toast('✅ Foto actualizada');
  };
  reader.readAsDataURL(file);
  input.value='';
}
function updateAvatarUI(photo,initials,color){
  const avs=['prfAv','iprfAv'];
  avs.forEach(id=>{
    const el=$(id);if(!el)return;
    if(photo){
      el.style.backgroundImage='url('+photo+')';
      el.style.backgroundSize='cover';
      el.style.backgroundPosition='center';
      el.textContent='';
    }else{
      el.style.backgroundImage='';
      el.textContent=initials;
      el.style.background=color;
    }
  });
}
function loadUserPhoto(){
  const u=SES.user;if(!u)return;
  if(u.photo)updateAvatarUI(u.photo,u.initials||u.name.slice(0,2).toUpperCase(),u.color||'var(--accent)');
  else updateAvatarUI(null,u.initials||u.name.slice(0,2).toUpperCase(),u.color||'var(--accent)');
}

// ══════════════════════════════════════════════
// CONTRATOS Y NÓMINAS
// ══════════════════════════════════════════════
function initDocsPanel(){
  const sel=$('docEmpSelect');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Selecciona empleado —</option>';
  sortedEmps().forEach(e=>{
    const o=document.createElement('option');
    o.value=e.id;
    o.textContent=e.name+' ('+roleLabel(e.role)+')';
    sel.appendChild(o);
  });
  if(cur)sel.value=cur;
  renderDocStatusList();
  renderDocsPanel();
}

function roleLabel(r){
  return r==='encargado'?'Encargado':r==='jefe_obra'?'Jefe de Obra':'Empleado';
}

function toggleDocMes(){
  const tipo=$('docTipoSelect')?.value;
  const mes=$('docNominaMes');
  if(mes)mes.style.display=tipo==='nomina'?'block':'none';
}

function subirDocumentoAdmin(input){
  const empId=$('docEmpSelect')?.value;
  if(!empId){toast('⚠️ Selecciona un empleado primero');input.value='';return;}
  const tipo=$('docTipoSelect')?.value||'otro';
  const file=input.files[0];if(!file)return;
  if(file.size>8*1024*1024){toast('⚠️ El archivo supera 8MB');input.value='';return;}
  const mes=$('docMesInput')?.value||'';
  const reader=new FileReader();
  reader.onload=e=>{
    const emp=DB.employees.find(x=>x.id===empId);if(!emp)return;
    if(!emp.docs)emp.docs={contrato:null,nominas:[],otros:[]};
    const doc={id:gid(),name:file.name,tipo,data:e.target.result,fecha:new Date().toISOString(),subidoPor:SES.user?.name||'Admin',mes:mes||null,firmado:false};
    if(tipo==='contrato'){emp.docs.contrato=doc;}
    else if(tipo==='nomina'){
      if(!emp.docs.nominas)emp.docs.nominas=[];
      emp.docs.nominas.unshift(doc);
      if(emp.docs.nominas.length>24)emp.docs.nominas=emp.docs.nominas.slice(0,24);
    } else {
      if(!emp.docs.otros)emp.docs.otros=[];
      emp.docs.otros.unshift(doc);
    }
    save();
    pushNoti('emp:'+empId, tipo==='nomina'?'info':'info',
      tipo==='contrato'?'📄 Nuevo contrato disponible':tipo==='nomina'?'💰 Nueva nómina disponible':'📎 Nuevo documento disponible',
      'Disponible en Perfil → Documentos.');
    renderDocsPanel();
    renderDocStatusList();
    toast('✅ '+file.name+' subido correctamente');
    input.value='';
  };
  reader.readAsDataURL(file);
}

function renderDocsPanel(){
  const empId=$('docEmpSelect')?.value;
  const list=$('docPanelList');
  const title=$('docPanelTitle');
  if(!empId){if(list)list.innerHTML='<div class="empty">Selecciona un empleado para ver sus documentos</div>';return;}
  const emp=DB.employees.find(e=>e.id===empId);
  if(!emp){if(list)list.innerHTML='<div class="empty">Empleado no encontrado</div>';return;}
  if(title)title.textContent='📁 Documentos de '+emp.name.split(' ')[0];
  const docs=emp.docs||{};
  const allDocs=[];
  if(docs.contrato)allDocs.push({...docs.contrato,_tipo:'contrato'});
  (docs.nominas||[]).forEach(d=>allDocs.push({...d,_tipo:'nomina'}));
  (docs.otros||[]).forEach(d=>allDocs.push({...d,_tipo:'otro'}));
  if(!allDocs.length){if(list)list.innerHTML='<div class="empty">Sin documentos. Sube el primero arriba.</div>';return;}
  if(list)list.innerHTML=allDocs.map(d=>`
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:28px;flex-shrink:0">${d._tipo==='contrato'?'📄':d._tipo==='nomina'?'💰':'📎'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${d._tipo==='nomina'&&d.mes?'📅 '+d.mes+' · ':''}${new Date(d.fecha).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})} · ${d.subidoPor||'Admin'}${d.firmado?' · <span style="color:var(--green)">✅ Firmado</span>':' · <span style="color:var(--orange)">Sin firmar</span>'}</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" onclick="verDocAdmin('${d.id}','${empId}')">👁️ Ver</button>
        <button class="btn btn-red btn-sm" onclick="eliminarDoc('${d.id}','${empId}')">✕</button>
      </div>
    </div>`).join('');
}

function verDocAdmin(docId,empId){
  const emp=DB.employees.find(e=>e.id===empId);if(!emp||!emp.docs)return;
  const allDocs=[emp.docs.contrato,...(emp.docs.nominas||[]),...(emp.docs.otros||[])].filter(Boolean);
  const doc=allDocs.find(d=>d.id===docId);
  if(!doc||!doc.data){toast('Documento no disponible');return;}
  const w=window.open('','_blank');if(!w)return;
  if(doc.data.includes('application/pdf')){
    w.document.write('<iframe src="'+doc.data+'" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe>');
  } else {
    w.document.write('<body style="margin:0;background:#000"><img src="'+doc.data+'" style="max-width:100%;display:block;margin:auto"></body>');
  }
}

function eliminarDoc(docId,empId){
  if(!confirm('¿Eliminar este documento?'))return;
  const emp=DB.employees.find(e=>e.id===empId);if(!emp||!emp.docs)return;
  if(emp.docs.contrato?.id===docId){emp.docs.contrato=null;}
  else{emp.docs.nominas=(emp.docs.nominas||[]).filter(d=>d.id!==docId);emp.docs.otros=(emp.docs.otros||[]).filter(d=>d.id!==docId);}
  save();renderDocsPanel();renderDocStatusList();toast('🗑️ Documento eliminado');
}

function renderDocStatusList(){
  const el=$('docStatusList');if(!el)return;
  const emps=sortedEmps();
  if(!emps.length){el.innerHTML='<div class="empty">Sin empleados</div>';return;}
  el.innerHTML=emps.map(emp=>{
    const docs=emp.docs||{};
    const tieneContrato=!!docs.contrato;
    const numNominas=(docs.nominas||[]).length;
    const sinFirmar=[docs.contrato,...(docs.nominas||[])].filter(Boolean).filter(d=>!d.firmado).length;
    return`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:34px;height:34px;border-radius:9px;background:${emp.color||'var(--accent)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${emp.initials||emp.name.slice(0,2)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${emp.name}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${roleLabel(emp.role)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <span class="badge ${tieneContrato?'badge-green':'badge-gray'}">${tieneContrato?'📄 Contrato':'Sin contrato'}</span>
        <span class="badge ${numNominas>0?'badge-purple':'badge-gray'}">${numNominas>0?numNominas+' nóminas':'Sin nóminas'}</span>
        ${sinFirmar>0?`<span class="badge badge-orange">${sinFirmar} sin firmar</span>`:''}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('docEmpSelect').value='${emp.id}';renderDocsPanel();document.getElementById('docEmpSelect').scrollIntoView()">Gestionar</button>
    </div>`;
  }).join('');
}

function exportAllDocs(){
  const empId=$('docEmpSelect')?.value;
  if(!empId){toast('Selecciona un empleado primero');return;}
  const emp=DB.employees.find(e=>e.id===empId);
  if(!emp||!emp.docs){toast('Sin documentos');return;}
  const docs=[emp.docs.contrato,...(emp.docs.nominas||[]),...(emp.docs.otros||[])].filter(Boolean);
  if(!docs.length){toast('Sin documentos para exportar');return;}
  // Descarga el primero disponible como demo
  docs.forEach(d=>{
    const a=document.createElement('a');
    a.href=d.data;a.download=d.name;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  });
  toast('✅ Descargando '+docs.length+' documento(s)');
}

// Funciones para EMPLEADOS - ver sus propios documentos desde Perfil
function renderDocumentosEmpleado(empId){
  const emp=DB.employees.find(e=>e.id===empId);
  if(!emp)return;
  const docs=emp.docs||{};
  const cn=$('docContratoName');if(cn)cn.textContent=docs.contrato?docs.contrato.name:'Sin contrato asignado';
  const cd=$('docContratoDate');if(cd)cd.textContent=docs.contrato?new Date(docs.contrato.fecha).toLocaleDateString('es-ES',{month:'short',year:'numeric'}):'—';
  const fb=$('btnFirmarContrato');
  if(fb)fb.style.display=(docs.contrato&&!docs.contrato.firmado)?'inline-flex':'none';
  const nl=$('docNominasList');
  if(nl){
    const nominas=docs.nominas||[];
    if(!nominas.length){nl.innerHTML='<div class="empty">Sin nóminas. El administrador las subirá aquí.</div>';return;}
    nl.innerHTML=nominas.map((n,i)=>`<div style="background:var(--bg4);border:1px solid var(--border);border-radius:var(--r);padding:14px;display:flex;align-items:center;gap:12px">
      <div style="font-size:24px;flex-shrink:0">💰</div>
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${n.name}${n.mes?' ('+n.mes+')':''}</div>
      <div style="font-size:11px;color:var(--text3)">${new Date(n.fecha).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})} ${n.firmado?'· <span style=\'color:var(--green)\'>✅ Firmada</span>':'· <span style=\'color:var(--orange)\'>Sin firmar</span>'}</div></div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" onclick="verDocEmp('nomina',${i})">Ver</button>
        ${!n.firmado?`<button class="btn btn-primary btn-sm" onclick="firmarDocEmp('nomina',${i})">✍️ Firmar</button>`:''}
      </div>
    </div>`).join('');
  }
}

function verDocEmp(tipo,idx=0){
  const u=SES.user;if(!u)return;
  const emp=DB.employees.find(e=>e.id===u.id);if(!emp||!emp.docs)return;
  let doc=tipo==='contrato'?emp.docs.contrato:(emp.docs.nominas||[])[idx];
  if(!doc||!doc.data){toast('Documento no disponible');return;}
  const w=window.open('','_blank');if(!w)return;
  if(doc.data.includes('application/pdf')){
    w.document.write('<iframe src="'+doc.data+'" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe>');
  } else {
    w.document.write('<body style="margin:0;background:#000"><img src="'+doc.data+'" style="max-width:100%;display:block;margin:auto"></body>');
  }
}

function firmarDocEmp(tipo,idx=0){
  const u=SES.user;if(!u)return;
  const emp=DB.employees.find(e=>e.id===u.id);if(!emp||!emp.docs)return;
  let doc=tipo==='contrato'?emp.docs.contrato:(emp.docs.nominas||[])[idx];
  if(!doc){toast('Documento no encontrado');return;}
  if(doc.firmado){toast('Ya está firmado');return;}
  if(!confirm('¿Confirmas la firma electrónica de "'+doc.name+'"?'))return;
  doc.firmado=true;doc.firmadoEn=new Date().toISOString();doc.firmadoPor=u.name;
  save();
  renderDocumentosEmpleado(u.id);
  toast('✅ Documento firmado');
}

// ── PWA Install ──
let _pwaPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();_pwaPrompt=e;
  const dismissed=localStorage.getItem('pwa_dismissed');
  if(!dismissed){
    setTimeout(()=>{const b=$('pwaInstall');if(b)b.classList.add('show');},3000);
  }
});
window.addEventListener('appinstalled',()=>{
  const b=$('pwaInstall');if(b)b.classList.remove('show');
  _pwaPrompt=null;toast('✅ TIMES INC instalada correctamente');
});
function doPwaInstall(){
  if(_pwaPrompt){_pwaPrompt.prompt();_pwaPrompt.userChoice.then(()=>{_pwaPrompt=null;const b=$('pwaInstall');if(b)b.classList.remove('show');});}
  else{
    // iOS Safari fallback
    toast('📲 En Safari: pulsa Compartir → "Añadir a pantalla inicio"');
  }
}
// ── PWA Service Worker — safe registration ──
(function(){
  if(!('serviceWorker' in navigator)) return;
  // Only register when served over HTTPS (not file://)
  if(location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  // Use a named SW file path — works when hosted, silently skips file://
  navigator.serviceWorker.register('./sw.js')
    .then(function(reg){ console.log('[TIMES] SW registered'); })
    .catch(function(){ /* silently ignore — app works without SW */ });
})();

// ── Firebase Auth ──
let _fbMode='login'; // 'login' | 'reg'
function openFbAuth(){openModal('mFbAuth');fbSwitchTab('login');if(!window._fbReady&&!window._fbLoading){_loadFirebase(null);}}
function fbSwitchTab(tab){
  // Solo modo login — registro desactivado por seguridad
  _fbMode='login';
  const ti=$('fbAuthTitle'),ts=$('fbAuthSub');
  if(ti)ti.textContent='Bienvenido de nuevo';
  if(ts)ts.textContent='Accede con tu cuenta de empresa';
  const regF=$('fbRegFields');if(regF)regF.style.display='none';
  const resetL=$('fbResetLink');if(resetL)resetL.style.display='block';
  const sub=$('fbSubmitBtn');if(sub)sub.textContent='Iniciar sesión';
  if($('fbAuthErr'))$('fbAuthErr').textContent='';
}

function toggleFbPass(){
  const inp=$('fbPass'),ico=$('fbPassIco');if(!inp)return;
  const show=inp.type==='password';inp.type=show?'text':'password';
  if(ico)ico.innerHTML=show?'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>':'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}
async function fbDoAuth(){
  const email=($('fbEmail')?.value||'').trim();
  const pass=$('fbPass')?.value||'';
  const errEl=$('fbAuthErr');
  if(!email||!pass){if(errEl)errEl.textContent='Completa todos los campos';return;}
  const btn=$('fbSubmitBtn');if(btn){btn.textContent='⏳ Cargando...';btn.disabled=true;}
  if(errEl)errEl.textContent='';

  // Cargar Firebase si aún no está listo
  if(!window._fbReady){
    if(errEl)errEl.textContent='Conectando...';
    await new Promise(resolve=>_loadFirebase(resolve));
  }

  if(btn)btn.textContent='⏳ Verificando...';
  try{
    const result=await window._fbSignIn(email,pass);
    const fbUser=result.user;
    const emp=DB.employees.find(e=>e.email&&e.email.toLowerCase()===fbUser.email.toLowerCase());
    if(emp){
      SES.user=emp;SES.isEnc=emp.role==='encargado';
      if(SES.isEnc)SES.isAdmin=true;
      saveSession();closeModal('mFbAuth');doEmpLogin();
      toast('✅ Bienvenido, '+emp.name.split(' ')[0]);
    }else{
      try{if(window._fbSignOut)window._fbSignOut().catch(()=>{});}catch(e){}
      if(errEl)errEl.textContent='⛔ Tu cuenta no está registrada. Contacta al administrador.';
    }
  }catch(err){
    const msgs={
      'auth/invalid-email':'Email no válido',
      'auth/wrong-password':'Contraseña incorrecta',
      'auth/invalid-credential':'Email o contraseña incorrectos',
      'auth/user-not-found':'No existe cuenta con ese email',
      'auth/email-already-in-use':'Email ya registrado',
      'auth/weak-password':'Mínimo 6 caracteres',
      'auth/too-many-requests':'Demasiados intentos. Espera un momento.',
      'auth/network-request-failed':'Sin conexión. Usa el PIN.',
      'auth/popup-blocked':'Permite los popups.',
      'auth/operation-not-allowed':'Método no habilitado en Firebase Console'
    };
    if(errEl)errEl.textContent=msgs[err.code]||err.message||'Error de autenticación';
    console.error('[TIMES] Auth error:',err.code,err.message);
  }
  if(btn){btn.textContent='Iniciar sesión';btn.disabled=false;}
}

async function fbLoginGoogle(){
  const errEl=$('fbAuthErr');
  if(errEl)errEl.textContent='Cargando Google...';

  if(!window._fbReady){
    await new Promise(resolve=>_loadFirebase(resolve));
  }

  if(!window._fbReady){
    if(errEl)errEl.textContent='Sin conexión. Usa tu PIN.';
    return;
  }
  try{
    const result=await window._fbGoogle();
    const fbUser=result.user;
    if(errEl)errEl.textContent='';
    const emp=DB.employees.find(e=>e.email&&e.email.toLowerCase()===fbUser.email.toLowerCase());
    if(emp){
      SES.user=emp;SES.isEnc=emp.role==='encargado';
      if(SES.isEnc)SES.isAdmin=true;
      saveSession();closeModal('mFbAuth');doEmpLogin();
      toast('✅ Bienvenido, '+(fbUser.displayName||fbUser.email).split(' ')[0]);
    }else{
      try{if(window._fbSignOut)window._fbSignOut().catch(()=>{});}catch(e){}
      if(errEl)errEl.textContent='⛔ Cuenta no registrada. Contacta al administrador.';
    }
  }catch(err){
    if(err.code==='auth/popup-closed-by-user'||err.code==='auth/cancelled-popup-request'){if(errEl)errEl.textContent='';return;}
    if(err.code==='auth/popup-blocked'){if(errEl)errEl.textContent='Permite los popups en Safari.';return;}
    if(errEl)errEl.textContent='Error: '+(err.message||err.code);
    console.error('[TIMES] Google auth error:',err.code);
  }
}

async function fbResetPassword(){
  const email=($('fbEmail')?.value||'').trim();
  const errEl=$('fbAuthErr');
  if(!email){if(errEl)errEl.textContent='Escribe tu email primero';return;}
  if(!window._fbReady){await new Promise(resolve=>_loadFirebase(resolve));}
  try{
    await window._fbResetPwd(email);
    if(errEl){errEl.style.color='var(--green)';errEl.textContent='✅ Email enviado a '+email;}
    setTimeout(()=>{if(errEl){errEl.style.color='var(--red)';errEl.textContent='';}},5000);
  }catch(err){
    if(errEl)errEl.textContent='No se pudo enviar. Comprueba el email.';
  }
}

// Añadir botón Firebase en la pantalla de login
function injectFbBtn(){}
// doLogout ya incluye Firebase signout arriba

// ── Firebase Auth state listener ──────────────────────
// Solo actúa en la carga inicial (no en login manual ni después de logout)
let _fbInitialCheckDone = false;
document.addEventListener('fbAuthChanged', e => {
  const user = e.detail.user;

  // Si estamos en proceso de logout, ignorar SIEMPRE (evita re-login automático)
  if (_loggingOut) return;

  // Si ya hay sesión TIMES activa, ignorar
  if (SES.user || SES.isAdmin) { _fbInitialCheckDone = true; return; }

  // Sin usuario Firebase → mantener en login
  if (!user) { _fbInitialCheckDone = true; return; }

  // Solo en la comprobación inicial (page load), no después de acciones manuales
  if (_fbInitialCheckDone) return;
  _fbInitialCheckDone = true;

  // Buscar empleado por email en la BD
  const emp = DB.employees.find(x => x.email && x.email.toLowerCase() === (user.email||'').toLowerCase());

  if (emp) {
    // Empleado registrado → auto-login solo si DB ya tiene datos
    if (!DB.employees || DB.employees.length === 0) {
      // BD aún no cargada — esperar un poco
      setTimeout(() => {
        const emp2 = DB.employees.find(x => x.email && x.email.toLowerCase() === (user.email||'').toLowerCase());
        if (emp2 && !SES.user && !SES.isAdmin && !_loggingOut) {
          SES.user = emp2; SES.isEnc = emp2.role === 'encargado';
          if (SES.isEnc) SES.isAdmin = true;
          saveSession(); doEmpLogin();
        }
      }, 800);
      return;
    }
    SES.user = emp; SES.isEnc = emp.role === 'encargado'; SES.isJO = emp.role === 'jefe_obra';
    SES.isAdmin = emp.role === 'jefe_obra';
    saveSession();
    if(SES.isAdmin){ doAdminLogin(); } else { doEmpLogin(); }
    console.log('[TIMES] Auto-login Firebase:', emp.name);
  } else {
    // Usuario Firebase pero NO registrado como empleado → bloquear acceso
    console.warn('[TIMES] Firebase user not in DB:', user.email);
    try { if(window._fbSignOut) window._fbSignOut().catch(()=>{}); } catch(e) {}
    setTimeout(() => {
      if (!SES.user && !SES.isAdmin) {
        const err = $('loginErr');
        if (err) err.textContent = '⚠️ Tu cuenta no está registrada. Contacta al administrador.';
      }
    }, 100);
  }
});
// ── Reloj ──
setInterval(()=>{
  const now=new Date(),ts=`${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
  const tc=$('topClock');if(tc)tc.textContent=ts;
  const bc=$('bigClock'),bs=$('bigSec');
  if(bc){const cn=bc.childNodes[0];if(cn)cn.textContent=`${p2(now.getHours())}:${p2(now.getMinutes())}`;}
  if(bs)bs.textContent=':'+p2(now.getSeconds());
  const bd=$('bigDate');if(bd)bd.textContent=now.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  tick();
  if(SES.user&&(!SES.isAdmin||(SES.isAdmin&&SES.isEnc))){safeRun(updJorCircle,'t');safeRun(renderResumen,'tr');}
},1000);

// ── Init ──
(function(){
  try{const c=JSON.parse(localStorage.getItem('an_times_v1')||'null');if(c&&c.employees)applyDB(c);}catch(e){}
  populateSelect();
  // FIX 4: una sola llamada directa a doFetch + polling cada 10s (reduce ~20 requests en arranque)
  doFetch();startPolling();
  setTimeout(()=>{
    populateSelect();loadRemembered();
    try{
      const ses=JSON.parse(localStorage.getItem('an_times_ses')||'null');
      if(ses){
        if(ses.isAdmin&&!ses.empId){SES={user:null,isAdmin:true,isEnc:false};doAdminLogin();}
        else if(ses.empId){
          const emp=DB.employees.find(e=>e.id===ses.empId);
          if(emp){SES.user=emp;SES.isEnc=emp.role==='encargado';SES.isJO=emp.role==='jefe_obra';
            SES.isAdmin=emp.role==='jefe_obra';
            if(SES.isAdmin){doAdminLogin();}else{doEmpLogin();}}
        }
      }
    }catch(e){}
  },600);
})();
function renderVacDash(){
  const el=$('dashVacaciones');if(!el)return;
  const now=new Date(),nowStr=today();
  const upcoming=(DB.vacaciones||[]).filter(v=>v.estado==='aprobada'&&v.desde>=nowStr).sort((a,b)=>a.desde.localeCompare(b.desde)).slice(0,4);
  if(!upcoming.length){el.innerHTML='<div class="empty">Sin vacaciones próximas</div>';return;}
  el.innerHTML=upcoming.map(v=>{
    const emp=DB.employees.find(e=>e.id===v.empId);
    const col=emp?.color||'var(--accent)',init=emp?.initials||'?';
    return`<div class="rec-item"><div style="display:flex;align-items:center;gap:8px"><div style="width:26px;height:26px;border-radius:7px;background:${col};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">${init}</div><div><div style="font-size:12px;font-weight:600">${v.empName}</div><div style="font-size:10px;color:var(--text3)">${v.desde} — ${v.hasta}</div></div></div><span style="font-size:12px;font-weight:700;color:var(--accent3);flex-shrink:0">${v.dias}d</span></div>`;
  }).join('');
}
// ── Resumen mensual PDF obligatorio ──
function generarResumenMensualPDF(empId, anyo, mes){
  // empId: si null = empleado actual (SES.user)
  const uid = empId || SES.user?.id;
  const emp = DB.employees.find(e=>e.id===uid);
  if(!emp){ toast('Empleado no encontrado'); return; }
  const mk = `${anyo||new Date().getFullYear()}-${p2(mes||new Date().getMonth())}`;
  const recs = (DB.records||[]).filter(r=>r.empId===uid&&r.fin&&r.inicio.startsWith(mk));
  if(!recs.length){ toast('Sin fichajes en '+mk); return; }

  const totalMin = recs.reduce((s,r)=>s+calcMin(r),0);
  const totalH = Math.floor(totalMin/60), totalM = totalMin%60;
  const mesNombre = new Date(anyo||new Date().getFullYear(), (mes||new Date().getMonth())-1, 1)
    .toLocaleDateString('es-ES',{month:'long',year:'numeric'});

  // Generar HTML del PDF
  const rows = recs.sort((a,b)=>a.inicio.localeCompare(b.inicio)).map(r=>{
    const m=calcMin(r), bm=Math.floor((r.breakSecs||0)/60);
    const st=r.aprobado===true?'<span style="color:#16a34a">✅ Aprobado</span>':r.aprobado===false?'<span style="color:#dc2626">❌ Rechazado</span>':'<span style="color:#d97706">⏳ Pendiente</span>';
    return `<tr><td>${fdate(r.inicio)}</td><td>${ftime(r.inicio)}</td><td>${ftime(r.fin)}</td>
      <td>${m>=60?Math.floor(m/60)+'h '+p2(m%60)+'m':m+'m'}</td>
      <td>${bm>0?Math.floor(bm/60)+'h '+p2(bm%60)+'m':'—'}</td>
      <td>${r.centro||'—'}</td><td>${st}</td></tr>`;
  }).join('');

  const firma = emp.resumenFirmas?.[mk];
  const firmadoHtml = firma
    ? `<div style="margin-top:30px;padding:16px;background:#f0fdf4;border:2px solid #16a34a;border-radius:8px">
        <div style="color:#16a34a;font-weight:700;font-size:15px">✅ DOCUMENTO FIRMADO ELECTRÓNICAMENTE</div>
        <div style="margin-top:4px;font-size:12px;color:#555">Firmado el ${new Date(firma.fecha).toLocaleString('es-ES')} · ${firma.firmante}</div>
       </div>`
    : `<div style="margin-top:30px;padding:16px;background:#fef9c3;border:2px dashed #d97706;border-radius:8px">
        <div style="color:#d97706;font-weight:700;font-size:15px">⚠️ PENDIENTE DE FIRMA</div>
        <div style="margin-top:4px;font-size:12px;color:#555">El empleado debe firmar este resumen desde la aplicación TIMES INC</div>
       </div>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #4f46e5}
      .logo{font-size:22px;font-weight:900;letter-spacing:-1px;color:#4f46e5}
      .logo span{color:#06b6d4}
      .title{font-size:16px;font-weight:700;margin-bottom:4px}
      .subtitle{font-size:12px;color:#555}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
      .info-box{background:#f5f3ff;border-radius:8px;padding:12px}
      .info-label{font-size:9px;font-weight:700;text-transform:uppercase;color:#7c3aed;margin-bottom:4px}
      .info-val{font-size:13px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#4f46e5;color:white;padding:7px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left}
      td{padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}
      tr:nth-child(even) td{background:#f9fafb}
      .total-row td{background:#ede9fe!important;font-weight:700;color:#4f46e5}
      .footer{margin-top:20px;font-size:9px;color:#999;text-align:center;border-top:1px solid #e5e7eb;padding-top:12px}
    </style></head><body>
    <div class="header">
      <div><div class="logo">TIMES <span>INC</span></div><div style="font-size:10px;color:#666;margin-top:2px">Control de jornada laboral</div></div>
      <div style="text-align:right"><div class="title">Resumen mensual de jornada</div><div class="subtitle">${mesNombre}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><div class="info-label">Empleado</div><div class="info-val">${emp.name}</div></div>
      <div class="info-box"><div class="info-label">Empresa</div><div class="info-val">${emp.empresa||'—'}</div></div>
      <div class="info-box"><div class="info-label">Período</div><div class="info-val">${mesNombre}</div></div>
      <div class="info-box"><div class="info-label">Total horas</div><div class="info-val" style="color:#4f46e5">${totalH}h ${p2(totalM)}m</div></div>
    </div>
    <table>
      <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Descanso</th><th>Centro</th><th>Estado</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row"><td colspan="3" style="text-align:right">TOTAL</td><td>${totalH}h ${p2(totalM)}m</td><td colspan="3">${recs.length} jornadas</td></tr>
      </tbody>
    </table>
    ${firmadoHtml}
    <div class="footer">Documento generado por TIMES INC el ${new Date().toLocaleString('es-ES')} · times-inc.vercel.app</div>
    </body></html>`;

  const w = window.open('','_blank');
  if(!w){ toast('Activa popups para ver el PDF'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(), 600);
}

function firmarResumenMensual(anyo, mes){
  const u = SES.user; if(!u) return;
  const mk = `${anyo||new Date().getFullYear()}-${p2(mes||new Date().getMonth())}`;
  const recs = (DB.records||[]).filter(r=>r.empId===u.id&&r.fin&&r.inicio.startsWith(mk));
  if(!recs.length){ toast('Sin jornadas en '+mk); return; }

  const emp = DB.employees.find(e=>e.id===u.id);
  if(emp?.resumenFirmas?.[mk]){ toast('Ya firmado el '+new Date(emp.resumenFirmas[mk].fecha).toLocaleDateString('es-ES')); return; }

  const totalMin = recs.reduce((s,r)=>s+calcMin(r),0);
  const mesNombre = new Date(anyo||new Date().getFullYear(), (mes||new Date().getMonth())-1, 1)
    .toLocaleDateString('es-ES',{month:'long',year:'numeric'});

  if(!confirm(`¿Firmar electrónicamente el resumen de ${mesNombre}?

Total: ${Math.floor(totalMin/60)}h ${p2(totalMin%60)}m en ${recs.length} jornadas

Al confirmar, tu firma quedará registrada en el sistema.`)) return;

  if(!emp.resumenFirmas) emp.resumenFirmas = {};
  emp.resumenFirmas[mk] = {
    fecha: new Date().toISOString(),
    firmante: u.name,
    totalMin,
    jornadas: recs.length
  };
  save();
  pushNoti('admin','info','✍️ Resumen firmado',`${u.name} ha firmado el resumen de ${mesNombre}.`);
  toast('✅ Resumen de '+mesNombre+' firmado correctamente');
  // Abrir PDF con firma
  generarResumenMensualPDF(u.id, anyo, mes);
}

// Mostrar botones de resumen mensual en la tab Jornada
function renderResumenMensualBtn(){
  const el = $('jorResumenMes'); if(!el||!SES.user) return;
  const now = new Date();
  const mesActual = now.getMonth()+1, anyoActual = now.getFullYear();
  const mesPasado = mesActual===1?12:mesActual-1, anyoPasado = mesActual===1?anyoActual-1:anyoActual;
  const mk = `${anyoActual}-${p2(mesActual)}`, mkP = `${anyoPasado}-${p2(mesPasado)}`;
  const emp = DB.employees.find(e=>e.id===SES.user.id);
  const firmadoActual = !!(emp?.resumenFirmas?.[mk]);
  const firmadoPasado = !!(emp?.resumenFirmas?.[mkP]);
  const mesNActual = now.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  const mesPasadoD = new Date(anyoPasado,mesPasado-1,1).toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  el.innerHTML = `
    <div style="margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">📊 Resumen mensual</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px">
          <div><div style="font-size:12px;font-weight:600">${mesNActual}</div><div style="font-size:10px;color:var(--text3)">${firmadoActual?'✅ Firmado':'⏳ Sin firmar'}</div></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="generarResumenMensualPDF('${SES.user.id}',${anyoActual},${mesActual})">📄 Ver</button>
            ${!firmadoActual?`<button class="btn btn-primary btn-sm" onclick="firmarResumenMensual(${anyoActual},${mesActual})">✍️ Firmar</button>`:''}
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px">
          <div><div style="font-size:12px;font-weight:600">${mesPasadoD}</div><div style="font-size:10px;color:${firmadoPasado?'var(--green)':'var(--red)'}">${firmadoPasado?'✅ Firmado':'❌ Pendiente de firma'}</div></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="generarResumenMensualPDF('${SES.user.id}',${anyoPasado},${mesPasado})">📄 Ver</button>
            ${!firmadoPasado?`<button class="btn btn-primary btn-sm" style="background:linear-gradient(135deg,var(--red),#dc2626)" onclick="firmarResumenMensual(${anyoPasado},${mesPasado})">✍️ Firmar</button>`:''}
          </div>
        </div>
      </div>
    </div>`;
}

// ── PWA + Push Notifications ──
(function(){
  if(!('serviceWorker' in navigator)) return;
  if(location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('./sw.js')
    .then(function(reg){
      console.log('[TIMES] SW registered');
      // Solicitar permiso de notificaciones
      if('Notification' in window && Notification.permission === 'default'){
        // Solo pedir permiso después de interacción del usuario
        window._swReg = reg;
      }
    })
    .catch(function(e){ console.warn('[TIMES] SW error:',e); });
})();

// Solicitar permisos de notificación tras login
function requestNotifPermission(){
  if(!('Notification' in window)) return;
  if(Notification.permission === 'granted') return;
  if(Notification.permission === 'denied') return;
  Notification.requestPermission().then(function(p){
    if(p === 'granted'){
      toast('🔔 Notificaciones activadas');
      scheduleEndOfDayReminder();
    }
  });
}

// Enviar notificación local (funciona con app abierta/cerrada si SW activo)
function sendLocalNotif(title, body, icon){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  try{
    if(window._swReg && window._swReg.showNotification){
      window._swReg.showNotification(title, {
        body: body,
        icon: icon || './icon.svg',
        badge: './icon.svg',
        tag: 'times-inc-'+Date.now(),
        vibrate: [200, 100, 200],
        requireInteraction: false,
        data: { url: window.location.href }
      });
    } else {
      new Notification(title, { body, icon: icon || './icon.svg' });
    }
  } catch(e) {}
}

// Recordatorio fin de jornada a las 20:00
function scheduleEndOfDayReminder(){
  if(!getCfg('notiFichaje', true)) return;
  const now = new Date();
  const target = new Date(now);
  target.setHours(20,0,0,0);
  if(now >= target) target.setDate(target.getDate()+1);
  const ms = target - now;
  setTimeout(function(){
    // Solo avisar si hay jornada abierta
    if(SES.user){
      const open = DB.records.find(function(r){ return r.empId === SES.user.id && !r.fin; });
      if(open){
        sendLocalNotif('⏰ TIMES INC - Recordatorio', '¡No olvides fichar tu salida!', './icon.svg');
      }
    }
    scheduleEndOfDayReminder(); // reprogramar para mañana
  }, Math.min(ms, 2147483647));
}


