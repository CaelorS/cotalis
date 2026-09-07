/* Cotalis - tunnel d'estimation : étapes, saisie, encadré d'estimation, rapport final, envoi de la demande. */
(function () {
  'use strict';
  const C = window.COTALIS;
  const CFG = window.COTALIS_CONFIG || {};
  const STORE = 'cotalis-tunnel-v1';

  const $ = id => document.getElementById(id);
  const eurF = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur = v => eurF.format(Math.round(v || 0));
  const pct = (v, d) => ((v || 0) * 100).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 1 : d }) + ' %';
  const fmt = (v, d) => (+v || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 0 : d });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  const DEFAULT = {
    kind: null, adresse: '', cp: '', ville: '', zone: 'moy', zoneAuto: true,
    type: 't3', nbapts: 3, apts: [], surface: '', eau: 1, etage: '', niveaux: '', annee: '', dpe: '', etat: '',
    ascenseur: false, copro: false, occupe: false, acces: false, plans: false, visite: false,
    gamme: 'std', stade: 'etude', demarrage: '3',
    works: {}, qty: {}, worksTouched: false,
    finance: null, prix: '', strat: 'meuble', loyer: '', loyerAuto: true, charges: '', apport: 15, taux: 3.35, duree: 25, vacance: 5,
    situation: { statut: '', revenus: '', credits: '', apportDispo: '', proprietaire: '' },
    contact: { prenom: '', nom: '', tel: '', email: '', consent: false },
    step: 'kind', ref: '', leadSent: false, rappel: false,
  };
  let S = load() || clone(DEFAULT);

  function load() { try { const r = localStorage.getItem(STORE); return r ? Object.assign(clone(DEFAULT), JSON.parse(r)) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }
  function getPath(p) { return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S); }
  function setPath(p, v) { const ks = p.split('.'); let o = S; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }

  /* ---------- étapes ---------- */
  const PROGRESS = ['Bien', 'Descriptif', 'Finition', 'Travaux', 'Financement', 'Coordonnées', 'Estimation'];
  const LABEL = { kind: 'Bien', bien: 'Descriptif', finition: 'Finition', travaux: 'Travaux', financeQ: 'Financement', acquisition: 'Financement', situation: 'Financement', contact: 'Coordonnées', resultat: 'Estimation' };
  const NEXT_LABEL = { kind: 'Continuer', bien: 'Continuer', finition: 'Voir mes travaux', travaux: 'Valider mes travaux', financeQ: 'Continuer', acquisition: 'Continuer', situation: 'Continuer', contact: 'Voir mon estimation' };

  function stepList() {
    const s = ['kind', 'bien', 'finition', 'travaux', 'financeQ'];
    if (S.finance === 'oui') s.push('acquisition', 'situation');
    s.push('contact', 'resultat');
    return s;
  }

  function showStep() {
    const list = stepList();
    if (!list.includes(S.step)) S.step = 'kind';
    document.querySelectorAll('.step').forEach(el => el.classList.toggle('active', el.dataset.step === S.step));
    document.querySelectorAll('[data-only]').forEach(el => el.classList.toggle('hidden', !el.dataset.only.split(' ').includes(S.kind || '')));
    $('surface-label').textContent = S.kind === 'immeuble' ? 'Surface habitable totale' : 'Surface habitable';

    const idx = list.indexOf(S.step);
    const cur = PROGRESS.indexOf(LABEL[S.step]);
    $('progress').innerHTML = PROGRESS.map((p, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${p}</li>`).join('');
    $('pct').textContent = S.step === 'resultat' ? 'Estimation prête' : 'Étape ' + (idx + 1) + ' sur ' + list.length + ' · ' + Math.round(idx / (list.length - 1) * 100) + ' %';

    const nav = $('stepnav');
    nav.classList.toggle('hidden', S.step === 'resultat');
    $('btn-prev').classList.toggle('hidden', idx === 0);
    $('btn-next').textContent = NEXT_LABEL[S.step] || 'Continuer';
    $('err').classList.add('hidden');
    $('panel').classList.toggle('hidden', S.step === 'resultat');

    if (S.step === 'travaux') renderLots();
    if (S.step === 'resultat') renderReport();
    renderPanel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const first = document.querySelector('.step.active input:not([type="checkbox"]), .step.active select');
    if (first && window.matchMedia('(min-width: 981px)').matches) first.focus({ preventScroll: true });
  }

  function validate() {
    const c = S.contact;
    switch (S.step) {
      case 'kind': return S.kind ? null : 'Choisissez un type de bien pour continuer.';
      case 'bien':
        if (!S.adresse.trim()) return 'Indiquez l\'adresse du bien, même approximative : elle fixe la zone de prix.';
        if (!(+S.surface > 0)) return 'La surface habitable est indispensable pour proposer des quantités.';
        if (S.kind === 'immeuble' && !(+S.nbapts >= 2)) return 'Un immeuble compte au moins deux appartements.';
        return null;
      case 'finition': return S.gamme ? null : 'Choisissez un niveau de finition.';
      case 'travaux': return Object.keys(S.works).some(k => S.works[k]) ? null : 'Cochez au moins un ouvrage.';
      case 'financeQ': return S.finance ? null : 'Dites-nous si vous souhaitez un accompagnement pour le financement.';
      case 'acquisition':
        if (!(+S.prix > 0)) return 'Le prix d\'acquisition est nécessaire pour calculer la rentabilité.';
        if (S.strat !== 'revente' && !(+S.loyer > 0)) return 'Indiquez le loyer mensuel visé.';
        return null;
      case 'contact':
        if (!c.prenom.trim() || !c.nom.trim()) return 'Prénom et nom, pour personnaliser votre estimation.';
        if (String(c.tel).replace(/\D/g, '').length < 9) return 'Un numéro de téléphone valide, pour vous rappeler si besoin.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return 'Une adresse e-mail valide, pour vous envoyer le PDF.';
        if (!c.consent) return 'Cochez la case pour que nous puissions vous recontacter.';
        return null;
    }
    return null;
  }

  function goNext() {
    const err = validate();
    if (err) { $('err').textContent = err; $('err').classList.remove('hidden'); return; }
    if (S.step === 'bien' && !S.worksTouched) S.works = C.preselect(S);
    if (S.step === 'contact') { ensureRef(); submitLead(); }
    const list = stepList();
    S.step = list[Math.min(list.length - 1, list.indexOf(S.step) + 1)];
    save(); showStep();
  }
  function goPrev() {
    const list = stepList();
    S.step = list[Math.max(0, list.indexOf(S.step) - 1)];
    save(); showStep();
  }

  /* ---------- formulaire ---------- */
  function fillForm() {
    document.querySelectorAll('[data-k]').forEach(el => {
      const v = getPath(el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    document.querySelectorAll('.choice').forEach(b => b.classList.toggle('selected', getPath(b.dataset.choice) === b.dataset.value));
    const z = $('zone');
    z.innerHTML = Object.keys(C.REGION).map(k => `<option value="${k}">${esc(C.REGION[k][1].charAt(0).toUpperCase() + C.REGION[k][1].slice(1))}</option>`).join('');
    z.value = S.zone;
    $('zone-hint').textContent = S.zoneAuto && S.ville ? 'déduite de ' + S.ville : (S.zoneAuto ? 'déduite de l\'adresse' : 'choisie manuellement');
    renderApts();
  }

  function syncApts() {
    const n = Math.max(2, Math.min(40, +S.nbapts || 2));
    while (S.apts.length < n) S.apts.push({ type: 't2' });
    S.apts.length = n;
  }
  function renderApts() {
    if (S.kind !== 'immeuble') return;
    syncApts();
    $('apts').innerHTML = S.apts.map((a, i) => `<div class="field"><label for="apt-${i}">Appartement ${i + 1}</label><select id="apt-${i}" data-apt="${i}"><option value="t1"${a.type === 't1' ? ' selected' : ''}>Studio / T1</option><option value="t2"${a.type === 't2' ? ' selected' : ''}>T2</option><option value="t3"${a.type === 't3' ? ' selected' : ''}>T3</option><option value="t4"${a.type === 't4' ? ' selected' : ''}>T4</option><option value="t5"${a.type === 't5' ? ' selected' : ''}>T5 et plus</option></select></div>`).join('');
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
      if (k === 'strat' || (k === 'surface' && S.loyerAuto)) {
        if (S.loyerAuto && +S.surface) { S.loyer = Math.round((C.LOYER_M2[S.strat] || 0) * +S.surface / 10) * 10; $('loyer').value = S.loyer || ''; }
      }
      if (k === 'loyer') S.loyerAuto = el.value === '';
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

  function onChoice(e) {
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

  /* ---------- tableau des travaux ---------- */
  let lotsBuilt = false;
  function renderLots() {
    if (!lotsBuilt) {
      $('lots').innerHTML = C.CATALOG.map(l => `
        <div class="lot">
          <div class="lot-head"><h3>${esc(l.lot)}</h3><span class="sum">sous-total <b class="num" data-lotsum="${esc(l.lot)}"></b></span></div>
          ${l.items.map(it => `
            <div class="item" data-item="${it.id}">
              <input type="checkbox" id="w-${it.id}" data-w="${it.id}">
              <label class="lbl" for="w-${it.id}">${esc(it.label)}${it.tva === 5.5 ? '<span class="tva55">TVA 5,5 %</span>' : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</label>
              <input type="number" min="0" step="1" data-q="${it.id}" inputmode="numeric" aria-label="Quantité ${esc(it.label)}">
              <span class="u">${it.unit}</span>
              <span class="pu num" data-pu="${it.id}"></span>
              <span class="tot num" data-tot="${it.id}"></span>
            </div>`).join('')}
        </div>`).join('');
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
    const ok = ready();
    $('p-empty').classList.toggle('hidden', ok);
    $('p-head').classList.toggle('hidden', !ok);
    $('panel-toggle').classList.toggle('hidden', !ok);
    $('p-body').classList.toggle('hidden', !ok);
    if (!ok) return;
    const R = C.compute(S);
    $('p-central').innerHTML = eur(R.ttc) + '<small>TTC</small>';
    $('p-low').textContent = eur(R.low); $('p-high').textContent = eur(R.high);
    const span = R.high * 1.08 || 1, px = v => (v / span * 100).toFixed(1) + '%';
    $('p-band').style.left = px(R.low); $('p-band').style.width = px(R.high - R.low);
    $('p-pin-low').style.left = px(R.low); $('p-pin-mid').style.left = px(R.ttc); $('p-pin-high').style.left = px(R.high);
    $('p-m2').innerHTML = fmt(R.ttc / R.ctx.surface) + '<small> €/m²</small>';
    $('p-duree').innerHTML = R.weeks + '<small> sem.</small>';
    const lab = R.score < 50 ? 'faible' : R.score < 70 ? 'moyenne' : R.score < 85 ? 'bonne' : 'élevée';
    $('p-conf').innerHTML = R.score + '<small> / 100 · ' + lab + '</small>';
    const cb = $('p-conf-bar'); cb.className = 'conf' + (R.score < 50 ? ' c' : R.score < 70 ? ' w' : ''); cb.firstElementChild.style.width = R.score + '%';
    $('p-l-direct').textContent = eur(R.direct); $('p-l-fg').textContent = eur(R.fg); $('p-l-marge').textContent = eur(R.marge);
    $('p-l-alea-t').textContent = '(' + pct(R.alea, 0) + ')'; $('p-l-alea').textContent = eur(R.aleaAmt);
    $('p-l-ht').textContent = eur(R.ht); $('p-l-tva-t').textContent = tvaLabel(R); $('p-l-tva').textContent = eur(R.tva); $('p-l-ttc').textContent = eur(R.ttc);
    const arr = Object.entries(R.lots).sort((a, b) => b[1] - a[1]); const max = arr.length ? arr[0][1] : 1;
    $('p-lots').innerHTML = arr.map(([n, v]) => `<div class="row"><span class="n" title="${esc(n)}">${esc(n)}</span><span class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><span class="v num">${eur(v)}<small>${pct(v / R.direct, 0)}</small></span></div>`).join('');
    const fin = S.finance === 'oui' && R.total > 0;
    $('p-tiles').classList.toggle('hidden', !fin);
    if (fin) $('p-tiles').innerHTML = tilesHtml(R, true);
  }
  function tvaLabel(R) { return 'TVA ' + (R.ancien ? (R.share55 > 0 ? '10 % et 5,5 % (moy. ' + pct(R.tvaRate) + ')' : '10 %') : '20 % (logement de moins de 2 ans)'); }
  function tilesHtml(R, compact) {
    const t = [['Coût total du projet', eur(R.total), 'bien + notaire + travaux + ameublement']];
    if (S.strat !== 'revente') {
      t.push(['Rendement brut', pct(R.brut), 'loyer annuel / coût total']);
      if (!compact) t.push(['Rendement net', pct(R.net), 'après vacance et charges']);
      t.push(['Mensualité', eur(R.mens), fmt(S.duree) + ' ans à ' + fmt(S.taux, 2) + ' %']);
      t.push(['Cash-flow mensuel', (R.cf >= 0 ? '+' : '') + eur(R.cf), R.cf >= 0 ? 'après mensualité et charges' : 'effort d\'épargne', R.cf >= 0 ? 'pos' : 'neg']);
      if (!compact) t.push(['Taux d\'effort', pct(R.effort, 0), 'mensualité / loyer']);
      if (!compact && R.endettement != null) t.push(['Endettement après projet', pct(R.endettement, 0), 'loyers retenus à 70 %', R.endettement > 0.35 ? 'neg' : '']);
    } else {
      t.push(['Mensualité', eur(R.mens), 'pendant les travaux']);
      t.push(['Revente à l\'équilibre', eur(R.total * 1.08), 'coût total + 8 % de frais de sortie']);
    }
    return t.map(x => `<div class="tile${x[3] ? ' ' + x[3] : ''}"><div class="eyebrow">${x[0]}</div><div class="v num">${x[1]}</div><div class="d">${x[2]}</div></div>`).join('');
  }

  /* ---------- rapport final ---------- */
  function ensureRef() {
    if (S.ref) return;
    const d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0');
    let h = 0; const s = S.contact.email + d.getTime(); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    S.ref = 'COT-' + y + m + j + '-' + h.toString(36).toUpperCase().slice(0, 4).padStart(4, '0');
  }
  const KIND = { appart: 'Appartement', maison: 'Maison', immeuble: 'Immeuble' };
  const STADE = { etude: 'en étude', compromis: 'sous compromis', acte: 'acte signé' };
  const STRAT = { nue: 'location nue', meuble: 'meublé (LMNP)', coloc: 'colocation meublée', revente: 'revente après travaux' };

  function renderReport() {
    const R = C.compute(S), A = C.alerts(S, R), c = S.contact;
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const typo = S.kind === 'immeuble' ? S.apts.length + ' appartements (' + S.apts.map(a => a.type.toUpperCase()).join(', ') + ')' : S.type.toUpperCase().replace('T1', 'Studio / T1');
    const bien = [
      ['Type de bien', KIND[S.kind]], ['Adresse', S.adresse], ['Zone de prix', C.REGION[S.zone][1]], ['Surface habitable', fmt(S.surface) + ' m²'], ['Typologie', typo],
      ['Pièces d\'eau', fmt(R.ctx.eau)], S.kind === 'appart' ? ['Étage', S.etage === '' ? 'non renseigné' : (S.etage > 0 ? fmt(S.etage) + 'ᵉ' + (S.ascenseur ? ', avec ascenseur' : ', sans ascenseur') : 'rez-de-chaussée')] : null,
      ['Année de construction', S.annee || 'inconnue'], ['DPE', S.dpe || 'inconnu'], ['État général', $('etat').selectedOptions[0] ? $('etat').selectedOptions[0].textContent : ''],
      ['Finition', C.GAMME[S.gamme][1]], ['Projet', STADE[S.stade] + ', démarrage souhaité sous ' + S.demarrage + ' mois'],
    ].filter(Boolean);
    const devisRows = C.CATALOG.map(l => {
      const rows = R.lines.filter(x => x.on && x.it.lotName === l.lot && x.amount > 0);
      if (!rows.length) return '';
      return `<tr class="lot"><td colspan="4">${esc(l.lot)}</td><td class="r num">${eur(R.lots[l.lot])}</td></tr>` + rows.map(x => `<tr><td>${esc(x.it.label)}${x.it.sub ? `<small>${esc(x.it.sub)}</small>` : ''}</td><td class="r num">${fmt(x.q)}</td><td>${x.it.unit}</td><td class="r num">${eur(x.unitPrice)}</td><td class="r num">${eur(x.amount)}</td></tr>`).join('');
    }).join('');
    const fin = S.finance === 'oui' && R.total > 0;
    const bank = fin ? [
      ['Prix d\'acquisition', eur(R.prix)], ['Frais de notaire (' + pct(C.NOTAIRE) + ', ancien)', eur(R.notaire)], ['Travaux estimés, centrale TTC', eur(R.ttc)],
      ['Fourchette travaux', eur(R.low) + ' à ' + eur(R.high)], ['Ameublement locatif', eur(R.meubles)], ['Coût total du projet', eur(R.total), 1],
      ['Apport (' + fmt(S.apport) + ' %)', eur(R.apport)], ['Montant à financer', eur(R.emprunt)], ['Mensualité estimée', eur(R.mens) + ' / mois'],
      S.strat !== 'revente' ? ['Loyer prévisionnel hors charges', eur(R.loyer) + ' / mois'] : null,
      ['Stratégie', STRAT[S.strat]], ['Durée prévisionnelle des travaux', R.weeks + ' semaines'],
    ].filter(Boolean) : [];
    const hyp = [
      `${KIND[S.kind]} de ${fmt(S.surface)} m², ${typo}, ${fmt(R.ctx.eau)} pièce${R.ctx.eau > 1 ? 's' : ''} d'eau.`,
      `Prix de référence ${C.REGION[S.zone][1]}, finition ${C.GAMME[S.gamme][1]}, coefficient de complexité ${R.cCx.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${R.cxParts.length ? ' (' + R.cxParts.join(', ') + ')' : ''}.`,
      S.occupe ? 'Logement occupé : interventions par phases, protection des lieux, majoration incluse.' : 'Logement vide pendant toute la durée du chantier.',
      R.ancien ? 'Logement achevé depuis plus de deux ans : TVA à 10 %, à 5,5 % pour les travaux d\'amélioration énergétique sur attestation.' : 'Logement de moins de deux ans : TVA à 20 % sur l\'ensemble.',
      'Réseaux existants supposés réutilisables sauf ouvrages retenus ; structure et planchers supposés sains.',
      S.visite ? 'Visite technique réalisée : métrés et réseaux vérifiés sur place.' : 'Aucune visite technique : quantités déduites de la surface et de la typologie.',
      `Provision pour aléas de ${pct(R.alea, 0)} et fourchette de ±${pct(R.spread, 0)}, liées au score de confiance de ${R.score} / 100.`,
    ];
    $('report').innerHTML = `
      <div class="print-brand"><svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true"><path d="M65,32.7 A30,30 0 1 0 65,71.3" fill="none" stroke="#2457A6" stroke-width="18"/><line x1="6" y1="18" x2="94" y2="18" stroke="#2457A6" stroke-width="5"/><line x1="2" y1="23" x2="10" y2="13" stroke="#E4B33B" stroke-width="4"/><line x1="90" y1="23" x2="98" y2="13" stroke="#E4B33B" stroke-width="4"/><rect x="78" y="18" width="8" height="70" fill="#2457A6"/></svg><b style="font-family:'Barlow Condensed',sans-serif;font-size:22px;letter-spacing:.12em">COTALIS</b><span style="color:#666;font-size:12px">Estimation indicative · n'est pas un devis</span></div>
      <div class="ok-note no-print">Merci ${esc(c.prenom)}, votre estimation est prête. Téléchargez-la en PDF ci-dessous ; une copie vous sera envoyée à ${esc(c.email)}.</div>
      <div class="rhead">
        <div><h2>Estimation travaux</h2><div class="who">Préparée pour ${esc(c.prenom)} ${esc(c.nom)} · ${date} · réf. <span class="num">${esc(S.ref)}</span></div></div>
        <div class="actions"><button type="button" class="btn primary" id="btn-pdf">Télécharger le PDF</button><button type="button" class="btn" id="btn-edit">Modifier mes réponses</button><button type="button" class="btn" id="btn-rappel">${S.rappel ? 'Rappel demandé ✓' : 'Être rappelé pour une visite technique'}</button></div>
      </div>
      <div class="two">
        <div class="box"><h3>Le bien</h3><table class="kv">${bien.map(b => `<tr><td>${esc(b[0])}</td><td>${esc(b[1])}</td></tr>`).join('')}</table></div>
        <div class="box">
          <h3>Estimation</h3>
          <div class="eyebrow">Estimation centrale · travaux TTC</div>
          <div class="big num">${eur(R.ttc)}<small>TTC</small></div>
          <div class="range"><div class="track"><div class="band" style="left:${(R.low / (R.high * 1.08) * 100).toFixed(1)}%;width:${((R.high - R.low) / (R.high * 1.08) * 100).toFixed(1)}%"></div><div class="pin mark" style="left:${(R.low / (R.high * 1.08) * 100).toFixed(1)}%"></div><div class="pin" style="left:${(R.ttc / (R.high * 1.08) * 100).toFixed(1)}%"></div><div class="pin mark" style="left:${(R.high / (R.high * 1.08) * 100).toFixed(1)}%"></div></div>
          <div class="range-lbl"><span>Basse <b class="num">${eur(R.low)}</b></span><span>Haute <b class="num">${eur(R.high)}</b></span></div></div>
          <table class="kv" style="margin-top:12px">
            <tr><td>Coût au m²</td><td class="num">${fmt(R.ttc / R.ctx.surface)} €/m² TTC</td></tr>
            <tr><td>Durée probable des travaux</td><td class="num">${R.weeks} semaines</td></tr>
            <tr><td>Score de confiance</td><td class="num">${R.score} / 100</td></tr>
            <tr><td>Coûts directs</td><td class="num">${eur(R.direct)}</td></tr>
            <tr><td>Frais généraux et pilotage</td><td class="num">${eur(R.fg)}</td></tr>
            <tr><td>Marge</td><td class="num">${eur(R.marge)}</td></tr>
            <tr><td>Provision pour aléas (${pct(R.alea, 0)})</td><td class="num">${eur(R.aleaAmt)}</td></tr>
            <tr class="total"><td>Total HT</td><td class="num">${eur(R.ht)}</td></tr>
            <tr><td>${tvaLabel(R)}</td><td class="num">${eur(R.tva)}</td></tr>
            <tr class="total"><td>Total TTC</td><td class="num">${eur(R.ttc)}</td></tr>
          </table>
        </div>
      </div>
      <div class="box"><h3>Détail par lot</h3><div style="overflow-x:auto"><table class="devis"><thead><tr><th>Ouvrage</th><th class="r">Qté</th><th>Unité</th><th class="r">Prix unitaire HT</th><th class="r">Montant HT</th></tr></thead><tbody>${devisRows}</tbody></table></div></div>
      ${fin ? `<div><div class="eyebrow" style="margin-bottom:8px">Analyse investisseur · projet complet</div><div class="tiles">${tilesHtml(R, false)}</div></div>
      <div class="box"><h3>Synthèse pour la banque</h3><table class="kv">${bank.map(b => `<tr${b[2] ? ' class="total"' : ''}><td>${esc(b[0])}</td><td class="num">${esc(b[1])}</td></tr>`).join('')}</table><p style="font-size:12.5px;color:var(--ink-3);margin:10px 0 0">Estimation indicative à distinguer du devis contractuel. Un courtier Cotalis reprend contact pour instruire le dossier.</p></div>` : ''}
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
      <div class="box"><h3>Comment le montant est calculé</h3>
        <div class="formula mono">Montant ouvrage HT = Quantité × Prix de référence × ( part main-d'œuvre × coef. région × coef. complexité + part matériaux × coef. gamme )</div>
        <ul class="plain" style="margin-top:12px">
          <li><b>Coefficient région</b> ${R.cReg.toLocaleString('fr-FR')} (${esc(C.REGION[S.zone][1])}), appliqué à la main-d'œuvre. <b>Coefficient gamme</b> ${R.cGamme.toLocaleString('fr-FR')} (${esc(C.GAMME[S.gamme][1])}), appliqué aux matériaux. <b>Complexité</b> ${R.cCx.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}.</li>
          <li><b>Frais généraux et pilotage</b> ${pct(C.FG + C.PILOTAGE, 0)} des coûts directs. <b>Marge</b> ${pct(C.MARGE, 0)} du prix HT hors aléas. <b>Aléas</b> ${pct(R.alea, 0)}, dérivés du score de confiance et de l'état du bien.</li>
          <li><b>Fourchette</b> basse = HT sans aléas − ${pct(R.spread, 0)} ; haute = HT avec aléas + ${pct(R.spread, 0)}.</li>
        </ul></div>
      <div><div class="eyebrow" style="margin-bottom:8px">Et ensuite</div><div class="steps">
        <div class="stepc now"><div class="display">Estimation en ligne</div>Fourchette, hypothèses, rentabilité. Sans engagement.</div>
        <div class="stepc"><div class="display">Visite technique</div>Un chiffreur contrôle métrés, réseaux et structure. Le score de confiance passe au maximum.</div>
        <div class="stepc"><div class="display">Devis contractuel</div>Prix et délais fermes, écarts avec l'estimation expliqués ligne à ligne, signature et acompte.</div>
        <div class="stepc"><div class="display">Chantier suivi</div>Planning, jalons, appels de fonds, réception.</div>
      </div></div>
      <p style="font-size:12.5px;color:var(--ink-3);margin:0;max-width:80ch">Prix de référence relevés en septembre 2026 sur des chantiers de rénovation locative. Les montants restent indicatifs tant qu'un devis signé ne les remplace pas. Document généré par Cotalis pour ${esc(c.prenom)} ${esc(c.nom)}, réf. ${esc(S.ref)}.</p>`;
    $('btn-pdf').addEventListener('click', () => window.print());
    $('btn-edit').addEventListener('click', () => { S.step = 'travaux'; save(); showStep(); });
    $('btn-rappel').addEventListener('click', () => { S.rappel = true; save(); submitLead('rappel'); $('btn-rappel').textContent = 'Rappel demandé ✓'; });
  }

  /* ---------- envoi de la demande ---------- */
  function leadPayload(kind) {
    const R = C.compute(S), c = S.contact;
    return {
      ref: S.ref, kind: kind || 'estimation', prenom: c.prenom, nom: c.nom, email: c.email, tel: c.tel,
      type_bien: S.kind, adresse: S.adresse, ville: S.ville, cp: S.cp, surface: +S.surface || null, gamme: S.gamme, stade: S.stade, demarrage: S.demarrage,
      estimation_ttc: Math.round(R.ttc), estimation_basse: Math.round(R.low), estimation_haute: Math.round(R.high), score: R.score,
      finance: S.finance, prix: +S.prix || null, strat: S.strat, loyer: +S.loyer || null,
      situation: S.situation, payload: { works: S.works, qty: S.qty, bien: { type: S.type, apts: S.apts, eau: S.eau, etage: S.etage, niveaux: S.niveaux, annee: S.annee, dpe: S.dpe, etat: S.etat, zone: S.zone, ascenseur: S.ascenseur, copro: S.copro, occupe: S.occupe, acces: S.acces, plans: S.plans, visite: S.visite }, acquisition: { apport: S.apport, taux: S.taux, duree: S.duree, vacance: S.vacance, charges: S.charges } },
      user_agent: navigator.userAgent, page: location.href,
    };
  }
  async function submitLead(kind) {
    const lead = leadPayload(kind);
    try { const all = JSON.parse(localStorage.getItem('cotalis-leads') || '[]'); all.push(Object.assign({ at: new Date().toISOString() }, lead)); localStorage.setItem('cotalis-leads', JSON.stringify(all.slice(-20))); } catch (e) {}
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) return;
    try {
      const r = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, Prefer: 'return=minimal' },
        body: JSON.stringify(lead),
      });
      if (r.ok) { S.leadSent = true; save(); } else console.warn('Cotalis : envoi refusé', r.status);
    } catch (e) { console.warn('Cotalis : envoi impossible', e); }
  }

  /* ---------- démarrage ---------- */
  const form = $('tunnel');
  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('click', onChoice);
  $('btn-next').addEventListener('click', goNext);
  $('btn-prev').addEventListener('click', goPrev);
  $('btn-restart').addEventListener('click', () => { if (confirm('Repartir de zéro ? Vos réponses seront effacées.')) { S = clone(DEFAULT); save(); lotsBuilt = false; fillForm(); showStep(); } });
  $('panel-toggle').addEventListener('click', () => { const p = $('panel'); p.classList.toggle('open'); $('panel-toggle').textContent = p.classList.contains('open') ? 'Réduire' : 'Voir le détail'; });
  $('adresse').addEventListener('input', e => { clearTimeout(acTimer); acTimer = setTimeout(() => fetchAddr(e.target.value), 250); });
  $('suggest').addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pickAddr(li); } });
  $('adresse').addEventListener('blur', () => setTimeout(hideSuggest, 150));
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && S.step !== 'travaux' && S.step !== 'resultat') { e.preventDefault(); goNext(); } });

  fillForm();
  showStep();
})();
