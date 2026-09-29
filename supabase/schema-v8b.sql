-- Cotalia v8b : droits du rôle serveur (fonctions Edge) sur les tables utilisées pour les visites.
-- Sans eux, la connexion d'un agenda échoue avec « permission denied for table calendar_accounts ».
grant select, insert, update, delete on public.calendar_accounts to service_role;
grant select, update on public.leads to service_role;
grant select on public.projects to service_role;
grant select on public.profiles to service_role;
grant select on public.pricing_settings to service_role;
