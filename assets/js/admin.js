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
  const FIN = { oui: 'Accompagné', non: 'Déjà financé' };
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
    renderLeads();
  }
  const margeOf = l => (l.payload && l.payload.interne && l.payload.interne.marge) || 0;
  function renderLeads() {
    const q = $('q').value.trim().toLowerCase(), fs = $('f-status').value, fa = $('f-assign').value, sort = $('f-sort').value;
    let rows = leads.filter(l => l.kind !== 'test');
    if (q) rows = rows.filter(l => [l.prenom, l.nom, l.email, l.ville, l.adresse, l.ref, l.tel].join(' ').toLowerCase().includes(q));
    if (fs) rows = rows.filter(l => (l.status || 'nouveau') === fs);
    if (fa === 'none') rows = rows.filter(l => !l.assigned_to); else if (fa) rows = rows.filter(l => l.assigned_to === fa);
    if (sort === 'ttc') rows.sort((a, b) => (b.estimation_ttc || 0) - (a.estimation_ttc || 0));
    else if (sort === 'marge') rows.sort((a, b) => margeOf(b) - margeOf(a));
    else if (sort === 'next') rows.sort((a, b) => String(a.next_action || '9999').localeCompare(String(b.next_action || '9999')));
    $('count').textContent = rows.length + ' dossier' + (rows.length > 1 ? 's' : '');
    const today = new Date().toISOString().slice(0, 10);
    $('leads').querySelector('tbody').innerHTML = rows.map(l => `<tr data-id="${l.id}" class="${l.next_action && l.next_action < today ? 'late' : ''}">
      <td class="num">${dt(l.created_at)}${l.kind === 'rappel' ? '<span class="pill">rappel</span>' : ''}</td>
      <td><b>${esc(l.prenom)} ${esc(l.nom)}</b><small>${esc(l.email)}<br>${esc(l.tel)}</small></td>
      <td>${esc(KIND[l.type_bien] || l.type_bien || '')}${l.surface ? ' · ' + l.surface + ' m²' : ''}<small>${esc(l.ville || l.adresse || '')}</small></td>
      <td class="r num">${l.estimation_ttc ? eur(l.estimation_ttc) : '—'}</td>
      <td class="r num">${margeOf(l) ? eur(margeOf(l)) : '—'}</td>
      <td>${esc(FIN[l.finance] || '—')}${l.prix ? '<small>' + eur(l.prix) + ' d\'achat</small>' : ''}</td>
      <td><select data-f="status" class="inline">${STATUS.map(s => `<option value="${s[0]}"${(l.status || 'nouveau') === s[0] ? ' selected' : ''}>${s[1]}</option>`).join('')}</select></td>
      <td><select data-f="assigned_to" class="inline"><option value="">—</option>${admins.map(a => `<option value="${a.id}"${l.assigned_to === a.id ? ' selected' : ''}>${esc(a.prenom || a.email)}</option>`).join('')}</select></td>
      <td><input type="date" data-f="next_action" class="inline" value="${l.next_action || ''}"></td>
      <td><button type="button" class="btn small" data-open="${l.id}">Ouvrir</button></td>
    </tr>`).join('') || '<tr><td colspan="10" class="empty">Aucun dossier.</td></tr>';
  }
  ['q', 'f-status', 'f-assign', 'f-sort'].forEach(id => $(id).addEventListener('input', renderLeads));
  $('leads').addEventListener('change', async e => {
    const el = e.target.closest('[data-f]'); if (!el) return;
    const id = +el.closest('tr').dataset.id, f = el.dataset.f, v = el.value || null;
    const { error } = await sb.from('leads').update({ [f]: v }).eq('id', id);
    if (error) { alert('Enregistrement impossible : ' + error.message); return; }
    const l = leads.find(x => x.id === id); if (l) l[f] = v;
    if (f === 'next_action') renderLeads();
  });
  $('leads').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openLead(+b.dataset.open); });

  async function openLead(id) {
    const l = leads.find(x => x.id === id); if (!l) return;
    const p = l.payload || {}, b = p.bien || {}, i = p.interne || {}, s = l.situation || {};
    const files = p.files || [];
    const fileLinks = await Promise.all(files.map(async f => { try { const { data } = await sb.storage.from('plans').createSignedUrl(f, 600); return `<li><a href="${data.signedUrl}" target="_blank" rel="noopener">${esc(f.split('/').pop())}</a></li>`; } catch (e) { return `<li>${esc(f)}</li>`; } }));
    const works = Object.keys(p.works || {}).filter(k => p.works[k]).map(k => C.ITEMS[k] ? C.ITEMS[k].label + (p.qty && p.qty[k] != null ? ' (' + p.qty[k] + ' ' + C.ITEMS[k].unit + ')' : '') : k);
    $('d-title').textContent = (l.prenom || '') + ' ' + (l.nom || '') + ' · ' + (l.ref || '');
    $('d-body').innerHTML = `
      <div class="two">
        <div class="box"><h3>Contact</h3><table class="kv">
          <tr><td>E-mail</td><td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td></tr><tr><td>Téléphone</td><td><a href="tel:${esc(l.tel)}">${esc(l.tel)}</a></td></tr>
          <tr><td>Demande</td><td>${l.kind === 'rappel' ? 'Rappel pour visite technique' : 'Estimation'} · ${dt(l.created_at)}</td></tr>
          <tr><td>Stade</td><td>${esc(l.stade || '')} · démarrage sous ${esc(l.demarrage || '?')} mois</td></tr>
          <tr><td>Projet partagé</td><td>${l.project_id ? `<a href="../estimation.html?p=${encodeURIComponent(l.project_id)}" target="_blank" rel="noopener">ouvrir l'estimation</a>` : '—'}</td></tr>
        </table></div>
        <div class="box"><h3>Bien</h3><table class="kv">
          <tr><td>Type</td><td>${esc(KIND[l.type_bien] || '')} · ${esc(b.type || '')}</td></tr><tr><td>Adresse</td><td>${esc(l.adresse || '')}</td></tr>
          <tr><td>Surface</td><td>${l.surface || '?'} m² · ${esc(b.eau || '?')} pièces d'eau</td></tr><tr><td>Année / DPE / état</td><td>${esc(b.annee || '?')} · ${esc(b.dpe || '?')} · ${esc(b.etat || '?')}</td></tr>
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
          <tr><td>Apport / taux / durée</td><td class="num">${p.acquisition ? eur(p.acquisition.apport) + ' · ' + (p.acquisition.taux || '?') + ' % · ' + (p.acquisition.duree || '?') + ' ans' : '—'}</td></tr>
          <tr><td>Situation</td><td>${esc(s.statut || '—')} · revenus ${s.revenus ? eur(s.revenus) : '?'} · crédits ${s.credits ? eur(s.credits) : '0 €'} · apport dispo ${s.apportDispo ? eur(s.apportDispo) : '?'} · ${esc(s.proprietaire || '')}</td></tr>
        </table></div>
      </div>
      <div class="two">
        <div class="box"><h3>Travaux retenus</h3><ul class="plain">${works.map(w => `<li>${esc(w)}</li>`).join('') || '<li>—</li>'}</ul></div>
        <div class="box"><h3>Plans et photos</h3><ul class="plain">${fileLinks.join('') || '<li>aucun fichier</li>'}</ul><p class="hint" style="margin:8px 0 0">Liens valables 10 minutes.</p></div>
      </div>
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
    $('items').querySelector('tbody').innerHTML = C.CATALOG.map(l => `<tr class="lot"><td colspan="8">${esc(l.lot)}</td></tr>` + l.items.map(it => { const d = C.DEFAULTS.items[it.id]; return `<tr data-item="${it.id}">
      <td><input type="checkbox" data-f="active"${it.inactive ? '' : ' checked'}></td>
      <td><input type="text" data-f="label" value="${esc(it.label)}" class="wide"><input type="text" data-f="sub" value="${esc(it.sub || '')}" class="wide sub" placeholder="précision"></td>
      <td>${esc(it.unit)}</td>
      <td class="r"><input type="number" step="1" data-f="pu" value="${it.pu}"></td>
      <td class="r hint num">${d.pu}</td>
      <td class="r"><input type="number" step="5" min="0" max="100" data-f="lab" value="${Math.round(it.lab * 100)}"></td>
      <td><select data-f="tva"><option value="10"${it.tva === 5.5 ? '' : ' selected'}>10 %</option><option value="5.5"${it.tva === 5.5 ? ' selected' : ''}>5,5 %</option></select></td>
      <td class="r"><input type="number" step="0.5" min="0" max="60" data-f="marge" value="${it.marge == null ? '' : +(it.marge * 100).toFixed(2)}" placeholder="défaut"></td>
    </tr>`; }).join('')).join('');
  }
  $('tab-prix').addEventListener('input', e => { const tr = e.target.closest('tr[data-item]'); if (tr) dirty.add(tr.dataset.item); if (e.target.dataset.set) dirty.add('settings'); $('prix-msg').textContent = 'Modifications non enregistrées.'; });
  $('prix-save').addEventListener('click', async () => {
    const btn = $('prix-save'); btn.disabled = true; $('prix-msg').textContent = 'Enregistrement…';
    try {
      const uid = A.user.id;
      const rows = [...document.querySelectorAll('tr[data-item]')].filter(tr => dirty.has(tr.dataset.item)).map(tr => {
        const g = f => tr.querySelector(`[data-f="${f}"]`);
        const it = C.ITEMS[tr.dataset.item];
        return { id: tr.dataset.item, lot: it.lotName, label: g('label').value.trim() || it.label, sub: g('sub').value.trim(), unit: it.unit, pu: +g('pu').value, lab: Math.min(1, Math.max(0, +g('lab').value / 100)), tva: +g('tva').value, marge: g('marge').value === '' ? null : +g('marge').value / 100, active: g('active').checked, updated_by: uid, updated_at: new Date().toISOString() };
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
