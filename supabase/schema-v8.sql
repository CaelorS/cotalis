-- Cotalia v8 : devis sur coûts directs, et plusieurs agendas Google pour les visites.
-- À exécuter dans l'éditeur SQL Supabase, après schema-v7b.sql. Rejouable sans risque.

-- 1. Devis établi sur les coûts directs : marge, frais généraux, pilotage et aléas à zéro.
--    Ces quatre valeurs restent modifiables dans le back-office, onglet Prix.
insert into public.pricing_settings (key, value, updated_at) values
  ('MARGE', '0'::jsonb, now()), ('FG', '0'::jsonb, now()), ('PILOTAGE', '0'::jsonb, now()), ('ALEA', '0'::jsonb, now())
on conflict (key) do update set value = excluded.value, updated_at = now();
update public.pricing_items set marge = null where marge is not null;

-- 2. Plusieurs agendas : un par administrateur connecté, avec ses règles d'attribution.
alter table public.calendar_accounts add column if not exists user_id uuid;
alter table public.calendar_accounts add column if not exists name text;
alter table public.calendar_accounts add column if not exists active boolean not null default true;
alter table public.calendar_accounts add column if not exists sort_order int not null default 0;
alter table public.calendar_accounts add column if not exists zones text;      -- départements couverts, ex. « 76, 27, 14 »
alter table public.calendar_accounts add column if not exists buffer int;      -- trajet bloqué avant et après, en minutes ; vide = règle générale
alter table public.leads add column if not exists visite_with text;

-- liste des agendas pour les administrateurs, sans jamais exposer le jeton
create or replace function public.calendar_list()
returns table (id text, email text, name text, active boolean, sort_order int, zones text, buffer int, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select c.id, c.email, c.name, c.active, c.sort_order, c.zones, c.buffer, c.updated_at
  from public.calendar_accounts c where public.is_admin() order by c.sort_order, c.updated_at;
$$;
grant execute on function public.calendar_list() to authenticated;

create or replace function public.calendar_update(p_id text, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé aux administrateurs'; end if;
  update public.calendar_accounts set
    name = coalesce(nullif(p_patch->>'name', ''), name),
    active = coalesce((p_patch->>'active')::boolean, active),
    sort_order = coalesce((p_patch->>'sort_order')::int, sort_order),
    zones = case when p_patch ? 'zones' then nullif(trim(p_patch->>'zones'), '') else zones end,
    buffer = case when p_patch ? 'buffer' then nullif(p_patch->>'buffer', '')::int else buffer end
  where id = p_id;
end $$;
grant execute on function public.calendar_update(text, jsonb) to authenticated;

create or replace function public.calendar_remove(p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'réservé aux administrateurs'; end if;
  delete from public.calendar_accounts where id = p_id;
end $$;
grant execute on function public.calendar_remove(text) to authenticated;
