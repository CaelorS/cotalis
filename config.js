/* Cotalia - configuration du site.
   Renseigner les deux champs Supabase pour enregistrer les demandes d'estimation dans une table `leads`.
   Tant qu'ils sont vides, les demandes restent dans le navigateur du prospect (aucun envoi). */
window.COTALIA_CONFIG = {
  supabaseUrl: 'https://yjmeskpeyikivucnykqa.supabase.co',
  supabaseAnonKey: 'sb_publishable_AVyWpYpT-3ZorLHp1tcHcA_xAYJPCff',  // clé publiable, faite pour être dans le site
  contactEmail: '',     // adresse affichée en pied de page, ex. contact@cotalia.fr
};
