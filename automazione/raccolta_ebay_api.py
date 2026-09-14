#!/usr/bin/env python3
"""Raccoglie le inserzioni Liebig attive con la Browse API di eBay.

Alternativa a raccolta_ebay.py, che legge le pagine con un browser: qui si usa
l'API ufficiale, quindi niente Chromium, niente 403, niente selettori che
cambiano, e pochi secondi invece di mezz'ora.

Servono EBAY_CLIENT_ID e EBAY_CLIENT_SECRET nel file .env (keyset di
produzione, non sandbox).

    python automazione/raccolta_ebay_api.py [--pagine 10] [--minimo 3000]

Scrive ebay_active.json nella radice, nello stesso formato del raccoglitore a
browser piu' alcuni campi strutturati (asta, offerte, spedizione) che l'API
fornisce esatti e che prima venivano dedotti da espressioni regolari sul testo.
"""
import argparse, base64, datetime, json, os, pathlib, shutil, sys, time
import requests

RADICE = pathlib.Path(__file__).resolve().parent.parent
USCITA = RADICE / "ebay_active.json"
STORICO = RADICE / "storico"

OAUTH = "https://api.ebay.com/identity/v1/oauth2/token"
RICERCA = "https://api.ebay.com/buy/browse/v1/item_summary/search"
MERCATO = "EBAY_IT"
PER_CHIAMATA = 200

QUERIES = [
    "figurine liebig", "liebig sang", "liebig serie completa",
    "chromo liebig ita", "liebig figurine ita", "liebig estratto di carne figurine",
    "liebig chromo serie completa", "liebig sammelbilder serie",
    "liebig chromos serie complete", "liebig trade cards set",
    "liebig bilderserie", "liebig edizione belga",
    "liebig edizione tedesca", "liebig figurine anni 50",
]

QUERIES_ASTE = ["liebig", "figurine liebig", "chromo liebig", "liebig sammelbilder"]

def log(msg):
    print(f"[{datetime.datetime.now():%H:%M:%S}] {msg}", flush=True)

def credenziali():
    env = {}
    f = RADICE / ".env"
    if f.exists():
        for riga in f.read_text(encoding="utf-8").splitlines():
            if "=" in riga and not riga.strip().startswith("#"):
                k, v = riga.split("=", 1)
                env[k.strip()] = v.strip()
    cid = env.get("EBAY_CLIENT_ID") or os.environ.get("EBAY_CLIENT_ID")
    sec = env.get("EBAY_CLIENT_SECRET") or os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not sec:
        sys.exit("Mancano EBAY_CLIENT_ID e EBAY_CLIENT_SECRET (in .env o nell'ambiente).")
    return cid, sec

def token():
    cid, sec = credenziali()
    basic = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    r = requests.post(OAUTH, timeout=30,
                      headers={"Authorization": "Basic " + basic,
                               "Content-Type": "application/x-www-form-urlencoded"},
                      data={"grant_type": "client_credentials",
                            "scope": "https://api.ebay.com/oauth/api_scope"})
    if not r.ok:
        sys.exit(f"Autenticazione eBay fallita: {r.status_code} {r.text[:200]}")
    return r.json()["access_token"]

def eur(valore):
    """1234.5 -> 'EUR 1.234,50', come lo scriverebbe il sito italiano."""
    intero, decimali = f"{float(valore):.2f}".split(".")
    migliaia = f"{int(intero):,}".replace(",", ".")
    return f"EUR {migliaia},{decimali}"

