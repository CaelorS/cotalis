-- Cotalia v14 : prix propres à une finition (économique, standard, premium) pour un ouvrage.
-- Exemple : {"eco": {"pu": 1300, "marge": 1.4476}}. pu = coût HT, marge ajoutée au coût.
-- Quand la finition choisie a un prix propre, il remplace le coût de base et le coefficient de finition.
-- null : valeurs du catalogue ; {} : aucun prix par finition.
alter table public.pricing_items add column if not exists gammes jsonb;
