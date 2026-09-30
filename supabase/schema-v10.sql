-- Cotalia v10 : journal des e-mails envoyés par le site (estimation, rappel, visite).
create table if not exists public.mail_log (
  id bigserial primary key,
  sent_at timestamptz not null default now(),
  lead_id bigint,
  kind text not null,          -- estimation, rappel, visite, annulation, equipe
  recipient text,
  ok boolean not null default false,
  provider_id text,
  error text
);
create index if not exists mail_log_lead_idx on public.mail_log (lead_id, kind);
alter table public.mail_log enable row level security;
drop policy if exists "mails: admin lecture" on public.mail_log;
create policy "mails: admin lecture" on public.mail_log for select to authenticated using (public.is_admin());
grant select on public.mail_log to authenticated;
grant select, insert on public.mail_log to service_role;
grant usage, select on sequence public.mail_log_id_seq to service_role;
