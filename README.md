# Catalogo Liebig — tutte le serie 1872-1975

Catalogo digitale interattivo delle serie di figurine Liebig, con numerazione Sanguinetti, quotazioni ricavate dal mercato reale e monitoraggio giornaliero delle inserzioni attive su eBay.it.

Sito pubblico: **https://liebig.pplx.app**

## Cosa contiene

- **1.871 serie** emesse dal 1872 al 1975, in qualunque edizione linguistica; 1.305 hanno un'edizione italiana.
- **Quotazioni di mercato osservate**: mediana, minimo e massimo delle inserzioni attive abbinate a ciascuna serie. Non ci sono prezzi di listino: il catalogo riporta solo prezzi reali rilevati, più una stima per comparabili dove il mercato diretto manca.
- **Indice di rarità relativa** in cinque livelli, calcolato su disponibilità sul mercato, anno di emissione e livello di prezzo.
- **Monitoraggio aste**: le inserzioni in formato asta abbinate a una serie, con confronto tra prezzo corrente e mediana della serie.
- **Inventario personale**: per ogni serie una spunta di possesso più i campi album, pagina
  e note, con filtri «serie che possiedo» e «serie mancanti», statistiche sulla raccolta ed
  esportazione/importazione in JSON. I dati stanno nel database, quindi si ritrovano da
  qualunque dispositivo. Il catalogo è a utente singolo e senza autenticazione: esiste un
  solo inventario, e chi raggiunge l'indirizzo del sito può modificarlo.
- **Storico delle quotazioni**: ogni rilevamento resta in archivio, e la scheda di una
  serie mostra l'andamento del prezzo mediano nel tempo.
- **Filtri** per fascia di prezzo, intervallo personalizzato, anno, rarità, edizione italiana, tipo di dato di prezzo e presenza di aste in corso.

## Struttura

```
site/                      sito statico: legge i dati da Supabase, nessun backend proprio
  index.html
  css/app.css
  js/config.js             indirizzo del progetto Supabase e chiave pubblica anon
  js/db.js                 client PostgREST minimo
  js/app.js
  version.txt              marcatore dell'ultima pubblicazione del sito
supabase/
  migrations/*.sql         schema, viste, politiche di accesso
  applica.py               applica le migrazioni non ancora applicate
build_dataset.py           pipeline: sorgenti -> database Supabase
automazione/
  raccolta_ebay.py         raccolta delle inserzioni con Playwright
  aggiorna.sh              i due passi in sequenza, dentro il contenitore
  nas_job.sh               involucro per il Task Scheduler: log ed esito
  Dockerfile               immagine con Python, psycopg e Chromium
  docker-compose.yml       esecuzione sul NAS
  SYNOLOGY.md              installazione e pianificazione su Synology
  stato.json               stato dell'ultima esecuzione della procedura pianificata
parse_pages.py             parser di pagine eBay salvate su file
requirements.txt           dipendenze Python
.env                       credenziali Supabase (non versionato; vedi .env.example)
AGGIORNAMENTO_GIORNALIERO.md  procedura di aggiornamento quotidiano
afil_rows.json             tavola di concordanza delle serie (6.544 righe)
mlc_all.json               elenco di riferimento complementare (354 voci)
ebay_active.json           ultimo rilevamento delle inserzioni attive (9.609 inserzioni)
sorgenti_ritirate/         rilevamenti non più usati dalla pipeline, tenuti per ricostruzione
DATI.md                    documentazione di ogni file di dati: contenuto, origine, ruolo
```

Il dettaglio di ogni sorgente (campi, origine, frequenza di aggiornamento, dati
volutamente non versionati) è in [DATI.md](DATI.md).

## Come rigenerare il catalogo

```bash
pip install -r requirements.txt
cp .env.example .env        # e compila le credenziali Supabase
python supabase/applica.py  # solo la prima volta: crea schema, viste e policy
python build_dataset.py
```

Legge le sorgenti nella radice del repository, abbina le inserzioni alle serie (per numero Sanguinetti e, in mancanza, per titolo), calcola quotazioni, scostamenti e rarità, e scrive un nuovo rilevamento nel database Supabase.

Ogni esecuzione aggiunge un rilevamento invece di sostituire il precedente: le quotazioni di tutti i giorni passati restano in archivio nella tabella `quotazioni`, ed è da lì che la scheda di ogni serie ricava l'andamento del prezzo nel tempo. La scrittura avviene in una sola transazione e il nuovo rilevamento diventa quello corrente solo alla fine, quindi un'esecuzione interrotta lascia il sito sui dati del giorno prima.

La pipeline è deterministica: rieseguita sulle stesse sorgenti riproduce gli stessi
valori (verificato il 14 settembre 2026 confrontando il contenuto del database con il
catalogo pubblicato in precedenza come file: tutte le 1.871 voci identiche su 19 campi).

L'abbinamento usa una serie di espressioni regolari sui titoli delle inserzioni per estrarre il numero di serie (`SANG. 123`, `serie n° 123`, `123 (1898)`, `S.123`, …), scartando i numeri incompatibili con l'anno di emissione dichiarato.

## Aggiornamento giornaliero

Ogni mattina alle 07:30 (Europa/Roma) una procedura automatica rilegge le inserzioni attive su eBay.it con quattordici query, ricostruisce il dataset e scrive un nuovo rilevamento nel database. La raccolta e la ricostruzione stanno in `automazione/aggiorna.sh`, pensato per girare in un contenitore su un NAS. Il sito non va più ripubblicato ogni giorno: essendo i dati nel database, le pagine pubblicate cambiano solo quando cambia il codice. Il dettaglio dei passaggi è in `AGGIORNAMENTO_GIORNALIERO.md`.

Le inserzioni concluse non vengono raccolte: richiedono un accesso autenticato.

## Fonti

- Tavola di concordanza delle serie: https://antichefigurineitalianeliebig.com/serie-liebig-1
- Listino Sanguinetti (fascicolo a stampa, non disponibile online): https://www.filateliasanguinetti.it/en/liebig-tradecards-pricelist
- Storia delle figurine Liebig: https://it.wikipedia.org/wiki/Figurine_Liebig
- Collezione di riferimento: https://www.my-liebig-collection.it/history_2.asp
- Elenco alternativo delle serie: http://www.cartolino.com/liebig/list.html
- Prezzi di mercato: inserzioni attive pubbliche su https://www.ebay.it

## Licenza e avvertenze

Le quotazioni sono rilevazioni statistiche di prezzi richiesti su un solo canale di vendita, non stime di valore certificate. I titoli e i collegamenti delle inserzioni appartengono ai rispettivi venditori.
