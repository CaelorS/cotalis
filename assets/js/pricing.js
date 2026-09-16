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

  C.applyPricing = function (items, settings) {
    (items || []).forEach(row => {
      const it = C.ITEMS[row.id]; if (!it) return;
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
