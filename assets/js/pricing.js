/* Cotalia - prix administrables : applique les valeurs enregistrées dans Supabase par-dessus le catalogue par défaut. */
(function () {
  'use strict';
  const CFG = window.COTALIA_CONFIG || {};
  const C = window.COTALIA;
  const BASE = (CFG.supabaseUrl || '').replace(/\/$/, ''), KEY = CFG.supabaseAnonKey || '';

  // Valeurs d'origine, conservées pour l'affichage « par défaut » du back-office et pour réinitialiser.
  C.DEFAULTS = {
    MARGE: C.MARGE, FG: C.FG, PILOTAGE: C.PILOTAGE, NOTAIRE: C.NOTAIRE,
    REGION: JSON.parse(JSON.stringify(C.REGION)), GAMME: JSON.parse(JSON.stringify(C.GAMME)),
    items: {},
  };
  C.CATALOG.forEach(l => l.items.forEach(it => { C.DEFAULTS.items[it.id] = { pu: it.pu, lab: it.lab, tva: it.tva || 10, label: it.label, sub: it.sub || '', unit: it.unit }; }));

  C.QTY_MODES = { surface: 'surface habitable × coef.', units: 'nombre de logements × coef.', pieces: '(pièces principales + logements) × coef.', eau: 'pièces d\'eau × coef.', fixed: 'quantité fixe' };
  function qtyFn(mode, coef) {
    const k = coef == null || coef === '' ? 1 : +coef;
    return { surface: s => Math.round(s.surface * k), units: s => Math.round(s.units * k), pieces: s => Math.round((s.pieces + s.units) * k), eau: s => Math.round(s.eau * k), fixed: () => Math.round(k) }[mode] || (s => s.units);
  }
  C.addCustomItem = function (row) {
    let lot = C.CATALOG.find(l => l.lot === row.lot);
    if (!lot) { lot = { lot: row.lot || 'Autres ouvrages', items: [] }; C.CATALOG.push(lot); }
    const it = { id: row.id, label: row.label || row.id, sub: row.sub || '', unit: row.unit || 'u', pu: +row.pu || 0, lab: row.lab == null ? 0.5 : +row.lab, custom: true, qtyMode: row.qty_mode || 'units', qtyCoef: row.qty_coef, presets: row.presets || [], lotName: lot.lot, qty: qtyFn(row.qty_mode, row.qty_coef) };
    if (+row.tva === 5.5) it.tva = 5.5;
    it.marge = (row.marge == null || row.marge === '') ? null : +row.marge;
    it.inactive = row.active === false;
    lot.items.push(it); C.ITEMS[it.id] = it;
    (row.presets || []).forEach(k => { if (C.PRESET[k] && !C.PRESET[k].includes(it.id)) C.PRESET[k].push(it.id); });
    return it;
  };
  C.applyPricing = function (items, settings) {
    (items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach(row => {
      if (row.custom && !C.ITEMS[row.id]) { C.addCustomItem(row); return; }
      const it = C.ITEMS[row.id]; if (!it) return;
      if (it.custom) { it.qtyMode = row.qty_mode || it.qtyMode; it.qtyCoef = row.qty_coef; it.qty = qtyFn(it.qtyMode, it.qtyCoef); it.presets = row.presets || []; }
      if (row.pu != null) it.pu = +row.pu;
      if (row.lab != null) it.lab = +row.lab;
      if (row.tva != null) { if (+row.tva === 5.5) it.tva = 5.5; else delete it.tva; }
      it.marge = (row.marge == null || row.marge === '') ? null : +row.marge;
      if (row.label) it.label = row.label;
      if (row.sub != null) it.sub = row.sub;
      it.inactive = row.active === false;
    });
    (settings || []).forEach(row => {
      const v = row.value;
      if (row.key === 'MARGE' && typeof v === 'number') C.MARGE = v;
      if (row.key === 'FG' && typeof v === 'number') C.FG = v;
      if (row.key === 'PILOTAGE' && typeof v === 'number') C.PILOTAGE = v;
      if (row.key === 'NOTAIRE' && typeof v === 'number') C.NOTAIRE = v;
      if (row.key === 'REGION' && v && typeof v === 'object') Object.keys(v).forEach(k => { if (C.REGION[k] && typeof v[k] === 'number') C.REGION[k][0] = v[k]; });
      if (row.key === 'GAMME' && v && typeof v === 'object') Object.keys(v).forEach(k => { if (C.GAMME[k] && typeof v[k] === 'number') C.GAMME[k][0] = v[k]; });
    });
  };

  C.loadPricing = async function () {
    if (!BASE || !KEY) return false;
    try {
      const h = { apikey: KEY, Authorization: 'Bearer ' + KEY };
      const [a, b] = await Promise.all([
        fetch(BASE + '/rest/v1/pricing_items?select=*', { headers: h }),
        fetch(BASE + '/rest/v1/pricing_settings?select=*', { headers: h }),
      ]);
      if (!a.ok || !b.ok) return false;
      C.applyPricing(await a.json(), await b.json());
      return true;
    } catch (e) { console.warn('Cotalia : prix par défaut utilisés', e); return false; }
  };
})();
