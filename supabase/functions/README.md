# Fonctions serveur : rendez-vous de visite via Google Agenda

Trois fonctions Supabase (Deno) dans ce dossier :

| Fonction | Rôle |
|---|---|
| `gcal-auth` | connexion de l'agenda Google d'un administrateur (OAuth, une fois par personne) |
| `gcal-slots` | créneaux libres sur trois semaines, selon les règles |
| `gcal-book` | crée la visite + deux blocs de trajet dans l'agenda attribué, invite le client, passe le dossier en « Visite planifiée » |

Règles par défaut (modifiables dans le back-office, onglet Administrateurs, section Agenda) : visite 60 min,
tampon 90 min avant et après, lundi-vendredi 9 h-18 h, 48 h de délai minimum, 2 visites par jour, 3 semaines d'horizon.

## Mise en place, une fois

1. **Google Cloud** (console.cloud.google.com) : créer un projet « Cotalia », activer l'API **Google Calendar**,
   configurer l'écran de consentement OAuth (type Externe, publier l'application), puis créer un identifiant
   **OAuth 2.0 · Application Web** avec l'URI de redirection
   `https://yjmeskpeyikivucnykqa.supabase.co/functions/v1/gcal-auth`.
   Noter le **Client ID** et le **Client secret**.
2. **Supabase** : exécuter `supabase/schema-v6.sql`. Puis, dans Edge Functions → Secrets, ajouter
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `SITE_URL = https://cotalia.fr`.
3. **Déploiement** depuis ce dépôt (CLI Supabase, `brew install supabase/tap/supabase`, puis `supabase login`) :

```bash
supabase link --project-ref yjmeskpeyikivucnykqa
supabase functions deploy gcal-auth gcal-slots gcal-book
```

4. **Simon** : dans le back-office, onglet Administrateurs, section Agenda, cliquer « Connecter l'agenda Google »
   avec son compte. Google affiche un écran « application non vérifiée » : Paramètres avancés → continuer.

## Plusieurs agendas (schema-v8.sql)

Chaque administrateur relie son propre agenda depuis son compte. La section Agenda du back-office liste les agendas
(actif, ordre, départements couverts, trajet propre) et fixe le mode d'attribution : par secteur, par ordre, équilibrée,
ou au responsable du dossier. Pour chaque heure, le créneau est proposé chez la première personne libre dans l'ordre
de préférence ; le dossier garde la trace dans `leads.visite_with`.

L'application Google doit être **en production** (Google Auth Platform → Audience → Publier l'application), sinon seuls
les testeurs déclarés peuvent se connecter et les jetons expirent au bout de sept jours.

## E-mails du site (schema-v10.sql, fonction `mail-lead`)

Le site envoie ses propres e-mails via **Resend** : estimation prête (client + équipe), demande de rappel (client + équipe),
visite confirmée (client, avec fichier iCal), visite annulée (client). Sans clé configurée, rien ne part et le journal
`mail_log` le note.

Mise en place, une fois :
1. Compte sur resend.com, menu **Domains → Add domain** : `cotalia.fr`. Resend affiche trois enregistrements DNS
   (DKIM en CNAME ou TXT, SPF en TXT, retour MX) à créer chez OVH, zone DNS de cotalia.fr. Attendre le statut « Verified ».
2. **API Keys → Create** : une clé « Cotalia site », permission Sending.
3. Supabase, Edge Functions → Secrets : `RESEND_API_KEY`, `MAIL_FROM` = `Cotalia <visites@cotalia.fr>`,
   `MAIL_REPLY_TO` = adresse qui reçoit les réponses (facultatif), `MAIL_TEAM` = adresses supplémentaires de l'équipe,
   séparées par des virgules (facultatif : les administrateurs du back-office sont prévenus d'office).
4. `supabase functions deploy mail-lead gcal-book gcal-cancel`.

Tant que le domaine n'est pas vérifié, Resend n'accepte que l'expéditeur `onboarding@resend.dev` vers l'adresse du compte.
