-- Cotalia v11 : historique des versions d'une estimation. Chaque passage du client sur son rapport avec un contenu
-- modifié enregistre une version, et le dossier du back-office prend les valeurs de la dernière.
create table if not exists public.lead_versions (
  id bigserial primary key,
  project_id text not null,
  created_at timestamptz not null default now(),
  ttc numeric,
  sig text,
  state jsonb not null            -- le dossier tel qu'envoyé (mêmes champs que leads, payload compris)
);
create index if not exists lead_versions_project_idx on public.lead_versions (project_id, created_at desc);
alter table public.lead_versions enable row level security;
drop policy if exists "versions: admin lecture" on public.lead_versions;
create policy "versions: admin lecture" on public.lead_versions for select to authenticated using (public.is_admin());
grant select on public.lead_versions to authenticated;
grant select, insert on public.lead_versions to service_role;
grant usage, select on sequence public.lead_versions_id_seq to service_role;

create or replace function public.save_lead_version(p_id text, p_token text, p_lead jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_sig text; v_last text;
begin
  if not exists (select 1 from public.projects where id = p_id and owner_token = p_token) then raise exception 'projet inconnu'; end if;
  if pg_column_size(p_lead) > 200000 then raise exception 'trop volumineux'; end if;
  v_sig := md5(coalesce(p_lead->'payload'->>'works', '') || coalesce(p_lead->'payload'->>'qty', '') || coalesce(p_lead->'payload'->>'bien', '')
            || coalesce(p_lead->>'surface', '') || coalesce(p_lead->>'gamme', '') || coalesce(p_lead->>'estimation_ttc', '')
            || coalesce(p_lead->>'finance', '') || coalesce(p_lead->>'prix', '') || coalesce(p_lead->>'loyer', '') || coalesce(p_lead->>'adresse', ''));
  select sig into v_last from public.lead_versions where project_id = p_id order by created_at desc limit 1;
  if v_last is distinct from v_sig then
    insert into public.lead_versions (project_id, ttc, sig, state) values (p_id, (p_lead->>'estimation_ttc')::numeric, v_sig, p_lead);
    -- le dossier affiche toujours la dernière version du client ; statut, responsable et notes ne bougent pas
    update public.leads set
      type_bien = p_lead->>'type_bien', adresse = p_lead->>'adresse', ville = p_lead->>'ville', cp = p_lead->>'cp',
      surface = (p_lead->>'surface')::numeric, gamme = p_lead->>'gamme', stade = p_lead->>'stade', demarrage = p_lead->>'demarrage',
      estimation_ttc = (p_lead->>'estimation_ttc')::numeric, estimation_basse = (p_lead->>'estimation_basse')::numeric, estimation_haute = (p_lead->>'estimation_haute')::numeric,
      score = (p_lead->>'score')::int, finance = p_lead->>'finance', prix = (p_lead->>'prix')::numeric, strat = p_lead->>'strat', loyer = (p_lead->>'loyer')::numeric,
      payload = coalesce(p_lead->'payload', payload), updated_at = now()
    where project_id = p_id;
  end if;
  return (select count(*)::int from public.lead_versions where project_id = p_id);
end $$;
grant execute on function public.save_lead_version(text, text, jsonb) to anon, authenticated;
