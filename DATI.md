# Sorgenti di dati

Ogni file di dati del repository è documentato qui: cosa contiene, come è stato
ottenuto, che ruolo ha nella pipeline e con che frequenza cambia. Tutti i percorsi
sono relativi alla radice del repository, perché `build_dataset.py` cerca le
sorgenti nella propria directory.

## Sorgenti in ingresso

### `afil_rows.json` — tavola di concordanza delle serie
- **Contenuto**: 6.544 righe, una per serie/edizione, come liste di 8 campi nell'ordine
  `[edizione, num_sanguinetti, num_unificato, num_de_magistris, num_cil, anno, titolo, note]`.
  Il campo `edizione` usa le sigle linguistiche del catalogo di origine (`IT`, `FR`, `DE`, …).
- **Origine**: tavola pubblicata su https://antichefigurineitalianeliebig.com/serie-liebig-1
- **Ruolo**: definisce l'anagrafica delle 1.871 serie, le numerazioni di conversione e le
  edizioni linguistiche esistenti. È la spina dorsale del catalogo.
- **Aggiornamento**: raccolta una volta sola (13 settembre 2026); cambia solo se la fonte
  pubblica viene rivista.

### `ebay_active.json` — inserzioni attive su eBay.it
- **Contenuto**: 9.609 inserzioni, una per oggetto, con quattro campi compatti
  `t` (titolo), `p` (prezzo come stringa, es. `EUR 1,14`), `r` (riga informativa: offerte,
  tempo rimasto, spedizione) e `u` (URL dell'inserzione).
- **Origine**: lettura pagina per pagina dei risultati di ricerca pubblici di
  https://www.ebay.it con le quattordici query elencate in `AGGIORNAMENTO_GIORNALIERO.md`
  (sei italiane, le altre internazionali).
- **Ruolo**: è l'unica fonte di prezzo del catalogo. Da qui nascono mediana, minimo,
  massimo, numero di offerte e aste in corso di ciascuna serie.
- **Aggiornamento**: ogni mattina. Il rilevamento presente nel repository è quello del
  14 settembre 2026, lo stesso pubblicato su https://liebig.pplx.app.

### `mlc_all.json` — elenco di riferimento complementare
- **Contenuto**: 354 voci con campi `num`, `titolo`, `anno`, `ed`, `img`, `id`.
- **Origine**: https://www.my-liebig-collection.it
- **Ruolo**: controllo incrociato su titoli e anni di emissione delle serie più antiche.
- **Aggiornamento**: raccolta una volta sola (13 settembre 2026).

### `sorgenti_ritirate/ebay_intl_raw_2026-09-14.json` — rilevamento internazionale separato
- **Contenuto**: 2.536 inserzioni nello stesso formato di `ebay_active.json`.
- **Storia**: nella prima versione della pipeline le query internazionali venivano
  raccolte in un file separato, letto come sorgente aggiuntiva
  (`FILE_EBAY = ["ebay_active.json", "ebay_intl_raw.json"]`). Dal 14 settembre 2026 tutte
  le quattordici query finiscono in `ebay_active.json` e questo file è stato ritirato.
- **Ruolo attuale**: nessuno. È conservato per ricostruire i rilevamenti precedenti:
  copiandolo nella radice con il nome `ebay_intl_raw.json` viene di nuovo incluso nel
  calcolo. Attenzione, in questo caso il risultato **non** coincide con il catalogo
  pubblicato, perché quelle inserzioni sono già contenute nel rilevamento unico.

### Inserzioni concluse — non raccolte
Le vendite concluse di eBay richiedono un accesso autenticato e presentano un captcha,
quindi non vengono raccolte. Il catalogo riporta perciò **prezzi richiesti** su inserzioni
attive, non prezzi di aggiudicazione. Il file `ebay_sold.json` usato nelle prime prove è
rimasto vuoto e non è incluso nel repository.

## Prodotto della pipeline: il database Supabase

La pipeline non scrive più un file: scrive un **rilevamento** nel database. Lo schema
è in `supabase/migrations/`, si applica con `python supabase/applica.py`.

### `serie` — anagrafica
Una riga per serie (1.871). Numerazioni di conversione, titolo, anno, numero di figurine,
edizioni linguistiche, segnalazione di rarità della fonte. Cambia solo se viene rivista
`afil_rows.json`.

### `rilevamenti` — testata di ogni esecuzione
Una riga per esecuzione della pipeline: data, ora, i totali del run in `meta` (le stesse
cifre che prima stavano nel campo `meta` del JSON) e il flag `corrente`, che indica quale
rilevamento il sito deve mostrare. Un vincolo di unicità parziale garantisce che ce ne sia
al massimo uno corrente.

### `quotazioni` — i prezzi, per serie e per rilevamento
Una riga per serie per rilevamento: mediana, minimo, massimo, stima da comparabili,
scostamento, fasce, numero di offerte e di aste, punteggio e classe di rarità.
**Non viene mai potata**: è l'archivio storico delle quotazioni, quello che prima si
perdeva ogni giorno con la cartella `storico/`. Da qui nasce il grafico di andamento nella
scheda di ogni serie.

### `inserzioni` — gli annunci abbinati
Gli annunci eBay abbinati a una serie, con titolo, prezzo, URL, formato asta, se è una
figurina sciolta e come è avvenuto l'abbinamento (numero o titolo). Al contrario delle
quotazioni queste righe **vengono potate**: si conservano quelle degli ultimi
`RILEVAMENTI_CON_INSERZIONI` rilevamenti (7 per impostazione predefinita), perché sono
circa 6.700 per rilevamento e invecchiano subito.

### `inventario` — la collezione personale
Una riga per serie posseduta o annotata: possesso, album, pagina, note. Non ha un campo
proprietario, perché il catalogo è a utente singolo.

### Viste di lettura
Il sito non interroga le tabelle direttamente ma cinque viste: `v_catalogo` (il
rilevamento corrente, una riga per serie, senza inserzioni), `v_inserzioni` e `v_aste`
(annunci del rilevamento corrente), `v_storico` (la serie temporale delle quotazioni) e
`v_meta` (la testata del rilevamento corrente).

### Accesso
Il sito usa la chiave pubblica `anon` e le politiche RLS: lettura su tutto il catalogo,
lettura e scrittura sull'inventario, nessuna scrittura sulle tabelle di catalogo. La
pipeline usa invece la connessione diretta con il ruolo `postgres`, che ignora le policy.
La migrazione `003_permessi.sql` revoca i privilegi che Supabase concede in automatico ad
`anon` su ogni nuova tabella di `public` — fra cui `TRUNCATE`, che non è soggetto a RLS e
avrebbe permesso a chiunque di svuotare il catalogo.

### `site/version.txt`
Marcatore scritto quando si ripubblica il sito. Da quando i dati stanno nel database il
sito va ripubblicato solo se cambia il codice, non ogni mattina.

## Stato dell'automazione

### `automazione/stato.json`
Fotografia dello stato tenuto dalla procedura pianificata: numero di esecuzione, data,
metadati dell'ultimo dataset costruito, identificativo del sito pubblicato e note sul
metodo di raccolta. È un'istantanea di riferimento, non un file letto dalla pipeline.

## Dati non versionati

- `.env` — credenziali Supabase: stringa di connessione con il ruolo `postgres`,
  indirizzo del progetto e chiave `anon`. Escluso dal repository; `.env.example` ne mostra
  la forma. La chiave `anon` è comunque pubblica e compare in `site/js/config.js`: non
  protegge i dati, che sono difesi dalle policy RLS.
- `storico/` — copie datate dei rilevamenti eBay. Non serve più per le quotazioni, che
  ora hanno un archivio proprio nella tabella `quotazioni`.
- **Inventario personale** — non è più nel browser né nel repository: sta nella tabella
  `inventario` del database. La voce «Esporta la collezione» del menu in alto a destra
  continua a produrre un
  file JSON `collezione-liebig-<data>.json` come backup, e l'importazione accetta sia il
  formato nuovo sia quello delle vecchie esportazioni da cookie.
