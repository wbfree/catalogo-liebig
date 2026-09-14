# Procedura di aggiornamento giornaliero — Catalogo Liebig

Obiettivo: rileggere le inserzioni attive su eBay.it, ricostruire il dataset e ripubblicare
il sito allo stesso indirizzo, segnalando nuove aste e scostamenti di prezzo.

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
Prima di sovrascriverlo, copia il file precedente in
`/home/user/workspace/storico/ebay_active_AAAA-MM-GG.json` e conserva la copia del
dataset precedente in `/home/user/workspace/storico/catalogo_AAAA-MM-GG.json`:
serve per il confronto.

## 2. Ricostruzione del dataset

```bash
cd /home/user/workspace && timeout 500 python build_dataset.py
```

Scrive `/home/user/workspace/site/data/catalogo.json`.

## 3. Confronto con il rilevamento precedente

Dal confronto fra il catalogo precedente e quello nuovo, individua:

- **nuove aste in corso** (`aste` passato da 0 a >0, oppure nuovi URL in `listings` con `asta: true`);
- **scostamenti di prezzo** rilevanti: variazione di `p_med` superiore al 15 % in valore
  assoluto, o serie che passano di fascia (`fascia`);
- **serie entrate o uscite dal mercato** (`fonte_prezzo` che cambia fra `mercato` e `stima`).

## 4. Ripubblicazione

```
deploy_website(project_path="/home/user/workspace/site",
               site_name="Catalogo Liebig - tutte le serie 1872-1975",
               entry_point="index.html")
```

Stesso `project_path` ⇒ stesso indirizzo, nessun nuovo artifact.

## 5. Notifica

Invia una notifica sintetica in italiano solo se ci sono novità: numero di nuove aste,
prime 5 serie per variazione di quotazione, eventuali serie appena comparse sul mercato.
Se nulla è cambiato in modo significativo, non notificare.

## Verifica pubblicazione

Prima del deploy, scrivi in site/version.txt la riga "aggiornato il <data e ora>" con la data del rilevamento. Dopo publish_website, controlla con `curl -s https://liebig.pplx.app/version.txt` che il sito pubblico sia stato effettivamente aggiornato.
