-- =====================================================================
-- Viste di lettura per il sito e politiche di accesso.
--
-- Il sito e' statico e parla con PostgREST usando la chiave pubblica anon:
-- tutto cio' che segue e' quindi leggibile da chiunque, per progetto.
-- La pipeline scrive con il ruolo postgres, che ignora le policy RLS.
-- =====================================================================

-- ------------------------------------------------------------- viste
-- Catalogo del rilevamento corrente: una riga per serie, i campi che
-- servono a tabella e filtri. Le inserzioni NON sono qui: si caricano
-- solo aprendo la scheda di una serie.
create or replace view public.v_catalogo
with (security_invoker = on) as
select s.num, s.titolo, s.anno, s.anno_raw, s.nfig, s.uni, s.dem, s.cil,
       s.it, s.edizioni,
       q.p_med, q.p_min, q.p_max, q.p_stima, q.scost, q.fonte_prezzo, q.fascia,
       q.offerte, q.offerte_sciolte, q.offerte_tot, q.aste,
       q.rarita, q.rarita_score, q.percentile
from public.serie s
join public.rilevamenti r on r.corrente
join public.quotazioni  q on q.rilevamento_id = r.id and q.serie_num = s.num;

comment on view public.v_catalogo is 'Catalogo del rilevamento corrente, senza le inserzioni.';

-- Inserzioni del rilevamento corrente, per la scheda di dettaglio.
create or replace view public.v_inserzioni
with (security_invoker = on) as
select i.serie_num, i.titolo, i.prezzo, i.url, i.asta, i.singola,
       i.sped_gratis, i.ed, i.abbinamento
from public.inserzioni i
join public.rilevamenti r on r.corrente and r.id = i.rilevamento_id;

-- Aste in corso con la mediana della serie a confronto.
create or replace view public.v_aste
with (security_invoker = on) as
select i.serie_num, s.titolo as serie_titolo, i.titolo, i.prezzo, i.url,
       q.p_med as mediana_serie
from public.inserzioni i
join public.rilevamenti r on r.corrente and r.id = i.rilevamento_id
join public.serie       s on s.num = i.serie_num
join public.quotazioni  q on q.rilevamento_id = r.id and q.serie_num = i.serie_num
where i.asta;

-- Serie temporale delle quotazioni: il motivo principale per cui questi
-- dati stanno in un database invece che in un file rigenerato ogni giorno.
create or replace view public.v_storico
with (security_invoker = on) as
select q.serie_num, r.data, q.p_med, q.p_min, q.p_max,
       q.offerte, q.aste, q.fonte_prezzo
from public.quotazioni q
join public.rilevamenti r on r.id = q.rilevamento_id
order by q.serie_num, r.data;

-- Intestazione del rilevamento corrente (sostituisce meta del JSON).
create or replace view public.v_meta
with (security_invoker = on) as
select r.data, r.aggiornato, r.meta
from public.rilevamenti r where r.corrente;

-- --------------------------------------------------------------- RLS
alter table public.serie       enable row level security;
alter table public.rilevamenti enable row level security;
alter table public.quotazioni  enable row level security;
alter table public.inserzioni  enable row level security;
alter table public.inventario  enable row level security;

-- Dati di catalogo: lettura pubblica, nessuna scrittura dal browser.
drop policy if exists serie_lettura       on public.serie;
drop policy if exists rilevamenti_lettura on public.rilevamenti;
drop policy if exists quotazioni_lettura  on public.quotazioni;
drop policy if exists inserzioni_lettura  on public.inserzioni;

create policy serie_lettura       on public.serie       for select using (true);
create policy rilevamenti_lettura on public.rilevamenti for select using (true);
create policy quotazioni_lettura  on public.quotazioni  for select using (true);
create policy inserzioni_lettura  on public.inserzioni  for select using (true);

-- Inventario: applicazione a utente singolo, nessuna autenticazione.
-- ATTENZIONE: cosi' chiunque apra il sito puo' leggere E modificare la
-- collezione, perche' la chiave anon e' visibile nel sorgente della pagina.
-- Per chiudere la scrittura basta eliminare la policy inventario_scrittura
-- (vedi 003_inventario_solo_lettura.sql).
drop policy if exists inventario_lettura   on public.inventario;
drop policy if exists inventario_scrittura on public.inventario;

create policy inventario_lettura   on public.inventario for select using (true);
create policy inventario_scrittura on public.inventario for all
  using (true) with check (true);

-- --------------------------------------------------------- permessi
grant usage on schema public to anon, authenticated;

grant select on public.serie, public.rilevamenti, public.quotazioni,
                public.inserzioni,
                public.v_catalogo, public.v_inserzioni, public.v_aste,
                public.v_storico, public.v_meta
  to anon, authenticated;

grant select, insert, update, delete on public.inventario to anon, authenticated;
