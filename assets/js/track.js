/* Cotalia - mesure d'audience légère : pages vues, clics sur le bouton principal, temps passé.
   Identifiant anonyme par navigateur, visite renouvelée après 30 min d'inactivité. Pas de cookie tiers. */
(function () {
  'use strict';
  var CFG = window.COTALIA_CONFIG || {}, BASE = (CFG.supabaseUrl || '').replace(/\/$/, ''), KEY = CFG.supabaseAnonKey || '';
  if (!BASE || !KEY || /^\/admin\//.test(location.pathname)) return;
  var rnd = function () { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); };
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var vid = get('cotalia-vid'); if (!vid) { vid = rnd(); set('cotalia-vid', vid); }
  var now = Date.now(), last = +get('cotalia-last') || 0, sid = get('cotalia-sid'), fresh = false;
  if (!sid || now - last > 30 * 60e3) { sid = rnd(); set('cotalia-sid', sid); fresh = true; }
  set('cotalia-last', String(now));
  var page = location.pathname.replace(/index\.html$/, '') || '/';
  var device = window.matchMedia('(max-width: 980px)').matches ? 'mobile' : 'ordinateur';
  function send(event, data) {
    set('cotalia-last', String(Date.now()));
    var body = { visitor: vid, session: sid, event: event, page: page, device: device, ua: navigator.userAgent, data: data || {} };
    if (event === 'view' && fresh) body.referrer = document.referrer && document.referrer.indexOf(location.host) < 0 ? document.referrer : (document.referrer ? 'interne' : '');
    try { fetch(BASE + '/rest/v1/rpc/track_event', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ p: body }), keepalive: true }).catch(function () {}); } catch (e) {}
  }
  send('view', { w: window.innerWidth, fresh: fresh, q: location.search.slice(1, 120) });
  // clics sur les appels à l'action principaux
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.cta, .btn.shine, [data-cta]'); if (!a) return;
    send('cta', { label: (a.getAttribute('data-cta') || a.textContent || '').trim().slice(0, 60), href: (a.getAttribute('href') || '').slice(0, 120) });
  }, true);
  // temps passé : envoyé quand la page passe en arrière-plan ou se ferme
  var since = Date.now();
  function leave() { var s = Math.round((Date.now() - since) / 1000); since = Date.now(); if (s >= 1) send('leave', { secs: Math.min(s, 3600) }); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); else since = Date.now(); });
  window.addEventListener('pagehide', leave);
})();
