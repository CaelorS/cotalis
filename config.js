/* Cotalis - configuration du site.
   Renseigner les deux champs Supabase pour enregistrer les demandes d'estimation dans une table `leads`.
   Tant qu'ils sont vides, les demandes restent dans le navigateur du prospect (aucun envoi). */
window.COTALIS_CONFIG = {
  supabaseUrl: '',      // ex. https://abcdefgh.supabase.co
  supabaseAnonKey: '',  // clé « anon public » du projet Supabase (elle est faite pour être publiée)
  contactEmail: '',     // adresse affichée en pied de page, ex. contact@cotalis.fr
};
