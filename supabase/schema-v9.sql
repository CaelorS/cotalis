-- Cotalia v9 : ouvrages insensibles au niveau de finition (dépose, gravats, nettoyage…).
-- La part hors main-d'œuvre de ces ouvrages ne suit plus le coefficient économique / standard / premium.
alter table public.pricing_items add column if not exists nofin boolean;
