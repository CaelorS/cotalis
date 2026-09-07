# Cotalis - site et estimateur travaux

Site statique, sans outil de build : une page d'accueil (`index.html`) et un tunnel
d'estimation en sept étapes (`estimation.html`). Tout se calcule dans le navigateur.

```
index.html            accueil : logo, promesse, bouton vers le tunnel
estimation.html       tunnel : bien, descriptif, finition, travaux, financement, coordonnées, estimation
config.js             URL et clé Supabase, e-mail de contact (vide par défaut)
assets/css/site.css   styles, thème clair et sombre, impression PDF
assets/js/catalog.js  référentiel travaux, coefficients, prix de référence : c'est ici qu'on administre les prix
assets/js/engine.js   moteur de chiffrage déterministe, pré-sélection des ouvrages, points de vigilance
assets/js/tunnel.js   étapes, formulaire, encadré d'estimation, rapport final, envoi des demandes
assets/img/           logo et favicon
```

## Tester en local

```bash
python3 -m http.server 8080
```

puis ouvrir http://localhost:8080. Ouvrir le fichier directement (`file://`) fonctionne
aussi, sauf la recherche d'adresse qui a besoin d'une page servie en http(s).

## Publier

Trois options gratuites, toutes compatibles avec un site statique :

1. **GitHub Pages** (le plus simple, aucune inscription supplémentaire)
   - Créer le dépôt et pousser :
     ```bash
     gh repo create cotalis-site --private --source=. --push
     ```
   - Sur GitHub : Settings → Pages → Source « Deploy from a branch », branche `main`,
     dossier `/ (root)`. Le site est en ligne sous `https://<compte>.github.io/cotalis-site/`
     au bout d'une minute. Un nom de domaine se branche dans la même page (champ « Custom domain »).
2. **Netlify** : « Add new site → Import from Git », choisir le dépôt, aucune commande de build,
   dossier de publication `/`. Chaque `git push` redéploie.
3. **Vercel** : « Add New → Project », importer le dépôt, framework « Other ». Même logique.

Supabase n'héberge pas de site : c'est la base de données qui reçoit les demandes
d'estimation (ci-dessous).

## Enregistrer les demandes avec Supabase

1. Créer un projet sur https://supabase.com, puis dans SQL Editor exécuter :

   ```sql
   create table public.leads (
     id bigint generated always as identity primary key,
     created_at timestamptz default now(),
     ref text, kind text, prenom text, nom text, email text, tel text,
     type_bien text, adresse text, ville text, cp text, surface numeric,
     gamme text, stade text, demarrage text,
     estimation_ttc numeric, estimation_basse numeric, estimation_haute numeric, score int,
     finance text, prix numeric, strat text, loyer numeric,
     situation jsonb, payload jsonb, user_agent text, page text
   );
   alter table public.leads enable row level security;
   create policy "insertion publique" on public.leads for insert to anon with check (true);
   ```

   Aucune politique de lecture pour `anon` : le site peut écrire, personne ne peut lire
   sans être connecté au tableau de bord Supabase.
2. Copier l'URL du projet et la clé `anon public` (Settings → API) dans `config.js`.
3. Pousser. Chaque estimation terminée crée une ligne ; une demande de rappel en crée une
   seconde avec `kind = 'rappel'`.

Tant que `config.js` est vide, les demandes restent dans le navigateur du prospect
(`localStorage`, clé `cotalis-leads`) et rien n'est envoyé.

## Envoi de l'estimation par e-mail (à faire)

Prévu avec une fonction Supabase (Edge Function) déclenchée à l'insertion dans `leads`,
qui envoie le PDF via Resend ou Brevo. En attendant, le bouton « Télécharger le PDF »
ouvre la boîte d'impression du navigateur avec une mise en page dédiée : choisir
« Enregistrer au format PDF ».

## Administrer les prix

Tout est dans `assets/js/catalog.js` : ouvrages, prix de référence HT, part de
main-d'œuvre, TVA, quantités proposées, coefficients par zone et par gamme, marge,
frais généraux, frais de notaire. Aucune autre modification n'est nécessaire.
