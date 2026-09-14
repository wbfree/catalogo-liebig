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

## Prodotto della pipeline

### `site/data/catalogo.json`
- **Struttura**: `{"meta": {...}, "serie": [...]}`.
- **`meta`** del rilevamento pubblicato: 1.871 serie totali, 1.305 con edizione italiana,
  anni 1872-1975, 9.609 inserzioni lette, 7.066 abbinate a una serie, 1.576 serie con
  mercato attivo, mediana globale 8,98 €.
- **Ogni voce di `serie`** contiene numerazioni di conversione, titolo, anno, numero di
  figurine, edizioni linguistiche, quotazione (mediana osservata oppure stima per
  comparabili), minimo e massimo, numero di inserzioni e di offerte, indice e percentile
  di rarità, scostamento rispetto alla fascia attesa e l'elenco delle inserzioni abbinate
  con titolo, prezzo e URL.
- **Rigenerazione**: `python build_dataset.py`. Lo script è deterministico: a parità di
  sorgenti produce un file identico byte per byte.

### `site/version.txt`
Marcatore scritto ad ogni pubblicazione automatica; serve a verificare dall'esterno
(`curl https://liebig.pplx.app/version.txt`) che il sito pubblico sia stato effettivamente
aggiornato dalla procedura pianificata.

## Stato dell'automazione

### `automazione/stato.json`
Fotografia dello stato tenuto dalla procedura pianificata: numero di esecuzione, data,
metadati dell'ultimo dataset costruito, identificativo del sito pubblicato e note sul
metodo di raccolta. È un'istantanea di riferimento, non un file letto dalla pipeline.

## Dati non versionati

- `storico/` — copie datate di `catalogo.json` e dei rilevamenti eBay, usate ogni mattina
  per calcolare le variazioni di quotazione rispetto al giorno precedente. Escluse dal
  repository perché crescono di alcuni megabyte al giorno.
- **Inventario personale** — le spunte di possesso e i riferimenti di album e pagina
  restano nel browser di chi consulta il sito, in cookie di lunga durata del solo dominio
  del catalogo. Non transitano da nessun server e non sono quindi presenti né nel dataset
  né nel repository. Il pulsante «Esporta la collezione» produce un file JSON
  `collezione-liebig-<data>.json` che resta in mano all'utente.
