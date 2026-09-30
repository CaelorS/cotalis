-- Cotalia v12 : la grille de prix passe en coûts, avec une marge de 40 % sur le prix de vente (coût = ancien prix × 0,6).
-- Conversion des trois prix qui avaient été modifiés dans le back-office. Exécutée le 30/09/2026.
-- Chaque ligne vérifie l'ancienne valeur : la rejouer ne change rien.
update public.pricing_items set pu = 50.4, updated_at = now() where id = 'elec_cab' and pu = 84;
update public.pricing_items set pu = 24.0, updated_at = now() where id = 'elec_app' and pu = 40;
update public.pricing_items set pu = 600.0, updated_at = now() where id = 'ballon' and pu = 1000;
