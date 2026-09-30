-- Cotalia v12 : la grille de prix passe en coûts, avec une marge de 40 % sur le prix de vente.
-- Les prix déjà modifiés dans le back-office sont convertis comme ceux du catalogue : coût = ancien prix × 0,6.
-- À n'exécuter qu'UNE fois (le rejouer baisserait les prix une seconde fois).
update public.pricing_items set pu = round((pu * 0.6)::numeric, 2), updated_at = now() where pu is not null;
