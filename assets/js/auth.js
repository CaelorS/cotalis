/* Cotalia - comptes utilisateurs : session Supabase, bouton en haut à droite, fenêtre de connexion. */
(function () {
  'use strict';
  const CFG = window.COTALIA_CONFIG || {};
  const C = window.COTALIA = window.COTALIA || {};
  const ROOT = location.pathname.includes('/admin/') ? '../' : './';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sb = (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;

  const A = C.auth = {
    sb, session: null, user: null, profile: null, ready: false, listeners: [],
    onChange(fn) { A.listeners.push(fn); if (A.ready) fn(A); },
    token() { return A.session ? A.session.access_token : null; },
    isAdmin() { return !!(A.profile && (A.profile.role === 'admin' || A.profile.role === 'owner')); },
    async init() {
      if (!sb) { A.ready = true; A.listeners.forEach(fn => fn(A)); renderWidget(); return; }
      const { data } = await sb.auth.getSession();
      await setSession(data.session);
      sb.auth.onAuthStateChange((event, s) => { if (event === 'PASSWORD_RECOVERY') openModal('recovery'); setSession(s); });
    },
    async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
    async signUp(email, password, meta) { const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta || {} } }); if (error) throw error; return data; },
    async signOut() { await sb.auth.signOut(); },
    async reset(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname.replace(/admin\/?$/, '') }); if (error) throw error; },
    async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw error; },
    open(mode) { openModal(mode || 'login'); },
    message(err) {
      const m = String(err && err.message || err || '');
      if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cet e-mail. Connectez-vous, ou demandez un nouveau mot de passe.';
      if (/invalid login|invalid credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
      if (/email not confirmed/i.test(m)) return 'Confirmez d\'abord votre e-mail : un lien vous a été envoyé.';
      if (/password.*(6|8)|weak/i.test(m)) return 'Le mot de passe doit faire au moins 8 caractères.';
      if (/rate limit/i.test(m)) return 'Trop de tentatives, réessayez dans une minute.';
      return m || 'Une erreur est survenue.';
    },
  };

  async function setSession(s) {
    A.session = s || null; A.user = s ? s.user : null; A.profile = null;
    if (A.user) {
      try { const { data } = await sb.from('profiles').select('*').eq('id', A.user.id).maybeSingle(); A.profile = data || null; } catch (e) {}
    }
    A.ready = true;
    renderWidget();
    A.listeners.forEach(fn => fn(A));
  }

  /* ---------- bouton en haut à droite ---------- */
  function renderWidget() {
    const slot = document.getElementById('auth-slot');
    if (!slot) return;
    if (!sb) { slot.innerHTML = ''; return; }
    if (A.user) {
      const name = (A.profile && A.profile.prenom) || A.user.email;
      slot.innerHTML = `<div class="auth-menu"><button type="button" class="btn" id="auth-toggle" aria-haspopup="true" aria-expanded="false">${esc(name)} <span aria-hidden="true">▾</span></button>
        <div class="auth-drop hidden" id="auth-drop"><a href="${ROOT}index.html#mine">Mes estimations</a><a href="${ROOT}estimation.html?new=1">Nouvelle estimation</a>${A.isAdmin() ? `<a href="${ROOT}admin/">Back-office</a>` : ''}<button type="button" id="auth-out">Se déconnecter</button></div></div>`;
      const t = document.getElementById('auth-toggle'), d = document.getElementById('auth-drop');
      t.addEventListener('click', () => { d.classList.toggle('hidden'); t.setAttribute('aria-expanded', String(!d.classList.contains('hidden'))); });
      document.addEventListener('click', e => { if (!slot.contains(e.target)) d.classList.add('hidden'); });
      document.getElementById('auth-out').addEventListener('click', async () => { await A.signOut(); if (location.pathname.includes('/admin/')) location.href = ROOT + 'index.html'; });
    } else {
      slot.innerHTML = '<button type="button" class="btn" id="auth-open">Se connecter</button>';
      document.getElementById('auth-open').addEventListener('click', () => openModal('login'));
    }
  }

  /* ---------- fenêtre de connexion ---------- */
  let modal = null;
  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'modal hidden'; modal.id = 'auth-modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<div class="modal-box">
      <h3 id="auth-title">Se connecter</h3>
      <p id="auth-text" class="hint">Retrouvez vos estimations sur tous vos appareils.</p>
      <form id="auth-form" class="auth-form" novalidate>
        <div class="field"><label for="auth-email">E-mail</label><input id="auth-email" type="email" autocomplete="email" inputmode="email"></div>
        <div class="field" id="auth-pw-field"><label for="auth-pw">Mot de passe</label><input id="auth-pw" type="password" autocomplete="current-password"></div>
        <div class="field hidden" id="auth-pw2-field"><label for="auth-pw2">Confirmez le mot de passe</label><input id="auth-pw2" type="password" autocomplete="new-password"></div>
        <p class="err hidden" id="auth-err"></p>
        <div class="modal-actions"><button type="button" class="btn" id="auth-cancel">Fermer</button><button type="submit" class="btn primary" id="auth-submit">Se connecter</button></div>
      </form>
      <div class="auth-links"><button type="button" class="linkbtn" data-mode="signup">Créer un compte</button><button type="button" class="linkbtn" data-mode="forgot">Mot de passe oublié</button><button type="button" class="linkbtn" data-mode="login">J'ai déjà un compte</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    document.getElementById('auth-cancel').addEventListener('click', closeModal);
    document.getElementById('auth-form').addEventListener('submit', submit);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }
  let mode = 'login';
  function setMode(m) {
    mode = m;
    const T = { login: ['Se connecter', 'Retrouvez vos estimations sur tous vos appareils.', 'Se connecter'], signup: ['Créer un compte', 'Vos estimations, vos documents et vos échanges avec Cotalia, au même endroit.', 'Créer mon compte'], forgot: ['Mot de passe oublié', 'Indiquez votre e-mail : nous vous envoyons un lien pour choisir un nouveau mot de passe.', 'Envoyer le lien'], recovery: ['Nouveau mot de passe', 'Choisissez votre nouveau mot de passe.', 'Enregistrer'] }[m];
    document.getElementById('auth-title').textContent = T[0];
    document.getElementById('auth-text').textContent = T[1];
    document.getElementById('auth-submit').textContent = T[2];
    document.getElementById('auth-pw-field').classList.toggle('hidden', m === 'forgot');
    document.getElementById('auth-pw2-field').classList.toggle('hidden', m !== 'signup' && m !== 'recovery');
    document.getElementById('auth-email').closest('.field').classList.toggle('hidden', m === 'recovery');
    document.getElementById('auth-pw').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    modal.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('hidden', b.dataset.mode === m || (m === 'recovery')));
    document.getElementById('auth-err').classList.add('hidden');
  }
  function openModal(m) { if (!sb) return; if (!modal) buildModal(); setMode(m); modal.classList.remove('hidden'); const f = modal.querySelector('.field:not(.hidden) input'); if (f) f.focus(); }
  function closeModal() { if (modal) modal.classList.add('hidden'); }
  async function submit(e) {
    e.preventDefault();
    const err = document.getElementById('auth-err'), btn = document.getElementById('auth-submit');
    const email = document.getElementById('auth-email').value.trim(), pw = document.getElementById('auth-pw').value, pw2 = document.getElementById('auth-pw2').value;
    err.classList.add('hidden');
    try {
      if (mode !== 'recovery' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Une adresse e-mail valide, s\'il vous plaît.');
      if ((mode === 'signup' || mode === 'recovery') && pw.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
      if ((mode === 'signup' || mode === 'recovery') && pw !== pw2) throw new Error('Les deux mots de passe ne correspondent pas.');
      btn.disabled = true;
      if (mode === 'login') { await A.signIn(email, pw); closeModal(); }
      else if (mode === 'signup') { const d = await A.signUp(email, pw); if (d.session) closeModal(); else { document.getElementById('auth-text').textContent = 'Compte créé. Un e-mail de confirmation vous a été envoyé : cliquez sur le lien, puis connectez-vous.'; setTimeout(() => setMode('login'), 4000); } }
      else if (mode === 'forgot') { await A.reset(email); document.getElementById('auth-text').textContent = 'Si un compte existe avec cet e-mail, le lien est parti. Pensez aux indésirables.'; }
      else if (mode === 'recovery') { await A.updatePassword(pw); closeModal(); }
    } catch (ex) { err.textContent = A.message(ex); err.classList.remove('hidden'); }
    btn.disabled = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.init); else A.init();
})();
