/* Configurazione Supabase del catalogo.
   La chiave publishable e' pubblica per progetto: identifica il progetto e
   corrisponde al ruolo anon. Non protegge i dati, che sono difesi dalle
   policy RLS lato database.
   Funziona anche la vecchia chiave anon in formato JWT, ma e' sul percorso
   di deprecazione di Supabase: si usa questa. */
window.LIEBIG_CONFIG = {
  url: 'https://twkhcynefhltiuwlzkqe.supabase.co',
  publishableKey: 'sb_publishable_AGxHKbJgoeyRttmOC4A1CA_XWnIPCG5'
};
