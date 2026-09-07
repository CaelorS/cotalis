/* Cotalis - moteur de chiffrage déterministe.
   Montant ouvrage HT = quantité × prix de référence × (part MO × coef. région × coef. complexité + part matériaux × coef. gamme). */
(function (root) {
  'use strict';
  const C = root.COTALIS;

  function ctxOf(S) {
    const units = S.kind === 'immeuble' ? Math.max(1, S.apts.length) : 1;
    let pieces, eau;
    if (S.kind === 'immeuble') {
      pieces = S.apts.reduce((n, a) => n + (C.PIECES[a.type] || 2), 0);
      eau = +S.eau || S.apts.reduce((n, a) => n + (C.EAU_DEFAULT[a.type] || 1), 0);
    } else {
      pieces = C.PIECES[S.type] || 3;
      eau = +S.eau || 1;
    }
    return { surface: +S.surface || 0, pieces, eau, units, niveaux: S.kind === 'immeuble' ? (+S.niveaux || 1) : (S.kind === 'maison' ? 2 : 1) };
  }

  function complexity(S) {
    const parts = []; let c = 1;
    if (S.kind === 'appart' && !S.ascenseur && +S.etage >= 2) { const p = Math.min(0.10, 0.02 * (+S.etage - 1)); c += p; parts.push('étage sans ascenseur +' + Math.round(p * 100) + ' %'); }
    if (S.kind === 'immeuble' && !S.ascenseur && +S.niveaux >= 3) { c += 0.04; parts.push('niveaux sans ascenseur +4 %'); }
    if (S.annee && +S.annee < 1949) { c += 0.06; parts.push('bâti ancien +6 %'); }
    if (S.occupe) { c += 0.05; parts.push('logement occupé +5 %'); }
    if (S.acces) { c += 0.04; parts.push('accès difficile +4 %'); }
    return { c, parts };
  }

  function isAncien(S) { return !S.annee || +S.annee <= 2024; }

  function compute(S) {
    const ctx = ctxOf(S);
    const cReg = C.REGION[S.zone] ? C.REGION[S.zone][0] : 0.97;
    const cGamme = C.GAMME[S.gamme] ? C.GAMME[S.gamme][0] : 1;
    const cx = complexity(S);

    const lines = [], lots = {};
    let direct = 0, direct55 = 0, labor = 0;
    C.CATALOG.forEach(l => l.items.forEach(it => {
      const on = !!S.works[it.id];
      const q = S.qty[it.id] != null ? +S.qty[it.id] : it.qty(ctx);
      const unitPrice = it.pu * (it.lab * cReg * cx.c + (1 - it.lab) * cGamme);
      const amount = on ? q * unitPrice : 0;
      lines.push({ it, on, q, unitPrice, amount });
      if (on && amount > 0) {
        direct += amount; labor += amount * it.lab;
        if (it.tva === 5.5) direct55 += amount;
        lots[it.lotName] = (lots[it.lotName] || 0) + amount;
      }
    }));

    let score = 25;
    if (ctx.surface > 0) score += 15;
    if (S.annee) score += 10;
    if (S.dpe) score += 10;
    if (S.etat) score += 10;
    if (S.plans) score += 10;
    if (S.visite) score += 20;
    score = Math.min(100, score);

    const alea = 0.05 + (100 - score) / 100 * 0.10 + (S.etat === 'degrade' || S.etat === 'total' ? 0.02 : 0);
    const spread = 0.03 + (100 - score) / 100 * 0.15;
    const fg = direct * (C.FG + C.PILOTAGE);
    const base = direct + fg;
    const htSans = base / (1 - C.MARGE);
    const marge = htSans - base;
    const aleaAmt = htSans * alea;
    const ht = htSans + aleaAmt;
    const share55 = direct ? direct55 / direct : 0;
    const ancien = isAncien(S);
    const tvaRate = ancien ? (share55 * 0.055 + (1 - share55) * 0.10) : 0.20;
    const tva = ht * tvaRate;
    const ttc = ht + tva;
    const low = htSans * (1 - spread) * (1 + tvaRate);
    const high = ht * (1 + spread) * (1 + tvaRate);
    const manDays = labor * cReg * cx.c / 420;
    const weeks = direct ? Math.ceil(manDays / (2.4 * Math.sqrt(ctx.units)) / 5) + 1 + (S.works.mur_p ? 5 : 0) : 0;

    const R = { ctx, cReg, cGamme, cCx: cx.c, cxParts: cx.parts, lines, lots, direct, fg, marge, alea, aleaAmt, htSans, ht, tvaRate, tva, ttc, low, high, spread, score, weeks, share55, ancien };

    if (S.finance === 'oui') {
      const prix = +S.prix || 0;
      const notaire = prix * C.NOTAIRE;
      const meubles = (C.AMEUBLEMENT[S.strat] || 0) * ctx.surface;
      const total = prix + notaire + ttc + meubles;
      const apport = total * (+S.apport || 0) / 100;
      const emprunt = total - apport;
      const r = (+S.taux || 0) / 100 / 12, n = (+S.duree || 20) * 12;
      const mens = r ? emprunt * r / (1 - Math.pow(1 + r, -n)) : emprunt / n;
      const loyer = +S.loyer || 0;
      const loyerNet = loyer * (1 - (+S.vacance || 0) / 100);
      const charges = +S.charges || 0;
      Object.assign(R, {
        prix, notaire, meubles, total, apport, emprunt, mens, loyer, loyerNet, charges,
        brut: total ? loyer * 12 / total : 0,
        net: total ? (loyerNet * 12 - charges) / total : 0,
        cf: loyerNet - mens - charges / 12,
        effort: loyer ? mens / loyer : 0,
      });
      const sit = S.situation || {};
      const revenus = +sit.revenus || 0;
      if (revenus) {
        // Taux d'endettement indicatif après projet : 70 % des loyers retenus, convention bancaire courante.
        R.endettement = ((+sit.credits || 0) + mens - 0.7 * loyer) / revenus;
      }
    }
    return R;
  }

  function preselect(S) {
    const base = C.PRESET[S.etat] || C.PRESET.correct;
    const set = new Set(base);
    if (S.dpe === 'F' || S.dpe === 'G') { set.add('fen'); set.add('iti'); }
    if (S.kind === 'maison' && (S.etat === 'total' || S.dpe === 'F' || S.dpe === 'G')) set.add('combles');
    if (S.kind === 'immeuble') { set.delete('tableau'); set.add('elec'); }
    const works = {};
    set.forEach(id => { works[id] = 1; });
    return works;
  }

  function alerts(S, R) {
    const A = [], w = S.works, an = +S.annee;
    const fmt = v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    if (!R.ctx.surface) A.push(['crit', 'Surface manquante', 'Sans surface habitable, aucune quantité ne peut être proposée.']);
    if ((S.dpe === 'F' || S.dpe === 'G') && !(w.iti || w.fen || w.combles)) A.push(['crit', 'Passoire thermique sans travaux énergétiques', 'Classe ' + S.dpe + ' : location interdite ' + (S.dpe === 'G' ? 'depuis le 1ᵉʳ janvier 2025' : 'à partir de 2028') + '. Ajoutez l\'isolation ou les menuiseries pour une mise en location durable.']);
    else if (S.dpe === 'F' || S.dpe === 'G') A.push(['warn', 'Objectif DPE à vérifier', 'Classe ' + S.dpe + ' au départ : un audit énergétique confirmera que les ouvrages retenus font sortir le logement du statut de passoire.']);
    if (an && an < 1997) A.push(['warn', 'Diagnostic amiante avant travaux', 'Immeuble antérieur à juillet 1997 : le repérage amiante avant travaux est obligatoire et n\'est pas compris. Un désamiantage, s\'il est nécessaire, se chiffre à part.']);
    if (an && an < 1949) A.push(['warn', 'Plomb dans les peintures', 'Bâti antérieur à 1949 : diagnostic plomb (CREP) à prévoir avant décapage ou dépose des revêtements.']);
    if (w.sdb && !w.plomb) A.push(['warn', 'Salle de bain sans reprise du réseau', 'Dans l\'ancien, les évacuations en plomb ou en fonte sont souvent à remplacer. Ajoutez « Réseau eau et évacuations à neuf » si leur état est inconnu.']);
    if (w.cuis && !w.elec && !w.tableau) A.push(['warn', 'Cuisine neuve sans électricité', 'Four, plaques et lave-vaisselle exigent des circuits spécialisés : une mise en sécurité ou en conformité est presque toujours nécessaire.']);
    if (w.mur_p) A.push(['warn', 'Mur porteur', 'Étude structure, accord de la copropriété et bureau de contrôle : 4 à 8 semaines de délai supplémentaire, déjà ajoutées à la durée.']);
    if (S.copro && w.fen) A.push(['info', 'Fenêtres en copropriété', 'Le remplacement doit respecter le cahier des charges des façades ou obtenir un vote en assemblée générale.']);
    if (S.kind === 'appart' && !S.ascenseur && +S.etage >= 2) A.push(['info', 'Logistique sans ascenseur', fmt(+S.etage) + 'ᵉ étage sans ascenseur : monte-matériaux ou portage manuel, majoration incluse dans le coefficient de complexité.']);
    if (w.parq && w.strat) A.push(['warn', 'Deux revêtements sur la même surface', 'Parquet et stratifié sont tous deux retenus : corrigez les quantités pour éviter un double compte.']);
    if (w.ballon && w.thermo) A.push(['warn', 'Deux chauffe-eau', 'Chauffe-eau électrique et thermodynamique sont retenus ensemble. Un seul est nécessaire.']);
    if (w.elec && w.tableau) A.push(['warn', 'Électricité comptée deux fois', 'La mise en conformité complète comprend déjà le tableau. Retirez « Mise en sécurité seule ».']);
    if (R.share55 > 0 && R.ancien) A.push(['good', 'TVA réduite appliquée', Math.round(R.share55 * 100) + ' % des coûts directs relèvent de l\'amélioration énergétique à 5,5 %. Une attestation simplifiée signée sera demandée avec le devis.']);
    if (!S.visite) A.push(['info', 'Score de confiance plafonné', 'Sans visite technique, la fourchette reste large. La visite fait passer le score au maximum et ouvre la voie au devis contractuel.']);
    if (S.finance === 'oui' && S.strat !== 'revente') {
      if (['paris', 'lyon', 'pc'].includes(S.zone) && R.ctx.surface && R.loyer / R.ctx.surface > 22) A.push(['warn', 'Encadrement des loyers', 'Loyer visé de ' + (R.loyer / R.ctx.surface).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' €/m² : Paris, Lyon, Villeurbanne et plusieurs communes de petite couronne encadrent les loyers. Vérifiez le plafond du secteur.']);
      if (R.cf < 0) A.push(['info', 'Effort d\'épargne', 'Cash-flow négatif de ' + fmt(Math.abs(R.cf)) + ' € par mois avec ' + fmt(+S.apport) + ' % d\'apport. Un apport plus élevé, une durée plus longue ou une autre stratégie locative changent la donne.']);
      if (R.endettement != null && R.endettement > 0.35) A.push(['warn', 'Endettement au-dessus de 35 %', 'Taux d\'endettement indicatif de ' + Math.round(R.endettement * 100) + ' % après projet, loyers retenus à 70 %. Nos financeurs regarderont l\'apport, le reste à vivre et le différé.']);
      if (S.strat === 'coloc' && R.ctx.pieces < 3) A.push(['warn', 'Colocation sur une petite typologie', 'Moins de trois pièces principales : le loyer de colocation visé est peut-être optimiste.']);
    }
    const order = { crit: 0, warn: 1, info: 2, good: 3 };
    A.sort((a, b) => order[a[0]] - order[b[0]]);
    return A;
  }

  root.COTALIS = Object.assign(root.COTALIS, { compute, preselect, alerts, ctxOf, isAncien });
})(window);
