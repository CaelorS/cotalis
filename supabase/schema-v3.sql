-- Cotalia · schéma v3 : ouvrages créés depuis le back-office.
alter table public.pricing_items add column if not exists custom boolean not null default false;
alter table public.pricing_items add column if not exists qty_mode text;      -- surface | units | pieces | eau | fixed
alter table public.pricing_items add column if not exists qty_coef numeric;   -- multiplicateur, ou quantité fixe
alter table public.pricing_items add column if not exists presets text[];     -- états généraux qui proposent l'ouvrage d'office : bon, correct, degrade, total
alter table public.pricing_items add column if not exists sort_order int default 0;
