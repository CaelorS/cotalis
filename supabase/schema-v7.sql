-- Cotalia v7 : trafic du site (pages vues, clics sur le bouton principal, durée), façon Google Analytics.
-- À exécuter dans l'éditeur SQL Supabase, après schema-v6.sql.

create table if not exists public.site_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  visitor text,            -- identifiant anonyme du navigateur (localStorage)
  session text,            -- visite : renouvelée après 30 min d'inactivité
  event text not null,     -- view, cta, leave
  page text,
  referrer text,
  device text,
  ua text,
  ip text,                 -- effacée après 90 jours (purge_site_ips)
  data jsonb default '{}'::jsonb
);
create index if not exists site_events_ts_idx on public.site_events (ts);
create index if not exists site_events_session_idx on public.site_events (session);
alter table public.site_events enable row level security;
grant select, delete on public.site_events to authenticated;
grant usage, select on sequence public.site_events_id_seq to authenticated;
drop policy if exists "trafic: admin lecture" on public.site_events;
create policy "trafic: admin lecture" on public.site_events for select to authenticated using (public.is_admin());
drop policy if exists "trafic: admin modification" on public.site_events;
create policy "trafic: admin modification" on public.site_events for delete to authenticated using (public.is_admin());

create or replace function public.track_event(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_ip text;
begin
  if pg_column_size(p) > 4000 then raise exception 'trop volumineux'; end if;
  if coalesce(p->>'event', '') not in ('view', 'cta', 'leave') then raise exception 'événement inconnu'; end if;
  begin
    v_ip := nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), '');
  exception when others then v_ip := null; end;
  insert into public.site_events (visitor, session, event, page, referrer, device, ua, ip, data)
  values (left(p->>'visitor', 40), left(p->>'session', 40), p->>'event', left(p->>'page', 200), left(p->>'referrer', 300), left(p->>'device', 20), left(p->>'ua', 300), v_ip, coalesce(p->'data', '{}'::jsonb));
end $$;
grant execute on function public.track_event(jsonb) to anon, authenticated;

create or replace function public.purge_site_ips() returns void language sql security definer set search_path = public as $$
  update public.site_events set ip = null where ip is not null and ts < now() - interval '90 days';
$$;
