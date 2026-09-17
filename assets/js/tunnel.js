/* Cotalia - tunnel d'estimation : étapes, saisie, encadré d'estimation, rapport final, partage, envoi des demandes. */
(function () {
  'use strict';
  const C = window.COTALIA;
  const CFG = window.COTALIA_CONFIG || {};
  const STORE = 'cotalia-tunnel-v2';
  const INDEX = 'cotalia-projects';
  const BASE = (CFG.supabaseUrl || '').replace(/\/$/, '');
  const KEY = CFG.supabaseAnonKey || '';
  const hasDb = () => !!(BASE && KEY);
  const auth = () => (C.auth && C.auth.token()) || KEY;
  const hdr = () => ({ 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + auth() });

  const $ = id => document.getElementById(id);
  const eurF = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur = v => eurF.format(Math.round(v || 0));
  const pct = (v, d) => ((v || 0) * 100).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 1 : d }) + ' %';
  const fmt = (v, d) => (+v || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 0 : d });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const rid = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

  const DEFAULT = {
    pid: '', token: '', kind: null, adresse: '', cp: '', ville: '', zone: 'moy', zoneAuto: true,
    type: 't3', nbapts: 3, apts: [], surface: '', eau: 1, etage: '', niveaux: '', annee: '', dpe: '', etat: '',
    ascenseur: '', copro: '', occupe: '', acces: '', visite: '', files: [],
    gamme: 'std', stade: '', demarrage: '',
    works: {}, qty: {}, worksTouched: false,
    finance: null, prix: '', prixAuto: true, strat: 'meuble', loyer: '', loyerAuto: true, charges: '', chargesAuto: true, apport: '', apportAuto: true, taux: 3.35, duree: 20,
    situation: { statut: '', revenus: '', credits: '', apportDispo: '', proprietaire: '' },
    contact: { prenom: '', nom: '', tel: '', email: '', consent: false, password: '' },
    step: 'kind', maxIdx: 0, ref: '', leadSubmitted: false, leadSent: false, rappel: false, savedAt: '',
    stepsAt: {}, startedAt: '', completedAt: '',
  };
  let S = load() || newState();
  let viewer = false;

  function newState() { const s = clone(DEFAULT); s.pid = rid(); s.token = rid(); return s; }
  function load() { try { const r = localStorage.getItem(STORE); if (!r) return null; const s = Object.assign(clone(DEFAULT), JSON.parse(r)); if (!s.pid) { s.pid = rid(); s.token = rid(); } return s; } catch (e) { return null; } }
  function save() { if (viewer) return; try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} updateIndex(); }
  function getPath(p) { return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S); }
  function setPath(p, v) { const ks = p.split('.'); let o = S; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }

  /* ---------- historique des projets (localStorage) ---------- */
  function loadIndex() { try { return JSON.parse(localStorage.getItem(INDEX) || '[]'); } catch (e) { return []; } }
  function updateIndex() {
    if (!S.kind || !S.pid) return;
    const idx = loadIndex();
    const R = ready() ? C.compute(S) : null;
    const label = KIND[S.kind] + (S.ville ? ' · ' + S.ville : (S.adresse ? ' · ' + S.adresse : '')) + (S.surface ? ' · ' + fmt(S.surface) + ' m²' : '');
    const e = { pid: S.pid, token: S.token, at: new Date().toISOString(), label, ttc: R ? Math.round(R.ttc) : null, done: S.maxIdx >= 6 };
    const i = idx.findIndex(x => x.pid === S.pid);
    if (i >= 0) idx[i] = Object.assign(idx[i], e); else { e.created = e.at; idx.unshift(e); }
    try { localStorage.setItem(INDEX, JSON.stringify(idx.slice(0, 20))); } catch (err) {}
  }

  /* ---------- étapes ---------- */
  const ICONS = {
    kind: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    bien: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    finition: '<rect x="4" y="4" width="12" height="6" rx="1"/><path d="M16 7h3v5h-7v3"/><rect x="10" y="15" width="4" height="6"/>',
    travaux: '<path d="M14 4l6 6-2 2-6-6z"/><path d="M12 6 4 14v3h3l8-8"/>',
    financeQ: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18"/>',
    contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    resultat: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h6M9 16h6M9 8h3"/>',
  };
  const PROGRESS = [['Bien', 'kind'], ['Descriptif', 'bien'], ['Finition', 'finition'], ['Travaux', 'travaux'], ['Financement', 'financeQ'], ['Coordonnées', 'contact'], ['Estimation', 'resultat']];
  const LABEL = { kind: 0, bien: 1, finition: 2, travaux: 3, financeQ: 4, acquisition: 4, situation: 4, contact: 5, resultat: 6 };
  const NEXT_LABEL = { kind: 'Continuer', bien: 'Continuer', finition: 'Voir mes travaux', travaux: 'Valider mes travaux', financeQ: 'Continuer', acquisition: 'Continuer', situation: 'Continuer', contact: 'Voir mon estimation' };
  const KIND = { appart: 'Appartement', maison: 'Maison', immeuble: 'Immeuble' };
  const STADE = { etude: 'en étude', compromis: 'sous compromis', acte: 'acte signé' };
  const STRAT = { nue: 'location nue', meuble: 'meublé (LMNP)', coloc: 'colocation meublée', revente: 'revente après travaux' };
  const TRI = { oui: 'oui', non: 'non', '': 'non renseigné', plan: 'à planifier' };

  function stepList() {
    const s = ['kind', 'bien', 'finition', 'travaux', 'financeQ'];
    if (S.finance === 'oui') s.push('acquisition', 'situation');
    else if (S.finance === 'renta') s.push('acquisition');
    s.push('contact', 'resultat');
    return s;
  }

  function showStep() {
    const list = stepList();
    if (!list.includes(S.step)) S.step = 'kind';
    const cur = LABEL[S.step];
    if (!viewer) S.maxIdx = Math.max(S.maxIdx || 0, cur);
    document.querySelectorAll('.step').forEach(el => el.classList.toggle('active', el.dataset.step === S.step));
    document.querySelectorAll('[data-only]').forEach(el => el.classList.toggle('hidden', !el.dataset.only.split(' ').includes(S.kind || '')));
    $('surface-label').textContent = S.kind === 'immeuble' ? 'Surface habitable totale' : 'Surface habitable';

    const idx = list.indexOf(S.step);
    $('progress').innerHTML = PROGRESS.map((p, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}"><button type="button" data-go="${p[1]}" ${i <= S.maxIdx ? '' : 'disabled'} aria-current="${i === cur ? 'step' : 'false'}" aria-label="${p[0]}" title="${p[0]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[p[1]]}</svg><span>${p[0]}</span></button></li>`).join('');
    $('pct').textContent = S.step === 'resultat' ? 'Estimation prête' : 'Étape ' + (idx + 1) + ' sur ' + list.length + ' · ' + PROGRESS[cur][0];
    document.body.dataset.step = S.step;

    $('stepnav').classList.toggle('hidden', S.step === 'resultat' || viewer);
    $('progress-wrap').classList.toggle('hidden', viewer);
    $('btn-prev').classList.toggle('hidden', idx === 0);
    $('btn-next').textContent = NEXT_LABEL[S.step] || 'Continuer';
    $('err').classList.add('hidden');
    $('panel').classList.toggle('hidden', S.step === 'resultat' || viewer);

    if (S.step === 'acquisition') proposeAcquisition();
    if (S.step === 'travaux') renderLots();
    if (S.step === 'resultat') renderReport();
    renderPanel();
    track();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const first = document.querySelector('.step.active input:not([type="checkbox"]), .step.active select');
    if (first && window.matchMedia('(min-width: 981px)').matches) first.focus({ preventScroll: true });
  }

  function validate() {
    const c = S.contact;
    switch (S.step) {
      case 'kind': return S.kind ? null : 'Appartement, maison ou immeuble ? On ne chiffre pas encore les châteaux, mais tout le reste, oui.';
      case 'bien':
        if (!S.adresse.trim()) return 'Sans adresse, on ne sait pas si vos artisans viennent de Lyon ou de Lozère. Même approximative, elle fixe la zone de prix.';
        if (!(+S.surface > 0)) return 'Sans surface, il va être difficile de vous faire un devis ! Même à 5 m² près, ça nous aide.';
        if (S.kind === 'immeuble' && !(+S.nbapts >= 2)) return 'Un immeuble avec un seul appartement, on appelle ça une maison. Indiquez au moins deux logements.';
        if (S.files.some(f => f.pending)) return 'Un fichier est encore en route vers nos serveurs. Deux secondes, il arrive.';
        return null;
      case 'finition': return null;   // rien de bloquant : standard locatif et « en étude » par défaut, démarrage libre
      case 'travaux': return Object.keys(S.works).some(k => S.works[k]) ? null : 'Aucun ouvrage coché : le chantier le moins cher du monde, mais pas très utile. Cochez-en au moins un.';
      case 'financeQ': return S.finance ? null : 'Une des trois options, s\'il vous plaît. Promis, aucune n\'engage votre banquier.';
      case 'acquisition':
        if (!(+S.prix > 0)) return 'Calculer une rentabilité sans prix d\'achat, c\'est diviser par zéro. Un ordre de grandeur suffit.';
        if (S.strat !== 'revente' && !(+S.loyer > 0)) return 'Un loyer visé, même optimiste : c\'est lui qui fait décoller la renta.';
        return null;
      case 'contact':
        if (!c.prenom.trim() || !c.nom.trim()) return 'Un prénom et un nom : « Cher inconnu » fait mauvais effet en tête d\'une estimation.';
        if (!(C.auth && C.auth.user) && C.auth && C.auth.sb && !$('pw-field').classList.contains('hidden') && String(c.password || '').length < 8) return 'Mot de passe trop court : huit caractères minimum. « 1234 » est populaire, mais pas chez nous.';
        if (String(c.tel).replace(/\D/g, '').length < 9) return 'Ce numéro de téléphone a l\'air incomplet. On préfère vous appeler, vous, plutôt qu\'un inconnu.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return 'Cette adresse e-mail ne ressemble pas à une adresse e-mail. Le PDF n\'arrivera jamais.';
        if (!c.consent) return 'La petite case, juste en dessous : sans elle, on n\'a pas le droit de vous rappeler, même pour une bonne nouvelle.';
        return null;
    }
    return null;
  }

  async function goNext() {
    const err = validate();
    if (err) { $('err').textContent = err; $('err').classList.remove('hidden'); return; }
    if (S.step === 'bien' && !S.worksTouched) S.works = C.preselect(S);
    if (S.step === 'finition') { if (!S.gamme) S.gamme = 'std'; if (!S.stade) S.stade = 'etude'; fillForm(); }
    if (S.step === 'acquisition') { const added = C.lateRules(S, 'strat'); if (added.length) S.autoAdded = (S.autoAdded || []).concat(added.filter(id => !(S.autoAdded || []).includes(id))); }
    if (S.step === 'contact') {
      if (!(await ensureAccount())) return;
      ensureRef(); if (!S.leadSubmitted) { S.leadSubmitted = true; submitLead(); } saveProject();
    }
    const list = stepList();
    S.step = list[Math.min(list.length - 1, list.indexOf(S.step) + 1)];
    save(); showStep();
  }
  function goPrev() {
    const list = stepList();
    S.step = list[Math.max(0, list.indexOf(S.step) - 1)];
    save(); showStep();
  }
  function goTo(step) {
    if (LABEL[step] > (S.maxIdx || 0)) return;
    if (step === 'resultat' && S.maxIdx < 6) return;
    S.step = step; save(); showStep();
  }

  /* ---------- formulaire ---------- */
  function fillForm() {
    document.querySelectorAll('[data-k]').forEach(el => {
      const v = getPath(el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    document.querySelectorAll('.choice').forEach(b => b.classList.toggle('selected', getPath(b.dataset.choice) === b.dataset.value));
    document.querySelectorAll('.seg').forEach(seg => { const v = String(S[seg.dataset.seg] == null ? '' : S[seg.dataset.seg]); seg.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b.dataset.v === v)); });
    const z = $('zone');
    z.innerHTML = Object.keys(C.REGION).map(k => `<option value="${k}">${esc(C.REGION[k][1].charAt(0).toUpperCase() + C.REGION[k][1].slice(1))}</option>`).join('');
    z.value = S.zone;
    $('zone-hint').textContent = S.zoneAuto && S.ville ? 'déduite de ' + S.ville : (S.zoneAuto ? 'déduite de l\'adresse' : 'choisie manuellement');
    renderApts(); renderFiles();
  }

  function syncApts() {
    const n = Math.max(2, Math.min(40, +S.nbapts || 2));
    while (S.apts.length < n) S.apts.push({ type: 't2' });
    S.apts.length = n;
  }
  function renderApts() {
    if (S.kind !== 'immeuble') return;
    syncApts();
    $('apts').innerHTML = S.apts.map((a, i) => `<div class="field"><label for="apt-${i}">Appartement ${i + 1}</label><select id="apt-${i}" data-apt="${i}">${['t1', 't2', 't3', 't4', 't5'].map(t => `<option value="${t}"${a.type === t ? ' selected' : ''}>${t === 't1' ? 'Studio / T1' : t === 't5' ? 'T5 et plus' : t.toUpperCase()}</option>`).join('')}</select></div>`).join('');
  }
  function defaultEau() {
    if (S.kind === 'immeuble') { syncApts(); return S.apts.reduce((n, a) => n + (C.EAU_DEFAULT[a.type] || 1), 0); }
    return C.EAU_DEFAULT[S.type] || 1;
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.apt != null) {
      S.apts[+el.dataset.apt].type = el.value; S.eau = defaultEau(); $('eau').value = S.eau; S.qty = {};
    } else if (el.dataset.k) {
      const k = el.dataset.k;
      const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value);
      setPath(k, v);
      if (k === 'adresse') { S.ville = ''; S.cp = ''; }
      if (k === 'zone') { S.zoneAuto = false; $('zone-hint').textContent = 'choisie manuellement'; }
      if (k === 'type') { S.eau = defaultEau(); $('eau').value = S.eau; S.qty = {}; }
      if (k === 'nbapts') { renderApts(); S.eau = defaultEau(); $('eau').value = S.eau; S.qty = {}; }
      if (k === 'surface' || k === 'eau') S.qty = {};
      if ((k === 'etat' || k === 'dpe') && !S.worksTouched) S.works = C.preselect(S);
      if (k === 'prix') { S.prixAuto = el.value === ''; }
      if (k === 'loyer') { S.loyerAuto = el.value === ''; }
      if (k === 'charges') { S.chargesAuto = el.value === ''; }
      if (k === 'apport') { S.apportAuto = el.value === ''; }
      if (['strat', 'surface', 'zone', 'etat', 'prix', 'loyer'].includes(k)) proposeAcquisition();
    } else if (el.dataset.w) {
      S.works[el.dataset.w] = el.checked ? 1 : 0; S.worksTouched = true;
    } else if (el.dataset.q) {
      if (el.value === '') delete S.qty[el.dataset.q]; else S.qty[el.dataset.q] = +el.value;
      if (!S.works[el.dataset.q] && +el.value > 0) { S.works[el.dataset.q] = 1; $('w-' + el.dataset.q).checked = true; }
      S.worksTouched = true;
    } else return;
    save(); renderPanel();
    if (S.step === 'travaux') updateLots();
  }

  function onClick(e) {
    const go = e.target.closest('[data-go]');
    if (go && !go.disabled) { goTo(go.dataset.go); return; }
    const segBtn = e.target.closest('.seg button');
    if (segBtn) {
      const seg = segBtn.closest('.seg'), k = seg.dataset.seg;
      S[k] = segBtn.dataset.v;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('selected', b === segBtn));
      save(); renderPanel(); return;
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) { S.files.splice(+rm.dataset.rm, 1); save(); renderFiles(); renderPanel(); return; }
    const b = e.target.closest('.choice'); if (!b) return;
    const k = b.dataset.choice, v = b.dataset.value;
    setPath(k, v);
    document.querySelectorAll(`.choice[data-choice="${k}"]`).forEach(x => x.classList.toggle('selected', x.dataset.value === v));
    if (k === 'kind') {
      if (v === 'immeuble') { renderApts(); if (!S.niveaux) S.niveaux = 3; }
      S.eau = defaultEau(); S.qty = {};
      if (!S.worksTouched) S.works = C.preselect(S);
      fillForm();
    }
    save(); renderPanel();
    if (k === 'kind' || k === 'finance') setTimeout(goNext, 220);
  }

  /* ---------- financement : valeurs proposées d'après ce qu'on sait déjà ---------- */
  // Prix d'achat d'après la zone, la surface et l'état ; loyer légèrement optimiste ; charges et taxe foncière légèrement minorées ;
  // apport à 10 % du prix. Chaque valeur cesse d'être proposée dès que la personne la saisit elle-même.
  function proposeAcquisition() {
    const surf = +S.surface || 0;
    if (S.prixAuto) { S.prix = surf ? Math.round((C.PRIX_M2[S.zone] || 2100) * surf * (C.PRIX_ETAT[S.etat] ?? 0.9) / 1000) * 1000 : ''; }
    if (S.loyerAuto) { S.loyer = surf && S.strat !== 'revente' ? Math.round((C.LOYER_M2_ZONE[S.zone] || 11) * (C.LOYER_STRAT[S.strat] || 1) * surf * 1.05 / 10) * 10 : ''; }
    if (S.chargesAuto) { S.charges = +S.loyer ? Math.round(+S.loyer * 12 * 0.08 / 50) * 50 : (+S.prix ? Math.round(+S.prix * 0.005 / 50) * 50 : ''); }
    if (S.apportAuto) { S.apport = +S.prix ? Math.round(+S.prix * 0.1 / 1000) * 1000 : ''; }
    ['prix', 'loyer', 'charges', 'apport'].forEach(k => { const el = $(k); if (el && document.activeElement !== el) el.value = S[k] === '' ? '' : S[k]; });
  }

  /* ---------- adresse (Base Adresse Nationale, gratuite, sans clé) ---------- */
  let acTimer = null, acAbort = null;
  function hideSuggest() { $('suggest').classList.add('hidden'); $('suggest').innerHTML = ''; }
  async function fetchAddr(q) {
    if (q.trim().length < 4) { hideSuggest(); return; }
    try {
      if (acAbort) acAbort.abort();
      acAbort = new AbortController();
      const r = await fetch('https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(q) + '&limit=5&autocomplete=1', { signal: acAbort.signal });
      const j = await r.json();
      const f = (j.features || []).filter(x => x.properties && x.properties.label);
      if (!f.length) { hideSuggest(); return; }
      $('suggest').innerHTML = f.map(x => `<li role="option" data-label="${esc(x.properties.label)}" data-cp="${esc(x.properties.postcode || '')}" data-city="${esc(x.properties.city || '')}">${esc(x.properties.label)}</li>`).join('');
      $('suggest').classList.remove('hidden');
    } catch (e) { if (e.name !== 'AbortError') hideSuggest(); }
  }
  function pickAddr(li) {
    S.adresse = li.dataset.label; S.cp = li.dataset.cp; S.ville = li.dataset.city;
    if (S.zoneAuto) { S.zone = C.zoneFromAddress(S.cp, S.ville); $('zone').value = S.zone; }
    $('adresse').value = S.adresse;
    $('zone-hint').textContent = S.zoneAuto ? 'déduite de ' + S.ville : 'choisie manuellement';
    hideSuggest(); save(); renderPanel();
  }

  /* ---------- plans et photos ---------- */
  const MAX_FILES = 12, MAX_SIZE = 15 * 1024 * 1024;
  const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
  function renderFiles() {
    $('files').innerHTML = S.files.map((f, i) => `<li><span class="fname">${esc(f.name)}</span><span class="fmeta">${f.pending ? 'envoi…' : f.error ? 'échec de l\'envoi' : f.local ? 'sur cet appareil' : (f.size / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo'}</span><button type="button" data-rm="${i}" aria-label="Retirer ${esc(f.name)}">×</button></li>`).join('');
  }
  async function addFiles(list) {
    const files = Array.from(list || []);
    for (const file of files) {
      if (S.files.length >= MAX_FILES) { flashErr('Douze fichiers, c\'est déjà un beau dossier. On s\'arrête là.'); break; }
      if (!OK_TYPES.includes(file.type) && !/\.(jpe?g|png|webp|heic|pdf)$/i.test(file.name)) { flashErr(file.name + ' : ce format nous résiste. JPG, PNG, WEBP, HEIC ou PDF, et tout ira bien.'); continue; }
      if (file.size > MAX_SIZE) { flashErr('Fichier trop lourd : ' + file.name + ' dépasse 15 Mo. Même nos chiffreurs ne le soulèveraient pas.'); continue; }
      const entry = { name: file.name, size: file.size, type: file.type, pending: hasDb(), local: !hasDb() };
      S.files.push(entry); renderFiles(); save(); renderPanel();
      if (hasDb()) {
        try {
          const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
          const path = S.pid + '/' + Date.now() + '-' + safe;
          const r = await fetch(BASE + '/storage/v1/object/plans/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          entry.path = path;
        } catch (e) { entry.error = true; console.warn('Cotalia : envoi du fichier impossible', e); }
        delete entry.pending; renderFiles(); save();
      }
    }
  }
  function flashErr(msg) { $('err').textContent = msg; $('err').classList.remove('hidden'); }

  /* ---------- tableau des travaux ---------- */
  let lotsBuilt = false;
  function lotHtml(l, items, withSum) {
    return `
        <div class="lot">
          <div class="lot-head"><h3>${esc(l.lot)}</h3>${withSum ? `<span class="sum">sous-total <b class="num" data-lotsum="${esc(l.lot)}"></b></span>` : ''}</div>
          ${items.map(it => `
            <div class="item" data-item="${it.id}">
              <input type="checkbox" id="w-${it.id}" data-w="${it.id}">
              <label class="lbl" for="w-${it.id}">${esc(it.label)}${it.tva === 5.5 ? '<span class="tva55">TVA 5,5 %</span>' : ''}<small>${it.sub ? esc(it.sub) + ' · ' : ''}<span class="pu num" data-pu="${it.id}"></span></small></label>
              <input type="number" min="0" step="1" data-q="${it.id}" inputmode="numeric" aria-label="Quantité ${esc(it.label)}">
              <span class="u">${it.unit}</span>
              <span class="tot num" data-tot="${it.id}"></span>
            </div>`).join('')}
        </div>`;
  }
  function renderLots() {
    if (!lotsBuilt) {
      const rec = C.preselect(S);
      const main = [], more = [];
      C.CATALOG.forEach(l => {
        const items = l.items.filter(it => !it.inactive);
        const a = items.filter(it => rec[it.id] || S.works[it.id]), b = items.filter(it => !(rec[it.id] || S.works[it.id]));
        if (a.length) main.push(lotHtml(l, a, true));
        if (b.length) more.push(lotHtml(l, b, false));
      });
      $('lots').innerHTML = main.join('') || '<p class="hint" style="padding:14px 22px">Aucun ouvrage retenu d\'office : ouvrez la boîte ci-dessous.</p>';
      $('lots-more').innerHTML = more.join('');
      $('more').classList.toggle('hidden', !more.length);
      lotsBuilt = true;
    }
    document.querySelectorAll('[data-w]').forEach(el => { el.checked = !!S.works[el.dataset.w]; });
    updateLots();
  }
  function updateLots() {
    if (!lotsBuilt) return;
    const R = C.compute(S);
    R.lines.forEach(({ it, on, q, unitPrice, amount }) => {
      const row = document.querySelector(`[data-item="${it.id}"]`); if (!row) return;
      row.classList.toggle('off', !on);
      const qi = row.querySelector('[data-q]');
      if (document.activeElement !== qi) qi.value = q;
      row.querySelector('[data-pu]').textContent = eur(unitPrice) + (it.unit === 'forfait' ? '' : '/' + it.unit);
      row.querySelector('[data-tot]').textContent = on ? eur(amount) : '—';
    });
    document.querySelectorAll('[data-lotsum]').forEach(el => { el.textContent = eur(R.lots[el.dataset.lotsum] || 0); });
  }

  /* ---------- encadré d'estimation ---------- */
  function ready() { return S.kind && +S.surface > 0 && Object.keys(S.works).some(k => S.works[k]); }
  function renderPanel() {
    const ok = ready() && (LABEL[S.step] || 0) >= LABEL.finition;   // l'estimation n'apparaît qu'à partir de la finition
    $('p-empty').classList.toggle('hidden', ok);
    $('p-head').classList.toggle('hidden', !ok);
    $('panel-toggle').classList.toggle('hidden', !ok);
    $('p-body').classList.toggle('hidden', !ok);
    if (!ok) return;
    const R = C.compute(S);
    $('p-central').innerHTML = eur(R.ttc) + '<small>TTC</small>';
    $('p-low').textContent = eur(R.low); $('p-high').textContent = eur(R.high);
    $('p-mini').innerHTML = '<span class="k">Travaux estimés</span><b class="num">' + eur(R.ttc) + '</b><small>TTC</small>';
    const span = R.high * 1.08 || 1, px = v => (v / span * 100).toFixed(1) + '%';
    $('p-band').style.left = px(R.low); $('p-band').style.width = px(R.high - R.low);
    $('p-pin-low').style.left = px(R.low); $('p-pin-mid').style.left = px(R.ttc); $('p-pin-high').style.left = px(R.high);
    $('p-m2').innerHTML = fmt(R.ttc / R.ctx.surface) + '<small> €/m²</small>';
    $('p-duree').innerHTML = R.weeks + '<small> sem.</small>';
    const arr = Object.entries(R.lots).sort((a, b) => b[1] - a[1]); const max = arr.length ? arr[0][1] : 1;
    $('p-lots').innerHTML = arr.map(([n, v]) => `<div class="row"><span class="n" title="${esc(n)}">${esc(n)}</span><span class="v num">${eur(v)}</span></div>`).join('');
    const fin = (S.finance === 'oui' || S.finance === 'renta') && R.total > 0;
    $('p-tiles').classList.toggle('hidden', !fin);
    if (fin) $('p-tiles').innerHTML = tilesHtml(R, true);
  }
  function tvaLabel(R) { return 'TVA ' + (R.ancien ? (R.share55 > 0 ? '10 % et 5,5 % (moy. ' + pct(R.tvaRate) + ')' : '10 %') : '20 % (logement de moins de 2 ans)'); }
  function tilesHtml(R, compact) {
    const t = [];
    const fin = (S.finance === 'oui' || S.finance === 'renta') && R.total > 0;
    if (fin) t.push(['Coût total du projet', eur(R.total), 'bien + notaire + travaux + ameublement']);
    if (!compact) { t.push(['Travaux estimés', eur(R.ttc), 'TTC, estimation centrale']); t.push(['Travaux au m²', fmt(R.ttc / R.ctx.surface) + ' €', 'TTC']); t.push(['Durée probable', R.weeks + ' sem.', 'chantier']); }
    if (fin && S.strat !== 'revente') {
      t.push(['Rendement brut', pct(R.brut), 'loyer annuel / coût total']);
      if (!compact) t.push(['Rendement net', pct(R.net), 'après charges et taxe foncière']);
      t.push(['Mensualité', eur(R.mens), fmt(S.duree) + ' ans à ' + fmt(S.taux, 2) + ' %']);
      t.push(['Cash-flow mensuel', (R.cf >= 0 ? '+' : '') + eur(R.cf), R.cf >= 0 ? 'après mensualité et charges' : 'effort d\'épargne', R.cf >= 0 ? 'pos' : 'neg']);
      if (!compact) t.push(['Taux d\'effort', pct(R.effort, 0), 'mensualité / loyer']);
      if (!compact && R.endettement != null) t.push(['Endettement après projet', pct(R.endettement, 0), 'loyers retenus à 70 %', R.endettement > 0.35 ? 'neg' : '']);
    } else if (fin) {
      t.push(['Mensualité', eur(R.mens), 'pendant les travaux']);
      t.push(['Revente à l\'équilibre', eur(R.total * 1.08), 'coût total + 8 % de frais de sortie']);
    }
    return t.map(x => `<div class="tile${x[3] ? ' ' + x[3] : ''}"><div class="eyebrow">${x[0]}</div><div class="v num">${x[1]}</div><div class="d">${x[2]}</div></div>`).join('');
  }

  /* ---------- rapport final ---------- */
  function ensureRef() {
    if (S.ref) return;
    const d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0');
    S.ref = 'COT-' + y + m + j + '-' + S.pid.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  }

  function renderReport() {
    const R = C.compute(S), A = C.alerts(S, R), c = S.contact;
    if (S.autoAdded && S.autoAdded.length) { const names = S.autoAdded.filter(id => S.works[id] && C.ITEMS[id]).map(id => C.ITEMS[id].label); if (names.length) A.push(['info', 'Ajouts liés à votre stratégie', 'Nous avons ajouté : ' + names.join(', ') + '. Retirez-les via « Modifier mes réponses » si vous ne les souhaitez pas.']); }
    const date = new Date(S.savedAt || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const typo = S.kind === 'immeuble' ? S.apts.length + ' appartements (' + S.apts.map(a => a.type.toUpperCase()).join(', ') + ')' : S.type.toUpperCase().replace('T1', 'Studio / T1');
    const etatSel = $('etat').querySelector(`option[value="${S.etat}"]`);
    const bien = [
      ['Type de bien', KIND[S.kind]], ['Adresse', S.adresse], ['Zone de prix', C.REGION[S.zone][1]], ['Surface habitable', fmt(S.surface) + ' m²'], ['Typologie', typo],
      ['Pièces d\'eau', fmt(R.ctx.eau)],
      S.kind === 'appart' ? ['Étage', S.etage === '' ? 'non renseigné' : (S.etage > 0 ? fmt(S.etage) + 'ᵉ' + (S.ascenseur === 'oui' ? ', avec ascenseur' : S.ascenseur === 'non' ? ', sans ascenseur' : '') : 'rez-de-chaussée')] : null,
      ['Année de construction', S.annee || 'inconnue'], ['DPE', S.dpe || 'inconnu'], ['État général', etatSel ? etatSel.textContent : 'non renseigné'],
      ['Occupé pendant les travaux', TRI[S.occupe]], ['Accès difficile', TRI[S.acces]], ['Visite technique', S.visite === 'oui' ? 'déjà réalisée' : S.visite === 'plan' ? 'à planifier' : 'pas encore'],
      ['Plans et photos', S.files.length ? S.files.length + ' fichier' + (S.files.length > 1 ? 's' : '') : 'aucun'],
      ['Finition', C.GAMME[S.gamme][1]], ['Projet', (STADE[S.stade] || 'en étude') + (S.demarrage === 'later' ? ', travaux non planifiés pour l\'instant' : S.demarrage ? ', démarrage souhaité sous ' + S.demarrage + ' mois' : ', démarrage non précisé')],
    ].filter(Boolean);
    const devisRows = C.CATALOG.map(l => {
      const rows = R.lines.filter(x => x.on && x.it.lotName === l.lot && x.amount > 0);
      if (!rows.length) return '';
      return `<tr class="lot"><td colspan="4">${esc(l.lot)}</td><td class="r num">${eur(R.lots[l.lot])}</td></tr>` + rows.map(x => `<tr><td>${esc(x.it.label)}${x.it.sub ? `<small>${esc(x.it.sub)}</small>` : ''}</td><td class="r num">${fmt(x.q)}</td><td>${x.it.unit}</td><td class="r num">${eur(x.unitPrice)}</td><td class="r num">${eur(x.amount)}</td></tr>`).join('');
    }).join('');
    const fin = (S.finance === 'oui' || S.finance === 'renta') && R.total > 0;
    const bank = fin ? [
      ['Prix d\'acquisition', eur(R.prix)], ['Frais de notaire (' + pct(C.NOTAIRE) + ', ancien)', eur(R.notaire)], ['Travaux estimés, centrale TTC', eur(R.ttc)],
      ['Fourchette travaux', eur(R.low) + ' à ' + eur(R.high)], ['Ameublement locatif', eur(R.meubles)], ['Coût total du projet', eur(R.total), 1],
      ['Apport', eur(R.apport)], ['Montant à financer', eur(R.emprunt)], ['Mensualité estimée', eur(R.mens) + ' / mois'],
      S.strat !== 'revente' ? ['Loyer prévisionnel hors charges', eur(R.loyer) + ' / mois'] : null,
      ['Stratégie', STRAT[S.strat]], ['Durée prévisionnelle des travaux', R.weeks + ' semaines'],
    ].filter(Boolean) : [];
    const hyp = [
      `${KIND[S.kind]} de ${fmt(S.surface)} m², ${typo}, ${fmt(R.ctx.eau)} pièce${R.ctx.eau > 1 ? 's' : ''} d'eau.`,
      `Prix de référence ${C.REGION[S.zone][1]}, finition ${C.GAMME[S.gamme][1]}${R.cxParts.length ? ', majorations : ' + R.cxParts.join(', ') : ''}.`,
      S.occupe === 'oui' ? 'Logement occupé : interventions par phases, protection des lieux, majoration incluse.' : 'Logement supposé vide pendant toute la durée du chantier.',
      R.ancien ? 'Logement achevé depuis plus de deux ans : TVA à 10 %, à 5,5 % pour les travaux d\'amélioration énergétique sur attestation.' : 'Logement de moins de deux ans : TVA à 20 % sur l\'ensemble.',
      'Réseaux existants supposés réutilisables sauf ouvrages retenus ; structure et planchers supposés sains.',
      S.visite === 'oui' ? 'Visite technique réalisée : métrés et réseaux vérifiés sur place.' : 'Aucune visite technique : quantités déduites de la surface et de la typologie.',
      `Fourchette de ±${pct(R.spread, 0)} liée au score de confiance de ${R.score} / 100.`,
    ];
    const who = viewer ? `Estimation partagée par ${esc(c.prenom)} ${esc(c.nom)}` : `Préparée pour ${esc(c.prenom)} ${esc(c.nom)}`;
    $('report').innerHTML = `
      <div class="print-brand"><svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true"><rect x="4" y="8" width="92" height="13" fill="#7FA8E8" opacity="0.28"/><rect x="79" y="21" width="13" height="72" fill="#7FA8E8" opacity="0.28"/><rect x="56" y="8" width="36" height="4" fill="#E4B33B"/><rect x="88" y="58" width="4" height="35" fill="#E4B33B"/><path d="M65,32.7 A30,30 0 1 0 65,71.3" fill="none" stroke="#2457A6" stroke-width="18"/></svg><b style="font-family:'Barlow Condensed',sans-serif;font-size:22px;letter-spacing:.12em">COTALIA</b><span style="color:#666;font-size:12px">Estimation indicative · n'est pas un devis</span></div>
      ${viewer ? `<div class="ok-note no-print">Vous consultez une estimation partagée. <a href="estimation.html?new=1">Faire ma propre estimation</a></div>` : `<div class="ok-note no-print">Merci ${esc(c.prenom)}, votre estimation est prête. Téléchargez-la en PDF ci-dessous ; une copie vous sera envoyée à ${esc(c.email)}.${S.accountPending ? ' Votre compte est créé : confirmez votre e-mail pour retrouver cette estimation sur tous vos appareils.' : ''}</div>`}
      <div class="rhead">
        <div><h2>Estimation travaux</h2><div class="who">${who} · ${date} · réf. <span class="num">${esc(S.ref)}</span></div></div>
        <div class="actions"><button type="button" class="btn primary" id="btn-pdf">Télécharger le PDF</button><button type="button" class="btn" id="btn-share">Partager mon projet</button>${viewer ? '' : `<button type="button" class="btn" id="btn-edit">Modifier mes réponses</button><button type="button" class="btn" id="btn-rappel">${S.rappel ? 'Rappel demandé ✓' : 'Être rappelé pour une visite technique'}</button>`}<a class="btn" href="estimation.html?new=1">Nouvelle estimation</a></div>
      </div>
      <div class="two">
        <div class="box"><h3>Le bien</h3><table class="kv">${bien.map(b => `<tr><td>${esc(b[0])}</td><td>${esc(b[1])}</td></tr>`).join('')}</table></div>
        <div class="box"><h3>Résumé du projet</h3><div class="tiles inbox">${tilesHtml(R, false)}</div></div>
      </div>
      <div class="box">
        <h3>Estimation des travaux</h3>
        <div class="two">
          <div>
            <div class="eyebrow">Estimation centrale · travaux TTC</div>
            <div class="big num">${eur(R.ttc)}<small>TTC</small></div>
            <div class="range"><div class="track"><div class="band" style="left:${(R.low / (R.high * 1.08) * 100).toFixed(1)}%;width:${((R.high - R.low) / (R.high * 1.08) * 100).toFixed(1)}%"></div><div class="pin mark" style="left:${(R.low / (R.high * 1.08) * 100).toFixed(1)}%"></div><div class="pin" style="left:${(R.ttc / (R.high * 1.08) * 100).toFixed(1)}%"></div><div class="pin mark" style="left:${(R.high / (R.high * 1.08) * 100).toFixed(1)}%"></div></div>
            <div class="range-lbl"><span>Basse <b class="num">${eur(R.low)}</b></span><span>Haute <b class="num">${eur(R.high)}</b></span></div></div>
          </div>
          <table class="kv">
            <tr><td>Coût au m²</td><td class="num">${fmt(R.ttc / R.ctx.surface)} €/m² TTC</td></tr>
            <tr><td>Durée probable des travaux</td><td class="num">${R.weeks} semaines</td></tr>
            <tr><td>Score de confiance</td><td class="num">${R.score} / 100</td></tr>
            <tr class="total"><td>Total HT</td><td class="num">${eur(R.ht)}</td></tr>
            <tr><td>${tvaLabel(R)}</td><td class="num">${eur(R.tva)}</td></tr>
            <tr class="total"><td>Total TTC</td><td class="num">${eur(R.ttc)}</td></tr>
          </table>
        </div>
      </div>
      <div class="box"><h3>Détail par lot</h3><div style="overflow-x:auto"><table class="devis"><thead><tr><th>Ouvrage</th><th class="r">Qté</th><th>Unité</th><th class="r">Prix unitaire HT</th><th class="r">Montant HT</th></tr></thead><tbody>${devisRows}</tbody></table></div><p style="font-size:12.5px;color:var(--ink-3);margin:10px 0 0">Montants HT hors provision pour aléas. Le total ci-dessus inclut frais généraux, pilotage, marge, aléas et TVA.</p></div>
      ${fin ? `<div class="box"><h3>${S.finance === 'oui' ? 'Synthèse pour la banque' : 'Synthèse du projet'}</h3><table class="kv">${bank.map(b => `<tr${b[2] ? ' class="total"' : ''}><td>${esc(b[0])}</td><td class="num">${esc(b[1])}</td></tr>`).join('')}</table><p style="font-size:12.5px;color:var(--ink-3);margin:10px 0 0">${S.finance === 'oui' ? 'Estimation indicative à distinguer du devis contractuel. Un courtier Cotalia reprend contact pour instruire le dossier.' : 'Estimation indicative à distinguer du devis contractuel. Vous pouvez la joindre à votre dossier de financement.'}</p></div>` : ''}
      <div class="two">
        <div class="box"><h3>Points de vigilance</h3><div class="alerts">${A.length ? A.map(a => `<div class="alert ${a[0]}"><i></i><div><b><span class="k">${{ crit: 'Bloquant', warn: 'À vérifier', info: 'Information', good: 'Avantage' }[a[0]]}</span>${esc(a[1])}</b>${esc(a[2])}</div></div>`).join('') : '<p style="color:var(--ink-3);margin:0">Aucune incohérence détectée.</p>'}</div></div>
        <div class="box"><h3>Hypothèses retenues</h3><ul class="plain">${hyp.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
          <h3 style="margin-top:16px">Non compris</h3><ul class="plain">
            <li>Diagnostics réglementaires avant travaux (amiante, plomb, termites) et études de structure.</li>
            <li>Honoraires d'architecte, de bureau d'études et autorisations d'urbanisme.</li>
            <li>Parties communes, raccordements aux réseaux et interventions des concessionnaires.</li>
            <li>Désamiantage, traitement de structures non visibles, humidité chronique.</li>
            <li>Mobilier hors cuisine, compté séparément en ameublement locatif.</li>
            <li>Dépassements au-delà de la provision pour aléas : tout écart est chiffré en avenant.</li>
          </ul></div>
      </div>
      <div><div class="eyebrow" style="margin-bottom:8px">Et ensuite</div><div class="steps">
        <div class="stepc now"><div class="display">Estimation en ligne</div>Fourchette, hypothèses, rentabilité. Sans engagement.</div>
        <div class="stepc"><div class="display">Visite technique</div>Un chiffreur contrôle métrés, réseaux et structure. Le score de confiance passe au maximum.</div>
        <div class="stepc"><div class="display">Devis contractuel</div>Prix et délais fermes, écarts avec l'estimation expliqués ligne à ligne, signature et acompte.</div>
        <div class="stepc"><div class="display">Chantier suivi</div>Planning, jalons, appels de fonds, réception.</div>
      </div></div>
      <p style="font-size:12.5px;color:var(--ink-3);margin:0;max-width:80ch">Prix de référence relevés en septembre 2026 sur des chantiers de rénovation locative. Les montants restent indicatifs tant qu'un devis signé ne les remplace pas. Document généré par Cotalia, réf. ${esc(S.ref)}.</p>`;
    $('btn-pdf').addEventListener('click', () => window.print());
    $('btn-share').addEventListener('click', share);
    if (!viewer) {
      $('btn-edit').addEventListener('click', () => { S.step = 'travaux'; save(); showStep(); });
      $('btn-rappel').addEventListener('click', () => { S.rappel = true; save(); submitLead('rappel'); $('btn-rappel').textContent = 'Rappel demandé ✓'; });
    }
  }

  /* ---------- partage ---------- */
  function shareData() {
    const d = clone(S);
    delete d.token; delete d.situation; delete d.leadSent; delete d.leadSubmitted; delete d.stepsAt; delete d.startedAt; delete d.completedAt; delete d.sharedFlag; delete d.reopenedFlag;
    d.contact = { prenom: S.contact.prenom, nom: S.contact.nom, tel: '', email: '', consent: false };
    d.files = S.files.filter(f => f.path).map(f => ({ name: f.name, path: f.path, size: f.size, type: f.type }));
    d.sharedAt = new Date().toISOString();
    return d;
  }
  async function saveProject() {
    if (viewer || !hasDb() || !S.kind) return false;
    try {
      const r = await fetch(BASE + '/rest/v1/rpc/save_project', { method: 'POST', headers: hdr(), body: JSON.stringify({ p_id: S.pid, p_token: S.token, p_data: shareData() }) });
      if (r.ok) { S.savedAt = new Date().toISOString(); save(); return true; }
      console.warn('Cotalia : enregistrement du projet refusé', r.status);
    } catch (e) { console.warn('Cotalia : enregistrement du projet impossible', e); }
    return false;
  }
  async function fetchProject(id) {
    const r = await fetch(BASE + '/rest/v1/rpc/get_project', { method: 'POST', headers: hdr(), body: JSON.stringify({ p_id: id }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  async function share() {
    const url = location.origin + location.pathname + '?p=' + encodeURIComponent(S.pid);
    const stored = viewer ? true : await saveProject();
    if (!viewer) { S.sharedFlag = true; save(); track(); }
    $('share-url').value = url;
    $('modal-title').textContent = 'Lien copié';
    $('modal-text').textContent = stored
      ? 'Le lien vers votre projet a été copié. Vous pouvez l\'envoyer à qui vous voulez : votre associé, votre banquier, votre courtier.'
      : 'Le lien a été copié, mais le projet n\'a pas pu être enregistré en ligne : il ne s\'ouvrira que sur cet appareil pour le moment.';
    try { await navigator.clipboard.writeText(url); } catch (e) { $('share-url').select(); $('modal-title').textContent = 'Votre lien de partage'; $('modal-text').textContent = 'Copiez ce lien pour l\'envoyer à qui vous voulez.'; }
    $('modal').classList.remove('hidden'); $('modal-close').focus();
  }
  function notice(html) { viewer = true; $('progress-wrap').classList.add('hidden'); $('stepnav').classList.add('hidden'); $('panel').classList.add('hidden'); document.querySelectorAll('.step').forEach(el => el.classList.toggle('active', el.dataset.step === 'resultat')); $('report').innerHTML = `<div class="box"><h3>Projet indisponible</h3><p>${html}</p><p><a class="btn primary" href="estimation.html?new=1">Faire ma propre estimation</a></p></div>`; }
  async function openProject(id) {
    const mine = loadIndex().find(x => x.pid === id);
    if (mine && S.pid === id && S.maxIdx >= 6) { S.step = 'resultat'; save(); showStep(); return; }
    if (!hasDb()) { notice('Ce projet n\'est pas disponible sur cet appareil.'); return; }
    try {
      const data = await fetchProject(id);
      if (!data) { notice('Ce lien ne correspond à aucun projet enregistré. Il a peut-être été créé sur un autre appareil sans être partagé.'); return; }
      if (mine) {
        S = Object.assign(newState(), data, { pid: id, token: mine.token, step: 'resultat', maxIdx: 6, reopenedFlag: true });
        const cur = load(); if (cur && cur.pid === id) { S.contact = cur.contact; S.situation = cur.situation; }
        save(); fillForm(); showStep();
      } else {
        viewer = true;
        S = Object.assign(newState(), data, { pid: id, token: '', step: 'resultat', maxIdx: 6 });
        fillForm(); showStep();
      }
    } catch (e) { console.warn(e); notice('Impossible de charger ce projet pour le moment. Réessayez dans quelques instants.'); }
  }

  /* ---------- compte utilisateur ---------- */
  async function ensureAccount() {
    const A = C.auth;
    if (A && A.sb && A.user) {
      // compte déjà ouvert : on complète le profil avec les coordonnées saisies si elles manquent
      const p = A.profile || {}, c = S.contact, upd = {};
      if (!p.prenom && c.prenom.trim()) upd.prenom = c.prenom.trim();
      if (!p.nom && c.nom.trim()) upd.nom = c.nom.trim();
      if (!p.tel && c.tel) upd.tel = c.tel;
      if (Object.keys(upd).length) { try { await A.sb.from('profiles').update(upd).eq('id', A.user.id); await A.refreshProfile(); } catch (e) {} }
      return true;
    }
    if (!A || !A.sb) return true;
    const c = S.contact, btn = $('btn-next');
    btn.disabled = true;
    try {
      const d = await A.signUp(c.email.trim(), c.password, { prenom: c.prenom.trim(), nom: c.nom.trim(), tel: c.tel });
      S.contact.password = '';
      S.accountPending = !d.session;
      return true;
    } catch (ex) {
      const msg = A.message(ex);
      if (/existe déjà/.test(msg)) { $('err').innerHTML = 'Un compte existe déjà avec cet e-mail. <button type="button" class="linkbtn" id="err-login">Connectez-vous</button> pour continuer.'; $('err').classList.remove('hidden'); $('err-login').addEventListener('click', () => A.open('login')); }
      else { $('err').textContent = msg; $('err').classList.remove('hidden'); }
      return false;
    } finally { btn.disabled = false; }
  }
  function applyProfile(A) {
    const p = A.profile, u = A.user;
    if (!u) { $('pw-field').classList.remove('hidden'); $('contact-logged').classList.add('hidden'); $('contact-login').classList.remove('hidden'); return; }
    $('contact-login').classList.add('hidden');
    if (!S.contact.email) S.contact.email = u.email || '';
    if (p) { if (!S.contact.prenom) S.contact.prenom = p.prenom || ''; if (!S.contact.nom) S.contact.nom = p.nom || ''; if (!S.contact.tel) S.contact.tel = p.tel || ''; }
    $('pw-field').classList.add('hidden'); $('contact-logged').classList.add('hidden');
    fillForm(); save();
  }

  /* ---------- suivi du parcours (analyse du tunnel) ---------- */
  const STEP_RANK = { kind: 0, bien: 1, finition: 2, travaux: 3, financeQ: 4, acquisition: 5, situation: 6, contact: 7, resultat: 8 };
  let trackTimer = null;
  function track() {
    if (viewer || !S.pid) return;
    const now = new Date().toISOString();
    if (!S.startedAt) S.startedAt = now;
    if (!S.stepsAt) S.stepsAt = {};
    if (!S.stepsAt[S.step]) S.stepsAt[S.step] = now;
    if (S.step === 'resultat' && !S.completedAt) S.completedAt = now;
    save();
    if (!hasDb()) return;
    clearTimeout(trackTimer);
    trackTimer = setTimeout(() => {
      const R = ready() ? C.compute(S) : null;
      const patch = { started_at: S.startedAt, completed_at: S.completedAt || null, last_step: S.step, max_step: Math.max.apply(null, Object.keys(S.stepsAt).map(k => STEP_RANK[k] || 0)), steps: S.stepsAt,
        kind: S.kind, surface: +S.surface || null, finance: S.finance, ttc: R ? Math.round(R.ttc) : null, ref: S.ref || null,
        device: window.matchMedia('(max-width: 980px)').matches ? 'mobile' : 'ordinateur', ua: navigator.userAgent, referrer: document.referrer || null,
        data: { etat: S.etat, gamme: S.gamme, stade: S.stade, demarrage: S.demarrage, zone: S.zone, works: Object.keys(S.works).filter(k => S.works[k]).length, files: S.files.length, worksTouched: S.worksTouched, shared: !!S.sharedFlag, reopened: !!S.reopenedFlag } };
      fetch(BASE + '/rest/v1/rpc/track_session', { method: 'POST', headers: hdr(), body: JSON.stringify({ p_id: S.pid, p_patch: patch }), keepalive: true }).catch(() => {});
    }, 400);
  }

  /* ---------- envoi de la demande ---------- */
  function leadPayload(kind) {
    const R = C.compute(S), c = S.contact;
    return {
      ref: S.ref, project_id: S.pid, kind: kind || 'estimation', prenom: c.prenom, nom: c.nom, email: c.email, tel: c.tel,
      type_bien: S.kind, adresse: S.adresse, ville: S.ville, cp: S.cp, surface: +S.surface || null, gamme: S.gamme, stade: S.stade, demarrage: S.demarrage,
      estimation_ttc: Math.round(R.ttc), estimation_basse: Math.round(R.low), estimation_haute: Math.round(R.high), score: R.score,
      finance: S.finance, prix: +S.prix || null, strat: S.strat, loyer: +S.loyer || null,
      situation: S.situation,
      payload: {
        works: S.works, qty: S.qty, files: S.files.filter(f => f.path).map(f => f.path),
        bien: { type: S.type, apts: S.apts, eau: S.eau, etage: S.etage, niveaux: S.niveaux, annee: S.annee, dpe: S.dpe, etat: S.etat, zone: S.zone, ascenseur: S.ascenseur, copro: S.copro, occupe: S.occupe, acces: S.acces, visite: S.visite },
        acquisition: { apport: S.apport, taux: S.taux, duree: S.duree, charges: S.charges },
        interne: { direct: Math.round(R.direct), fg: Math.round(R.fg), marge: Math.round(R.marge), alea: R.alea, aleaAmt: Math.round(R.aleaAmt), ht: Math.round(R.ht), tva: Math.round(R.tva), ttc: Math.round(R.ttc), weeks: R.weeks, cReg: R.cReg, cGamme: R.cGamme, cCx: R.cCx },
      },
      user_agent: navigator.userAgent, page: location.href, user_id: (C.auth && C.auth.user) ? C.auth.user.id : null,
    };
  }
  async function submitLead(kind) {
    const lead = leadPayload(kind);
    try { const all = JSON.parse(localStorage.getItem('cotalia-leads') || '[]'); all.push(Object.assign({ at: new Date().toISOString() }, lead)); localStorage.setItem('cotalia-leads', JSON.stringify(all.slice(-20))); } catch (e) {}
    if (!hasDb()) return;
    try {
      const r = await fetch(BASE + '/rest/v1/leads', { method: 'POST', headers: Object.assign(hdr(), { Prefer: 'return=minimal' }), body: JSON.stringify(lead) });
      if (r.ok) { S.leadSent = true; save(); } else console.warn('Cotalia : envoi refusé', r.status);
    } catch (e) { console.warn('Cotalia : envoi impossible', e); }
  }

  /* ---------- démarrage ---------- */
  const form = $('tunnel');
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('click', onClick);
  $('progress').addEventListener('click', onClick);
  $('btn-next').addEventListener('click', goNext);
  $('btn-prev').addEventListener('click', goPrev);
  $('panel-toggle').addEventListener('click', () => { const p = $('panel'); p.classList.toggle('open'); $('panel-toggle').textContent = p.classList.contains('open') ? 'Réduire' : 'Voir le détail'; });
  $('adresse').addEventListener('input', e => { clearTimeout(acTimer); acTimer = setTimeout(() => fetchAddr(e.target.value), 250); });
  $('suggest').addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pickAddr(li); } });
  $('adresse').addEventListener('blur', () => setTimeout(hideSuggest, 150));
  const drop = $('drop'), fileInput = $('file-input');
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  $('modal-close').addEventListener('click', () => $('modal').classList.add('hidden'));
  $('btn-login').addEventListener('click', () => { if (C.auth) C.auth.open('login'); });
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').classList.add('hidden'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('modal').classList.add('hidden');
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && S.step !== 'travaux' && S.step !== 'resultat' && !viewer) { e.preventDefault(); goNext(); }
  });

  const params = new URLSearchParams(location.search);
  if (params.has('new')) { S = newState(); save(); history.replaceState(null, '', location.pathname); }
  fillForm();
  if (params.get('p')) { openProject(params.get('p')); } else { showStep(); }
  if (C.loadPricing) C.loadPricing().then(ok => { if (!ok) return; lotsBuilt = false; if (!S.worksTouched && S.kind) S.works = C.preselect(S); renderPanel(); if (S.step === 'travaux') renderLots(); if (S.step === 'resultat' && !viewer) renderReport(); });
  if (C.auth) C.auth.onChange(A => { if (!viewer) applyProfile(A); });
})();
