/* Cotalia - référentiel travaux et paramètres du moteur.
   Prix de référence HT, septembre 2026. Administrable : modifier ici, rien d'autre à toucher. */
(function (root) {
  'use strict';

  // pu : prix de référence HT par unité (€) ; lab : part main-d'œuvre ; tva : 10 par défaut, 5.5 pour l'amélioration énergétique.
  // gammes : par finition, { eco|std|prem: { pu: coût HT, marge, sub } }. pu et marge remplacent le coût de base et le coefficient de finition ; sub remplace la précision affichée.
  // qty(s) reçoit s.surface, s.pieces, s.eau, s.units (nombre de logements : 1 sauf immeuble).
  const CATALOG = [
    { lot: 'Démolition et dépose', items: [
      { id: 'dep_rev', label: 'Dépose des revêtements', sub: 'sols, faïence, papiers peints', unit: 'm²', pu: 12.86, lab: 0.85, qm: 'surface', qc: 1 },
      { id: 'dep_eq', label: 'Dépose cuisine et sanitaires existants', unit: 'forfait', pu: 464.29, lab: 0.9, qm: 'units', qc: 1 },
      { id: 'benne', label: 'Évacuation des gravats', sub: 'benne, transport, déchetterie', unit: 'forfait', pu: 642.86, lab: 0.35, qm: 'units_half', qc: 1 },
    ]},
    { lot: 'Gros œuvre et cloisons', items: [
      { id: 'mur_np', label: 'Ouverture dans mur non porteur', unit: 'u', pu: 607.14, lab: 0.8, qm: 'units', qc: 1 },
      { id: 'mur_p', label: 'Ouverture de mur porteur', sub: 'IPN, étude structure incluse', unit: 'u', pu: 3428.57, lab: 0.6, qm: 'fixed', qc: 1 },
      { id: 'cloison', label: 'Cloisons neuves', sub: 'plaques de plâtre sur ossature, isolant phonique', unit: 'ml', pu: 103.57, lab: 0.6, qm: 'surface', qc: 0.08 },
      { id: 'plafond', label: 'Faux plafond', sub: 'plaques de plâtre, reprise éclairage', unit: 'm²', pu: 39.29, lab: 0.6, qm: 'surface', qc: 1 },
    ]},
    { lot: 'Électricité', items: [
      // Depuis le 30/09/2026 l'électricité est découpée en trois postes. L'ancien « elec » (conformité complète à 95 €/m²)
      // équivaut aux trois réunis : voir LEGACY_WORKS plus bas, qui reprend les estimations déjà enregistrées.
      // un tableau par logement : un seul pour un appartement ou une maison, un par appartement dans un immeuble
      { id: 'tableau', label: 'Tableau électrique', sub: 'tableau neuf, terre, différentiels · un par logement', unit: 'u', pu: 1000, lab: 0.55, qm: 'units', qc: 1 },
      { id: 'elec_app', label: 'Appareillage', sub: 'prises, interrupteurs, points lumineux', unit: 'm²', pu: 18.57, lab: 0.45, qm: 'surface', qc: 1 },
      { id: 'elec_cab', label: 'Circuits et câblage', sub: 'gaines, câbles, saignées, circuits spécialisés', unit: 'm²', pu: 34.29, lab: 0.7, qm: 'surface', qc: 1 },
    ]},
    { lot: 'Parties communes et réseaux', only: ['immeuble'], items: [
      { id: 'colonne_elec', label: 'Colonne montante électrique', sub: 'gaine, câbles, coupe-circuits par niveau', unit: 'niveau', pu: 1357.14, lab: 0.65, qm: 'niveaux', qc: 1 },
      { id: 'colonne_plomb', label: 'Colonne montante plomberie', sub: 'eau froide, eau chaude, évacuation par niveau', unit: 'niveau', pu: 1214.29, lab: 0.7, qm: 'niveaux', qc: 1 },
    ] },
    { lot: 'Plomberie et chauffage', items: [
      // L'ancienne ligne « Réseau eau et évacuations à neuf » (plomb) est retirée depuis le 30/09/2026 : le réseau est compris
      // dans la salle de bain, le WC et la cuisine. Voir LEGACY_WORKS pour les estimations déjà enregistrées.
      { id: 'ballon', label: 'Chauffe-eau électrique', unit: 'u', pu: 492.86, lab: 0.35, qm: 'units', qc: 1 },
      { id: 'thermo', label: 'Chauffe-eau thermodynamique', unit: 'u', pu: 1892.86, lab: 0.3, qm: 'units', qc: 1 },
      { id: 'radia', label: 'Radiateurs électriques à inertie', unit: 'u', pu: 300, lab: 0.3, qm: 'pieces_units', qc: 1 },
      { id: 'chaud', label: 'Chaudière gaz à condensation', unit: 'u', pu: 3000, lab: 0.35, qm: 'units', qc: 1 },
      { id: 'vmc', label: 'VMC simple flux hygroréglable', unit: 'forfait', pu: 678.57, lab: 0.55, qm: 'units', qc: 1 },
    ]},
    { lot: 'Isolation et menuiseries extérieures', items: [
      { id: 'fen', label: 'Fenêtres PVC double vitrage', sub: 'fourniture et pose, dépose comprise', unit: 'u', pu: 557.14, lab: 0.35, qm: 'pieces_units', qc: 1 },
      { id: 'iti', label: 'Isolation des murs par l\'intérieur', sub: 'doublage, R ≥ 3,7', unit: 'm²', pu: 48.57, lab: 0.5, qm: 'surface', qc: 0.9 },
      { id: 'combles', label: 'Isolation des combles', unit: 'm²', pu: 22.86, lab: 0.45, qm: 'surface_per_level', qc: 1 },
      { id: 'porte', label: 'Porte palière blindée', unit: 'u', pu: 1571.43, lab: 0.3, qm: 'units', qc: 1 },
    ]},
    { lot: 'Extérieurs et toiture', only: ['maison', 'immeuble'], items: [
      { id: 'ravalement', label: 'Ravalement de façade', sub: 'nettoyage, reprise d\'enduit, peinture, échafaudage', unit: 'm²', pu: 60.71, lab: 0.7, qm: 'facade', qc: 1 },
      { id: 'ite', label: 'Isolation par l\'extérieur', sub: 'option au ravalement : isolant, enduit de finition', unit: 'm²', pu: 117.86, lab: 0.55, tva: 5.5, qm: 'facade', qc: 1 },
      { id: 'toit_rep', label: 'Réparation de toiture', sub: 'reprise partielle, tuiles ou ardoises, zinguerie', unit: 'm²', pu: 42.86, lab: 0.75, qm: 'toiture', qc: 0.3 },
      { id: 'toit_neuf', label: 'Réfection complète de toiture', sub: 'dépose, écran, liteaux, couverture, zinguerie', unit: 'm²', pu: 150, lab: 0.6, qm: 'toiture', qc: 1 },
    ] },
    { lot: 'Salle de bain et WC', items: [
      { id: 'sdb', label: 'Salle de bain complète', sub: 'douche à l\'italienne, meuble vasque, faïence, WC · réseau eau et évacuations compris', unit: 'forfait', pu: 5571.43, lab: 0.55, qm: 'units', qc: 1, gammes: { eco: { pu: 3500, marge: 5000 / 1.1 / 3500 - 1 } } },   // éco : 5 000 € TTC
      { id: 'wc', label: 'WC séparé', sub: 'cuvette à poser, lave-mains, faïence · réseau eau et évacuations compris', unit: 'forfait', pu: 1142.86, lab: 0.55, qm: 'eau_minus_units', qc: 1, gammes: { prem: { sub: 'cuvette suspendue, lave-mains, faïence · réseau eau et évacuations compris' } } },   // WC suspendu en premium seulement
    ]},
    { lot: 'Cuisine', items: [
      { id: 'cuis', label: 'Cuisine équipée', sub: 'meubles, plan de travail, électroménager, pose · réseau eau et évacuations compris', unit: 'forfait', pu: 4642.86, lab: 0.3, qm: 'units', qc: 1, gammes: { eco: { pu: 1300, marge: 3500 / 1.1 / 1300 - 1 } } },   // éco : 3 500 € TTC
    ]},
    { lot: 'Sols', items: [
      { id: 'ragr', label: 'Ragréage', unit: 'm²', pu: 10, lab: 0.6, qm: 'surface', qc: 1 },
      { id: 'parq', label: 'Parquet contrecollé', sub: 'pièces de vie et chambres', unit: 'm²', pu: 51.43, lab: 0.45, qm: 'surface', qc: 0.72 },
      { id: 'strat', label: 'Stratifié ou linoléum', sub: 'pièces de vie et chambres', unit: 'm²', pu: 27.14, lab: 0.5, qm: 'surface', qc: 0.72 },
      { id: 'pvc', label: 'Lames PVC', sub: 'pièces de vie et chambres', unit: 'm²', pu: 40, marge: 0.875, lab: 0.45, qm: 'surface', qc: 0.72 },
      { id: 'carr', label: 'Carrelage', sub: 'cuisine, salle de bain, entrée', unit: 'm²', pu: 60.71, lab: 0.55, qm: 'surface', qc: 0.2 },
    ]},
    { lot: 'Peinture et menuiseries intérieures', items: [
      { id: 'peint', label: 'Préparation et peinture', sub: 'murs et plafonds, 2 couches', unit: 'm²', pu: 22.86, lab: 0.75, qm: 'surface', qc: 2.8 },
      { id: 'portes', label: 'Portes intérieures', sub: 'bloc-porte et quincaillerie', unit: 'u', pu: 271.43, lab: 0.45, qm: 'pieces_units', qc: 1 },
      { id: 'placard', label: 'Placards sur mesure', unit: 'ml', pu: 464.29, lab: 0.4, qm: 'units', qc: 2 },
      { id: 'nett', label: 'Nettoyage de fin de chantier', unit: 'forfait', pu: 250, lab: 1, qm: 'units', qc: 1 },
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
    niveaux:          (s, k) => Math.max(1, Math.round((s.niveaux || 1) * k)),
    facade:           (s, k) => Math.round(Math.sqrt(s.surface / Math.max(1, s.niveaux || 1)) * 4 * 2.7 * Math.max(1, s.niveaux || 1) * 0.7 * k),   // périmètre × hauteur, 30 % d'ouvertures
    toiture:          (s, k) => Math.round(s.surface / Math.max(1, s.niveaux || 1) * 1.25 * k),                                               // emprise au sol × pente
  };
  const QTY_MODES = { surface: 'surface × coef.', units: 'logements × coef.', pieces_units: '(pièces + logements) × coef.', eau: 'pièces d\'eau × coef.', eau_units: '(pièces d\'eau + logements) × coef.', eau_minus_units: '(pièces d\'eau − logements) × coef., 1 minimum', units_half: 'logements ÷ 2 arrondi sup. × coef.', surface_per_level: 'surface ÷ niveaux × coef.', fixed: 'quantité fixe', niveaux: 'nombre de niveaux × coef.', facade: 'surface de façade estimée × coef.', toiture: 'surface de toiture estimée × coef.' };
  function qtyFn(mode, coef) { const f = QTY[mode] || QTY.units; const k = (coef == null || coef === '') ? 1 : +coef; return s => f(s, k); }

  // Pourquoi cet ouvrage ? Explications en langage détendu, affichées au survol dans l'étape Travaux.
  const WHY = {
    dep_rev: "On enlève l'ancien avant de poser le neuf : vieux sols, faïence fatiguée, papiers peints d'une autre époque. Sans ça, le beau carrelage neuf se pose sur du bancal.",
    dep_eq: "La cuisine et la salle de bain d'origine partent à la benne. C'est le préalable à toute pièce d'eau refaite, et ça libère la place pour les réseaux.",
    benne: "Tout ce qu'on démonte doit partir quelque part, proprement et légalement. La benne, le transport et la déchetterie sont dedans, personne ne les voit mais tout le monde en a besoin.",
    mur_np: "Ouvrir une cloison pour agrandir un séjour ou relier la cuisine : le geste qui change le plus la sensation d'espace, pour un prix raisonnable.",
    mur_p: "Ouvrir un mur qui porte la maison demande une poutre, un bureau d'études et des mains sûres. Cher, mais parfois c'est ce qui rend le plan possible.",
    cloison: "Créer une pièce, isoler une chambre, fermer un coin bureau : les cloisons redessinent le plan. Indispensable pour une colocation ou un T2 tiré d'un grand T1.",
    plafond: "Un faux plafond cache les réseaux, isole du bruit du dessus et permet des spots encastrés. Utile quand le plafond d'origine est irrécupérable.",
    tableau: "Le minimum vital quand l'installation est saine mais vieillotte : un tableau neuf, la terre, des différentiels. Ça sécurise sans tout refaire. Dans un immeuble, chaque appartement a le sien : chaque locataire coupe chez lui sans plonger l'immeuble dans le noir.",
    elec_app: "Tout ce qu'on touche du doigt : prises, interrupteurs, points lumineux. C'est là que le niveau de finition se voit, et qu'un logement paraît neuf ou fatigué.",
    elec_cab: "Ce qu'on ne voit pas mais qui compte : gaines, câbles et circuits dédiés pour le four, les plaques ou le lave-linge. C'est ce que le diagnostiqueur vérifie en premier.",
    colonne_elec: "Dans un immeuble, l'électricité monte par une colonne commune. Si elle date d'avant votre naissance, on la refait avant de brancher quoi que ce soit.",
    colonne_plomb: "Même logique pour l'eau : une colonne montante neuve évite les fuites entre étages et les dégâts des eaux qui pourrissent une copropriété.",
    ballon: "Un chauffe-eau électrique simple, fiable, pas cher. Le bon choix pour un petit logement ou un budget serré.",
    thermo: "Le chauffe-eau thermodynamique consomme trois fois moins que l'électrique classique. Plus cher à l'achat, gagnant sur la facture et sur le DPE.",
    radia: "Des radiateurs à inertie chauffent doucement et coûtent moins à l'usage que les vieux convecteurs. Vos locataires vous en seront reconnaissants en janvier.",
    chaud: "Une chaudière gaz à condensation, pour les logements déjà raccordés au gaz : efficace, et souvent la solution la moins chère à faire tourner.",
    vmc: "La ventilation évite la buée, les moisissures et l'air lourd. Obligatoire dans le neuf, et franchement recommandée partout où on refait une salle de bain.",
    fen: "Des fenêtres double vitrage : moins de bruit, moins de froid, un DPE qui grimpe. L'un des postes les plus rentables sur la valeur du bien.",
    iti: "Isoler les murs par l'intérieur, c'est perdre quelques centimètres et gagner beaucoup de confort. Le passage obligé pour sortir un logement de la catégorie passoire.",
    combles: "La chaleur s'échappe par le toit. Isoler les combles est l'euro le mieux placé de toute la rénovation énergétique.",
    porte: "Une porte d'entrée neuve : sécurité, isolation, et la première impression du locataire en visite.",
    ravalement: "Une façade propre, c'est un immeuble qui se loue et se revend mieux, et une obligation légale tous les dix ans dans beaucoup de villes.",
    ite: "Isoler par l'extérieur pendant qu'on ravale : même échafaudage, deux résultats. Le DPE fait un bond, et on ne perd pas un centimètre dedans.",
    toit_rep: "Reprendre les tuiles cassées, les faîtages et la zinguerie avant que l'eau ne rentre. Une petite réparation aujourd'hui évite un plafond effondré demain.",
    toit_neuf: "Quand la toiture est en fin de vie, on refait tout : écran, liteaux, couverture. Gros poste, mais tranquillité pour trente ans.",
    sdb: "Douche à l'italienne, meuble vasque, faïence : la pièce qui fait basculer une visite. Une salle de bain propre loue plus vite et plus cher. Le réseau d'eau et les évacuations de la pièce sont refaits dans le même mouvement.",
    wc: "Un WC séparé de la salle de bain est très apprécié, surtout en colocation ou en famille. Petit espace, gros confort. Arrivée d'eau et évacuation comprises.",
    cuis: "Une cuisine équipée avec électroménager : pour un meublé, c'est ce que le locataire paie sans discuter. Et ça photographie bien dans l'annonce. Arrivées d'eau et évacuations de la cuisine comprises.",
    ragr: "Avant un sol neuf, on met l'ancien à niveau. Sans ragréage, le parquet grince et le carrelage se fend.",
    parq: "Du parquet dans les pièces de vie : chaleureux, durable, valorisant. Le contrecollé donne le rendu du massif pour moins cher.",
    strat: "Stratifié ou linoléum : l'aspect du bois ou un sol souple, vite posé et résistant. Le choix malin pour un budget serré ou une location qui tourne beaucoup.",
    pvc: "Les lames PVC clipsables imitent le parquet, ne craignent pas l'eau et s'entretiennent d'un coup de serpillière. Un bon équilibre entre prix, rendu et durée de vie.",
    carr: "Du carrelage dans les pièces humides : cuisine, salle de bain, entrée. Il ne craint ni l'eau ni les années.",
    peint: "Préparation et deux couches de peinture, murs et plafonds : le poste qui transforme visuellement le logement pour le moins cher. On ne s'en passe jamais.",
    portes: "Des portes intérieures neuves, alignées et qui ferment : le détail qui fait sérieux et cohérent avec le reste des finitions.",
    placard: "Des rangements sur mesure : les locataires les cherchent, les annonces les vantent, et ça évite les armoires bancales.",
    nett: "Le chantier finit par un vrai nettoyage, vitres comprises. Vous récupérez un logement prêt à photographier et à louer.",
  };
  // Icônes des lots : trait fin monoligne, sans fond (chemins SVG dans une vue 0 0 32 32)
  const LOT_ICONS = {
    'Démolition et dépose': '<path d="M6 24h12v4H6zM22 6l4 4-11 11-4-4zM11 17l-3 7 7-3M4 12h5M6 9h3"/>',
    'Gros œuvre et cloisons': '<path d="M4 10h24v16H4zM4 16h24M4 22h24M12 10v6M20 16v6M12 22v4M20 10v6"/>',
    'Électricité': '<path d="M18 3 8 18h7l-2 11 11-16h-7z"/>',
    'Parties communes et réseaux': '<path d="M10 4h12v24H10zM16 4v24M10 12h12M10 20h12M4 12h6M22 12h6M4 20h6M22 20h6"/>',
    'Plomberie et chauffage': '<path d="M6 14h10v6H6zM16 17h6a4 4 0 0 1 4 4v6M3 14v6M11 10c0-3 5-3 5 0M13 8V5M26 27l-1.5 2-1.5-2a1.5 1.5 0 0 1 3 0z"/>',
    'Isolation et menuiseries extérieures': '<path d="M4 8h24v16H4zM10 8v16M22 8v16M10 16h12M14 4c1 1 1 2 0 3M18 4c1 1 1 2 0 3"/>',
    'Extérieurs et toiture': '<path d="M3 15 16 4l13 11M6 14v14h20V14M13 28v-8h6v8M22 8V4h3v6"/>',
    'Salle de bain et WC': '<path d="M4 16h24v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM7 16V7a3 3 0 0 1 6 0M13 7h-2M9 27v2M23 27v2"/>',
    'Cuisine': '<path d="M4 14h24v12H4zM4 20h24M16 14v12M10 10a3 3 0 0 1 6 0M12 6v2M22 6v6"/><circle cx="9" cy="17" r="1.2"/><circle cx="23" cy="17" r="1.2"/>',
    'Sols': '<path d="M4 8h24v16H4zM4 16h24M12 8v8M20 16v8M20 8v8M12 16v8"/>',
    'Peinture et menuiseries intérieures': '<path d="M5 6h16v7H5zM21 9h5v6h-9v4M15 19h3v9h-3z"/>',
  };
  const lotIcon = (lot, cls) => LOT_ICONS[lot] ? `<svg class="loticon${cls ? ' ' + cls : ''}" viewBox="0 0 32 32" aria-hidden="true">${LOT_ICONS[lot]}</svg>` : '';
  const ITEMS = {};
  CATALOG.forEach(l => l.items.forEach(i => { i.lotName = l.lot; if (l.only && !i.only) i.only = l.only; i.qty = qtyFn(i.qm, i.qc); ITEMS[i.id] = i; }));

  // Règles complémentaires de sélection, appliquées dans l'ordre après la liste de l'état général.
  // when : toutes les conditions doivent être vraies. Champs : kind, etat, dpe, annee, surface, eau, zone, gamme, strat.
  const RULES = [
    { id: 'dpe_fg', label: 'Passoire thermique (DPE F ou G)', when: [{ f: 'dpe', op: 'in', v: 'F,G' }], add: ['fen', 'iti'], remove: [] },
    { id: 'avant_1975', label: 'Bâti antérieur à 1975 (époques « avant 1948 » et « 1948 à 1974 »), sans isolation d\'origine', when: [{ f: 'annee', op: 'lt', v: '1975' }], add: ['iti', 'fen'], remove: [] },
    { id: 'maison_total', label: 'Maison à rénover entièrement', when: [{ f: 'kind', op: 'eq', v: 'maison' }, { f: 'etat', op: 'eq', v: 'total' }], add: ['combles'], remove: [] },
    { id: 'maison_fg', label: 'Maison en passoire thermique', when: [{ f: 'kind', op: 'eq', v: 'maison' }, { f: 'dpe', op: 'in', v: 'F,G' }], add: ['combles'], remove: [] },
    { id: 'immeuble_elec', label: 'Immeuble : électricité complète, un tableau par appartement', when: [{ f: 'kind', op: 'eq', v: 'immeuble' }], add: ['tableau', 'elec_app', 'elec_cab'], remove: [] },
    { id: 'immeuble_colonnes', label: 'Immeuble dégradé ou à rénover : colonnes montantes', when: [{ f: 'kind', op: 'eq', v: 'immeuble' }, { f: 'etat', op: 'in', v: 'degrade,total' }], add: ['colonne_elec', 'colonne_plomb'], remove: [] },
    { id: 'ext_total', label: 'Maison ou immeuble à rénover entièrement : ravalement et reprise de toiture', when: [{ f: 'kind', op: 'in', v: 'maison,immeuble' }, { f: 'etat', op: 'eq', v: 'total' }], add: ['ravalement', 'toit_rep'], remove: [] },
    { id: 'coloc', label: 'Colocation : cloisons et salle d\'eau supplémentaire', when: [{ f: 'strat', op: 'eq', v: 'coloc' }], add: ['cloison', 'sdb'], remove: [] },
  ];
  const RULE_FIELDS = { kind: 'Type de bien', etat: 'État général', dpe: 'DPE', annee: 'Année de construction', surface: 'Surface', eau: 'Pièces d\'eau', zone: 'Zone de prix', gamme: 'Finition', strat: 'Stratégie locative' };
  const RULE_OPS = { eq: 'est', ne: 'n\'est pas', in: 'est parmi', lt: 'est inférieur à', gt: 'est supérieur à' };

  // Ouvrages proposés d'office selon l'état général déclaré. Le prospect ajuste ensuite ligne à ligne.
  const PRESET = {
    bon:     ['peint', 'tableau', 'nett'],
    correct: ['dep_rev', 'benne', 'tableau', 'sdb', 'cuis', 'ragr', 'parq', 'carr', 'peint', 'vmc', 'nett'],
    degrade: ['dep_rev', 'dep_eq', 'benne', 'tableau', 'elec_app', 'elec_cab', 'ballon', 'radia', 'vmc', 'sdb', 'wc', 'cuis', 'ragr', 'parq', 'carr', 'peint', 'portes', 'nett'],
    total:   ['dep_rev', 'dep_eq', 'benne', 'cloison', 'tableau', 'elec_app', 'elec_cab', 'ballon', 'radia', 'vmc', 'fen', 'sdb', 'wc', 'cuis', 'ragr', 'parq', 'carr', 'peint', 'portes', 'nett'],
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
    CATALOG, ITEMS, WHY, LOT_ICONS, lotIcon, PRESET, RULES, RULE_FIELDS, RULE_OPS, QTY, QTY_MODES, qtyFn, REGION, GAMME, PIECES, EAU_DEFAULT, zoneFromAddress,
    // Frais généraux, pilotage et aléas sont à zéro depuis le 29/09/2026.
    // Ils restent réglables dans le back-office (onglet Prix). Valeurs d'origine : marge 18 %, pilotage 3 %, frais généraux 8 %, aléas 100 %.
    // Depuis le 30/09/2026 : les prix du catalogue sont des COÛTS et la marge s'ajoute au coût.
    // Prix de vente d'une ligne = coût × (1 + marge). Marge par défaut 40 % : coût = ancien prix ÷ 1,4.
    MARGE: 0.40,      // marge ajoutée au coût (0,40 = +40 %, 1 = prix doublé)
    PILOTAGE: 0,      // pilotage de chantier, sur les coûts directs
    FG: 0,            // frais généraux, sur les coûts directs
    ALEA: 0,          // part appliquée de la provision pour aléas calculée (0 = aucune, 1 = entière)
    NOTAIRE: 0.075,   // frais d'acquisition dans l'ancien
    AMEUBLEMENT: { nue: 0, meuble: 120, coloc: 150, revente: 0 }, // €/m²
    LOYER_M2: { nue: 13, meuble: 16, coloc: 20, revente: 0 },      // repère national, ajusté par zone ci-dessous
    // Prix d'achat d'un bien à rénover, € par m² habitable, par zone de prix (repères septembre 2026)
    PRIX_M2: { paris: 8600, pc: 5300, gc: 3500, lyon: 4000, metro: 2800, moy: 1900, rural: 1250 },
    // Loyer nu, € par m² et par mois, par zone ; meublé et colocation appliquent un multiplicateur
    LOYER_M2_ZONE: { paris: 33, pc: 25, gc: 19, lyon: 18, metro: 15, moy: 12.5, rural: 10 },
    LOYER_STRAT: { nue: 1, meuble: 1.15, coloc: 1.3, revente: 0 },
    // Décote du prix selon l'état général déclaré
    PRIX_ETAT: { bon: 1, correct: 0.94, degrade: 0.85, total: 0.76, '': 0.9 },
  });
})(window);

/* Ouvrages insensibles à la finition : leur part hors main-d'œuvre est de la location, du transport ou des frais,
   pas un matériau dont la gamme change. Réglable ouvrage par ouvrage dans le back-office. */
(function () {
  var C = (typeof window !== 'undefined' ? window : globalThis).COTALIA; if (!C || !C.ITEMS) return;
  ['dep_rev', 'dep_eq', 'benne', 'mur_np', 'mur_p', 'ragr', 'nett', 'colonne_elec', 'colonne_plomb', 'elec_cab'].forEach(function (id) { if (C.ITEMS[id]) C.ITEMS[id].nofin = true; });
  /* Ouvrages qui dépendent de la finition. Sol des pièces de vie : stratifié ou linoléum en économique, lames PVC en standard, parquet contrecollé en premium.
     Dans les ouvrages proposés par état, « parq » désigne ce sol : il est remplacé par celui de la finition choisie (standard tant qu'elle n'est pas choisie). */
  C.GAMME_ALT = [{ eco: 'strat', std: 'pvc', prem: 'parq' }];
  C.applySwaps = function (works, S) {
    var g = S.gamme || 'std';
    (C.GAMME_ALT || []).forEach(function (alt) {
      var to = alt[g], it = C.ITEMS[to]; if (!it || it.inactive) return;
      var others = Object.keys(alt).map(function (k) { return alt[k]; }).filter(function (id) { return id !== to && works[id]; });
      if (!others.length) return;
      others.forEach(function (id) { delete works[id]; }); works[to] = 1;
    });
    return works;
  };
  // précision affichée d'un ouvrage : celle de la finition si elle existe, sinon la précision générale
  C.subOf = function (it, gamme) { var g = it.gammes && it.gammes[gamme || 'std']; return (g && g.sub) || it.sub || ''; };
  /* Anciens ouvrages remplacés : une estimation enregistrée avant le découpage garde son contenu. */
  C.LEGACY_WORKS = { elec: ['tableau', 'elec_app', 'elec_cab'], plomb: [], tableaux_apt: ['tableau'] };   // plomb : ligne retirée, comprise dans salle de bain, WC et cuisine
  C.normIds = function (ids) { var out = []; (ids || []).forEach(function (id) { (C.LEGACY_WORKS[id] || [id]).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); }); }); return out; };
  C.normWorks = function (works) {
    var w = Object.assign({}, works || {});
    Object.keys(C.LEGACY_WORKS).forEach(function (old) { if (old in w) { if (w[old]) C.LEGACY_WORKS[old].forEach(function (id) { w[id] = true; }); delete w[old]; } });
    return w;
  };
  C.normQty = function (qty) {
    var q = Object.assign({}, qty || {});
    if (q.elec != null) { if (q.elec_app == null) q.elec_app = q.elec; if (q.elec_cab == null) q.elec_cab = q.elec; delete q.elec; }
    return q;
  };
})();
