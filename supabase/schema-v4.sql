-- Cotalia · schéma v4 : analyse des performances du tunnel.
-- Une ligne par parcours (complet ou non), mise à jour à chaque étape atteinte.
create table if not exists public.funnel_sessions (
  id text primary key,                       -- identifiant du projet (pid), un par estimation
  started_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  last_step text,
  max_step int default 0,                    -- rang de l'étape la plus avancée
  steps jsonb default '{}'::jsonb,           -- { "kind": "2026-09-17T10:00:00Z", "bien": ... } première arrivée sur chaque étape
  kind text, surface numeric, finance text, ttc numeric, ref text,
  device text, ua text, referrer text, user_id uuid,
  data jsonb default '{}'::jsonb
);
alter table public.funnel_sessions enable row level security;
revoke all on public.funnel_sessions from anon;

create or replace function public.track_session(p_id text, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_id !~ '^[A-Za-z0-9_-]{16,32}$' then raise exception 'identifiant invalide'; end if;
  if pg_column_size(p_patch) > 20000 then raise exception 'trop volumineux'; end if;
  insert into public.funnel_sessions (id, started_at, updated_at, completed_at, last_step, max_step, steps, kind, surface, finance, ttc, ref, device, ua, referrer, user_id, data)
  values (
    p_id, coalesce((p_patch->>'started_at')::timestamptz, now()), now(),
    (p_patch->>'completed_at')::timestamptz, p_patch->>'last_step', coalesce((p_patch->>'max_step')::int, 0),
    coalesce(p_patch->'steps', '{}'::jsonb), p_patch->>'kind', (p_patch->>'surface')::numeric, p_patch->>'finance', (p_patch->>'ttc')::numeric, p_patch->>'ref',
    p_patch->>'device', left(p_patch->>'ua', 300), left(p_patch->>'referrer', 300), auth.uid(), coalesce(p_patch->'data', '{}'::jsonb)
  )
  on conflict (id) do update set
    updated_at = now(),
    completed_at = coalesce(public.funnel_sessions.completed_at, (p_patch->>'completed_at')::timestamptz),
    last_step = coalesce(p_patch->>'last_step', public.funnel_sessions.last_step),
    max_step = greatest(public.funnel_sessions.max_step, coalesce((p_patch->>'max_step')::int, 0)),
    steps = public.funnel_sessions.steps || coalesce(p_patch->'steps', '{}'::jsonb),
    kind = coalesce(p_patch->>'kind', public.funnel_sessions.kind),
    surface = coalesce((p_patch->>'surface')::numeric, public.funnel_sessions.surface),
    finance = coalesce(p_patch->>'finance', public.funnel_sessions.finance),
    ttc = coalesce((p_patch->>'ttc')::numeric, public.funnel_sessions.ttc),
    ref = coalesce(p_patch->>'ref', public.funnel_sessions.ref),
    device = coalesce(p_patch->>'device', public.funnel_sessions.device),
    user_id = coalesce(auth.uid(), public.funnel_sessions.user_id),
    data = public.funnel_sessions.data || coalesce(p_patch->'data', '{}'::jsonb);
end $$;
grant execute on function public.track_session(text, jsonb) to anon, authenticated;

drop policy if exists "tunnel: admin lecture" on public.funnel_sessions;
create policy "tunnel: admin lecture" on public.funnel_sessions for select to authenticated using (public.is_admin());
grant select on public.funnel_sessions to authenticated;
create index if not exists funnel_sessions_started_idx on public.funnel_sessions (started_at desc);
