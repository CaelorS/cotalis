-- Cotalia · schéma v2 : comptes utilisateurs, administrateurs, prix administrables, suivi des dossiers.
-- À exécuter après schema.sql. Peut être relancé sans dommage.

-- 1. Profils et rôles ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, prenom text, nom text, tel text,
  role text not null default 'client',           -- client | admin | owner
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create table if not exists public.admin_invites (
  email text primary key,
  created_by uuid,
  created_at timestamptz default now()
);
alter table public.admin_invites enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'));
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- À la création d'un compte : profil automatique. Le compte propriétaire et les invités deviennent administrateurs.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := 'client';
begin
  if lower(new.email) = 'wauquier.jeremy@gmail.com' then r := 'owner';
  elsif exists (select 1 from public.admin_invites where lower(email) = lower(new.email)) then r := 'admin';
  end if;
  insert into public.profiles (id, email, prenom, nom, tel, role)
  values (new.id, new.email, new.raw_user_meta_data->>'prenom', new.raw_user_meta_data->>'nom', new.raw_user_meta_data->>'tel', r)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Le rôle ne change que par un administrateur ; le propriétaire est intouchable.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and new.role <> 'owner' then raise exception 'Le compte propriétaire ne peut pas être modifié.'; end if;
  if new.role <> old.role then
    if not public.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
    if new.role = 'owner' then raise exception 'Ce rôle est réservé.'; end if;
  end if;
  if new.role = 'owner' and old.role <> 'owner' then raise exception 'Ce rôle est réservé.'; end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles for each row execute function public.protect_profile_role();

drop policy if exists "profil: lecture" on public.profiles;
create policy "profil: lecture" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profil: modification" on public.profiles;
create policy "profil: modification" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
grant select, update on public.profiles to authenticated;

drop policy if exists "invitations: admin" on public.admin_invites;
create policy "invitations: admin" on public.admin_invites for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.admin_invites to authenticated;

-- 2. Suivi des dossiers (CRM) -----------------------------------------------------------
alter table public.leads add column if not exists status text not null default 'nouveau';
alter table public.leads add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists notes text;
alter table public.leads add column if not exists next_action date;
alter table public.leads add column if not exists updated_at timestamptz default now();
alter table public.leads add column if not exists user_id uuid;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads for each row execute function public.set_updated_at();

drop policy if exists "insertion publique" on public.leads;
create policy "insertion publique" on public.leads for insert to anon, authenticated with check (true);
drop policy if exists "dossiers: admin lecture" on public.leads;
create policy "dossiers: admin lecture" on public.leads for select to authenticated using (public.is_admin());
drop policy if exists "dossiers: admin modification" on public.leads;
create policy "dossiers: admin modification" on public.leads for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant usage on schema public to authenticated;
grant insert, select, update on public.leads to authenticated;

-- 3. Projets rattachés aux comptes ---------------------------------------------------------
alter table public.projects add column if not exists user_id uuid;

create or replace function public.save_project(p_id text, p_token text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_id !~ '^[A-Za-z0-9_-]{16,32}$' or length(coalesce(p_token, '')) < 16 then
    raise exception 'identifiant invalide';
  end if;
  if pg_column_size(p_data) > 300000 then
    raise exception 'projet trop volumineux';
  end if;
  insert into public.projects (id, owner_token, data, user_id) values (p_id, p_token, p_data, auth.uid())
  on conflict (id) do update set data = excluded.data, updated_at = now(), user_id = coalesce(auth.uid(), public.projects.user_id)
  where projects.owner_token = excluded.owner_token;
end $$;
grant execute on function public.save_project(text, text, jsonb) to anon, authenticated;
grant execute on function public.get_project(text) to anon, authenticated;

drop policy if exists "projets: lecture propriétaire" on public.projects;
create policy "projets: lecture propriétaire" on public.projects for select to authenticated using (user_id = auth.uid() or public.is_admin());
grant select on public.projects to authenticated;

-- 4. Prix administrables ---------------------------------------------------------------------
create table if not exists public.pricing_items (
  id text primary key,
  lot text, label text, sub text, unit text,
  pu numeric, lab numeric, tva numeric, marge numeric,      -- marge vide = marge par défaut
  active boolean not null default true,
  updated_at timestamptz default now(), updated_by uuid
);
alter table public.pricing_items enable row level security;
create table if not exists public.pricing_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table public.pricing_settings enable row level security;

drop policy if exists "prix: lecture publique" on public.pricing_items;
create policy "prix: lecture publique" on public.pricing_items for select to anon, authenticated using (true);
drop policy if exists "prix: admin" on public.pricing_items;
create policy "prix: admin" on public.pricing_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "reglages: lecture publique" on public.pricing_settings;
create policy "reglages: lecture publique" on public.pricing_settings for select to anon, authenticated using (true);
drop policy if exists "reglages: admin" on public.pricing_settings;
create policy "reglages: admin" on public.pricing_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.pricing_items, public.pricing_settings to anon;
grant select, insert, update, delete on public.pricing_items, public.pricing_settings to authenticated;

-- 5. Plans et photos : dépôt par tous, lecture par les administrateurs ---------------------------
drop policy if exists "depot plans" on storage.objects;
create policy "depot plans" on storage.objects for insert to anon, authenticated with check (bucket_id = 'plans');
drop policy if exists "lecture plans admin" on storage.objects;
create policy "lecture plans admin" on storage.objects for select to authenticated using (bucket_id = 'plans' and public.is_admin());
