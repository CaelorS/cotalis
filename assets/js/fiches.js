/* Cotalia - fiches matériaux et équipements par finition, illustrées dans le rapport et le PDF.
   Chaque fiche n'apparaît que si l'un des ouvrages listés dans works est retenu. Images dans /assets/img/gammes/. */
(function () {
  'use strict';
  var C = window.COTALIA = window.COTALIA || {};
  var W = { cuisine: ['cuis'], vasque: ['sdb'], douche: ['sdb'], sol: ['strat', 'pvc', 'parq'], mur: ['sdb', 'wc', 'cuis', 'carr'], eau: ['ballon', 'thermo'], peinture: ['peint'] };
  function f(key, title, intro, pts) { return { key: key, works: W[key], title: title, intro: intro, pts: pts }; }
  C.FICHES = {
    eco: [
      f('cuisine', 'Kitchenette compacte', 'Module blanc pour kitchenette de studio ou petit logement.', ['Caissons bas en mélaminé blanc, configuration compacte.', 'Encombrement indicatif : 120 × 60 cm.', 'Plan inox avec évier, égouttoir et deux foyers électriques.']),
      f('vasque', 'Meuble vasque et miroir', 'Ensemble de salle d\'eau compact à finition blanche.', ['Meuble à deux tiroirs, largeur indicative de 60 cm.', 'Miroir rond et vasque assortis.', 'Robinetterie et accessoires compatibles.']),
      f('douche', 'Cabine de douche d\'angle', 'Ensemble vitré avec receveur blanc, adapté aux petites salles de bain.', ['Configuration d\'angle pour optimiser l\'espace.', 'Cabine vitrée et receveur blanc.', 'Dimensions adaptées au projet après relevé.']),
      f('sol', 'Sol stratifié', 'Revêtement de sol clipsable à décor bois naturel.', ['Épaisseur indicative : 10 mm, lames d\'environ 138 × 19 cm.', 'Pose flottante clipsée sur support préparé, avec sous-couche.', 'Profils de finition et jeux périphériques compris.']),
      f('mur', 'Carreau mural', 'Revêtement mural céramique blanc cassé, finition légèrement texturée.', ['Format indicatif : 20 × 60 cm.', 'Pour les murs de cuisine et de salle de bain.', 'Pose collée avec joints adaptés à la zone.']),
      f('eau', 'Chauffe-eau électrique', 'Appareil mural vertical à résistance blindée, finition blanche.', ['Capacité indicative : 100 litres, pose verticale.', 'Capacité ajustée au nombre d\'occupants.', 'Groupe de sécurité et raccordements compris.']),
      f('peinture', 'Peinture velours', 'Peinture alkyde à aspect velours pour murs et menuiseries compatibles.', ['Finition velours, teinte à définir au nuancier du projet.', 'Primaire et système choisis selon le support.', 'Fonds préparés, deux couches.']),
    ],
    std: [
      f('cuisine', 'Cuisine équipée', 'Cuisine en kit aux lignes sobres, adaptée à un logement locatif.', ['Façades blanc mat et décor bois clair.', 'Linéaire indicatif d\'environ 2,40 m : meubles hauts et bas, plan de travail, crédence.', 'Évier, robinetterie et électroménager selon le lot retenu.']),
      f('vasque', 'Meuble vasque et rangement miroir', 'Ensemble de salle de bain contemporain avec meuble foncé et miroir de rangement.', ['Meuble suspendu avec vasque et tiroirs.', 'Façade gris foncé et plan vasque clair.', 'Miroir de rangement avec éclairage intégré.']),
      f('douche', 'Douche à l\'italienne', 'Ensemble complet comprenant receveur, paroi vitrée et robinetterie.', ['Receveur adapté aux dimensions de la pièce.', 'Paroi vitrée nervurée, format indicatif 80 × 200 cm.', 'Mitigeur, colonne ou kit douche et douchette.']),
      f('sol', 'Lames de sol PVC', 'Revêtement de sol PVC à assemblage clipsé, décor bois.', ['Épaisseur annoncée : 4 + 1 mm.', 'Aspect bois clair pour pièces de vie et chambres.', 'Pose clipsée sur support stable, propre, sec et plan.']),
      f('mur', 'Carreau mural effet marbre', 'Carreau mural brillant, effet marbre blanc veiné de touches dorées.', ['Format indicatif : 60 × 120 cm, épaisseur 9,4 mm.', 'Finition brillante pour murs de cuisine et de salle de bain.', 'Pose collée avec mortier-colle et joints adaptés.']),
      f('eau', 'Chauffe-eau électrique', 'Appareil mural vertical à résistance blindée, finition blanche.', ['Capacité indicative : 100 litres, pose verticale.', 'Capacité ajustée au nombre d\'occupants.', 'Groupe de sécurité et raccordements compris.']),
      f('peinture', 'Peinture velours', 'Peinture alkyde à aspect velours pour murs et menuiseries compatibles.', ['Finition velours, teinte à définir au nuancier du projet.', 'Primaire et système choisis selon le support.', 'Fonds préparés, deux couches.']),
    ],
    prem: [
      f('cuisine', 'Cuisine intégrée', 'Composition de cuisine contemporaine aux façades sombres et aux lignes épurées.', ['Façades noir mat, rangements hauts et bas intégrés.', 'Plan de travail et crédence assortis.', 'Évier et robinetterie coordonnés, four et appareil de cuisson intégrés.']),
      f('vasque', 'Meuble double vasque', 'Ensemble de salle de bain avec meuble suspendu, rangements et finitions décor bois.', ['Meuble à double vasque, façades texturées effet bois.', 'Deux vasques et robinetteries adaptées.', 'Miroir central et colonnes latérales de rangement.']),
      f('douche', 'Douche avec cabine intégrale', 'Cabine de douche avec profilés noirs, vitrage traité et fermeture amortie.', ['Largeur réglable 100 à 160 cm, profondeur 80 cm, hauteur 195 cm.', 'Profilés noir mat et vitrage anti-calcaire.', 'Portes à fermeture douce.']),
      f('sol', 'Parquet contrecollé', 'Parquet en chêne clair, finition vernie, pour un rendu naturel.', ['Lames de largeur indicative 110 mm.', 'Parement en chêne clair verni.', 'Pose flottante ou collée selon le support, sous-couche et jeux périphériques compris.']),
      f('mur', 'Carrelage effet marbre', 'Grès cérame rectifié grand format, effet marbre blanc veiné.', ['Format indicatif : 60 × 120 cm.', 'Finition brillante, pour sols et murs intérieurs.', 'Bords rectifiés pour des joints fins.']),
      f('eau', 'Chauffe-eau plat électrique', 'Appareil mural à faible profondeur pour la production d\'eau chaude.', ['Capacité indicative : 200 litres.', 'Format plat pour limiter l\'emprise dans le logement.', 'Groupe de sécurité et raccordements compris.']),
      f('peinture', 'Peinture velours', 'Peinture alkyde à aspect velours pour murs et menuiseries compatibles.', ['Finition velours, teinte à définir au nuancier du projet.', 'Primaire et système choisis selon le support.', 'Fonds préparés, deux couches.']),
    ],
  };
  // fiches à montrer pour une estimation : celles de la finition choisie dont un ouvrage est retenu
  C.fichesFor = function (S) {
    var g = S.gamme || 'std', works = S.works || {};
    return (C.FICHES[g] || []).filter(function (fi) { return fi.works.some(function (id) { return works[id] && C.ITEMS[id] && !C.ITEMS[id].inactive; }); })
      .map(function (fi) { return Object.assign({ img: '/assets/img/gammes/' + g + '-' + fi.key + '.jpg' }, fi); });
  };
})();
