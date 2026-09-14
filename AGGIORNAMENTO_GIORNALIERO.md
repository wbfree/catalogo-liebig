# Procedura di aggiornamento giornaliero — Catalogo Liebig

Obiettivo: rileggere le inserzioni attive su eBay.it e scrivere un nuovo rilevamento nel
database, segnalando nuove aste e scostamenti di prezzo. Il sito legge i dati dal database
e non va ripubblicato ogni giorno (vedi passo 4).

Perimetro: tutte le 1.871 serie Liebig emesse dal 1872 al 1975, in qualunque edizione
linguistica (1.305 hanno un'edizione italiana).

Con quattordici query la raccolta richiede circa 25-30 minuti: se il tempo stringe, dai
priorità alle prime sei (mercato italiano) e salva comunque un file parziale.

## 1. Raccolta inserzioni attive (browser)

Non esiste un connettore eBay: serve il browser. Le inserzioni **concluse** richiedono
login e sono protette da captcha: non vanno tentate.

Esegui in `browser_exec`, in un solo snippet:

```python
import json, re
start_browser("cloud", url="https://www.ebay.it")   # prima la home: serve per i cookie
wait(3)

QUERIES = ["figurine liebig", "liebig sang", "liebig serie completa",
           "chromo liebig ita", "liebig figurine ita", "liebig estratto di carne figurine",
           # il catalogo copre tutte le edizioni linguistiche: servono anche le chiavi estere
           "liebig chromo serie completa", "liebig sammelbilder serie",
           "liebig chromos serie complete", "liebig trade cards set",
           "liebig bilderserie", "liebig edizione belga",
           "liebig edizione tedesca", "liebig figurine anni 50"]

EXTRACT = r"""
(() => {
  const out = [];
  document.querySelectorAll('li.s-card, li.s-item').forEach(li => {
    const t = (li.querySelector('.s-card__title, .s-item__title')||{}).innerText || '';
    if (!t || /Shop on eBay/i.test(t)) return;
    const p = (li.querySelector('.s-card__price, .s-item__price')||{}).innerText || '';
    const r = [...li.querySelectorAll('.s-card__attribute-row, .s-item__detail')]
                .map(e => e.innerText.trim()).filter(Boolean).join(' | ');
    const a = li.querySelector('a[href*="/itm/"]');
    if (!p || !a) return;
    out.push({t: t.trim(), p: p.trim(), r: r, u: a.href.split('?')[0]});
  });
  return JSON.stringify(out);
})()
"""

seen, rows = set(), []
for q in QUERIES:
    for page in range(1, 9):
        goto_url(f"https://www.ebay.it/sch/i.html?_nkw={q.replace(' ', '+')}&_ipg=240&_pgn={page}")
        wait(2)
        try:
            batch = json.loads(js(EXTRACT))
        except Exception:
            break
        if not batch:
            break
        for b in batch:
            if b["u"] not in seen:
                seen.add(b["u"]); rows.append(b)
stop_browser()
print(len(rows))
```

Salva l'elenco in `/home/user/workspace/ebay_active.json` (lista di `{t, p, r, u}`).
Una copia del file precedente in `/home/user/workspace/storico/ebay_active_AAAA-MM-GG.json`
resta utile per rifare i conti su una giornata, ma non serve più al confronto del passo 3:
i rilevamenti sono tutti in archivio nel database.

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
