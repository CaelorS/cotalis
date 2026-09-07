/* Cotalis - référentiel travaux et paramètres du moteur.
   Prix de référence HT, septembre 2026. Administrable : modifier ici, rien d'autre à toucher. */
(function (root) {
  'use strict';

  // pu : prix de référence HT par unité (€) ; lab : part main-d'œuvre ; tva : 10 par défaut, 5.5 pour l'amélioration énergétique.
  // qty(s) reçoit s.surface, s.pieces, s.eau, s.units (nombre de logements : 1 sauf immeuble).
  const CATALOG = [
    { lot: 'Démolition et dépose', items: [
      { id: 'dep_rev', label: 'Dépose des revêtements', sub: 'sols, faïence, papiers peints', unit: 'm²', pu: 18, lab: 0.85, qty: s => s.surface },
      { id: 'dep_eq', label: 'Dépose cuisine et sanitaires existants', unit: 'forfait', pu: 650, lab: 0.9, qty: s => s.units },
      { id: 'benne', label: 'Évacuation des gravats', sub: 'benne, transport, déchetterie', unit: 'forfait', pu: 900, lab: 0.35, qty: s => Math.ceil(s.units / 2) },
    ]},
    { lot: 'Gros œuvre et cloisons', items: [
      { id: 'mur_np', label: 'Ouverture dans mur non porteur', unit: 'u', pu: 850, lab: 0.8, qty: s => s.units },
      { id: 'mur_p', label: 'Ouverture de mur porteur', sub: 'IPN, étude structure incluse', unit: 'u', pu: 4800, lab: 0.6, qty: () => 1 },
      { id: 'cloison', label: 'Cloisons neuves', sub: 'plaques de plâtre sur ossature, isolant phonique', unit: 'ml', pu: 145, lab: 0.6, qty: s => Math.round(s.surface * 0.08) },
      { id: 'plafond', label: 'Faux plafond', sub: 'plaques de plâtre, reprise éclairage', unit: 'm²', pu: 55, lab: 0.6, qty: s => s.surface },
    ]},
    { lot: 'Électricité', items: [
      { id: 'elec', label: 'Mise en conformité complète', sub: 'tableau, circuits, prises, luminaires', unit: 'm²', pu: 95, lab: 0.6, qty: s => s.surface },
      { id: 'tableau', label: 'Mise en sécurité seule', sub: 'tableau, terre, différentiels', unit: 'forfait', pu: 1400, lab: 0.55, qty: s => s.units },
    ]},
    { lot: 'Plomberie et chauffage', items: [
      { id: 'plomb', label: 'Réseau eau et évacuations à neuf', sub: 'par pièce d\'eau et cuisine', unit: 'u', pu: 2400, lab: 0.65, qty: s => s.eau + s.units },
      { id: 'ballon', label: 'Chauffe-eau électrique', unit: 'u', pu: 690, lab: 0.35, qty: s => s.units },
      { id: 'thermo', label: 'Chauffe-eau thermodynamique', unit: 'u', pu: 2650, lab: 0.3, qty: s => s.units, tva: 5.5 },
      { id: 'radia', label: 'Radiateurs électriques à inertie', unit: 'u', pu: 420, lab: 0.3, qty: s => s.pieces + s.units },
      { id: 'chaud', label: 'Chaudière gaz à condensation', unit: 'u', pu: 4200, lab: 0.35, qty: s => s.units },
      { id: 'vmc', label: 'VMC simple flux hygroréglable', unit: 'forfait', pu: 950, lab: 0.55, qty: s => s.units },
    ]},
    { lot: 'Isolation et menuiseries extérieures', items: [
      { id: 'fen', label: 'Fenêtres PVC double vitrage', sub: 'fourniture et pose, dépose comprise', unit: 'u', pu: 780, lab: 0.35, qty: s => s.pieces + s.units, tva: 5.5 },
      { id: 'iti', label: 'Isolation des murs par l\'intérieur', sub: 'doublage, R ≥ 3,7', unit: 'm²', pu: 68, lab: 0.5, qty: s => Math.round(s.surface * 0.9), tva: 5.5 },
      { id: 'combles', label: 'Isolation des combles', unit: 'm²', pu: 32, lab: 0.45, qty: s => Math.round(s.surface / Math.max(1, s.niveaux || 1)), tva: 5.5 },
      { id: 'porte', label: 'Porte palière blindée', unit: 'u', pu: 2200, lab: 0.3, qty: s => s.units },
    ]},
    { lot: 'Salle de bain et WC', items: [
      { id: 'sdb', label: 'Salle de bain complète', sub: 'douche à l\'italienne, meuble vasque, faïence, WC', unit: 'forfait', pu: 7800, lab: 0.55, qty: s => s.units },
      { id: 'wc', label: 'WC séparé', sub: 'cuvette suspendue, lave-mains, faïence', unit: 'forfait', pu: 1600, lab: 0.55, qty: s => Math.max(1, s.eau - s.units) },
    ]},
    { lot: 'Cuisine', items: [
      { id: 'cuis', label: 'Cuisine équipée', sub: 'meubles, plan de travail, électroménager, pose', unit: 'forfait', pu: 6500, lab: 0.3, qty: s => s.units },
    ]},
    { lot: 'Sols', items: [
      { id: 'ragr', label: 'Ragréage', unit: 'm²', pu: 14, lab: 0.6, qty: s => s.surface },
      { id: 'parq', label: 'Parquet contrecollé', sub: 'pièces de vie et chambres', unit: 'm²', pu: 72, lab: 0.45, qty: s => Math.round(s.surface * 0.72) },
      { id: 'strat', label: 'Stratifié', unit: 'm²', pu: 38, lab: 0.5, qty: s => Math.round(s.surface * 0.72) },
      { id: 'carr', label: 'Carrelage 60 × 60', sub: 'cuisine, salle de bain, entrée', unit: 'm²', pu: 85, lab: 0.55, qty: s => Math.round(s.surface * 0.2) },
    ]},
    { lot: 'Peinture et menuiseries intérieures', items: [
      { id: 'peint', label: 'Préparation et peinture', sub: 'murs et plafonds, 2 couches', unit: 'm²', pu: 32, lab: 0.75, qty: s => Math.round(s.surface * 2.8) },
      { id: 'portes', label: 'Portes intérieures', sub: 'bloc-porte et quincaillerie', unit: 'u', pu: 380, lab: 0.45, qty: s => s.pieces + s.units },
      { id: 'placard', label: 'Placards sur mesure', unit: 'ml', pu: 650, lab: 0.4, qty: s => 2 * s.units },
      { id: 'nett', label: 'Nettoyage de fin de chantier', unit: 'forfait', pu: 350, lab: 1, qty: s => s.units },
    ]},
  ];

  const ITEMS = {};
  CATALOG.forEach(l => l.items.forEach(i => { i.lotName = l.lot; ITEMS[i.id] = i; }));

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

  root.COTALIS = Object.assign(root.COTALIS || {}, {
    CATALOG, ITEMS, PRESET, REGION, GAMME, PIECES, EAU_DEFAULT, zoneFromAddress,
    MARGE: 0.18,      // marge brute sur le prix HT hors aléas
    PILOTAGE: 0.03,   // pilotage de chantier, sur les coûts directs
    FG: 0.08,         // frais généraux, sur les coûts directs
    NOTAIRE: 0.075,   // frais d'acquisition dans l'ancien
    AMEUBLEMENT: { nue: 0, meuble: 120, coloc: 150, revente: 0 }, // €/m²
    LOYER_M2: { nue: 13, meuble: 16, coloc: 20, revente: 0 },      // repère pour préremplir le loyer visé
  });
})(window);
