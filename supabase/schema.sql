-- Cotalia · schéma Supabase.
-- À coller tel quel dans SQL Editor et exécuter. Le script peut être relancé sans dommage.

-- 1. Demandes d'estimation ------------------------------------------------------
create table if not exists public.leads (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  ref text, kind text, prenom text, nom text, email text, tel text,
  type_bien text, adresse text, ville text, cp text, surface numeric,
  gamme text, stade text, demarrage text,
  estimation_ttc numeric, estimation_basse numeric, estimation_haute numeric, score int,
  finance text, prix numeric, strat text, loyer numeric,
  situation jsonb, payload jsonb, user_agent text, page text
);
alter table public.leads add column if not exists project_id text;
alter table public.leads enable row level security;
drop policy if exists "insertion publique" on public.leads;
create policy "insertion publique" on public.leads for insert to anon with check (true);
grant usage on schema public to anon;
grant insert on public.leads to anon;

-- 2. Projets partageables par lien -----------------------------------------------
-- La table n'est jamais accessible directement : seules les deux fonctions ci-dessous le sont.
create table if not exists public.projects (
  id text primary key,
  owner_token text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  data jsonb not null
);
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;

-- Enregistre ou met à jour un projet. La mise à jour n'est possible qu'avec le jeton du créateur.
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
  insert into public.projects (id, owner_token, data) values (p_id, p_token, p_data)
  on conflict (id) do update set data = excluded.data, updated_at = now()
  where projects.owner_token = excluded.owner_token;
end $$;

-- Lit un projet à partir de son identifiant, impossible à deviner. Le jeton du créateur n'est jamais renvoyé.
create or replace function public.get_project(p_id text)
returns jsonb
language sql security definer stable set search_path = public as $$
  select data from public.projects where id = p_id;
$$;

grant execute on function public.save_project(text, text, jsonb) to anon;
grant execute on function public.get_project(text) to anon;

-- 3. Plans et photos déposés par les prospects -------------------------------------
-- Bucket privé : le site peut déposer, seul le tableau de bord peut lire.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plans', 'plans', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists "depot plans" on storage.objects;
create policy "depot plans" on storage.objects for insert to anon with check (bucket_id = 'plans');
