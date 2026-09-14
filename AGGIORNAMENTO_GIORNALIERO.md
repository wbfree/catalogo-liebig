# Procedura di aggiornamento giornaliero — Catalogo Liebig

Obiettivo: rileggere le inserzioni attive su eBay.it e scrivere un nuovo rilevamento nel
database, segnalando nuove aste e scostamenti di prezzo. Il sito legge i dati dal database
e non va ripubblicato ogni giorno (vedi passo 4).

Perimetro: tutte le 1.871 serie Liebig emesse dal 1872 al 1975, in qualunque edizione
linguistica (1.305 hanno un'edizione italiana).

Con quattordici query la raccolta richiede circa 25-30 minuti: se il tempo stringe, dai
priorità alle prime sei (mercato italiano) e salva comunque un file parziale.

## 1. Raccolta inserzioni attive

Non esiste un connettore eBay e una richiesta HTTP semplice riceve **403**: serve una
sessione di browser vera. Se ne occupa `automazione/raccolta_ebay.py`, che usa Playwright.

```bash
python automazione/raccolta_ebay.py
```

Quattordici query (sei sul mercato italiano, otto su quelli esteri), fino a 8 pagine da
240 risultati ciascuna, con deduplica per URL dell'inserzione. Dura 25-30 minuti. Scrive
`ebay_active.json` nella radice, in modo atomico, e mette una copia del rilevamento
precedente in `storico/`.

Opzioni utili: `--pagine N` per accorciare, `--visibile` per guardare cosa fa il browser,
`--minimo N` per la soglia sotto la quale la raccolta e' considerata fallita (3.000
inserzioni per impostazione predefinita). Se la soglia non viene raggiunta il file **non**
viene sostituito e lo script esce con codice 1, cosi' la pipeline non gira su dati monchi.

Le inserzioni **concluse** richiedono login e sono protette da captcha: non vanno tentate.

Sul NAS questo passo gira dentro un contenitore Docker: vedi
[automazione/SYNOLOGY.md](automazione/SYNOLOGY.md).

## 2. Ricostruzione del dataset

```bash
cd /home/user/workspace && timeout 500 python build_dataset.py
```

Scrive un nuovo rilevamento nel database Supabase e lo rende corrente. La scrittura è in
una sola transazione: se si interrompe, il sito continua a mostrare il rilevamento del
giorno prima. Serve `.env` con `SUPABASE_DB_URL` (vedi `.env.example`).

Lo script stampa in coda l'identificativo del rilevamento, il numero di quotazioni e di
inserzioni scritte.

## 3. Confronto con il rilevamento precedente

Non serve più conservare copie del dataset: il confronto è una interrogazione, perché
tutti i rilevamenti sono in archivio.

```sql
-- variazioni di quotazione fra gli ultimi due rilevamenti
with ultimi as (
  select id, data, row_number() over (order by data desc, id desc) as n
  from rilevamenti
)
select s.num, s.titolo,
       vecchia.p_med as prima, nuova.p_med as adesso,
       round((nuova.p_med - vecchia.p_med) / nullif(vecchia.p_med, 0) * 100, 1) as var_pct,
       vecchia.fonte_prezzo as fonte_prima, nuova.fonte_prezzo as fonte_adesso,
       vecchia.aste as aste_prima, nuova.aste as aste_adesso
from quotazioni nuova
join ultimi   un on un.id = nuova.rilevamento_id and un.n = 1
join ultimi   uv on uv.n = 2
join quotazioni vecchia on vecchia.rilevamento_id = uv.id and vecchia.serie_num = nuova.serie_num
join serie s on s.num = nuova.serie_num
where nuova.aste > vecchia.aste                                   -- nuove aste
   or vecchia.fonte_prezzo is distinct from nuova.fonte_prezzo    -- entrata/uscita dal mercato
   or abs(nuova.p_med - vecchia.p_med) / nullif(vecchia.p_med, 0) > 0.15
order by abs(nuova.p_med - vecchia.p_med) / nullif(vecchia.p_med, 0) desc;
```

## 4. Pubblicazione

**Non serve ripubblicare il sito ogni giorno.** Le pagine leggono i dati dal database:
appena il nuovo rilevamento diventa corrente, il sito lo mostra. Il deploy va rifatto solo
quando cambia il codice in `site/`:

```
deploy_website(project_path="/home/user/workspace/site",
               site_name="Catalogo Liebig - tutte le serie 1872-1975",
               entry_point="index.html")
```

Stesso `project_path` ⇒ stesso indirizzo, nessun nuovo artifact. Quando lo si rifà,
scrivere prima in `site/version.txt` la riga `aggiornato il <data e ora>` con la data
effettiva, e controllare poi con `curl -s https://liebig.pplx.app/version.txt` che il sito
pubblico sia stato davvero sostituito.

## 5. Verifica del rilevamento

```sql
select data, corrente, meta->>'n_inserzioni' as lette,
       meta->>'n_inserzioni_abbinate' as abbinate,
       meta->>'serie_con_mercato' as con_mercato
from rilevamenti order by data desc limit 3;
```

Se `con_mercato` crolla rispetto ai giorni precedenti, la raccolta del passo 1 è andata
male: conviene ripeterla invece di lasciare pubblicato il rilevamento nuovo. Per tornare
indietro basta spostare il flag:

```sql
update rilevamenti set corrente = false where corrente;
update rilevamenti set corrente = true  where id = <id del rilevamento buono>;
```

## 6. Notifica

Invia una notifica sintetica in italiano solo se ci sono novità: numero di nuove aste,
prime 5 serie per variazione di quotazione, eventuali serie appena comparse sul mercato.
Se nulla è cambiato in modo significativo, non notificare.
