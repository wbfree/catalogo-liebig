# Catalogo Liebig — tutte le serie 1872-1975

Catalogo digitale interattivo delle serie di figurine Liebig, con numerazione Sanguinetti, quotazioni ricavate dal mercato reale e monitoraggio giornaliero delle inserzioni attive su eBay.it.

Sito pubblico: **https://liebig.pplx.app**

## Cosa contiene

- **1.871 serie** emesse dal 1872 al 1975, in qualunque edizione linguistica; 1.305 hanno un'edizione italiana.
- **Quotazioni di mercato osservate**: mediana, minimo e massimo delle inserzioni attive abbinate a ciascuna serie. Non ci sono prezzi di listino: il catalogo riporta solo prezzi reali rilevati, più una stima per comparabili dove il mercato diretto manca.
- **Indice di rarità relativa** in cinque livelli, calcolato su disponibilità sul mercato, anno di emissione e livello di prezzo.
- **Monitoraggio aste**: le inserzioni in formato asta abbinate a una serie, con confronto tra prezzo corrente e mediana della serie.
- **Filtri** per fascia di prezzo, intervallo personalizzato, anno, rarità, edizione italiana, tipo di dato di prezzo e presenza di aste in corso.

## Struttura

```
site/                      sito statico (nessun backend)
  index.html
  css/app.css
  js/app.js
  data/catalogo.json       dataset pubblicato
  version.txt              data dell'ultimo rilevamento pubblicato
build_dataset.py           pipeline: sorgenti -> catalogo.json
parse_pages.py             parser di pagine eBay salvate su file
AGGIORNAMENTO_GIORNALIERO.md  procedura di aggiornamento quotidiano
afil_rows.json             tavola di concordanza delle serie (6.544 righe)
mlc_all.json               dati storici complementari
ebay_active.json           ultimo rilevamento delle inserzioni attive
```

## Come rigenerare il catalogo

```bash
python build_dataset.py
```

Legge le sorgenti nella radice del repository, abbina le inserzioni alle serie (per numero Sanguinetti e, in mancanza, per titolo), calcola quotazioni, scostamenti e rarità, e riscrive `site/data/catalogo.json`.

L'abbinamento usa una serie di espressioni regolari sui titoli delle inserzioni per estrarre il numero di serie (`SANG. 123`, `serie n° 123`, `123 (1898)`, `S.123`, …), scartando i numeri incompatibili con l'anno di emissione dichiarato.

## Aggiornamento giornaliero

Ogni mattina alle 07:30 (Europa/Roma) una procedura automatica rilegge le inserzioni attive su eBay.it con quattordici query, ricostruisce il dataset, confronta il risultato con il rilevamento precedente e ripubblica il sito. Il dettaglio dei passaggi è in `AGGIORNAMENTO_GIORNALIERO.md`.

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
