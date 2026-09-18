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
    { lot: 'Parties communes et réseaux', only: ['immeuble'], items: [
      { id: 'colonne_elec', label: 'Colonne montante électrique', sub: 'gaine, câbles, coupe-circuits par niveau', unit: 'niveau', pu: 1900, lab: 0.65, qm: 'niveaux', qc: 1 },
      { id: 'colonne_plomb', label: 'Colonne montante plomberie', sub: 'eau froide, eau chaude, évacuation par niveau', unit: 'niveau', pu: 1700, lab: 0.7, qm: 'niveaux', qc: 1 },
      { id: 'tableaux_apt', label: 'Tableau électrique par appartement', sub: 'tableau divisionnaire, différentiels, terre', unit: 'u', pu: 950, lab: 0.55, qm: 'units', qc: 1 },
    ] },
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
    { lot: 'Extérieurs et toiture', only: ['maison', 'immeuble'], items: [
      { id: 'ravalement', label: 'Ravalement de façade', sub: 'nettoyage, reprise d\'enduit, peinture, échafaudage', unit: 'm²', pu: 85, lab: 0.7, qm: 'facade', qc: 1 },
      { id: 'ite', label: 'Isolation par l\'extérieur', sub: 'option au ravalement : isolant, enduit de finition', unit: 'm²', pu: 165, lab: 0.55, tva: 5.5, qm: 'facade', qc: 1 },
      { id: 'toit_rep', label: 'Réparation de toiture', sub: 'reprise partielle, tuiles ou ardoises, zinguerie', unit: 'm²', pu: 60, lab: 0.75, qm: 'toiture', qc: 0.3 },
      { id: 'toit_neuf', label: 'Réfection complète de toiture', sub: 'dépose, écran, liteaux, couverture, zinguerie', unit: 'm²', pu: 210, lab: 0.6, qm: 'toiture', qc: 1 },
    ] },
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
    elec: "Tableau, circuits, prises, luminaires : tout à neuf, aux normes. C'est ce que l'assureur, le locataire et le diagnostiqueur regardent en premier.",
    tableau: "Le minimum vital quand l'installation est saine mais vieillotte : un tableau neuf, la terre, des différentiels. Ça sécurise sans tout refaire.",
    colonne_elec: "Dans un immeuble, l'électricité monte par une colonne commune. Si elle date d'avant votre naissance, on la refait avant de brancher quoi que ce soit.",
    colonne_plomb: "Même logique pour l'eau : une colonne montante neuve évite les fuites entre étages et les dégâts des eaux qui pourrissent une copropriété.",
    tableaux_apt: "Un tableau par appartement, avec ses propres protections. Chaque locataire coupe chez lui sans plonger l'immeuble dans le noir.",
    plomb: "Réseaux d'eau et d'évacuation refaits : fini les tuyaux en plomb, les fuites lentes et les pressions bizarres. On le fait pendant que les murs sont ouverts.",
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
    sdb: "Douche à l'italienne, meuble vasque, faïence : la pièce qui fait basculer une visite. Une salle de bain propre loue plus vite et plus cher.",
    wc: "Un WC séparé de la salle de bain est très apprécié, surtout en colocation ou en famille. Petit espace, gros confort.",
    cuis: "Une cuisine équipée avec électroménager : pour un meublé, c'est ce que le locataire paie sans discuter. Et ça photographie bien dans l'annonce.",
    ragr: "Avant un sol neuf, on met l'ancien à niveau. Sans ragréage, le parquet grince et le carrelage se fend.",
    parq: "Du parquet dans les pièces de vie : chaleureux, durable, valorisant. Le contrecollé donne le rendu du massif pour moins cher.",
    strat: "Le stratifié imite le bois, se pose vite et résiste bien. Le choix malin pour un budget serré ou une location qui tourne beaucoup.",
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
    { id: 'immeuble_elec', label: 'Immeuble : conformité électrique complète et tableaux par appartement', when: [{ f: 'kind', op: 'eq', v: 'immeuble' }], add: ['elec', 'tableaux_apt'], remove: ['tableau'] },
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
    CATALOG, ITEMS, WHY, LOT_ICONS, lotIcon, PRESET, RULES, RULE_FIELDS, RULE_OPS, QTY, QTY_MODES, qtyFn, REGION, GAMME, PIECES, EAU_DEFAULT, zoneFromAddress,
    MARGE: 0.18,      // marge brute sur le prix HT hors aléas
    PILOTAGE: 0.03,   // pilotage de chantier, sur les coûts directs
    FG: 0.08,         // frais généraux, sur les coûts directs
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
