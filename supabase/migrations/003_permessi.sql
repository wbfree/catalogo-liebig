-- =====================================================================
-- Stretta sui permessi.
--
-- Supabase, per impostazione predefinita, concede ad anon e authenticated
-- TUTTI i privilegi su ogni tabella creata in public, TRUNCATE compreso.
-- TRUNCATE non e' soggetto a RLS: senza questa revoca, chiunque abbia la
-- chiave anon (che sta nel sorgente del sito) puo' svuotare il catalogo.
-- =====================================================================

-- 1. si riparte da zero su tutto lo schema
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- e anche per le tabelle che verranno create in futuro
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 2. si riconcede solo lo stretto necessario
grant usage on schema public to anon, authenticated;

-- catalogo: sola lettura
grant select on public.serie, public.rilevamenti, public.quotazioni, public.inserzioni,
                public.v_catalogo, public.v_inserzioni, public.v_aste,
                public.v_storico, public.v_meta
  to anon, authenticated;

-- inventario: lettura e scrittura (applicazione a utente singolo, nessuna auth)
grant select, insert, update, delete on public.inventario to anon, authenticated;

-- 3. la tabella di servizio delle migrazioni non deve essere esposta:
--    sta in public, quindi PostgREST la pubblicherebbe. Niente grant,
--    piu' RLS senza policy come seconda barriera.
alter table public.migrazioni enable row level security;
revoke all on public.migrazioni from anon, authenticated;
