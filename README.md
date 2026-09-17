# Cotalia - site et estimateur travaux

Site statique, sans outil de build : une page d'accueil (`index.html`) et un tunnel
d'estimation en sept étapes (`estimation.html`). Tout se calcule dans le navigateur.

```
index.html            accueil : logo, promesse, bouton vers le tunnel
estimation.html       tunnel : bien, descriptif, finition, travaux, financement, coordonnées, estimation
config.js             URL et clé Supabase, e-mail de contact (vide par défaut)
assets/css/site.css   styles, thème clair et sombre, impression PDF
assets/js/catalog.js  référentiel travaux, coefficients, prix de référence : c'est ici qu'on administre les prix
assets/js/engine.js   moteur de chiffrage déterministe, pré-sélection des ouvrages, points de vigilance
assets/js/tunnel.js   étapes, formulaire, encadré d'estimation, rapport final, partage, envoi des demandes
assets/js/auth.js     comptes utilisateurs (Supabase Auth), bouton de connexion, fenêtre de connexion
assets/js/pricing.js  applique les prix administrés par-dessus le catalogue
assets/js/home.js     accueil : liste des estimations
assets/js/admin.js    back-office
admin/index.html      back-office (non référencé)
supabase/schema.sql   tables, fonctions et bucket à créer dans Supabase
supabase/schema-v2.sql comptes, rôles, CRM, prix administrables
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
     gh repo create cotalia-site --private --source=. --push
     ```
   - Sur GitHub : Settings → Pages → Source « Deploy from a branch », branche `main`,
     dossier `/ (root)`. Le site est en ligne sous `https://<compte>.github.io/cotalia-site/`
     au bout d'une minute. Un nom de domaine se branche dans la même page (champ « Custom domain »).
2. **Netlify** : « Add new site → Import from Git », choisir le dépôt, aucune commande de build,
   dossier de publication `/`. Chaque `git push` redéploie.
3. **Vercel** : « Add New → Project », importer le dépôt, framework « Other ». Même logique.

Supabase n'héberge pas de site : c'est la base de données qui reçoit les demandes
d'estimation (ci-dessous).

## Enregistrer les demandes avec Supabase

1. Créer un projet sur https://supabase.com, puis dans SQL Editor exécuter le contenu de
   `supabase/schema.sql`. Il crée :
   - la table `leads` (demandes d'estimation et de rappel), en insertion seule pour le site ;
   - la table `projects` et les fonctions `save_project` / `get_project`, qui portent le lien
     de partage `estimation.html?p=<identifiant>` ; la table n'est jamais lisible directement,
     seule la fonction renvoie un projet à qui connaît son identifiant ;
   - le bucket privé `plans` où les prospects déposent plans et photos (15 Mo par fichier).

   Aucune politique de lecture pour `anon` : le site peut écrire, personne ne peut lire
   sans être connecté au tableau de bord Supabase.
2. Copier l'URL du projet et la clé `anon public` (Settings → API) dans `config.js`.
3. Pousser. Chaque estimation terminée crée une ligne ; une demande de rappel en crée une
   seconde avec `kind = 'rappel'`.

Tant que `config.js` est vide, les demandes restent dans le navigateur du prospect
(`localStorage`, clé `cotalia-leads`) et rien n'est envoyé.

## Comptes, back-office et prix administrables

Exécuter ensuite `supabase/schema-v2.sql` dans SQL Editor. Il ajoute les profils et rôles,
le suivi des dossiers, les prix administrables et le rattachement des projets aux comptes.

Dans Authentication → Providers → Email, laisser « Enable email provider » activé. Pour un
parcours sans friction, désactiver « Confirm email » ; sinon le prospect doit cliquer sur un
lien avant de pouvoir se connecter. Dans Authentication → URL Configuration, mettre
`https://cotalia.fr` en Site URL et ajouter `https://cotalia.fr/*` aux Redirect URLs.

- Le compte propriétaire (super-administrateur, non modifiable) est `cotalia.easel715@simplelogin.com` ; pour en changer, adapter et relancer `supabase/proprietaire.sql`.
- Le back-office est sur `/admin/` (aucun lien depuis le site). Onglets : Dossiers (CRM),
  Prix (réglages généraux, prix par ouvrage, marge par défaut ou par ouvrage), Administrateurs.
- Un administrateur ajoute un autre administrateur par e-mail : compte existant promu,
  sinon invitation appliquée à la création du compte.

## Envoi de l'estimation par e-mail (à faire)

Prévu avec une fonction Supabase (Edge Function) déclenchée à l'insertion dans `leads`,
qui envoie le PDF via Resend ou Brevo. En attendant, le bouton « Télécharger le PDF »
ouvre la boîte d'impression du navigateur avec une mise en page dédiée : choisir
« Enregistrer au format PDF ».

## Administrer les prix

Tout est dans `assets/js/catalog.js` : ouvrages, prix de référence HT, part de
main-d'œuvre, TVA, quantités proposées, coefficients par zone et par gamme, marge,
frais généraux, frais de notaire. Aucune autre modification n'est nécessaire.
