-- =====================================================================
-- Catalogo Liebig — schema Supabase
--
-- Separa i tre piani che nel JSON erano appiattiti in un unico oggetto:
--   serie        anagrafica stabile, cambia solo se la fonte viene rivista
--   rilevamenti  una riga per esecuzione della pipeline (ogni mattina)
--   quotazioni   valori calcolati per serie PER rilevamento -> storico prezzi
--   inserzioni   annunci eBay abbinati, del rilevamento corrente
--   inventario   collezione personale (applicazione a utente singolo)
-- =====================================================================

create extension if not exists pg_trgm;

-- ------------------------------------------------------------------ serie
create table if not exists public.serie (
  num        smallint primary key check (num between 1 and 1871),
  titolo     text     not null,
  anno       smallint check (anno between 1872 and 1975),
  anno_raw   text,
  nfig       smallint,
  uni        text,
  dem        text,
  cil        text,
  it         boolean  not null default false,
  edizioni   text[]   not null default '{}',
  nota_rarita boolean not null default false
);
comment on table  public.serie is 'Anagrafica delle 1.871 serie Liebig, numerazione Sanguinetti.';
comment on column public.serie.it is 'Esiste un''edizione italiana della serie.';
comment on column public.serie.nota_rarita is 'La fonte descrive la serie come rara/introvabile.';

create index if not exists serie_anno_idx on public.serie (anno);
create index if not exists serie_titolo_trgm_idx on public.serie using gin (titolo gin_trgm_ops);

-- ------------------------------------------------------ rilevamenti
create table if not exists public.rilevamenti (
  id          bigint generated always as identity primary key,
  data        date        not null,
  aggiornato  timestamptz not null default now(),
  corrente    boolean     not null default false,
  meta        jsonb       not null default '{}'::jsonb
);
comment on table public.rilevamenti is 'Una riga per esecuzione della pipeline. meta conserva i totali del run.';

-- un solo rilevamento corrente alla volta
create unique index if not exists rilevamenti_corrente_uniq
  on public.rilevamenti (corrente) where corrente;
create index if not exists rilevamenti_data_idx on public.rilevamenti (data desc);

-- ------------------------------------------------------- quotazioni
create table if not exists public.quotazioni (
  rilevamento_id  bigint   not null references public.rilevamenti(id) on delete cascade,
  serie_num       smallint not null references public.serie(num)      on delete cascade,
  p_med           numeric(10,2),
  p_min           numeric(10,2),
  p_max           numeric(10,2),
  p_stima         numeric(10,2),
  scost           numeric(6,1),
  fonte_prezzo    text  not null check (fonte_prezzo in ('mercato','stima')),
  fascia          text  not null check (fascia in ('0-5','5-15','15-40','40-100','100+')),
  offerte         integer not null default 0,
  offerte_sciolte integer not null default 0,
  offerte_tot     integer not null default 0,
  aste            integer not null default 0,
  rarita_score    numeric(5,1),
  percentile      numeric(5,1),
  rarita          text check (rarita in ('Comune','Bassa','Media','Alta','Estrema')),
  primary key (rilevamento_id, serie_num)
);
comment on table public.quotazioni is
  'Quotazioni e rarita per serie e per rilevamento. Storico: e'' qui che vive la serie temporale dei prezzi.';

create index if not exists quotazioni_serie_idx on public.quotazioni (serie_num, rilevamento_id desc);

-- -------------------------------------------------------- inserzioni
create table if not exists public.inserzioni (
  id             bigint generated always as identity primary key,
  rilevamento_id bigint   not null references public.rilevamenti(id) on delete cascade,
  serie_num      smallint not null references public.serie(num)      on delete cascade,
  titolo         text     not null,
  prezzo         numeric(10,2) not null,
  url            text     not null,
  asta           boolean  not null default false,
  singola        boolean  not null default false,
  sped_gratis    boolean  not null default false,
  ed             text,
  anno_ins       smallint,
  abbinamento    text check (abbinamento in ('numero','titolo'))
);
comment on table public.inserzioni is
  'Annunci eBay abbinati a una serie. Conservati per gli ultimi rilevamenti, non per sempre.';
comment on column public.inserzioni.abbinamento is 'Come e'' stata abbinata: numero Sanguinetti nel titolo oppure corrispondenza del titolo.';

create index if not exists inserzioni_serie_idx on public.inserzioni (rilevamento_id, serie_num, prezzo);
create index if not exists inserzioni_asta_idx  on public.inserzioni (rilevamento_id) where asta;

-- -------------------------------------------------------- inventario
create table if not exists public.inventario (
  serie_num  smallint primary key references public.serie(num) on delete cascade,
  posseduta  boolean     not null default false,
  album      text,
  pagina     text,
  note       text,
  aggiornato timestamptz not null default now(),
  constraint inventario_album_len  check (album  is null or char_length(album)  <= 60),
  constraint inventario_pagina_len check (pagina is null or char_length(pagina) <= 30),
  constraint inventario_note_len   check (note   is null or char_length(note)   <= 300)
);
comment on table public.inventario is
  'Collezione personale. Applicazione a utente singolo: una sola riga per serie, nessun proprietario.';

create index if not exists inventario_posseduta_idx on public.inventario (serie_num) where posseduta;

create or replace function public.tocca_aggiornato() returns trigger
language plpgsql as $$
begin new.aggiornato := now(); return new; end $$;

drop trigger if exists inventario_tocca on public.inventario;
create trigger inventario_tocca before update on public.inventario
  for each row execute function public.tocca_aggiornato();
