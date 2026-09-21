-- Cotalia v7b : droits de lecture du trafic pour les administrateurs (oubliés dans v7) et nettoyage d'une ligne de test.
grant select, delete on public.site_events to authenticated;
grant usage, select on sequence public.site_events_id_seq to authenticated;
delete from public.site_events where visitor = 'test';
