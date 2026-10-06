-- Cotalia v15 : l'ouverture de mur porteur passe de l'unité au mètre linéaire (remarque de Sandrine, 06/10/2026).
-- Le prix enregistré (2 880 € de coût le forfait) devient 960 € par ml, avec 3 ml proposés d'office : même total pour l'ouverture type.
update public.pricing_items
   set unit = 'ml', pu = 960, qty_coef = 3, sub = 'IPN, étude structure incluse · au mètre linéaire d''ouverture', updated_at = now()
 where id = 'mur_p' and unit = 'u' and pu = 2880;
