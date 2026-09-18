-- Cotalia v5 : archivage des dossiers et des parcours, actions en masse.
-- À exécuter dans l'éditeur SQL Supabase, après schema-v4.sql.

alter table public.leads add column if not exists archived_at timestamptz;
create index if not exists leads_archived_idx on public.leads (archived_at);

alter table public.funnel_sessions add column if not exists archived_at timestamptz;

-- les administrateurs peuvent maintenant modifier un parcours (archivage)
drop policy if exists "tunnel: admin modification" on public.funnel_sessions;
create policy "tunnel: admin modification" on public.funnel_sessions for update to authenticated using (public.is_admin()) with check (public.is_admin());
