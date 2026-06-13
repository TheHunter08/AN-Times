
// ── Firebase Auth — carga diferida (solo cuando el usuario lo pide) ──
window._fbReady = false;
window._fbLoading = false;

function _loadFirebase(callback) {
  if (window._fbReady) { if(callback) callback(); return; }
  if (window._fbLoading) { 
    // Already loading — wait for it
    var check = setInterval(function(){
      if(window._fbReady){ clearInterval(check); if(callback) callback(); }
    }, 100);
    return;
  }
  window._fbLoading = true;

  // Load app-compat
  var s1 = document.createElement('script');
  s1.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js';
  s1.onerror = function() {
    window._fbLoading = false;
    console.warn('[TIMES] Firebase no disponible (sin internet)');
    var err = document.getElementById('fbAuthErr');
    if (err) err.textContent = 'Sin conexión. Usa el PIN de acceso.';
  };
  s1.onload = function() {
    // Load auth-compat
    var s2 = document.createElement('script');
    s2.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js';
    s2.onerror = function() {
      window._fbLoading = false;
      var err = document.getElementById('fbAuthErr');
      if (err) err.textContent = 'Error cargando Firebase Auth.';
    };
    s2.onload = function() {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp({
            apiKey:            'AIzaSyAYZdHMrGBnBb5O6p5oBIuikX1Qc9HgvjQ',
            authDomain:        'times-inc.firebaseapp.com',
            databaseURL:       'https://times-inc-default-rtdb.europe-west1.firebasedatabase.app',
            projectId:         'times-inc',
            storageBucket:     'times-inc.firebasestorage.app',
            messagingSenderId: '366356529016',
            appId:             '1:366356529016:web:ffe5ba97c214c21fc9928d'
          });
        }
        var _auth  = firebase.auth();
        var _gProv = new firebase.auth.GoogleAuthProvider();
        _gProv.setCustomParameters({ prompt: 'select_account' });

        window._fbAuth     = _auth;
        window._fbSignIn   = function(e,p){ return _auth.signInWithEmailAndPassword(e,p); };
        window._fbSignUp   = function(e,p){ return _auth.createUserWithEmailAndPassword(e,p); };
        window._fbSignOut  = function(){    return _auth.signOut(); };
        window._fbGoogle   = function(){    return _auth.signInWithPopup(_gProv); };
        window._fbResetPwd = function(e){   return _auth.sendPasswordResetEmail(e); };

        _auth.onAuthStateChanged(function(user) {
          window._fbReady   = true;
          window._fbLoading = false;
          if (user) {
            window._fbUid         = user.uid;
            window._fbEmail       = user.email;
            window._fbDisplayName = user.displayName || user.email;
            window._fbPhotoURL    = user.photoURL;
            document.dispatchEvent(new CustomEvent('fbAuthChanged', { detail: { user: user } }));
          } else {
            window._fbUid   = null;
            window._fbEmail = null;
            document.dispatchEvent(new CustomEvent('fbAuthChanged', { detail: { user: null } }));
          }
        });

        window._fbReady   = true;
        window._fbLoading = false;
        console.log('[TIMES] Firebase Auth cargado ✅');
        if (callback) callback();
      } catch(err) {
        window._fbLoading = false;
        console.warn('[TIMES] Firebase init error:', err.message);
        var errEl = document.getElementById('fbAuthErr');
        if (errEl) errEl.textContent = 'Error Firebase: ' + err.message;
      }
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

// Stubs — estos no hacen nada hasta que se carga Firebase
window._fbSignIn   = function(){ return Promise.reject(new Error('Firebase no cargado')); };
window._fbSignUp   = function(){ return Promise.reject(new Error('Firebase no cargado')); };
window._fbSignOut  = function(){ return Promise.resolve(); };
window._fbGoogle   = function(){ return Promise.reject(new Error('Firebase no cargado')); };
window._fbResetPwd = function(){ return Promise.reject(new Error('Firebase no cargado')); };
