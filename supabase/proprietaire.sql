-- Cotalia : désigner le compte propriétaire (super-administrateur) et libérer les changements de rôle depuis le tableau de bord.
-- À exécuter dans SQL Editor. Remplacer l'adresse si le compte propriétaire change.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if session_user in ('postgres', 'supabase_admin') then return new; end if;
  if old.role = 'owner' and new.role <> 'owner' then raise exception 'Le compte propriétaire ne peut pas être modifié.'; end if;
  if new.role <> old.role then
    if not public.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
    if new.role = 'owner' then raise exception 'Ce rôle est réservé.'; end if;
  end if;
  return new;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := 'client';
begin
  if lower(new.email) = 'cotalia.easel715@simplelogin.com' then r := 'owner';
  elsif exists (select 1 from public.admin_invites where lower(email) = lower(new.email)) then r := 'admin';
  end if;
  insert into public.profiles (id, email, prenom, nom, tel, role)
  values (new.id, new.email, new.raw_user_meta_data->>'prenom', new.raw_user_meta_data->>'nom', new.raw_user_meta_data->>'tel', r)
  on conflict (id) do nothing;
  return new;
end $$;

update public.profiles set role = 'owner' where lower(email) = 'cotalia.easel715@simplelogin.com';
update public.profiles set role = 'client' where lower(email) = 'wauquier.jeremy@gmail.com';
select email, role, created_at from public.profiles order by created_at;
