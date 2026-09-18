/* Cotalia - back-office : suivi des dossiers, prix administrables, administrateurs. */
(function () {
  'use strict';
  const C = window.COTALIA, A = C.auth;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v || 0));
  const dt = v => v ? new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const KIND = { appart: 'Appartement', maison: 'Maison', immeuble: 'Immeuble' };
  const STATUS = [['nouveau', 'Nouveau'], ['contacte', 'Contacté'], ['relance', 'Relancé'], ['visite', 'Visite planifiée'], ['devis', 'Devis envoyé'], ['signe', 'Signé'], ['perdu', 'Perdu']];
  const STATUS_LABEL = Object.fromEntries(STATUS);
  const FIN = { oui: 'Accompagné', renta: 'Rentabilité seule', non: 'Sans rentabilité' };
  const EPOQUE = { '1930': 'avant 1948', '1960': '1948-1974', '1982': '1975 et après', '2000': '1975 et après', '2016': '1975 et après', '2025': 'neuf' };
  const epoque = a => EPOQUE[String(a)] || (a ? String(a) : '?');
  const DEM = { '1': 'dès que possible', '3': 'sous 3 mois', '6': 'sous 6 mois', later: 'travaux non planifiés' };
  const demLabel = d => DEM[String(d || '')] || '';
  let sb = null, leads = [], admins = [], pricingLoaded = false, dirty = new Set();

  /* ---------- accès ---------- */
  A.onChange(a => {
    sb = a.sb;
    const ok = a.isAdmin();
    $('gate').classList.toggle('hidden', ok);
    $('tabs').classList.toggle('hidden', !ok);
    if (!ok) {
      $('gate-text').textContent = a.user ? 'Ce compte n\'a pas accès au back-office. Demandez à un administrateur de vous ajouter, puis reconnectez-vous.' : 'Connectez-vous avec votre compte administrateur.';
      $('gate-login').classList.toggle('hidden', !!a.user);
      document.querySelectorAll('.tabpane').forEach(p => p.classList.add('hidden'));
      return;
    }
    showTab(document.querySelector('.tab.selected').dataset.tab);
  });
  $('gate-login').addEventListener('click', () => A.open('login'));
  $('tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) showTab(t.dataset.tab); });
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('selected', t.dataset.tab === name));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
    if (name === 'dossiers') loadLeads();
    if (name === 'prix') loadPricingTab();
    if (name === 'selection') loadSelectionTab();
    if (name === 'scoring') loadScoring();
    if (name === 'tunnel') { if (!leads.length && sb) sb.from('leads').select('id,project_id,prenom,nom').then(r => { leads = r.data || leads; loadTunnel(); }); else loadTunnel(); }
    if (name === 'admins') loadAdmins();
  }

  /* ---------- dossiers ---------- */
  async function loadAdminsList() {
    const { data } = await sb.from('profiles').select('id,prenom,nom,email,role,created_at').in('role', ['admin', 'owner']).order('created_at');
    admins = data || [];
    const sel = $('f-assign'); sel.innerHTML = '<option value="">Toute l\'équipe</option><option value="none">Non attribués</option>' + admins.map(a => `<option value="${a.id}">${esc(a.prenom || a.email)}</option>`).join('');
  }
  async function loadLeads() {
    if (!admins.length) await loadAdminsList();
    if (!$('f-status').options.length || $('f-status').options.length === 1) $('f-status').innerHTML = '<option value="">Tous les statuts</option>' + STATUS.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('');
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(1000);
    if (error) { $('count').textContent = 'Lecture impossible : ' + error.message; return; }
    leads = data || [];
    rappelMap = null; await loadScoringConfig(); await loadScoringSessions();
    renderLeads();
  }
  const margeOf = l => (l.payload && l.payload.interne && l.payload.interne.marge) || 0;
  const filesOf = l => (l.payload && l.payload.files) || [];
  const photoBadge = l => filesOf(l).length ? `<button type="button" class="photos" data-photos="${l.id}" title="Voir les ${filesOf(l).length} fichier(s) déposé(s)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg><i>✓</i><small>${filesOf(l).length}</small></button>` : '';
  const pct1 = v => (v * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  const cfHtml = v => v == null ? '' : `<span class="${v >= 0 ? 'cf-pos' : 'cf-neg'}">${v >= 0 ? '+' : '−'}${eur(Math.abs(v))}/mois</span>`;
  /* chiffres du projet complet : stockés à l'envoi depuis septembre 2026, recalculés pour les dossiers plus anciens */
  function finOf(l) {
    if (!(l.finance === 'oui' || l.finance === 'renta') || !l.prix) return null;
    const i = (l.payload && l.payload.interne) || {};
    if (i.total) return { total: i.total, brut: i.brut, cf: l.strat === 'revente' ? null : i.cf };
    const p = l.payload || {}, acq = p.acquisition || {};
    const prix = +l.prix, ttc = +l.estimation_ttc || 0, meubles = ((C.AMEUBLEMENT || {})[l.strat] || 0) * (+l.surface || 0);
    const total = prix + prix * (C.NOTAIRE || 0.075) + ttc + meubles;
    const apport = Math.min(total, +acq.apport || 0), emprunt = total - apport;
    const r = (+acq.taux || 0) / 100 / 12, n = (+acq.duree || 20) * 12;
    const mens = r ? emprunt * r / (1 - Math.pow(1 + r, -n)) : emprunt / n;
    const loyer = +l.loyer || 0;
    return { total: Math.round(total), brut: total ? loyer * 12 / total : 0, cf: l.strat === 'revente' ? null : Math.round(loyer - mens - (+acq.charges || 0) / 12) };
  }
  const finCell = l => { const f = finOf(l); if (!f) return ''; return `<span class="fin-sub">projet ${eur(f.total)}</span><span class="fin-sub">renta ${pct1(f.brut)}${f.cf != null ? ' · ' + cfHtml(f.cf) : ''}</span>`; };
  let sortKey = 'date', sortDir = -1;   // -1 décroissant, 1 croissant
  const STATUS_RANK = Object.fromEntries(STATUS.map((s, i) => [s[0], i]));
  const adminName = id => { const a = admins.find(x => x.id === id); return a ? (a.prenom || a.email) : ''; };
  const SORTERS = {
    date: l => l.created_at || '',
    contact: l => ((l.nom || '') + ' ' + (l.prenom || '')).toLowerCase(),
    bien: l => ((KIND[l.type_bien] || '') + ' ' + (l.ville || l.adresse || '')).toLowerCase(),
    ttc: l => +l.estimation_ttc || 0,
    marge: l => margeOf(l),
    finance: l => FIN[l.finance] || '',
    status: l => STATUS_RANK[l.status || 'nouveau'] || 0,
    assign: l => adminName(l.assigned_to).toLowerCase(),
    next: l => l.next_action || (sortDir === 1 ? '9999' : ''),
    score: l => scoreLead(l).total,
    photos: l => filesOf(l).length,
  };
  function renderLeads() {
    const q = $('q').value.trim().toLowerCase(), fs = $('f-status').value, fa = $('f-assign').value;
    const fk = $('f-kind').value, ff = $('f-fin').value, fst = $('f-stade').value, ft = $('f-type').value, fv = $('f-ville').value.trim().toLowerCase();
    const fmin = $('f-min').value === '' ? null : +$('f-min').value, fmax = $('f-max').value === '' ? null : +$('f-max').value, ffrom = $('f-from').value, fto = $('f-to').value;
    let rows = leads.filter(l => l.kind !== 'test');
    if (q) rows = rows.filter(l => [l.prenom, l.nom, l.email, l.ville, l.adresse, l.ref, l.tel].join(' ').toLowerCase().includes(q));
    if (fs) rows = rows.filter(l => (l.status || 'nouveau') === fs);
    if (fa === 'none') rows = rows.filter(l => !l.assigned_to); else if (fa) rows = rows.filter(l => l.assigned_to === fa);
    if (fk) rows = rows.filter(l => l.type_bien === fk);
    if (ff) rows = rows.filter(l => l.finance === ff);
    if (fst) rows = rows.filter(l => l.stade === fst);
    if (ft) rows = rows.filter(l => (l.kind || 'estimation') === ft);
    if (fv) rows = rows.filter(l => ((l.ville || '') + ' ' + (l.adresse || '')).toLowerCase().includes(fv));
    if (fmin != null) rows = rows.filter(l => (+l.estimation_ttc || 0) >= fmin);
    if (fmax != null) rows = rows.filter(l => (+l.estimation_ttc || 0) <= fmax);
    if (ffrom) rows = rows.filter(l => (l.created_at || '').slice(0, 10) >= ffrom);
    if (fto) rows = rows.filter(l => (l.created_at || '').slice(0, 10) <= fto);
    const key = SORTERS[sortKey] || SORTERS.date;
    rows.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr')) * sortDir; });
    document.querySelectorAll('#leads th[data-sort]').forEach(th => { th.classList.toggle('asc', th.dataset.sort === sortKey && sortDir === 1); th.classList.toggle('desc', th.dataset.sort === sortKey && sortDir === -1); th.setAttribute('aria-sort', th.dataset.sort === sortKey ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'); });
    $('count').textContent = rows.length + ' dossier' + (rows.length > 1 ? 's' : '');
    const today = new Date().toISOString().slice(0, 10);
    $('leads').querySelector('tbody').innerHTML = rows.map(l => `<tr data-id="${l.id}" class="${l.next_action && l.next_action < today ? 'late' : ''}">
      <td class="num">${dt(l.created_at)}${l.kind === 'rappel' ? '<span class="pill">rappel</span>' : ''}</td>
      <td><b>${esc(l.prenom)} ${esc(l.nom)}</b><small>${esc(l.email)}<br>${esc(l.tel)}</small></td>
      <td>${esc(KIND[l.type_bien] || l.type_bien || '')}${l.surface ? ' · ' + l.surface + ' m²' : ''}<small>${esc(l.ville || l.adresse || '')}</small></td>
      <td class="r num">${l.estimation_ttc ? eur(l.estimation_ttc) : '—'}</td>
      <td class="r num">${margeOf(l) ? eur(margeOf(l)) : '—'}</td>
      <td>${scoreBadge(scoreLead(l))}</td>
      <td>${esc(FIN[l.finance] || '—')}${l.prix ? '<small>' + eur(l.prix) + ' d\'achat</small>' : ''}${finCell(l)}</td>
      <td><button type="button" class="pill st st-${l.status || 'nouveau'} stbtn" data-stbtn="${l.id}">${STATUS_LABEL[l.status || 'nouveau']}<i>▾</i></button></td>
      <td><select data-f="assigned_to" class="inline"><option value="">—</option>${admins.map(a => `<option value="${a.id}"${l.assigned_to === a.id ? ' selected' : ''}>${esc(a.prenom || a.email)}</option>`).join('')}</select></td>
      <td><input type="date" data-f="next_action" class="inline" value="${l.next_action || ''}"></td>
      <td class="c">${photoBadge(l) || '<span class="muted">—</span>'}</td>
      <td class="nowrap"><button type="button" class="btn small" data-open="${l.id}">Ouvrir</button></td>
    </tr>`).join('') || '<tr><td colspan="12" class="empty">Aucun dossier.</td></tr>';
    $('leads-cards').innerHTML = rows.map(l => `<div class="mcard" data-open="${l.id}" role="button">
      <div class="mrow"><b>${esc(l.prenom)} ${esc(l.nom)}</b><span class="mrow" style="gap:6px">${photoBadge(l)}${scoreBadge(scoreLead(l))}</span></div>
      <div class="msub">${esc(KIND[l.type_bien] || '')}${l.surface ? ' · ' + l.surface + ' m²' : ''}${l.ville ? ' · ' + esc(l.ville) : ''}</div>
      <div class="mrow"><span class="num">${l.estimation_ttc ? eur(l.estimation_ttc) : '—'}</span><span class="pill st st-${l.status || 'nouveau'}">${STATUS_LABEL[l.status || 'nouveau']}</span></div>
      <div class="msub">${dt(l.created_at)}${l.assigned_to ? ' · ' + esc(adminName(l.assigned_to)) : ''}${l.next_action ? ' · prochaine action ' + esc(l.next_action) : ''}</div>
    </div>`).join('') || '<p class="empty">Aucun dossier.</p>';
  }
  $('leads-cards').addEventListener('click', e => { const ph = e.target.closest('[data-photos]'); if (ph) { e.stopPropagation(); openPhotos(+ph.dataset.photos); return; } const c = e.target.closest('[data-open]'); if (c) openLead(+c.dataset.open); });
  const FILTER_IDS = ['q', 'f-status', 'f-assign', 'f-kind', 'f-fin', 'f-stade', 'f-type', 'f-ville', 'f-min', 'f-max', 'f-from', 'f-to'];
  FILTER_IDS.forEach(id => $(id).addEventListener('input', renderLeads));
  $('f-reset').addEventListener('click', () => { FILTER_IDS.forEach(id => { $(id).value = ''; }); renderLeads(); });
  $('leads').querySelector('thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]'); if (!th) return;
    if (sortKey === th.dataset.sort) sortDir = -sortDir; else { sortKey = th.dataset.sort; sortDir = ['ttc', 'marge', 'date'].includes(sortKey) ? -1 : 1; }
    renderLeads();
  });
  $('leads').addEventListener('change', async e => {
    const el = e.target.closest('[data-f]'); if (!el) return;
    const id = +el.closest('tr').dataset.id, f = el.dataset.f, v = el.value || null;
    const { error } = await sb.from('leads').update({ [f]: v }).eq('id', id);
    if (error) { alert('Enregistrement impossible : ' + error.message); return; }
    const l = leads.find(x => x.id === id); if (l) l[f] = v;
    if (f === 'next_action') renderLeads();
  });
  /* menu de statut : les choix s'affichent avec leur couleur, au-dessus du tableau */
  const stlist = document.createElement('div'); stlist.className = 'stlist hidden'; document.body.appendChild(stlist);
  let stOpenFor = null;
  function openStatusMenu(btn) {
    const id = +btn.dataset.stbtn, l = leads.find(x => x.id === id); if (!l) return;
    if (stOpenFor === id) { closeStatusMenu(); return; }
    stOpenFor = id;
    stlist.innerHTML = STATUS.map(st => `<button type="button" class="pill st st-${st[0]}${(l.status || 'nouveau') === st[0] ? ' cur' : ''}" data-stpick="${st[0]}">${st[1]}</button>`).join('');
    stlist.classList.remove('hidden');
    const r = btn.getBoundingClientRect(), h = stlist.offsetHeight, below = r.bottom + 6 + h <= innerHeight;
    stlist.style.left = Math.min(r.left, innerWidth - stlist.offsetWidth - 8) + 'px';
    stlist.style.top = (below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)) + 'px';
  }
  function closeStatusMenu() { stlist.classList.add('hidden'); stOpenFor = null; }
  stlist.addEventListener('click', async e => {
    const b = e.target.closest('[data-stpick]'); if (!b || stOpenFor == null) return;
    const id = stOpenFor, v = b.dataset.stpick; closeStatusMenu();
    const { error } = await sb.from('leads').update({ status: v }).eq('id', id);
    if (error) { alert('Enregistrement impossible : ' + error.message); return; }
    const l = leads.find(x => x.id === id); if (l) l.status = v;
    const btn = document.querySelector(`[data-stbtn="${id}"]`); if (btn) { btn.className = 'pill st st-' + v + ' stbtn'; btn.innerHTML = STATUS_LABEL[v] + '<i>▾</i>'; }
  });
  document.addEventListener('click', e => { if (stOpenFor != null && !e.target.closest('.stlist') && !e.target.closest('[data-stbtn]')) closeStatusMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeStatusMenu(); });
  window.addEventListener('scroll', closeStatusMenu, true); window.addEventListener('resize', closeStatusMenu);
  $('leads').addEventListener('click', e => { const sb2 = e.target.closest('[data-stbtn]'); if (sb2) { openStatusMenu(sb2); return; } const ph = e.target.closest('[data-photos]'); if (ph) { openPhotos(+ph.dataset.photos); return; } const b = e.target.closest('[data-open]'); if (b) openLead(+b.dataset.open); });

  /* ---------- visionneuse : toutes les photos du dossier, à faire défiler ---------- */
  const IMG_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;
  async function signedUrl(f) { try { const { data } = await sb.storage.from('plans').createSignedUrl(f, 60 * 60 * 24 * 365); return data && data.signedUrl; } catch (e) { return null; } }
  async function openPhotos(id) {
    const l = leads.find(x => x.id === id); if (!l) return;
    const files = filesOf(l);
    $('lb-title').textContent = (l.prenom || '') + ' ' + (l.nom || '') + ' · ' + files.length + ' fichier' + (files.length > 1 ? 's' : '');
    $('lb-body').innerHTML = '<p class="empty">Chargement…</p>';
    $('lightbox').classList.remove('hidden'); document.body.style.overflow = 'hidden';
    const urls = await Promise.all(files.map(signedUrl));
    $('lb-body').innerHTML = files.map((f, k) => { const name = esc(f.split('/').pop()), u = urls[k];
      if (!u) return `<div class="lb-file">${name}<br><small>lien indisponible</small></div>`;
      if (IMG_EXT.test(f)) return `<figure><img src="${u}" alt="${name}" loading="lazy"><figcaption>${k + 1} / ${files.length} · ${name} · <a href="${u}" target="_blank" rel="noopener">ouvrir en grand</a></figcaption></figure>`;
      return `<div class="lb-file"><a href="${u}" target="_blank" rel="noopener">${name}</a><br><small>document, s'ouvre dans un nouvel onglet</small></div>`;
    }).join('') || '<p class="empty">Aucun fichier.</p>';
    $('lb-body').scrollTop = 0;
  }
  function closePhotos() { $('lightbox').classList.add('hidden'); $('lb-body').innerHTML = ''; document.body.style.overflow = ''; }
  $('lb-close').addEventListener('click', closePhotos);
  $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox') || e.target === $('lb-body')) closePhotos(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('lightbox').classList.contains('hidden')) closePhotos(); });

  async function openLead(id) {
    const l = leads.find(x => x.id === id); if (!l) return;
    const p = l.payload || {}, b = p.bien || {}, i = p.interne || {}, s = l.situation || {};
    const files = p.files || [];
    const fileLinks = await Promise.all(files.map(async f => { try { const { data } = await sb.storage.from('plans').createSignedUrl(f, 60 * 60 * 24 * 365); return `<li><a href="${data.signedUrl}" target="_blank" rel="noopener">${esc(f.split('/').pop())}</a></li>`; } catch (e) { return `<li>${esc(f)}</li>`; } }));
    const works = Object.keys(p.works || {}).filter(k => p.works[k]).map(k => C.ITEMS[k] ? C.ITEMS[k].label + (p.qty && p.qty[k] != null ? ' (' + p.qty[k] + ' ' + C.ITEMS[k].unit + ')' : '') : k);
    $('d-title').textContent = (l.prenom || '') + ' ' + (l.nom || '') + ' · ' + (l.ref || '');
    $('d-body').innerHTML = `
      <div class="two">
        <div class="box"><h3>Contact</h3><table class="kv">
          <tr><td>E-mail</td><td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td></tr><tr><td>Téléphone</td><td><a href="tel:${esc(l.tel)}">${esc(l.tel)}</a></td></tr>
          <tr><td>Demande</td><td>${l.kind === 'rappel' ? 'Rappel pour visite technique' : 'Estimation'} · ${dt(l.created_at)}</td></tr>
          <tr><td>Stade</td><td>${esc(l.stade || '')} · ${esc(demLabel(l.demarrage) || 'démarrage non précisé')}</td></tr>
          <tr><td>Projet partagé</td><td>${l.project_id ? `<a href="/estimation/?p=${encodeURIComponent(l.project_id)}" target="_blank" rel="noopener">ouvrir l'estimation</a>` : '—'}</td></tr>
        </table></div>
        <div class="box"><h3>Bien</h3><table class="kv">
          <tr><td>Type</td><td>${esc(KIND[l.type_bien] || '')} · ${esc(b.type || '')}</td></tr><tr><td>Adresse</td><td>${esc(l.adresse || '')}</td></tr>
          <tr><td>Surface</td><td>${l.surface || '?'} m² · ${esc(b.eau || '?')} pièces d'eau</td></tr><tr><td>Époque / DPE / état</td><td>${esc(epoque(b.annee))} · ${esc(b.dpe || '?')} · ${esc(b.etat || '?')}</td></tr>
          <tr><td>Finition</td><td>${esc(l.gamme || '')}</td></tr><tr><td>Occupé / accès / visite</td><td>${esc(b.occupe || '?')} · ${esc(b.acces || '?')} · ${esc(b.visite || '?')}</td></tr>
        </table></div>
      </div>
      <div class="two">
        <div class="box"><h3>Chiffres</h3><table class="kv">
          <tr><td>Fourchette</td><td class="num">${eur(l.estimation_basse)} à ${eur(l.estimation_haute)}</td></tr><tr class="total"><td>Travaux TTC</td><td class="num">${eur(l.estimation_ttc)}</td></tr>
          <tr><td>Coûts directs</td><td class="num">${eur(i.direct)}</td></tr><tr><td>Frais généraux et pilotage</td><td class="num">${eur(i.fg)}</td></tr><tr><td>Marge</td><td class="num">${eur(i.marge)}</td></tr><tr><td>Aléas</td><td class="num">${eur(i.aleaAmt)} (${Math.round((i.alea || 0) * 100)} %)</td></tr>
          <tr><td>Score de confiance</td><td class="num">${l.score || '?'} / 100</td></tr><tr><td>Durée</td><td class="num">${i.weeks || '?'} semaines</td></tr>
        </table></div>
        <div class="box"><h3>Financement</h3><table class="kv">
          <tr><td>Accompagnement</td><td>${esc(FIN[l.finance] || '—')}</td></tr><tr><td>Prix d'achat</td><td class="num">${l.prix ? eur(l.prix) : '—'}</td></tr><tr><td>Stratégie / loyer</td><td>${esc(l.strat || '')} · ${l.loyer ? eur(l.loyer) + ' / mois' : '—'}</td></tr>
          ${(() => { const f = finOf(l); return f ? `<tr class="total"><td>Coût total du projet</td><td class="num">${eur(f.total)}</td></tr><tr><td>Rentabilité brute</td><td class="num">${pct1(f.brut)}</td></tr><tr><td>Cash-flow mensuel</td><td class="num">${f.cf != null ? cfHtml(f.cf) : '—'}</td></tr>` : ''; })()}<tr><td>Apport / taux / durée</td><td class="num">${p.acquisition ? eur(p.acquisition.apport) + ' · ' + (p.acquisition.taux || '?') + ' % · ' + (p.acquisition.duree || '?') + ' ans' : '—'}</td></tr>
          <tr><td>Situation</td><td>${esc(s.statut || '—')} · revenus ${s.revenus ? eur(s.revenus) : '?'} · crédits ${s.credits ? eur(s.credits) : '0 €'} · apport dispo ${s.apportDispo ? eur(s.apportDispo) : '?'} · ${esc(s.proprietaire || '')}</td></tr>
        </table></div>
      </div>
      <div class="two">
        <div class="box"><h3>Travaux retenus</h3><ul class="plain">${works.map(w => `<li>${esc(w)}</li>`).join('') || '<li>—</li>'}</ul></div>
        <div class="box"><h3>Plans et photos ${files.length ? `<button type="button" class="btn small" data-photos="${l.id}" style="margin-left:8px">Voir les photos</button>` : ''}</h3><ul class="plain">${fileLinks.join('') || '<li>aucun fichier</li>'}</ul><p class="hint" style="margin:8px 0 0">Fichiers conservés avec le dossier, sans limite de durée. Liens valables un an.</p></div>
      </div>
      ${(() => { const sc = scoreLead(l); return `<div class="box"><h3>Score ${scoreBadge(sc)}</h3><div class="gauges">${['valeur', 'maturite', 'engagement'].map(k => `<div class="gauge"><div class="eyebrow">${{ valeur: 'Valeur du dossier', maturite: 'Maturité', engagement: 'Engagement' }[k]} · ${sc[k]} / 100</div><div class="track"><i style="width:${sc[k]}%"></i></div><ul class="plain">${sc.why[k].map(w => `<li>${esc(w)}</li>`).join('') || '<li>aucun signal</li>'}</ul></div>`).join('')}</div>${sc.rule ? `<p class="hint" style="margin:8px 0 0">Règle appliquée : ${esc(sc.rule)}</p>` : ''}</div>`; })()}
      <div class="box"><h3>Suivi</h3>
        <div class="grid">
          <div class="field"><label>Statut</label><select id="d-status">${STATUS.map(s => `<option value="${s[0]}"${(l.status || 'nouveau') === s[0] ? ' selected' : ''}>${s[1]}</option>`).join('')}</select></div>
          <div class="field"><label>Responsable</label><select id="d-assign"><option value="">—</option>${admins.map(a => `<option value="${a.id}"${l.assigned_to === a.id ? ' selected' : ''}>${esc(a.prenom || a.email)}</option>`).join('')}</select></div>
          <div class="field"><label>Prochaine action</label><input type="date" id="d-next" value="${l.next_action || ''}"></div>
        </div>
        <div class="field" style="margin-top:12px"><label>Notes internes</label><textarea id="d-notes" rows="5">${esc(l.notes || '')}</textarea></div>
        <div class="savebar"><span class="hint" id="d-msg">Dernière modification : ${l.updated_at ? new Date(l.updated_at).toLocaleString('fr-FR') : '—'}</span><button type="button" class="btn primary" id="d-save">Enregistrer</button></div>
      </div>`;
    $('drawer').classList.remove('hidden');
    $('d-body').querySelectorAll('[data-photos]').forEach(b => b.addEventListener('click', () => openPhotos(+b.dataset.photos)));
    $('d-save').addEventListener('click', async () => {
      const upd = { status: $('d-status').value, assigned_to: $('d-assign').value || null, next_action: $('d-next').value || null, notes: $('d-notes').value };
      const { error } = await sb.from('leads').update(upd).eq('id', id);
      if (error) { $('d-msg').textContent = 'Enregistrement impossible : ' + error.message; return; }
      Object.assign(l, upd, { updated_at: new Date().toISOString() }); $('d-msg').textContent = 'Enregistré.'; renderLeads();
    });
  }
  $('d-close').addEventListener('click', () => $('drawer').classList.add('hidden'));
  $('drawer').addEventListener('click', e => { if (e.target === $('drawer')) $('drawer').classList.add('hidden'); });

  /* ---------- prix ---------- */
  const SETTINGS = [
    ['MARGE', 'Marge par défaut', '%', 100], ['FG', 'Frais généraux', '%', 100], ['PILOTAGE', 'Pilotage de chantier', '%', 100], ['NOTAIRE', 'Frais de notaire', '%', 100],
    ['REGION.paris', 'Coef. Paris', '', 1], ['REGION.pc', 'Coef. petite couronne', '', 1], ['REGION.gc', 'Coef. grande couronne', '', 1], ['REGION.lyon', 'Coef. Lyon, Bordeaux, Nice', '', 1], ['REGION.metro', 'Coef. autre métropole', '', 1], ['REGION.moy', 'Coef. ville moyenne', '', 1], ['REGION.rural', 'Coef. rural', '', 1],
    ['GAMME.eco', 'Coef. matériaux économique', '', 1], ['GAMME.std', 'Coef. matériaux standard', '', 1], ['GAMME.prem', 'Coef. matériaux premium', '', 1],
  ];
  const getSetting = k => { const [a, b] = k.split('.'); return b ? C[a][b][0] : C[a]; };
  const getDefault = k => { const [a, b] = k.split('.'); return b ? C.DEFAULTS[a][b][0] : C.DEFAULTS[a]; };
  async function loadPricingTab() {
    if (!pricingLoaded) { await C.loadPricing(); pricingLoaded = true; }
    dirty.clear(); $('prix-msg').textContent = '';
    $('settings').innerHTML = SETTINGS.map(([k, label, unit, mult]) => { const v = getSetting(k), d = getDefault(k); return `<div class="field"><label>${label} <span class="optsub">défaut ${(d * mult).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit}</span></label><div class="unit"><input type="number" step="${mult === 100 ? 0.5 : 0.01}" data-set="${k}" value="${+(v * mult).toFixed(3)}">${unit ? `<span>${unit}</span>` : ''}</div></div>`; }).join('');
    $('items').querySelector('tbody').innerHTML = C.CATALOG.map(l => `<tr class="lot"><td colspan="10">${C.lotIcon(l.lot)}${esc(l.lot)}</td></tr>` + l.items.map(it => { const d = C.DEFAULTS.items[it.id] || { pu: '—' }; return `<tr data-item="${it.id}"${it.custom ? ' data-custom="1"' : ''}>
      <td><input type="checkbox" data-f="active"${it.inactive ? '' : ' checked'}></td>
      <td><input type="text" data-f="label" value="${esc(it.label)}" class="wide"><input type="text" data-f="sub" value="${esc(it.sub || '')}" class="wide sub" placeholder="précision"></td>
      <td>${esc(it.unit)}</td>
      <td class="r"><input type="number" step="1" data-f="pu" value="${it.pu}"></td>
      <td class="r hint num">${d.pu}</td>
      <td class="r"><input type="number" step="5" min="0" max="100" data-f="lab" value="${Math.round(it.lab * 100)}"></td>
      <td><select data-f="tva"><option value="10"${it.tva === 5.5 ? '' : ' selected'}>10 %</option><option value="5.5"${it.tva === 5.5 ? ' selected' : ''}>5,5 %</option></select></td>
      <td class="r"><input type="number" step="0.5" min="0" max="60" data-f="marge" value="${it.marge == null ? '' : +(it.marge * 100).toFixed(2)}" placeholder="défaut"></td>
      <td class="qtycell"><select data-f="qty_mode" class="inline">${Object.keys(C.QTY_MODES).map(k => `<option value="${k}"${it.qm === k ? ' selected' : ''}>${C.QTY_MODES[k]}</option>`).join('')}</select> <input type="number" step="0.01" data-f="qty_coef" value="${it.qc == null ? 1 : it.qc}" style="width:72px" aria-label="Coefficient">${d.qm ? `<small>défaut : ${esc(C.QTY_MODES[d.qm])} ${d.qc}</small>` : ''}</td>
      <td>${it.custom ? `<button type="button" class="btn small" data-del="${it.id}">Supprimer</button>` : ''}</td>
    </tr>`; }).join('')).join('');
    $('items-cards').innerHTML = C.CATALOG.map(l => `<div class="mlot">${C.lotIcon(l.lot)}${esc(l.lot)}</div>` + l.items.map(it => `<div class="mcard${it.inactive ? ' off' : ''}">
      <div class="mrow"><b>${esc(it.label)}</b><button type="button" class="btn small" data-edit="${it.id}" aria-label="Modifier ${esc(it.label)}">✎</button></div>
      <div class="msub">${esc(it.sub || '')}</div>
      <div class="mrow"><span class="num">${eur(it.pu)}${it.unit === 'forfait' ? '' : '/' + it.unit} HT</span><span>${it.inactive ? 'inactif' : 'MO ' + Math.round(it.lab * 100) + ' % · TVA ' + (it.tva === 5.5 ? '5,5' : '10') + ' % · marge ' + (it.marge == null ? 'défaut' : Math.round(it.marge * 100) + ' %')}</span></div>
    </div>`).join('')).join('');
    const lots = $('ni-lot'); lots.innerHTML = C.CATALOG.map(l => `<option value="${esc(l.lot)}">${esc(l.lot)}</option>`).join('') + '<option value="__new">Nouveau lot…</option>';
    $('ni-qmode').innerHTML = Object.keys(C.QTY_MODES).map(k => `<option value="${k}">${C.QTY_MODES[k]}</option>`).join('');
  }
  $('ni-lot').addEventListener('change', () => $('ni-newlot-field').classList.toggle('hidden', $('ni-lot').value !== '__new'));
  $('ni-qmode').addEventListener('change', () => { $('ni-qcoef-label').textContent = $('ni-qmode').value === 'fixed' ? 'Quantité' : 'Coefficient'; });
  $('new-item').addEventListener('submit', async e => {
    e.preventDefault();
    const lot = $('ni-lot').value === '__new' ? $('ni-newlot').value.trim() : $('ni-lot').value;
    const label = $('ni-label').value.trim();
    if (!lot || !label || !$('ni-pu').value) { $('ni-msg').textContent = 'Lot, nom et prix sont obligatoires.'; return; }
    const slug = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const id = 'c_' + slug + '_' + Date.now().toString(36).slice(-4);
    const row = { id, custom: true, lot, label, sub: $('ni-sub').value.trim(), unit: $('ni-unit').value, pu: +$('ni-pu').value, lab: Math.min(1, Math.max(0, +$('ni-lab').value / 100)), tva: +$('ni-tva').value, marge: $('ni-marge').value === '' ? null : +$('ni-marge').value / 100, qty_mode: $('ni-qmode').value, qty_coef: +$('ni-qcoef').value || 1, presets: [...document.querySelectorAll('[name="ni-preset"]:checked')].map(c => c.value), active: true, sort_order: 100, updated_by: A.user.id, updated_at: new Date().toISOString() };
    const { error } = await sb.from('pricing_items').insert(row);
    if (error) { $('ni-msg').textContent = 'Création impossible : ' + error.message; return; }
    C.addCustomItem(row); $('new-item').reset(); $('ni-newlot-field').classList.add('hidden'); $('ni-msg').textContent = 'Ouvrage créé : il est visible dans le tunnel.'; await loadPricingTab(); $('ni-msg').textContent = 'Ouvrage « ' + label + ' » créé.';
  });
  // Éditeur plein écran d'un ouvrage (mobile)
  function openItemEditor(id) {
    const it = C.ITEMS[id]; if (!it) return;
    const d = C.DEFAULTS.items[it.id] || {};
    $('d-title').textContent = it.label;
    $('d-body').innerHTML = `<div class="box"><h3>${esc(it.lotName)}</h3><div class="grid">
      <div class="field wide"><label>Nom</label><input id="ie-label" value="${esc(it.label)}"></div>
      <div class="field wide"><label>Précision</label><input id="ie-sub" value="${esc(it.sub || '')}"></div>
      <div class="field"><label>Prix HT (${esc(it.unit)})${d.pu != null ? ` <span class="optsub">défaut ${d.pu}</span>` : ''}</label><input id="ie-pu" type="number" step="1" value="${it.pu}"></div>
      <div class="field"><label>Part main-d'œuvre %</label><input id="ie-lab" type="number" step="5" min="0" max="100" value="${Math.round(it.lab * 100)}"></div>
      <div class="field"><label>TVA</label><select id="ie-tva"><option value="10"${it.tva === 5.5 ? '' : ' selected'}>10 %</option><option value="5.5"${it.tva === 5.5 ? ' selected' : ''}>5,5 %</option></select></div>
      <div class="field"><label>Marge % <span class="optsub">vide : défaut</span></label><input id="ie-marge" type="number" step="0.5" min="0" max="60" value="${it.marge == null ? '' : +(it.marge * 100).toFixed(2)}" placeholder="défaut"></div>
      <div class="field"><label>Quantité proposée</label><select id="ie-qm">${Object.keys(C.QTY_MODES).map(k => `<option value="${k}"${it.qm === k ? ' selected' : ''}>${C.QTY_MODES[k]}</option>`).join('')}</select></div>
      <div class="field"><label>Coefficient</label><input id="ie-qc" type="number" step="0.01" value="${it.qc == null ? 1 : it.qc}"></div>
      <div class="field wide"><label class="check"><input type="checkbox" id="ie-active"${it.inactive ? '' : ' checked'}> Actif dans le tunnel</label></div>
    </div><div class="savebar"><span class="hint" id="ie-msg"></span><button type="button" class="btn primary" id="ie-save">Enregistrer</button></div></div>`;
    $('drawer').classList.remove('hidden');
    $('ie-save').addEventListener('click', async () => {
      const g = i => document.getElementById(i);
      const row = { id: it.id, lot: it.lotName, label: g('ie-label').value.trim() || it.label, sub: g('ie-sub').value.trim(), unit: it.unit, pu: +g('ie-pu').value, lab: Math.min(1, Math.max(0, +g('ie-lab').value / 100)), tva: +g('ie-tva').value, marge: g('ie-marge').value === '' ? null : +g('ie-marge').value / 100, active: g('ie-active').checked, qty_mode: g('ie-qm').value, qty_coef: g('ie-qc').value === '' ? 1 : +g('ie-qc').value, updated_by: A.user.id, updated_at: new Date().toISOString() };
      if (it.custom) { row.custom = true; row.presets = it.presets || []; }
      const { error } = await sb.from('pricing_items').upsert(row);
      if (error) { $('ie-msg').textContent = 'Enregistrement impossible : ' + error.message; return; }
      C.applyPricing([row], []); pricingLoaded = false; await loadPricingTab(); $('drawer').classList.add('hidden');
    });
  }
  $('items-cards').addEventListener('click', e => { const b = e.target.closest('[data-edit]'); if (b) openItemEditor(b.dataset.edit); });
  $('items').addEventListener('click', async e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!confirm('Supprimer cet ouvrage ? Les estimations déjà faites ne sont pas modifiées.')) return;
    const { error } = await sb.from('pricing_items').delete().eq('id', b.dataset.del);
    if (error) { alert('Suppression impossible : ' + error.message); return; }
    const it = C.ITEMS[b.dataset.del]; if (it) { const lot = C.CATALOG.find(l => l.lot === it.lotName); if (lot) lot.items = lot.items.filter(x => x.id !== it.id); delete C.ITEMS[it.id]; Object.keys(C.PRESET).forEach(k => { C.PRESET[k] = C.PRESET[k].filter(x => x !== it.id); }); }
    await loadPricingTab();
  });
  $('tab-prix').addEventListener('input', e => { const tr = e.target.closest('tr[data-item]'); if (tr) dirty.add(tr.dataset.item); if (e.target.dataset.set) dirty.add('settings'); $('prix-msg').textContent = 'Modifications non enregistrées.'; });
  $('prix-save').addEventListener('click', async () => {
    const btn = $('prix-save'); btn.disabled = true; $('prix-msg').textContent = 'Enregistrement…';
    try {
      const uid = A.user.id;
      const rows = [...document.querySelectorAll('tr[data-item]')].filter(tr => dirty.has(tr.dataset.item)).map(tr => {
        const g = f => tr.querySelector(`[data-f="${f}"]`);
        const it = C.ITEMS[tr.dataset.item];
        const row = { id: tr.dataset.item, lot: it.lotName, label: g('label').value.trim() || it.label, sub: g('sub').value.trim(), unit: it.unit, pu: +g('pu').value, lab: Math.min(1, Math.max(0, +g('lab').value / 100)), tva: +g('tva').value, marge: g('marge').value === '' ? null : +g('marge').value / 100, active: g('active').checked, updated_by: uid, updated_at: new Date().toISOString() };
        row.qty_mode = g('qty_mode').value; row.qty_coef = g('qty_coef').value === '' ? 1 : +g('qty_coef').value;
        if (it.custom) { row.custom = true; row.presets = it.presets || []; }
        return row;
      });
      if (rows.length) { const { error } = await sb.from('pricing_items').upsert(rows); if (error) throw error; }
      if (dirty.has('settings')) {
        const vals = {}; document.querySelectorAll('[data-set]').forEach(inp => { const [k, label, unit, mult] = SETTINGS.find(s => s[0] === inp.dataset.set); vals[k] = +inp.value / mult; });
        const setRows = [['MARGE', vals.MARGE], ['FG', vals.FG], ['PILOTAGE', vals.PILOTAGE], ['NOTAIRE', vals.NOTAIRE],
          ['REGION', Object.fromEntries(Object.keys(C.REGION).map(k => [k, vals['REGION.' + k]]))], ['GAMME', Object.fromEntries(Object.keys(C.GAMME).map(k => [k, vals['GAMME.' + k]]))]]
          .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
        const { error } = await sb.from('pricing_settings').upsert(setRows); if (error) throw error;
      }
      pricingLoaded = false; await loadPricingTab(); $('prix-msg').textContent = 'Enregistré. Les nouvelles estimations utilisent ces valeurs.';
    } catch (e) { $('prix-msg').textContent = 'Enregistrement impossible : ' + (e.message || e); }
    btn.disabled = false;
  });
  $('prix-reset').addEventListener('click', async () => {
    if (!confirm('Supprimer tous les prix personnalisés et revenir au catalogue par défaut ?')) return;
    try {
      let r = await sb.from('pricing_items').delete().neq('id', ''); if (r.error) throw r.error;
      r = await sb.from('pricing_settings').delete().neq('key', ''); if (r.error) throw r.error;
      location.reload();
    } catch (e) { $('prix-msg').textContent = 'Réinitialisation impossible : ' + (e.message || e); }
  });

  /* ---------- sélection des ouvrages ---------- */
  const ETATS = [['bon', 'Bon'], ['correct', 'Correct'], ['degrade', 'Dégradé'], ['total', 'À rénover entièrement']];
  let rules = [];
  const allItems = () => C.CATALOG.flatMap(l => l.items.filter(it => !it.inactive));
  async function loadSelectionTab() {
    if (!pricingLoaded) { await C.loadPricing(); pricingLoaded = true; }
    rules = JSON.parse(JSON.stringify(C.RULES));
    $('sel-msg').textContent = '';
    $('preset-table').querySelector('tbody').innerHTML = C.CATALOG.map(l => `<tr class="lot"><td colspan="5">${C.lotIcon(l.lot)}${esc(l.lot)}</td></tr>` + l.items.filter(it => !it.inactive).map(it => `<tr data-preset="${it.id}"><td>${esc(it.label)}</td>${ETATS.map(e => `<td><input type="checkbox" data-etat="${e[0]}"${(C.PRESET[e[0]] || []).includes(it.id) ? ' checked' : ''} aria-label="${esc(it.label)} : ${e[1]}"></td>`).join('')}</tr>`).join('')).join('');
    renderRules();
  }
  const itemOptions = (sel) => allItems().map(it => `<option value="${it.id}"${(sel || []).includes(it.id) ? ' selected' : ''}>${esc(it.lotName)} · ${esc(it.label)}</option>`).join('');
  function renderRules() {
    $('rules').innerHTML = rules.map((r, i) => `<div class="rule" data-i="${i}">
      <div class="rule-head"><input type="text" data-r="label" value="${esc(r.label || '')}" placeholder="Nom de la règle" class="wide"><label class="check"><input type="checkbox" data-r="enabled"${r.disabled ? '' : ' checked'}> active</label><button type="button" class="btn small" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn small" data-down="${i}" ${i === rules.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn small" data-rdel="${i}">Supprimer</button></div>
      <div class="rule-when"><span class="eyebrow">Quand</span>${(r.when || []).map((c, j) => `<div class="cond" data-j="${j}"><select data-c="f">${Object.keys(C.RULE_FIELDS).map(f => `<option value="${f}"${c.f === f ? ' selected' : ''}>${C.RULE_FIELDS[f]}</option>`).join('')}</select><select data-c="op">${Object.keys(C.RULE_OPS).map(o => `<option value="${o}"${c.op === o ? ' selected' : ''}>${C.RULE_OPS[o]}</option>`).join('')}</select><input type="text" data-c="v" value="${esc(c.v == null ? '' : c.v)}" placeholder="valeur"><button type="button" class="btn small" data-cdel="${j}" aria-label="Retirer la condition">×</button></div>`).join('')}<button type="button" class="btn small" data-cadd="${i}">+ condition</button></div>
      <div class="rule-then"><div class="field"><label>Ajouter</label><select multiple size="4" data-r="add">${itemOptions(r.add)}</select></div><div class="field"><label>Retirer</label><select multiple size="4" data-r="remove">${itemOptions(r.remove)}</select></div></div>
    </div>`).join('') || '<p class="hint">Aucune règle : seule la liste de l\'état général s\'applique.</p>';
  }
  function readRules() {
    return [...document.querySelectorAll('.rule')].map((el, i) => ({
      id: rules[i].id || ('r_' + Date.now().toString(36) + i),
      label: el.querySelector('[data-r="label"]').value.trim(),
      disabled: !el.querySelector('[data-r="enabled"]').checked,
      when: [...el.querySelectorAll('.cond')].map(c => ({ f: c.querySelector('[data-c="f"]').value, op: c.querySelector('[data-c="op"]').value, v: c.querySelector('[data-c="v"]').value.trim() })),
      add: [...el.querySelector('[data-r="add"]').selectedOptions].map(o => o.value),
      remove: [...el.querySelector('[data-r="remove"]').selectedOptions].map(o => o.value),
    }));
  }
  $('rules').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    rules = readRules();
    if (t.dataset.rdel != null) rules.splice(+t.dataset.rdel, 1);
    else if (t.dataset.up != null) { const i = +t.dataset.up; [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]]; }
    else if (t.dataset.down != null) { const i = +t.dataset.down; [rules[i + 1], rules[i]] = [rules[i], rules[i + 1]]; }
    else if (t.dataset.cadd != null) rules[+t.dataset.cadd].when.push({ f: 'dpe', op: 'in', v: 'F,G' });
    else if (t.dataset.cdel != null) { const r = t.closest('.rule'); rules[+r.dataset.i].when.splice(+t.dataset.cdel, 1); }
    else return;
    renderRules();
  });
  $('rule-add').addEventListener('click', () => { rules = readRules(); rules.push({ id: 'r_' + Date.now().toString(36), label: '', when: [{ f: 'dpe', op: 'in', v: 'F,G' }], add: [], remove: [] }); renderRules(); });
  $('sel-save').addEventListener('click', async () => {
    const btn = $('sel-save'); btn.disabled = true; $('sel-msg').textContent = 'Enregistrement…';
    try {
      const preset = {}; ETATS.forEach(e => { preset[e[0]] = [...document.querySelectorAll(`[data-preset] [data-etat="${e[0]}"]:checked`)].map(cb => cb.closest('tr').dataset.preset); });
      const newRules = readRules().filter(r => r.when.length && (r.add.length || r.remove.length));
      const { error } = await sb.from('pricing_settings').upsert([{ key: 'PRESET', value: preset, updated_at: new Date().toISOString() }, { key: 'RULES', value: newRules, updated_at: new Date().toISOString() }]);
      if (error) throw error;
      Object.keys(preset).forEach(k => { C.PRESET[k] = preset[k]; }); C.RULES.length = 0; newRules.forEach(r => C.RULES.push(r));
      await loadSelectionTab(); $('sel-msg').textContent = 'Enregistré. Les prochaines estimations suivent ces règles.';
    } catch (e) { $('sel-msg').textContent = 'Enregistrement impossible : ' + (e.message || e); }
    btn.disabled = false;
  });
  $('sel-reset').addEventListener('click', async () => {
    if (!confirm('Revenir aux règles de sélection par défaut ?')) return;
    const { error } = await sb.from('pricing_settings').delete().in('key', ['PRESET', 'RULES']);
    if (error) { $('sel-msg').textContent = 'Impossible : ' + error.message; return; }
    location.reload();
  });

  /* ---------- scoring ---------- */
  const SC_DEFAULT = {
    poids: { valeur: 40, maturite: 35, engagement: 25 },
    valeur: { ttc_15k: 10, ttc_40k: 25, ttc_80k: 40, ttc_plus: 50, marge_3k: 5, marge_8k: 15, marge_plus: 25, finance_oui: 15, bien_entier: 10 },
    maturite: { stade_etude: 10, stade_compromis: 35, stade_acte: 50, dem_6: 10, dem_3: 20, dem_1: 30, finance_ok: 20, adresse_precise: 10 },
    engagement: { rappel: 30, fichiers: 20, travaux_modifies: 15, partage: 15, compte: 10, session_unique: 10 },
    paliers: { A: 70, B: 50, C: 30 },
    regles: { acte_immediat_A: 1, plancher_ttc_C: 5000 },
  };
  const SC_LABELS = {
    poids: ['Pondération de la note globale (%)', { valeur: 'Valeur', maturite: 'Maturité', engagement: 'Engagement' }],
    valeur: ['Valeur du dossier', { ttc_15k: 'Travaux < 15 k€', ttc_40k: 'Travaux 15 à 40 k€', ttc_80k: 'Travaux 40 à 80 k€', ttc_plus: 'Travaux > 80 k€', marge_3k: 'Marge < 3 k€', marge_8k: 'Marge 3 à 8 k€', marge_plus: 'Marge > 8 k€', finance_oui: 'Accompagnement financement demandé', bien_entier: 'Maison ou immeuble' }],
    maturite: ['Maturité', { stade_etude: 'En étude', stade_compromis: 'Sous compromis', stade_acte: 'Acte signé', dem_6: 'Démarrage sous 6 mois', dem_3: 'Démarrage sous 3 mois', dem_1: 'Démarrage dès que possible', finance_ok: 'Financement acquis ou accompagné', adresse_precise: 'Adresse précise choisie dans la liste' }],
    engagement: ['Engagement', { rappel: 'Rappel visite technique demandé', fichiers: 'Plans ou photos déposés', travaux_modifies: 'Travaux modifiés à la main', partage: 'Estimation partagée ou rouverte', compte: 'Compte créé, téléphone valide', session_unique: 'Parcours complet d\'une traite' }],
    paliers: ['Paliers (note globale minimale)', { A: 'Lettre A à partir de', B: 'Lettre B à partir de', C: 'Lettre C à partir de' }],
    regles: ['Règles prioritaires', { acte_immediat_A: 'Acte signé + démarrage immédiat ⇒ A (1 = oui, 0 = non)', plancher_ttc_C: 'Travaux sous ce montant ⇒ plafonné à C (€)' }],
  };
  let SC = JSON.parse(JSON.stringify(SC_DEFAULT)), scLoaded = false, scSessions = {};
  const rappelByProject = () => { const m = {}; leads.forEach(l => { if (l.kind === 'rappel' && l.project_id) m[l.project_id] = true; }); return m; };
  let rappelMap = null;
  function scoreLead(l) {
    if (!rappelMap) rappelMap = rappelByProject();
    const p = l.payload || {}, b = p.bien || {}, sess = scSessions[l.project_id] || null;
    const why = { valeur: [], maturite: [], engagement: [] };
    let v = 0, m = 0, e = 0;
    const ttc = +l.estimation_ttc || 0, marge = margeOf(l);
    const V = SC.valeur, M = SC.maturite, E = SC.engagement;
    if (ttc) { const pts = ttc < 15000 ? V.ttc_15k : ttc < 40000 ? V.ttc_40k : ttc < 80000 ? V.ttc_80k : V.ttc_plus; v += pts; why.valeur.push('Travaux ' + eur(ttc) + ' : +' + pts); }
    if (marge) { const pts = marge < 3000 ? V.marge_3k : marge < 8000 ? V.marge_8k : V.marge_plus; v += pts; why.valeur.push('Marge ' + eur(marge) + ' : +' + pts); }
    if (l.finance === 'oui') { v += V.finance_oui; why.valeur.push('Accompagnement financement : +' + V.finance_oui); }
    if (l.type_bien === 'maison' || l.type_bien === 'immeuble') { v += V.bien_entier; why.valeur.push((KIND[l.type_bien]) + ' : +' + V.bien_entier); }
    const st = { etude: M.stade_etude, compromis: M.stade_compromis, acte: M.stade_acte }[l.stade]; if (st != null) { m += st; why.maturite.push('Stade ' + l.stade + ' : +' + st); }
    const dm = { '6': M.dem_6, '3': M.dem_3, '1': M.dem_1 }[String(l.demarrage || '')]; if (dm != null) { m += dm; why.maturite.push('Démarrage sous ' + l.demarrage + ' mois : +' + dm); }
    if (l.finance === 'oui' || l.finance === 'renta') { m += M.finance_ok; why.maturite.push('Financement ' + (l.finance === 'oui' ? 'accompagné' : 'acquis') + ' : +' + M.finance_ok); }
    if (l.cp && l.ville) { m += M.adresse_precise; why.maturite.push('Adresse précise : +' + M.adresse_precise); }
    if (l.kind === 'rappel' || rappelMap[l.project_id]) { e += E.rappel; why.engagement.push('Rappel demandé : +' + E.rappel); }
    if (p.files && p.files.length) { e += E.fichiers; why.engagement.push(p.files.length + ' fichier(s) : +' + E.fichiers); }
    if ((sess && sess.data && sess.data.worksTouched) || (p.qty && Object.keys(p.qty).length)) { e += E.travaux_modifies; why.engagement.push('Travaux ajustés : +' + E.travaux_modifies); }
    if (sess && sess.data && (sess.data.shared || sess.data.reopened)) { e += E.partage; why.engagement.push('Estimation partagée : +' + E.partage); }
    if (l.user_id && String(l.tel || '').replace(/\D/g, '').length >= 9) { e += E.compte; why.engagement.push('Compte et téléphone : +' + E.compte); }
    if (sess && sess.completed_at) { const d = Date.parse(sess.completed_at) - Date.parse(sess.started_at); if (d > 0 && d < 45 * 60000) { e += E.session_unique; why.engagement.push('Parcours complet d\'une traite : +' + E.session_unique); } }
    v = Math.min(100, v); m = Math.min(100, m); e = Math.min(100, e);
    const w = SC.poids, tw = (w.valeur + w.maturite + w.engagement) || 100;
    let total = Math.round((v * w.valeur + m * w.maturite + e * w.engagement) / tw);
    let letter = total >= SC.paliers.A ? 'A' : total >= SC.paliers.B ? 'B' : total >= SC.paliers.C ? 'C' : 'D', rule = '';
    if (SC.regles.acte_immediat_A && l.stade === 'acte' && String(l.demarrage) === '1') { letter = 'A'; rule = 'acte signé et démarrage immédiat, passé en A'; }
    if (SC.regles.plancher_ttc_C && ttc && ttc < SC.regles.plancher_ttc_C && letter < 'C') { letter = 'C'; rule = 'travaux sous ' + eur(SC.regles.plancher_ttc_C) + ', plafonné à C'; }
    return { total, letter, valeur: v, maturite: m, engagement: e, why, rule };
  }
  const scoreBadge = sc => `<span class="score s${sc.letter}" title="valeur ${sc.valeur} · maturité ${sc.maturite} · engagement ${sc.engagement}">${sc.letter}<small>${sc.total}</small></span>`;
  async function loadScoringConfig() {
    if (scLoaded) return;
    try { const { data } = await sb.from('pricing_settings').select('value').eq('key', 'SCORING').maybeSingle(); if (data && data.value) SC = mergeDeep(JSON.parse(JSON.stringify(SC_DEFAULT)), data.value); } catch (e) {}
    scLoaded = true;
  }
  function mergeDeep(a, b) { Object.keys(b || {}).forEach(k => { if (b[k] && typeof b[k] === 'object' && a[k] && typeof a[k] === 'object') mergeDeep(a[k], b[k]); else if (b[k] != null) a[k] = b[k]; }); return a; }
  async function loadScoringSessions() {
    const ids = leads.map(l => l.project_id).filter(Boolean);
    if (!ids.length) return;
    try { const { data } = await sb.from('funnel_sessions').select('id,started_at,completed_at,data').in('id', ids.slice(0, 1000)); (data || []).forEach(x => { scSessions[x.id] = x; }); } catch (e) {}
  }
  let scSortKey = 'score', scSortDir = -1;
  async function loadScoring() {
    await loadScoringConfig();
    if (!leads.length) { const { data } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(1000); leads = data || []; }
    rappelMap = null; await loadScoringSessions();
    renderBareme(); renderScoring();
  }
  function renderBareme() {
    $('sc-bareme').innerHTML = Object.keys(SC_LABELS).map(g => `<div class="bareme-group"><h4>${SC_LABELS[g][0]}</h4><div class="grid">${Object.keys(SC_LABELS[g][1]).map(k => `<div class="field"><label>${SC_LABELS[g][1][k]} <span class="optsub">défaut ${SC_DEFAULT[g][k]}</span></label><input type="number" step="1" data-sc="${g}.${k}" value="${SC[g][k]}"></div>`).join('')}</div></div>`).join('');
  }
  function renderScoring() {
    const fl = $('sc-letter').value, fs = $('sc-status').value;
    let rows = leads.filter(l => l.kind !== 'test' && l.kind !== 'rappel');
    if (fs !== 'all') rows = rows.filter(l => !['signe', 'perdu'].includes(l.status));
    const scored = rows.map(l => ({ l, sc: scoreLead(l) }));
    let list = fl ? scored.filter(x => x.sc.letter === fl) : scored;
    const key = { score: x => x.sc.total, contact: x => ((x.l.nom || '') + (x.l.prenom || '')).toLowerCase(), bien: x => (KIND[x.l.type_bien] || '') + (x.l.ville || ''), ttc: x => +x.l.estimation_ttc || 0, valeur: x => x.sc.valeur, maturite: x => x.sc.maturite, engagement: x => x.sc.engagement, status: x => STATUS_RANK[x.l.status || 'nouveau'] || 0 }[scSortKey];
    list.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr')) * scSortDir; });
    document.querySelectorAll('#sc-table th[data-sort]').forEach(th => { th.classList.toggle('asc', th.dataset.sort === scSortKey && scSortDir === 1); th.classList.toggle('desc', th.dataset.sort === scSortKey && scSortDir === -1); });
    const counts = { A: 0, B: 0, C: 0, D: 0 }; scored.forEach(x => { counts[x.sc.letter]++; });
    $('sc-kpis').innerHTML = ['A', 'B', 'C', 'D'].map(k => `<div class="tile"><div class="eyebrow">${{ A: 'À rappeler aujourd\'hui', B: 'À rappeler sous 48 h', C: 'Relance automatique', D: 'Nurturing' }[k]}</div><div class="v num"><span class="score s${k}">${k}</span> ${counts[k]}</div><div class="d">${scored.length ? Math.round(counts[k] / scored.length * 100) + ' % des dossiers ouverts' : ''}</div></div>`).join('');
    $('sc-count').textContent = list.length + ' dossier' + (list.length > 1 ? 's' : '');
    $('sc-table').querySelector('tbody').innerHTML = list.map(({ l, sc }) => `<tr data-id="${l.id}">
      <td>${scoreBadge(sc)}</td>
      <td><b>${esc(l.prenom)} ${esc(l.nom)}</b><small>${dt(l.created_at)} · ${esc(l.stade || '')}${demLabel(l.demarrage) ? ' · ' + esc(demLabel(l.demarrage)) : ''}</small></td>
      <td>${esc(KIND[l.type_bien] || '')}${l.surface ? ' · ' + l.surface + ' m²' : ''}<small>${esc(l.ville || l.adresse || '')}</small></td>
      <td class="r num">${l.estimation_ttc ? eur(l.estimation_ttc) : '—'}</td>
      <td class="r num">${sc.valeur}</td><td class="r num">${sc.maturite}</td><td class="r num">${sc.engagement}</td>
      <td><span class="pill st st-${l.status || 'nouveau'}">${STATUS_LABEL[l.status || 'nouveau']}</span></td>
      <td><button type="button" class="btn small" data-open="${l.id}">Ouvrir</button></td>
    </tr>`).join('') || '<tr><td colspan="9" class="empty">Aucun dossier.</td></tr>';
    $('sc-cards').innerHTML = list.map(({ l, sc }) => `<div class="mcard" data-open="${l.id}" role="button">
      <div class="mrow"><b>${esc(l.prenom)} ${esc(l.nom)}</b>${scoreBadge(sc)}</div>
      <div class="msub">${esc(KIND[l.type_bien] || '')}${l.surface ? ' · ' + l.surface + ' m²' : ''}${l.ville ? ' · ' + esc(l.ville) : ''} · ${esc(l.stade || '')}</div>
      <div class="mrow"><span class="num">${l.estimation_ttc ? eur(l.estimation_ttc) : '—'}</span><span class="msub">V ${sc.valeur} · M ${sc.maturite} · E ${sc.engagement}</span></div>
    </div>`).join('') || '<p class="empty">Aucun dossier.</p>';
  }
  $('sc-cards').addEventListener('click', e => { const c = e.target.closest('[data-open]'); if (c) openLead(+c.dataset.open); });
  ['sc-letter', 'sc-status'].forEach(id => $(id).addEventListener('input', renderScoring));
  $('sc-table').querySelector('thead').addEventListener('click', e => { const th = e.target.closest('th[data-sort]'); if (!th) return; if (scSortKey === th.dataset.sort) scSortDir = -scSortDir; else { scSortKey = th.dataset.sort; scSortDir = -1; } renderScoring(); });
  $('sc-table').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openLead(+b.dataset.open); });
  $('sc-bareme').addEventListener('input', () => { document.querySelectorAll('[data-sc]').forEach(inp => { const [g, k] = inp.dataset.sc.split('.'); SC[g][k] = +inp.value || 0; }); renderScoring(); $('sc-msg').textContent = 'Barème modifié, non enregistré.'; });
  $('sc-save').addEventListener('click', async () => {
    const { error } = await sb.from('pricing_settings').upsert({ key: 'SCORING', value: SC, updated_at: new Date().toISOString() });
    $('sc-msg').textContent = error ? 'Enregistrement impossible : ' + error.message : 'Barème enregistré.';
  });
  $('sc-reset').addEventListener('click', async () => {
    if (!confirm('Revenir au barème par défaut ?')) return;
    await sb.from('pricing_settings').delete().eq('key', 'SCORING');
    SC = JSON.parse(JSON.stringify(SC_DEFAULT)); renderBareme(); renderScoring(); $('sc-msg').textContent = 'Barème par défaut rétabli.';
  });

  /* ---------- identités anonymes : un nom d'animal par IP, une couleur, la ville ---------- */
  const ANIMAUX = ['Blaireau', 'Castor', 'Loutre', 'Hérisson', 'Renard', 'Marmotte', 'Pingouin', 'Koala', 'Paresseux', 'Chouette', 'Tatou', 'Lama', 'Wombat', 'Pélican', 'Écureuil', 'Flamant', 'Hibou', 'Mouflon', 'Otarie', 'Panda', 'Raton', 'Sanglier', 'Tortue', 'Zèbre', 'Alpaga', 'Bison', 'Caméléon', 'Dauphin', 'Élan', 'Fennec', 'Girafe', 'Manchot'];
  const ADJ = ['farceur', 'distrait', 'pressé', 'gourmand', 'rêveur', 'malin', 'prudent', 'bavard', 'zen', 'curieux', 'grognon', 'élégant', 'matinal', 'nocturne', 'timide', 'audacieux', 'joufflu', 'agile', 'philosophe', 'bricoleur', 'romantique', 'sceptique', 'enthousiaste', 'flâneur'];
  const hashStr = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  function ipIdentity(ip) {
    const h = hashStr(String(ip));
    return { name: ANIMAUX[h % ANIMAUX.length] + ' ' + ADJ[Math.floor(h / 97) % ADJ.length], hue: h % 360 };
  }
  const chipStyle = hue => `background:hsl(${hue} 70% 92%);color:hsl(${hue} 55% 30%);border:1px solid hsl(${hue} 50% 78%)`;
  let geoCache = {}; try { geoCache = JSON.parse(localStorage.getItem('cotalia-geo') || '{}'); } catch (e) {}
  let geoQueue = [], geoBusy = false;
  function geoCity(ip) {
    if (!ip) return '';
    if (geoCache[ip] !== undefined) return geoCache[ip];
    if (!geoQueue.includes(ip)) { geoQueue.push(ip); geoPump(); }
    return null;
  }
  async function geoPump() {
    if (geoBusy || !geoQueue.length) return;
    geoBusy = true;
    const ip = geoQueue.shift();
    try {
      const r = await fetch('https://ipapi.co/' + encodeURIComponent(ip) + '/json/');
      const j = r.ok ? await r.json() : {};
      geoCache[ip] = j && j.city ? j.city + (j.country_code && j.country_code !== 'FR' ? ' (' + j.country_code + ')' : '') : '';
    } catch (e) { geoCache[ip] = ''; }
    try { localStorage.setItem('cotalia-geo', JSON.stringify(geoCache)); } catch (e) {}
    document.querySelectorAll(`[data-geo="${CSS.escape(ip)}"]`).forEach(el => { el.textContent = geoCache[ip] ? ' · ' + geoCache[ip] : ''; });
    geoBusy = false;
    setTimeout(geoPump, 700);   // ipapi.co tolère une trentaine d'appels par minute
  }
  // Puce colorée : le vrai nom quand on le connaît (dossier ou compte), un pseudonyme d'animal sinon.
  function ipChip(ip) {
    if (!ip) return '';
    const id = ipIdentity(ip), city = geoCity(ip);
    return `<span class="ipchip" style="${chipStyle(id.hue)}" title="IP ${esc(ip)}">${esc(id.name)}<span data-geo="${esc(ip)}">${city ? ' · ' + esc(city) : ''}</span></span>`;
  }
  function namedChip(label, key, ip, openId) {
    const hue = hashStr(String(key)) % 360, city = ip ? geoCity(ip) : '';
    return `<span class="ipchip${openId ? ' clickable' : ''}" style="${chipStyle(hue)}" title="${ip ? 'IP ' + esc(ip) : ''}"${openId ? ` data-open="${openId}" role="button"` : ''}>${esc(label)}${ip ? `<span data-geo="${esc(ip)}">${city ? ' · ' + esc(city) : ''}</span>` : ''}</span>`;
  }

  /* ---------- analyse du tunnel ---------- */
  const T_STEPS = [['kind', 'Bien'], ['bien', 'Descriptif'], ['finition', 'Finition'], ['travaux', 'Travaux'], ['financeQ', 'Financement'], ['acquisition', 'Acquisition'], ['situation', 'Situation'], ['contact', 'Coordonnées'], ['resultat', 'Estimation']];
  const T_LABEL = Object.fromEntries(T_STEPS);
  let sessions = [], tSortKey = 'date', tSortDir = -1;
  const median = arr => { const a = arr.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const dur = ms => { if (ms == null) return '—'; const s = Math.round(ms / 1000); if (s < 60) return s + ' s'; if (s < 3600) return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s'; return Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0'); };
  async function loadTunnel() {
    const days = +$('t-period').value;
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const { data, error } = await sb.from('funnel_sessions').select('*').gte('started_at', since).order('started_at', { ascending: false }).limit(5000);
    if (error) { $('t-count').textContent = 'Lecture impossible : ' + error.message + (error.code === '42P01' ? ' (exécutez supabase/schema-v4.sql)' : ''); return; }
    sessions = data || [];
    // profils des parcours faits par un compte connecté, pour afficher le vrai nom
    const ids = [...new Set(sessions.map(x => x.user_id).filter(id => id && !profilesById[id]))];
    if (ids.length) { try { const { data: pr } = await sb.from('profiles').select('id,prenom,nom,email').in('id', ids.slice(0, 500)); (pr || []).forEach(x => { profilesById[x.id] = x; }); } catch (e) {} }
    renderTunnel();
  }
  const profilesById = {};
  const accountChip = (x) => { const p = profilesById[x.user_id]; const name = p ? [p.prenom, p.nom].filter(Boolean).join(' ') || p.email : ''; return name ? namedChip(name, p.email || x.user_id, x.ip) : namedChip('Compte connecté', x.user_id, x.ip); };
  function sessionDuration(x) {
    const t = Object.values(x.steps || {}).map(v => Date.parse(v)).filter(isFinite);
    if (t.length < 2) return x.completed_at ? Date.parse(x.completed_at) - Date.parse(x.started_at) : null;
    return Math.max.apply(null, t) - Math.min.apply(null, t);
  }
  function renderTunnel() {
    const dev = $('t-device').value, st = $('t-state').value;
    let rows = sessions.slice();
    if (dev) rows = rows.filter(x => x.device === dev);
    if (st === 'done') rows = rows.filter(x => x.completed_at); else if (st === 'abandon') rows = rows.filter(x => !x.completed_at);
    const started = rows.length, done = rows.filter(x => x.completed_at).length;
    const medDone = median(rows.filter(x => x.completed_at).map(sessionDuration));
    const mobile = rows.filter(x => x.device === 'mobile').length;
    const withContact = rows.filter(x => (x.max_step || 0) >= 7).length;
    $('t-count').textContent = started + ' parcours';
    $('t-kpis').innerHTML = [
      ['Parcours commencés', started, mobile ? Math.round(mobile / started * 100) + ' % sur mobile' : ''],
      ['Estimations complètes', done, started ? Math.round(done / started * 100) + ' % de conversion' : ''],
      ['Coordonnées laissées', withContact, started ? Math.round(withContact / started * 100) + ' % des départs' : ''],
      ['Durée médiane d\'un parcours complet', dur(medDone), 'de la première à la dernière étape'],
    ].map(k => `<div class="tile"><div class="eyebrow">${k[0]}</div><div class="v num">${k[1]}</div><div class="d">${k[2]}</div></div>`).join('');
    // entonnoir
    const reach = T_STEPS.map(([k]) => rows.filter(x => x.steps && x.steps[k]));
    const exits = T_STEPS.map(([k]) => rows.filter(x => !x.completed_at && x.last_step === k).length);
    const times = T_STEPS.map(([k], i) => median(rows.map(x => { const a = x.steps && x.steps[k]; if (!a) return null; const later = T_STEPS.slice(i + 1).map(([n]) => x.steps[n]).filter(Boolean).map(Date.parse); return later.length ? Math.min.apply(null, later) - Date.parse(a) : null; })));
    let worst = -1, worstLoss = 0;
    const lossRows = T_STEPS.map(([k, label], i) => {
      const n = reach[i].length, prev = i ? reach[i - 1].length : n;
      const loss = i && prev ? (prev - n) / prev : 0;
      if (i && ['acquisition', 'situation'].indexOf(k) < 0 && loss > worstLoss && prev >= 5) { worstLoss = loss; worst = i; }
      return { k, label, n, prev, loss, i };
    });
    $('t-funnel').querySelector('tbody').innerHTML = lossRows.map(r => `<tr class="${r.i === worst ? 'late' : ''}"><td><b>${r.label}</b>${['acquisition', 'situation'].includes(r.k) ? '<small>étape optionnelle, selon le choix de financement</small>' : ''}</td><td class="r num">${r.n}</td><td class="r num">${started ? Math.round(r.n / started * 100) + ' %' : '—'}</td><td class="r num">${r.i && r.prev ? '−' + Math.round(r.loss * 100) + ' %' : '—'}</td><td class="r num">${exits[r.i] || 0}</td><td class="r num">${dur(times[r.i])}</td><td class="r num">${reach[r.i].filter(x => x.device === 'mobile').length}</td><td class="r num">${reach[r.i].filter(x => x.device === 'ordinateur').length}</td></tr>`).join('');
    // parcours
    const key = { date: x => x.started_at || '', device: x => x.device || '', bien: x => (KIND[x.kind] || '') + (x.surface || ''), step: x => x.max_step || 0, done: x => x.completed_at ? 1 : 0, duration: x => sessionDuration(x) || 0, ttc: x => +x.ttc || 0, total: x => +((x.data || {}).total) || 0, renta: x => +((x.data || {}).brut) || 0, finance: x => x.finance || '' }[tSortKey];
    rows.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'fr')) * tSortDir; });
    document.querySelectorAll('#t-sessions th[data-sort]').forEach(th => { th.classList.toggle('asc', th.dataset.sort === tSortKey && tSortDir === 1); th.classList.toggle('desc', th.dataset.sort === tSortKey && tSortDir === -1); });
    const leadByRef = Object.fromEntries(leads.map(l => [l.project_id, l]));
    $('t-sessions').querySelector('tbody').innerHTML = rows.map(x => { const l = leadByRef[x.id]; return `<tr>
      <td class="num">${new Date(x.started_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${esc(x.device || '—')}</td>
      <td>${esc(KIND[x.kind] || '—')}${x.surface ? ' · ' + x.surface + ' m²' : ''}<small>${esc((x.data && x.data.etat) || '')}${x.data && x.data.works ? ' · ' + x.data.works + ' ouvrages' : ''}</small></td>
      <td>${esc(T_LABEL[x.last_step] || x.last_step || '—')}<small>${T_STEPS.filter(([k]) => x.steps && x.steps[k]).length} étape(s) vue(s)</small></td>
      <td>${x.completed_at ? '<span class="pill" style="background:var(--good-soft);color:var(--good)">complet</span>' : '<span class="pill">incomplet</span>'}</td>
      <td class="r num">${dur(sessionDuration(x))}</td>
      <td class="r num">${x.ttc ? eur(x.ttc) : '—'}</td>
      <td class="r num">${x.data && x.data.total ? eur(x.data.total) : '—'}</td>
      <td>${esc(FIN[x.finance] || '—')}</td>
      <td class="r num">${x.data && x.data.total ? pct1(x.data.brut || 0) + (x.data.cf != null ? '<small>' + cfHtml(x.data.cf) + '</small>' : '') : '—'}</td>
      <td>${l ? namedChip((l.prenom || '') + ' ' + (l.nom || ''), l.email || l.id, x.ip, l.id) : x.user_id ? accountChip(x) : x.ip ? ipChip(x.ip) : '—'}</td>
    </tr>`; }).join('') || '<tr><td colspan="11" class="empty">Aucun parcours sur la période.</td></tr>';
    $('t-cards').innerHTML = rows.map(x => { const l = leadByRef[x.id]; return `<div class="mcard"${l ? ` data-open="${l.id}" role="button"` : ''}>
      <div class="mrow">${l ? namedChip((l.prenom || '') + ' ' + (l.nom || ''), l.email || l.id, x.ip) : x.user_id ? accountChip(x) : x.ip ? ipChip(x.ip) : '<span class="msub">anonyme</span>'}${x.completed_at ? '<span class="pill" style="background:var(--good-soft);color:var(--good)">complet</span>' : '<span class="pill">incomplet</span>'}</div>
      <div class="msub">${new Date(x.started_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(x.device || '')} · ${esc(KIND[x.kind] || '')}${x.surface ? ' ' + x.surface + ' m²' : ''}</div>
      <div class="mrow"><span>${esc(T_LABEL[x.last_step] || x.last_step || '—')} · ${dur(sessionDuration(x))}</span><span class="num">${x.ttc ? eur(x.ttc) : ''}</span></div>
      ${x.data && x.data.total ? `<div class="msub">projet ${eur(x.data.total)} · renta ${pct1(x.data.brut || 0)}${x.data.cf != null ? ' · ' + cfHtml(x.data.cf) : ''}</div>` : ''}
    </div>`; }).join('') || '<p class="empty">Aucun parcours sur la période.</p>';
  }
  $('t-cards').addEventListener('click', e => { const c = e.target.closest('[data-open]'); if (c) openLead(+c.dataset.open); });
  ['t-device', 't-state'].forEach(id => $(id).addEventListener('input', renderTunnel));
  $('t-period').addEventListener('input', loadTunnel);
  $('t-sessions').querySelector('thead').addEventListener('click', e => { const th = e.target.closest('th[data-sort]'); if (!th) return; if (tSortKey === th.dataset.sort) tSortDir = -tSortDir; else { tSortKey = th.dataset.sort; tSortDir = -1; } renderTunnel(); });
  $('t-sessions').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openLead(+b.dataset.open); });

  /* ---------- administrateurs ---------- */
  async function loadAdmins() {
    await loadAdminsList();
    const { data: inv } = await sb.from('admin_invites').select('*').order('created_at');
    const me = A.user.id;
    $('admins').querySelector('tbody').innerHTML = admins.map(a => `<tr><td>${esc([a.prenom, a.nom].filter(Boolean).join(' ') || '—')}</td><td>${esc(a.email)}</td><td>${a.role === 'owner' ? '<span class="pill">propriétaire</span>' : 'administrateur'}</td><td class="num">${dt(a.created_at)}</td><td>${a.role === 'owner' || a.id === me ? '' : `<button type="button" class="btn small" data-demote="${a.id}">Retirer</button>`}</td></tr>`).join('')
      + (inv || []).map(i => `<tr class="pending"><td>—</td><td>${esc(i.email)}</td><td>invité, compte à créer</td><td class="num">${dt(i.created_at)}</td><td><button type="button" class="btn small" data-uninvite="${esc(i.email)}">Annuler</button></td></tr>`).join('');
  }
  $('admin-add').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('admin-email').value.trim().toLowerCase(); if (!email) return;
    $('admin-msg').textContent = '';
    const { data: p } = await sb.from('profiles').select('id,role').ilike('email', email).maybeSingle();
    if (p) {
      if (p.role === 'owner' || p.role === 'admin') { $('admin-msg').textContent = 'Ce compte est déjà administrateur.'; return; }
      const { error } = await sb.from('profiles').update({ role: 'admin' }).eq('id', p.id);
      $('admin-msg').textContent = error ? 'Impossible : ' + error.message : 'Compte promu administrateur. La personne doit se reconnecter pour voir le back-office.';
    } else {
      const { error } = await sb.from('admin_invites').upsert({ email, created_by: A.user.id });
      $('admin-msg').textContent = error ? 'Impossible : ' + error.message : 'Invitation enregistrée : dès que cette adresse crée son compte sur cotalia.fr, elle sera administratrice.';
    }
    $('admin-email').value = ''; loadAdmins();
  });
  $('admins').addEventListener('click', async e => {
    const d = e.target.closest('[data-demote]'), u = e.target.closest('[data-uninvite]');
    if (d && confirm('Retirer les droits d\'administration de ce compte ?')) { const { error } = await sb.from('profiles').update({ role: 'client' }).eq('id', d.dataset.demote); if (error) alert(error.message); loadAdmins(); }
    if (u) { await sb.from('admin_invites').delete().eq('email', u.dataset.uninvite); loadAdmins(); }
  });
})();
