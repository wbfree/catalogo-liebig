#!/usr/bin/env python3
"""Raccoglie le inserzioni Liebig attive su eBay.it e scrive ebay_active.json.

Sostituisce il passo 1 della procedura, che prima girava con le primitive di
browser dell'ambiente agente. Una richiesta HTTP semplice non basta: eBay
risponde 403 senza una sessione di browser vera, quindi si usa Playwright.

    python automazione/raccolta_ebay.py [--pagine 8] [--attesa 2.0] [--visibile]

Scrive ebay_active.json nella radice del repository, in modo atomico: il file
precedente viene sostituito solo a raccolta finita, e ne resta una copia
datata in storico/.
"""
import argparse, json, os, pathlib, random, shutil, sys, time, datetime

RADICE = pathlib.Path(__file__).resolve().parent.parent
USCITA = RADICE / "ebay_active.json"
STORICO = RADICE / "storico"

QUERIES = [
    "figurine liebig", "liebig sang", "liebig serie completa",
    "chromo liebig ita", "liebig figurine ita", "liebig estratto di carne figurine",
    # il catalogo copre tutte le edizioni linguistiche: servono anche le chiavi estere
    "liebig chromo serie completa", "liebig sammelbilder serie",
    "liebig chromos serie complete", "liebig trade cards set",
    "liebig bilderserie", "liebig edizione belga",
    "liebig edizione tedesca", "liebig figurine anni 50",
]

# Selettori verificati sulla pagina di eBay del 14 settembre 2026:
# li.s-card e' la classe attuale, li.s-item resta per le pagine vecchie.
ESTRAI = r"""
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

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

def log(msg):
    print(f"[{datetime.datetime.now():%H:%M:%S}] {msg}", flush=True)

def raccogli(pagine, attesa, visibile):
    from playwright.sync_api import sync_playwright, Error as PWError

    visti, righe = set(), []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=not visibile,
            # --disable-dev-shm-usage e' indispensabile in Docker: /dev/shm
            # predefinito e' 64 MB e Chromium ci muore sopra
            args=["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu",
                  # le immagini non servono all'estrazione e sono la voce di
                  # consumo piu' pesante. Si bloccano nel motore: farlo con
                  # ctx.route costringerebbe ogni singola richiesta a un
                  # viaggio fino a Python, e su un Celeron si sente.
                  "--blink-settings=imagesEnabled=false"])
        ctx = browser.new_context(locale="it-IT", user_agent=UA,
                                  viewport={"width": 1440, "height": 900})
        pag = ctx.new_page()
        pag.set_default_timeout(45_000)

        # la home prima di tutto: serve a prendere i cookie di sessione
        log("apertura di ebay.it")
        pag.goto("https://www.ebay.it", wait_until="domcontentloaded")
        pag.wait_for_timeout(3_000)
        # nessun banner di consenso viene cliccato: i risultati di ricerca
        # restano leggibili senza. Se un giorno venissero nascosti dietro al
        # banner, e' qui che va messa la scelta (rifiutando i non essenziali).

        for i, q in enumerate(QUERIES, 1):
            for p in range(1, pagine + 1):
                url = (f"https://www.ebay.it/sch/i.html?_nkw={q.replace(' ', '+')}"
                       f"&_ipg=240&_pgn={p}")
                prima = len(righe)
                try:
                    pag.goto(url, wait_until="domcontentloaded")
                    pag.wait_for_timeout(int(attesa * 1000 + random.uniform(0, 600)))
                    lotto = json.loads(pag.evaluate(ESTRAI))
                except (PWError, json.JSONDecodeError) as e:
                    log(f"{i:2}/{len(QUERIES)} {q[:28]:<28} pag.{p}  lettura non riuscita "
                        f"({type(e).__name__}), passo alla query successiva")
                    break
                for b in lotto:
                    if b["u"] not in visti:
                        visti.add(b["u"])
                        righe.append(b)
                log(f"{i:2}/{len(QUERIES)} {q[:28]:<28} pag.{p}  letti {len(lotto):>3}"
                    f"  nuovi {len(righe) - prima:>3}  totale {len(righe)}")
                if not lotto:
                    break

        browser.close()
    return righe

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pagine", type=int, default=8, help="pagine per query (default 8)")
    ap.add_argument("--attesa", type=float, default=2.0, help="secondi fra una pagina e l'altra")
    ap.add_argument("--visibile", action="store_true", help="mostra il browser, per capire cosa succede")
    ap.add_argument("--minimo", type=int, default=3000,
                    help="sotto questo numero di inserzioni la raccolta e' considerata fallita")
    a = ap.parse_args()

    inizio = time.time()
    righe = raccogli(a.pagine, a.attesa, a.visibile)
    durata = time.time() - inizio
    log(f"raccolte {len(righe)} inserzioni in {durata/60:.1f} minuti")

    if len(righe) < a.minimo:
        log(f"TROPPO POCHE: attese almeno {a.minimo}. "
            f"{USCITA.name} NON viene sostituito, cosi' la pipeline non gira su dati monchi.")
        return 1

    STORICO.mkdir(exist_ok=True)
    if USCITA.exists():
        copia = STORICO / f"ebay_active_{datetime.date.today():%Y-%m-%d}.json"
        shutil.copy2(USCITA, copia)
        log(f"copia del rilevamento precedente in {copia.relative_to(RADICE)}")

    # scrittura atomica: se il processo muore a meta', il file buono resta
    tmp = USCITA.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(righe, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, USCITA)
    log(f"scritto {USCITA.relative_to(RADICE)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
