-- Cotalia v6 : prise de rendez-vous de visite technique via l'agenda Google de Simon.
-- À exécuter dans l'éditeur SQL Supabase, après schema-v5.sql.

-- jeton de connexion à l'agenda ; aucune policy : seules les fonctions serveur (clé service) y accèdent
create table if not exists public.calendar_accounts (
  id text primary key,
  email text,
  refresh_token text not null,
  updated_at timestamptz default now()
);
alter table public.calendar_accounts enable row level security;

-- visite planifiée sur le dossier
alter table public.leads add column if not exists visite_at timestamptz;
alter table public.leads add column if not exists visite_event text;

-- état de la connexion, lisible par les administrateurs (l'e-mail du compte relié, jamais le jeton)
create or replace function public.calendar_status()
returns text language sql security definer set search_path = public as $$
  select email from public.calendar_accounts where id = 'simon' and public.is_admin();
$$;
grant execute on function public.calendar_status() to authenticated;
