-- Cotalia v13 : la marge s'ajoute au coût (prix de vente = coût × (1 + marge)), 40 % par défaut.
-- Rejouable : chaque ligne vérifie l'ancienne valeur.
insert into public.pricing_settings (key, value, updated_at) values ('MARGE_COUT', '0.4'::jsonb, now()) on conflict (key) do nothing;
-- deux prix saisis comme prix de vente (84 et 40 €/m²) : leur coût est recalculé pour que le prix de vente ne bouge pas
update public.pricing_items set pu = 60, updated_at = now() where id = 'elec_cab' and pu = 50.4 and marge is null;
update public.pricing_items set pu = 28.57, updated_at = now() where id = 'elec_app' and pu = 24 and marge is null;
-- deux marges saisies à 100 % avaient été plafonnées à 95 % par l'ancien calcul
update public.pricing_items set marge = 1, updated_at = now() where id in ('plafond', 'ragr') and marge = 0.95;
