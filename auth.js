// Pixelish Launcher – account UI (Register / Log in / Log out).
// Talks to the Netlify API (/api/me, /api/auth/{signup,login,logout}) with a signed session token
// kept in localStorage and sent as "Authorization: Bearer <token>". Exposes window.PixelishAuth.
(function () {
  var state = { user: null };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var bar = $('#acct'), dlg = $('#authDlg');
  if (!bar || !dlg) return;
  var form = $('#authForm', dlg), err = $('#authErr', dlg), submit = $('#authSubmit', dlg);
  var uIn = $('#authUser', dlg), pIn = $('#authPass', dlg), p2Wrap = $('#authPass2Wrap', dlg), p2In = $('#authPass2', dlg);
  var mode = 'login';
  var API = window.PIXELISH_API || 'https://pixelish-launcher.netlify.app';
  var TOKEN_KEY = 'pl_session_token';
  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function api(path, body) {
    var h = {}, t = getToken();
    if (t) h.Authorization = 'Bearer ' + t;
    if (body) h['Content-Type'] = 'application/json';
    return fetch(API + path, body ? { method: 'POST', headers: h, credentials: 'omit', body: JSON.stringify(body) } : { headers: h, credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }
  function render() {
    var u = state.user;
    bar.innerHTML = '';
    if (u) {
      var chip = document.createElement('span'); chip.className = 'who'; chip.id = 'acctName';
      chip.innerHTML = '<span class="av" aria-hidden="true"></span>';
      var nm = document.createElement('b'); nm.textContent = u.username; chip.appendChild(nm);
      var out = document.createElement('button'); out.className = 'mini'; out.id = 'btnLogout'; out.type = 'button'; out.textContent = 'Log out';
      out.onclick = logout; bar.appendChild(chip); bar.appendChild(out);
    } else {
      var li = document.createElement('button'); li.className = 'mini ghost'; li.id = 'btnLogin'; li.type = 'button'; li.textContent = 'Log in'; li.onclick = function () { open('login'); };
      var su = document.createElement('button'); su.className = 'mini'; su.id = 'btnSignup'; su.type = 'button'; su.textContent = 'Register'; su.onclick = function () { open('signup'); };
      bar.appendChild(li); bar.appendChild(su);
    }
    document.documentElement.classList.toggle('logged-in', !!u);
    document.dispatchEvent(new CustomEvent('pixelish:auth', { detail: u }));
  }
  function setMode(m) {
    mode = m;
    dlg.querySelectorAll('[data-tab]').forEach(function (t) { var on = t.dataset.tab === m; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    $('#authTitle', dlg).textContent = m === 'login' ? 'Log in' : 'Register';
    submit.textContent = m === 'login' ? 'Log in' : 'Create account';
    p2Wrap.hidden = m === 'login'; p2In.required = m !== 'login';
    pIn.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('#authHint', dlg).hidden = m === 'login';
    showErr('');
  }
  function showErr(t, field) {
    err.textContent = t; err.hidden = !t;
    [uIn, pIn, p2In].forEach(function (i) { i.removeAttribute('aria-invalid'); });
    if (field === 'username') uIn.setAttribute('aria-invalid', 'true');
    if (field === 'password') pIn.setAttribute('aria-invalid', 'true');
    if (field === 'password2') p2In.setAttribute('aria-invalid', 'true');
  }
  function open(m) { setMode(m || 'login'); form.reset(); showErr(''); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); setTimeout(function () { uIn.focus(); }, 30); }
  function close() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  function logout() {
    var done = function () { setToken(null); state.user = null; render(); };
    if (!getToken()) return Promise.resolve(done());
    return api('/api/auth/logout', {}).then(done, done);
  }

  dlg.querySelectorAll('[data-tab]').forEach(function (t) { t.onclick = function () { setMode(t.dataset.tab); uIn.focus(); }; });
  $('#authClose', dlg).onclick = close;
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var u = uIn.value.trim(), p = pIn.value;
    if (mode === 'signup') {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return showErr('Usernames must be 3–20 characters: letters, numbers and underscores (_) only.', 'username');
      if (p.length < 8) return showErr('Your password must be at least 8 characters.', 'password');
      if (p !== p2In.value) return showErr('The passwords don’t match.', 'password2');
    } else if (!u || !p) return showErr('Please enter your username and password.');
    submit.disabled = true; submit.textContent = 'One moment…';
    api('/api/auth/' + mode, { username: u, password: p }).then(function (r) {
      if (r.ok && r.user && r.token) { setToken(r.token); state.user = r.user; render(); close(); }
      else showErr(r.error || 'Something went wrong. Please try again.', r.field);
    }).catch(function () { showErr('Can’t reach the server. Please try again.'); })
      .then(function () { submit.disabled = false; submit.textContent = mode === 'login' ? 'Log in' : 'Create account'; });
  });

  window.PixelishAuth = { get user() { return state.user; }, open: open, logout: logout, refresh: refresh };
  function refresh() {
    if (!getToken()) { state.user = null; render(); return Promise.resolve(null); }
    return api('/api/me').then(function (r) {
      if (r.loggedIn) state.user = r; else { state.user = null; if (r._status === 200) setToken(null); }
      render(); return state.user;
    }).catch(function () { render(); });
  }
  render(); refresh();
})();
