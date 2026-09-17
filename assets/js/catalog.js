/* Cotalia - référentiel travaux et paramètres du moteur.
   Prix de référence HT, septembre 2026. Administrable : modifier ici, rien d'autre à toucher. */
(function (root) {
  'use strict';

  // pu : prix de référence HT par unité (€) ; lab : part main-d'œuvre ; tva : 10 par défaut, 5.5 pour l'amélioration énergétique.
  // qty(s) reçoit s.surface, s.pieces, s.eau, s.units (nombre de logements : 1 sauf immeuble).
  const CATALOG = [
    { lot: 'Démolition et dépose', items: [
      { id: 'dep_rev', label: 'Dépose des revêtements', sub: 'sols, faïence, papiers peints', unit: 'm²', pu: 18, lab: 0.85, qm: 'surface', qc: 1 },
      { id: 'dep_eq', label: 'Dépose cuisine et sanitaires existants', unit: 'forfait', pu: 650, lab: 0.9, qm: 'units', qc: 1 },
      { id: 'benne', label: 'Évacuation des gravats', sub: 'benne, transport, déchetterie', unit: 'forfait', pu: 900, lab: 0.35, qm: 'units_half', qc: 1 },
    ]},
    { lot: 'Gros œuvre et cloisons', items: [
      { id: 'mur_np', label: 'Ouverture dans mur non porteur', unit: 'u', pu: 850, lab: 0.8, qm: 'units', qc: 1 },
      { id: 'mur_p', label: 'Ouverture de mur porteur', sub: 'IPN, étude structure incluse', unit: 'u', pu: 4800, lab: 0.6, qm: 'fixed', qc: 1 },
      { id: 'cloison', label: 'Cloisons neuves', sub: 'plaques de plâtre sur ossature, isolant phonique', unit: 'ml', pu: 145, lab: 0.6, qm: 'surface', qc: 0.08 },
      { id: 'plafond', label: 'Faux plafond', sub: 'plaques de plâtre, reprise éclairage', unit: 'm²', pu: 55, lab: 0.6, qm: 'surface', qc: 1 },
    ]},
    { lot: 'Électricité', items: [
      { id: 'elec', label: 'Mise en conformité complète', sub: 'tableau, circuits, prises, luminaires', unit: 'm²', pu: 95, lab: 0.6, qm: 'surface', qc: 1 },
      { id: 'tableau', label: 'Mise en sécurité seule', sub: 'tableau, terre, différentiels', unit: 'forfait', pu: 1400, lab: 0.55, qm: 'units', qc: 1 },
    ]},
    { lot: 'Plomberie et chauffage', items: [
      { id: 'plomb', label: 'Réseau eau et évacuations à neuf', sub: 'par pièce d\'eau et cuisine', unit: 'u', pu: 2400, lab: 0.65, qm: 'eau_units', qc: 1 },
      { id: 'ballon', label: 'Chauffe-eau électrique', unit: 'u', pu: 690, lab: 0.35, qm: 'units', qc: 1 },
      { id: 'thermo', label: 'Chauffe-eau thermodynamique', unit: 'u', pu: 2650, lab: 0.3, qm: 'units', qc: 1 },
      { id: 'radia', label: 'Radiateurs électriques à inertie', unit: 'u', pu: 420, lab: 0.3, qm: 'pieces_units', qc: 1 },
      { id: 'chaud', label: 'Chaudière gaz à condensation', unit: 'u', pu: 4200, lab: 0.35, qm: 'units', qc: 1 },
      { id: 'vmc', label: 'VMC simple flux hygroréglable', unit: 'forfait', pu: 950, lab: 0.55, qm: 'units', qc: 1 },
    ]},
    { lot: 'Isolation et menuiseries extérieures', items: [
      { id: 'fen', label: 'Fenêtres PVC double vitrage', sub: 'fourniture et pose, dépose comprise', unit: 'u', pu: 780, lab: 0.35, qm: 'pieces_units', qc: 1 },
      { id: 'iti', label: 'Isolation des murs par l\'intérieur', sub: 'doublage, R ≥ 3,7', unit: 'm²', pu: 68, lab: 0.5, qm: 'surface', qc: 0.9 },
      { id: 'combles', label: 'Isolation des combles', unit: 'm²', pu: 32, lab: 0.45, qm: 'surface_per_level', qc: 1 },
      { id: 'porte', label: 'Porte palière blindée', unit: 'u', pu: 2200, lab: 0.3, qm: 'units', qc: 1 },
    ]},
    { lot: 'Salle de bain et WC', items: [
      { id: 'sdb', label: 'Salle de bain complète', sub: 'douche à l\'italienne, meuble vasque, faïence, WC', unit: 'forfait', pu: 7800, lab: 0.55, qm: 'units', qc: 1 },
      { id: 'wc', label: 'WC séparé', sub: 'cuvette suspendue, lave-mains, faïence', unit: 'forfait', pu: 1600, lab: 0.55, qm: 'eau_minus_units', qc: 1 },
    ]},
    { lot: 'Cuisine', items: [
      { id: 'cuis', label: 'Cuisine équipée', sub: 'meubles, plan de travail, électroménager, pose', unit: 'forfait', pu: 6500, lab: 0.3, qm: 'units', qc: 1 },
    ]},
    { lot: 'Sols', items: [
      { id: 'ragr', label: 'Ragréage', unit: 'm²', pu: 14, lab: 0.6, qm: 'surface', qc: 1 },
      { id: 'parq', label: 'Parquet contrecollé', sub: 'pièces de vie et chambres', unit: 'm²', pu: 72, lab: 0.45, qm: 'surface', qc: 0.72 },
      { id: 'strat', label: 'Stratifié', unit: 'm²', pu: 38, lab: 0.5, qm: 'surface', qc: 0.72 },
      { id: 'carr', label: 'Carrelage 60 × 60', sub: 'cuisine, salle de bain, entrée', unit: 'm²', pu: 85, lab: 0.55, qm: 'surface', qc: 0.2 },
    ]},
    { lot: 'Peinture et menuiseries intérieures', items: [
      { id: 'peint', label: 'Préparation et peinture', sub: 'murs et plafonds, 2 couches', unit: 'm²', pu: 32, lab: 0.75, qm: 'surface', qc: 2.8 },
      { id: 'portes', label: 'Portes intérieures', sub: 'bloc-porte et quincaillerie', unit: 'u', pu: 380, lab: 0.45, qm: 'pieces_units', qc: 1 },
      { id: 'placard', label: 'Placards sur mesure', unit: 'ml', pu: 650, lab: 0.4, qm: 'units', qc: 2 },
      { id: 'nett', label: 'Nettoyage de fin de chantier', unit: 'forfait', pu: 350, lab: 1, qm: 'units', qc: 1 },
    ]},
  ];

  // Règles de quantité proposée : chaque ouvrage a un mode (qm) et un coefficient (qc), modifiables dans le back-office.
  const QTY = {
    surface:          (s, k) => Math.round(s.surface * k),
    units:            (s, k) => Math.round(s.units * k),
    pieces_units:     (s, k) => Math.round((s.pieces + s.units) * k),
    eau:              (s, k) => Math.round(s.eau * k),
    eau_units:        (s, k) => Math.round((s.eau + s.units) * k),
    eau_minus_units:  (s, k) => Math.max(1, Math.round((s.eau - s.units) * k)),
    units_half:       (s, k) => Math.ceil(s.units / 2) * k,
    surface_per_level:(s, k) => Math.round(s.surface / Math.max(1, s.niveaux || 1) * k),
    fixed:            (s, k) => Math.round(k),
  };
  const QTY_MODES = { surface: 'surface × coef.', units: 'logements × coef.', pieces_units: '(pièces + logements) × coef.', eau: 'pièces d\'eau × coef.', eau_units: '(pièces d\'eau + logements) × coef.', eau_minus_units: '(pièces d\'eau − logements) × coef., 1 minimum', units_half: 'logements ÷ 2 arrondi sup. × coef.', surface_per_level: 'surface ÷ niveaux × coef.', fixed: 'quantité fixe' };
  function qtyFn(mode, coef) { const f = QTY[mode] || QTY.units; const k = (coef == null || coef === '') ? 1 : +coef; return s => f(s, k); }

  const ITEMS = {};
  CATALOG.forEach(l => l.items.forEach(i => { i.lotName = l.lot; i.qty = qtyFn(i.qm, i.qc); ITEMS[i.id] = i; }));

  // Règles complémentaires de sélection, appliquées dans l'ordre après la liste de l'état général.
  // when : toutes les conditions doivent être vraies. Champs : kind, etat, dpe, annee, surface, eau, zone, gamme, strat.
  const RULES = [
    { id: 'dpe_fg', label: 'Passoire thermique (DPE F ou G)', when: [{ f: 'dpe', op: 'in', v: 'F,G' }], add: ['fen', 'iti'], remove: [] },
    { id: 'avant_1975', label: 'Bâti antérieur à 1975, sans isolation d\'origine', when: [{ f: 'annee', op: 'lt', v: '1975' }], add: ['iti', 'fen'], remove: [] },
    { id: 'maison_total', label: 'Maison à rénover entièrement', when: [{ f: 'kind', op: 'eq', v: 'maison' }, { f: 'etat', op: 'eq', v: 'total' }], add: ['combles'], remove: [] },
    { id: 'maison_fg', label: 'Maison en passoire thermique', when: [{ f: 'kind', op: 'eq', v: 'maison' }, { f: 'dpe', op: 'in', v: 'F,G' }], add: ['combles'], remove: [] },
    { id: 'immeuble_elec', label: 'Immeuble : conformité électrique complète', when: [{ f: 'kind', op: 'eq', v: 'immeuble' }], add: ['elec'], remove: ['tableau'] },
    { id: 'coloc', label: 'Colocation : cloisons et salle d\'eau supplémentaire', when: [{ f: 'strat', op: 'eq', v: 'coloc' }], add: ['cloison', 'sdb'], remove: [] },
  ];
  const RULE_FIELDS = { kind: 'Type de bien', etat: 'État général', dpe: 'DPE', annee: 'Année de construction', surface: 'Surface', eau: 'Pièces d\'eau', zone: 'Zone de prix', gamme: 'Finition', strat: 'Stratégie locative' };
  const RULE_OPS = { eq: 'est', ne: 'n\'est pas', in: 'est parmi', lt: 'est inférieur à', gt: 'est supérieur à' };

  // Ouvrages proposés d'office selon l'état général déclaré. Le prospect ajuste ensuite ligne à ligne.
  const PRESET = {
    bon:     ['peint', 'tableau', 'nett'],
    correct: ['dep_rev', 'benne', 'tableau', 'sdb', 'cuis', 'ragr', 'parq', 'carr', 'peint', 'vmc', 'nett'],
    degrade: ['dep_rev', 'dep_eq', 'benne', 'elec', 'plomb', 'ballon', 'radia', 'vmc', 'sdb', 'wc', 'cuis', 'ragr', 'parq', 'carr', 'peint', 'portes', 'nett'],
    total:   ['dep_rev', 'dep_eq', 'benne', 'cloison', 'elec', 'plomb', 'ballon', 'radia', 'vmc', 'fen', 'sdb', 'wc', 'cuis', 'ragr', 'parq', 'carr', 'peint', 'portes', 'nett'],
  };

  // Coefficient appliqué à la main-d'œuvre selon la zone de prix.
  const REGION = {
    paris: [1.28, 'Paris'],
    pc:    [1.18, 'petite couronne'],
    gc:    [1.10, 'grande couronne'],
    lyon:  [1.06, 'Lyon, Bordeaux, Nice'],
    metro: [1.02, 'autre métropole'],
    moy:   [0.97, 'ville moyenne'],
    rural: [0.92, 'rural'],
  };
  const METRO = ['marseille', 'toulouse', 'nantes', 'lille', 'montpellier', 'strasbourg', 'rennes', 'grenoble', 'rouen', 'toulon', 'aix-en-provence', 'nancy', 'metz', 'tours', 'orléans', 'clermont-ferrand', 'dijon', 'angers', 'reims', 'le havre', 'saint-étienne', 'caen', 'brest', 'nîmes', 'annecy', 'mulhouse', 'perpignan', 'limoges', 'besançon', 'amiens', 'le mans', 'avignon', 'poitiers', 'pau', 'bayonne', 'la rochelle', 'nanterre', 'boulogne-billancourt'];
  const LYON = ['lyon', 'villeurbanne', 'bordeaux', 'nice'];

  function zoneFromAddress(postcode, city) {
    const cp = String(postcode || '').slice(0, 2);
    const c = String(city || '').toLowerCase().trim();
    if (cp === '75') return 'paris';
    if (['92', '93', '94'].includes(cp)) return 'pc';
    if (['77', '78', '91', '95'].includes(cp)) return 'gc';
    if (LYON.includes(c)) return 'lyon';
    if (METRO.includes(c)) return 'metro';
    return 'moy';
  }

  // Coefficient appliqué aux matériaux selon le niveau de finition.
  const GAMME = {
    eco:  [0.82, 'économique'],
    std:  [1.00, 'standard locatif'],
    prem: [1.42, 'premium'],
  };

  const PIECES = { t1: 1, t2: 2, t3: 3, t4: 4, t5: 5, t6: 6 };
  const EAU_DEFAULT = { t1: 1, t2: 1, t3: 1, t4: 2, t5: 2, t6: 2 };

  root.COTALIA = Object.assign(root.COTALIA || {}, {
    CATALOG, ITEMS, PRESET, RULES, RULE_FIELDS, RULE_OPS, QTY, QTY_MODES, qtyFn, REGION, GAMME, PIECES, EAU_DEFAULT, zoneFromAddress,
    MARGE: 0.18,      // marge brute sur le prix HT hors aléas
    PILOTAGE: 0.03,   // pilotage de chantier, sur les coûts directs
    FG: 0.08,         // frais généraux, sur les coûts directs
    NOTAIRE: 0.075,   // frais d'acquisition dans l'ancien
    AMEUBLEMENT: { nue: 0, meuble: 120, coloc: 150, revente: 0 }, // €/m²
    LOYER_M2: { nue: 13, meuble: 16, coloc: 20, revente: 0 },      // repère pour préremplir le loyer visé
  });
})(window);
