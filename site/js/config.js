/* Configurazione Supabase del catalogo.
   La chiave publishable e' pubblica per progetto: identifica il progetto e
   corrisponde al ruolo anon. Non protegge i dati, che sono difesi dalle
   policy RLS lato database.
   Funziona anche la vecchia chiave anon in formato JWT, ma e' sul percorso
   di deprecazione di Supabase: si usa questa.

   `self` e non `window`: questo file viene importato anche dal service
   worker, dove `window` non esiste. Nella pagina self === window.

   VERSIONE e' l'unico numero da alzare quando si pubblica: da qui nascono sia
   il nome delle cache del service worker sia la sigla mostrata in testata,
   cosi' guardando lo schermo si sa quale versione si sta usando. */
self.LIEBIG_CONFIG = {
  versione: 15,
  url: 'https://twkhcynefhltiuwlzkqe.supabase.co',
  publishableKey: 'sb_publishable_AGxHKbJgoeyRttmOC4A1CA_XWnIPCG5'
};