def converti(it):
    """Da item_summary dell'API al formato del raccoglitore a browser.

    I campi t/p/r/u restano per compatibilita' con i rilevamenti vecchi; asta,
    offerte e sped arrivano invece strutturati e non piu' dedotti dal testo.
    """
    opzioni = it.get("buyingOptions", [])
    asta = "AUCTION" in opzioni
    prezzo = it.get("price") or it.get("currentBidPrice")
    if not prezzo or prezzo.get("currency") != "EUR":
        return None
    offerte = it.get("bidCount")
    spedizioni = it.get("shippingOptions") or []
    gratis = any(float((s.get("shippingCost") or {}).get("value", "1")) == 0 for s in spedizioni)

    pezzi = [eur(prezzo["value"])]
    pezzi.append(f"{offerte} offerte" if asta else "Compralo Subito")
    if gratis:
        pezzi.append("Consegna gratuita")

    return {
        "t": (it.get("title") or "").strip(),
        "p": eur(prezzo["value"]),
        "r": " | ".join(pezzi),
        "u": (it.get("itemWebUrl") or "").split("?")[0],
        "asta": asta,
        "offerte": offerte if asta else None,
        "sped": gratis,
    }

def cerca(tok, q, pagine, filtro=None):
    h = {"Authorization": "Bearer " + tok, "X-EBAY-C-MARKETPLACE-ID": MERCATO,
         "Accept": "application/json"}
    out = []
    for p in range(pagine):
        par = {"q": q, "limit": PER_CHIAMATA, "offset": p * PER_CHIAMATA}
        if filtro:
            par["filter"] = filtro
        r = requests.get(RICERCA, headers=h, params=par, timeout=45)
        if r.status_code == 429:
            log("  limite di chiamate raggiunto, mi fermo su questa chiave")
            break
        if not r.ok:
            log(f"  errore {r.status_code} su {q} pagina {p + 1}: {r.text[:120]}")
            break
        lotto = r.json().get("itemSummaries") or []
        out.extend(lotto)
        if len(lotto) < PER_CHIAMATA:
            break
    return out

def raccogli(pagine):
    tok = token()
    log("token ottenuto")
    visti, righe = set(), []

    def aggiungi(lotto):
        nuovi = 0
        for it in lotto:
            r = converti(it)
            if r and r["u"] and r["u"] not in visti:
                visti.add(r["u"])
                righe.append(r)
                nuovi += 1
        return nuovi

    for i, q in enumerate(QUERIES, 1):
        n = aggiungi(cerca(tok, q, pagine))
        log(f"{i:2}/{len(QUERIES)} {q[:34]:<34} nuovi {n:>4}  totale {len(righe)}")

    log("passata sulle aste (la ricerca per pertinenza non le fa emergere)")
    for i, q in enumerate(QUERIES_ASTE, 1):
        n = aggiungi(cerca(tok, q, pagine, filtro="buyingOptions:{AUCTION}"))
        log(f"{i:2}/{len(QUERIES_ASTE)} {q[:34]:<34} nuovi {n:>4}  totale {len(righe)}")

    return righe

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pagine", type=int, default=10,
                    help="pagine da 200 risultati per chiave (default 10)")
    ap.add_argument("--minimo", type=int, default=3000,
                    help="sotto questo numero di inserzioni la raccolta e' considerata fallita")
    ap.add_argument("--uscita", default=str(USCITA),
                    help="dove scrivere (per provare senza toccare il rilevamento buono)")
    a = ap.parse_args()

    inizio = time.time()
    righe = raccogli(a.pagine)
    aste = sum(1 for r in righe if r["asta"])
    log(f"raccolte {len(righe)} inserzioni in {time.time() - inizio:.0f} secondi ({aste} aste)")

    if len(righe) < a.minimo:
        log(f"TROPPO POCHE: attese almeno {a.minimo}. Non scrivo nulla.")
        return 1

    uscita = pathlib.Path(a.uscita)
    if uscita == USCITA:
        STORICO.mkdir(exist_ok=True)
        if USCITA.exists():
            copia = STORICO / f"ebay_active_{datetime.date.today():%Y-%m-%d}.json"
            shutil.copy2(USCITA, copia)
            log(f"copia del rilevamento precedente in {copia.relative_to(RADICE)}")

    tmp = uscita.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(righe, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, uscita)
    log(f"scritto {uscita}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
