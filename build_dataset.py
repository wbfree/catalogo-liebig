#!/usr/bin/env python3
"""Costruisce il dataset del catalogo completo delle serie Liebig (1872-1975).

Input:
  afil_rows.json  -> tabella serie (numerazione Sanguinetti / Unificato / De Magistris / CIL)
  ebay_active.json -> inserzioni eBay.it attive rilevate con la Browse API di eBay
Output:
  database Supabase (tabelle serie / rilevamenti / quotazioni / inserzioni)

La connessione si legge da SUPABASE_DB_URL, nel file .env o nell'ambiente.
"""
import json, re, statistics, unicodedata, collections, datetime, os, sys, pathlib
import psycopg

BASE = os.path.dirname(os.path.abspath(__file__))
# quanti rilevamenti passati conservano anche le singole inserzioni
# (lo storico delle quotazioni non viene mai potato)
RILEVAMENTI_CON_INSERZIONI = 7

# ---------------------------------------------------------------- serie
def anno_int(s):
    m = re.findall(r"\b(18\d\d|19\d\d)", s)
    return int(m[0]) if m else None

def n_fig(titolo):
    m = re.search(r"(\d{1,2})\s*fig", titolo, re.I)
    return int(m.group(1)) if m else None

def pulisci_titolo(t):
    t = re.sub(r"\s*\d{1,2}\s*fig(urine)?\.?\s*(non\s+)?(numerate|numerata)?\.?\s*$", "", t, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip(" .,-")
    return t

RARE_RE = re.compile(r"\b(rarissim|molto\s+rar|assai\s+rar|rar[ao]\b|introvabil|difficil\w*\s+(da\s+)?trovar|scarsissim)", re.I)

def carica_serie():
    rows = json.load(open(os.path.join(BASE, "afil_rows.json"), encoding="utf-8"))
    per_num = {}
    for r in rows:
        naz, sang, uni, dem, cil, anno, titolo, commento = r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]
        if not sang.isdigit():
            continue
        y = anno_int(anno)
        num = int(sang)
        d = per_num.setdefault(num, {"num": num, "edizioni": set(), "anno": y, "anno_raw": anno,
                                     "titolo": "", "uni": uni, "dem": dem, "cil": cil,
                                     "nfig": None, "nota_rarita": False})
        d["edizioni"].add(naz)
        if naz == "IT":
            d["titolo"] = pulisci_titolo(titolo)
            d["nfig"] = n_fig(titolo)
            d["anno"] = y
            d["anno_raw"] = anno
            d["uni"], d["dem"], d["cil"] = uni, dem, cil
        elif not d["titolo"]:
            d["titolo"] = pulisci_titolo(titolo)
            d["nfig"] = d["nfig"] or n_fig(titolo)
        if RARE_RE.search(commento or ""):
            d["nota_rarita"] = True
    serie = []
    for d in per_num.values():
        d["it"] = "IT" in d["edizioni"]
        d["edizioni"] = sorted(d["edizioni"])
        if d["anno"] and not (1872 <= d["anno"] <= 1975):
            d["anno"] = None
        serie.append(d)
    serie.sort(key=lambda x: x["num"])
    return serie

# ---------------------------------------------------------------- eBay
EDIZ = [
    (r"\bED\.?\s*ITALIA(NA)?\b|\bITALIANA\b|\bITA\b|\bIT\b", "IT"),
    (r"\bED\.?\s*BELGI(O|A)\b|\bBELGA\b|\bBEL\b", "BL"),
    (r"\bED\.?\s*TEDESC(A|O)\b|\bGERMANIA\b|\bTED\b", "TD"),
    (r"\bED\.?\s*FRANCESE\b|\bFRANCIA\b|\bFRA\b", "FR"),
    (r"\bED\.?\s*OLANDESE\b|\bOLANDA\b|\bOL\b", "OL"),
    (r"\bFIAMMING", "FM"),
    (r"\bSPAGNOL", "SP"),
    (r"\bINGLESE\b", "IN"),
]

NUM_RE = [
    re.compile(r"SANG\.?\s*(?:N\.?\s*)?(\d{1,4})", re.I),
    # "Carabinieri - 1828 (1968)": numero di serie seguito dall'anno fra parentesi
    re.compile(r"(\d{3,4})\s*\((?:18\d\d|19\d\d)\)"),
    re.compile(r"S[EÉ]RIE\s*(?:N|NR|N°|N\.)?\s*[°.:]*\s*(\d{1,4})", re.I),
    re.compile(r"\bN[°\.:]\s*(\d{1,4})", re.I),
    # notazione compatta usata dai venditori esteri: S860, S 187, S. 1377
    re.compile(r"(?<![A-Za-z0-9])S\.?\s?(\d{2,4})(?!\d)", re.I),
]

def prezzo(p):
    """Estrae il prezzo minimo in EUR da stringhe tipo 'EUR 3,19 a EUR 16,49'."""
    vals = []
    for m in re.finditer(r"EUR\s*([\d\.]+,\d{2}|\d+)", p):
        v = m.group(1).replace(".", "").replace(",", ".")
        try:
            vals.append(float(v))
        except ValueError:
            pass
    return min(vals) if vals else None

FILE_EBAY = ["ebay_active.json", "ebay_intl_raw.json"]

def carica_ebay():
    rows, visti = [], set()
    for fn in FILE_EBAY:
        p = os.path.join(BASE, fn)
        if not os.path.exists(p):
            continue
        for r in json.load(open(p, encoding="utf-8")):
            if r.get("u") and r["u"] not in visti:
                visti.add(r["u"])
                rows.append(r)
    out = []
    for r in rows:
        t = r["t"].split("\n")[0].strip()
        pz = prezzo(r["p"]) or prezzo(r["r"])
        if pz is None or pz <= 0:
            continue
        # scarta accessori / cataloghi / raccoglitori
        if re.search(r"raccoglitor|custodi|album vuot|foglio|fogli\b|catalogo|unificato|classificator|lotto\s+\d{2,}|kg\b", t, re.I):
            tipo = "accessorio"
        else:
            tipo = "serie"
        num = None
        for rx in NUM_RE:
            m = rx.search(t)
            if m:
                n = int(m.group(1))
                if 1 <= n <= 1871:
                    num = n
                    break
        ed = None
        for rx, code in EDIZ:
            if re.search(rx, t):
                ed = code
                break
        # i rilevamenti presi con la Browse API portano il dato esatto; quelli
        # vecchi, letti dalle pagine, lo fanno ancora dedurre dal testo
        if "asta" in r:
            asta = bool(r["asta"])
        else:
            asta = bool(re.search(r"offert[ae]", r["r"], re.I)) and "Compralo Subito" not in r["r"]
        # figurina sciolta vs serie completa
        singola = bool(re.search(
            r"\bfigurina\b|\bfig\.?\s*singol|\b1\s*(?:fig\b|figurina|quadro|chromo|card|cartoncino)"
            r"|\bsingol|\bcartoncino\b|figurina\s*[A-F]\b|\bquadro\b", t, re.I))
        intera = bool(re.search(
            r"serie\s*completa|completa\s*\d|\bcompleta\b|\b(6|10|12)\s*fig|set\s*completo"
            r"|complete\s*set|serie\s*di\s*quadri|\bquadri\b", t, re.I))
        if intera:
            singola = False
        m_anno = re.search(r"\b(18[7-9]\d|19[0-7]\d)\b", t)
        anno_ins = int(m_anno.group(1)) if m_anno else None
        out.append({"t": t, "prezzo": round(pz, 2), "num": num, "ed": ed,
                    "asta": asta, "url": r["u"], "tipo": tipo, "singola": singola,
                    "anno_ins": anno_ins, "venditore": r.get("venditore"),
                    "sped": bool(r["sped"]) if "sped" in r
                            else bool(re.search(r"Consegna gratuita", r["r"], re.I))})
    return accorpa_ripetute(out)

def accorpa_ripetute(righe):
    """Una sola offerta per venditore e per titolo, al suo prezzo migliore.

    Parecchi negozi mettono la stessa serie in vendita in piu' annunci: uno per
    copia in magazzino, spesso a prezzi leggermente diversi. Hanno codici
    inserzione diversi, quindi la deduplica per URL non li vede, ma per chi
    consulta il catalogo sono una riga sola ripetuta: gonfiano la colonna
    offerte e danno a un solo venditore tanti voti quanti annunci nel calcolo
    della mediana (un negozio arrivava a trentotto annunci identici).

    Si tiene il piu' economico, che e' il prezzo a cui quella serie si compra
    davvero da quel venditore. Le aste restano separate dal compralo subito:
    sono occasioni diverse, e quelle alimentano la tabella delle aste in corso.

    Sui rilevamenti archiviati prima del 15 settembre 2026 il venditore non
    c'e': quelli restano come sono.
    """
    tenute, senza_venditore, ripetute = {}, [], 0
    for r in righe:
        if not r.get("venditore"):
            senza_venditore.append(r)
            continue
        chiave = (r["venditore"], " ".join(r["t"].lower().split()), r["asta"])
        vecchia = tenute.get(chiave)
        if vecchia is None:
            tenute[chiave] = r
        else:
            ripetute += 1
            if r["prezzo"] < vecchia["prezzo"]:
                tenute[chiave] = r
    if ripetute:
        print(f"annunci ripetuti dallo stesso venditore, accorpati: {ripetute}")
    return senza_venditore + list(tenute.values())

# ---------------------------------------------------------------- match per titolo
STOP = set("""di del della delle dei degli da dal con per il lo la le i gli un una e ed in su al alla
ai agli sul sulla nel nella fig figurine serie liebig cromo chromo cat vero estratto carne anno""".split())

def tokens(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return [w for w in re.findall(r"[a-z]{4,}", s) if w not in STOP]

# ---------------------------------------------------------------- Supabase
def db_url():
    """Stringa di connessione da .env accanto allo script, o dall'ambiente."""
    env = pathlib.Path(BASE) / ".env"
    if env.exists():
        for riga in env.read_text(encoding="utf-8").splitlines():
            if riga.startswith("SUPABASE_DB_URL="):
                return riga.split("=", 1)[1].strip()
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        sys.exit("Manca SUPABASE_DB_URL: mettila in .env o nell'ambiente.")
    return url

def controlla_crollo(cur, meta, soglia):
    """Rifiuta una raccolta visibilmente incompleta.

    La pipeline gira senza nessuno che guardi: se la lettura di eBay va male a
    meta' strada, senza questo controllo il catalogo verrebbe ripubblicato con
    le quotazioni azzerate e nessuno se ne accorgerebbe fino a danno fatto.
    Restituisce il motivo del rifiuto, oppure None se si puo' procedere.
    """
    riga = cur.execute("select meta from public.rilevamenti where corrente").fetchone()
    if not riga:
        return None                      # primo rilevamento: non c'e' con cosa confrontare
    prima = riga[0]
    for campo, etichetta in (("n_inserzioni", "inserzioni lette"),
                             ("serie_con_mercato", "serie con mercato attivo")):
        vecchio, adesso = prima.get(campo), meta.get(campo)
        if vecchio and adesso is not None and adesso < vecchio * soglia:
            return (f"{etichetta}: {adesso} contro {vecchio} del rilevamento precedente "
                    f"({adesso / vecchio * 100:.0f}%, soglia {soglia * 100:.0f}%)")
    return None

def scrivi_supabase(serie, meta, soglia=0.6, forza=False):
    """Pubblica il rilevamento in una sola transazione.

    Il nuovo rilevamento nasce non corrente: diventa corrente solo in fondo,
    quando quotazioni e inserzioni sono gia' scritte. Se qualcosa fallisce a
    meta' strada, il sito continua a servire il rilevamento precedente.
    """
    oggi = datetime.date.today()
    with psycopg.connect(db_url(), connect_timeout=30, autocommit=False) as conn:
        cur = conn.cursor()

        motivo = controlla_crollo(cur, meta, soglia)
        if motivo and not forza:
            sys.exit(f"RACCOLTA INCOMPLETA, non pubblico nulla -> {motivo}. "
                     f"Il sito resta sul rilevamento precedente. Ripeti la raccolta, "
                     f"oppure rilancia con --forza se il calo e' reale.")
        if motivo:
            print(f"ATTENZIONE, pubblico lo stesso per via di --forza -> {motivo}")

        # 1. anagrafica: cambia solo se la fonte viene rivista
        cur.executemany("""
            insert into public.serie
                   (num, titolo, anno, anno_raw, nfig, uni, dem, cil, it, edizioni, nota_rarita)
            values (%s,  %s,     %s,   %s,       %s,   %s,  %s,  %s,  %s, %s,       %s)
            on conflict (num) do update set
                titolo = excluded.titolo, anno = excluded.anno, anno_raw = excluded.anno_raw,
                nfig = excluded.nfig, uni = excluded.uni, dem = excluded.dem, cil = excluded.cil,
                it = excluded.it, edizioni = excluded.edizioni, nota_rarita = excluded.nota_rarita
        """, [(s["num"], s["titolo"], s["anno"], s["anno_raw"], s["nfig"],
               s["uni"] or None, s["dem"] or None, s["cil"] or None,
               s["it"], s["edizioni"], s["nota_rarita"]) for s in serie])

        # 2. testata del rilevamento, ancora non corrente
        rid = cur.execute(
            "insert into public.rilevamenti (data, aggiornato, corrente, meta)"
            " values (%s, now(), false, %s) returning id",
            (oggi, json.dumps(meta, ensure_ascii=False))).fetchone()[0]

        # 3. quotazioni: una riga per serie, e' lo storico
        with cur.copy("""copy public.quotazioni
            (rilevamento_id, serie_num, p_med, p_min, p_max, p_stima, scost, fonte_prezzo,
             fascia, offerte, offerte_sciolte, offerte_tot, aste, rarita_score, percentile, rarita)
            from stdin""") as cp:
            for s in serie:
                cp.write_row((rid, s["num"], s["p_med"], s["p_min"], s["p_max"], s["p_stima"],
                              s["scost"], s["fonte_prezzo"], s["fascia"], s["offerte"],
                              s["offerte_sciolte"], s["offerte_tot"], s["aste"],
                              s["rarita_score"], s["percentile"], s["rarita"]))

        # 4. inserzioni abbinate
        n_ins = 0
        with cur.copy("""copy public.inserzioni
            (rilevamento_id, serie_num, titolo, prezzo, url, asta, singola, sped_gratis,
             ed, anno_ins, abbinamento) from stdin""") as cp:
            for s in serie:
                for l in s["_inserzioni"]:
                    cp.write_row((rid, s["num"], l["t"], l["prezzo"], l["url"], l["asta"],
                                  l["singola"], l["sped"], l["ed"], l["anno_ins"], l["match"]))
                    n_ins += 1

        # 5. pubblicazione atomica
        cur.execute("update public.rilevamenti set corrente = false where corrente")
        cur.execute("update public.rilevamenti set corrente = true where id = %s", (rid,))

        # 6. potatura: lo storico delle quotazioni resta, le inserzioni no
        potati = cur.execute("""
            delete from public.inserzioni where rilevamento_id in (
                select id from public.rilevamenti order by data desc, id desc
                offset %s) returning 1""", (RILEVAMENTI_CON_INSERZIONI,)).rowcount
        conn.commit()

    print(f"rilevamento {rid} del {oggi}: {len(serie)} quotazioni, {n_ins} inserzioni"
          + (f", potate {potati} inserzioni di rilevamenti vecchi" if potati > 0 else ""))


def main(soglia=0.6, forza=False, prova=False):
    serie = carica_serie()
    listings = carica_ebay()
    print(f"serie in catalogo: {len(serie)}")
    print(f"inserzioni eBay con prezzo: {len(listings)}")

    per_serie = collections.defaultdict(list)
    by_num = {s["num"]: s for s in serie}

    idx = {}
    for s in serie:
        tk = tokens(s["titolo"])
        if len(tk) >= 1:
            idx[s["num"]] = set(tk)

    def match_titolo(l):
        lt = set(tokens(l["t"]))
        if not lt:
            return None
        best, score = None, 0.0
        for num, tk in idx.items():
            if len(tk) < 2:
                continue
            inter = len(tk & lt)
            if not inter:
                continue
            sc = inter / len(tk)
            if sc > score:
                best, score = num, sc
        return best if (best and score >= 0.99) else None

    matched_num = matched_tit = conflitti = scartati = 0
    for l in listings:
        if l["tipo"] != "serie":
            continue
        t_match = match_titolo(l)
        num_ok = bool(l["num"]) and l["num"] in by_num
        # controllo di coerenza sull'anno: numerazioni estranee a Sanguinetti vengono scartate
        if (num_ok and l["anno_ins"] and by_num[l["num"]]["anno"]
                and abs(l["anno_ins"] - by_num[l["num"]]["anno"]) > 2):
            num_ok = False
            scartati += 1
        if num_ok:
            # il titolo di catalogo ha la precedenza sul numero dichiarato dal venditore
            if t_match and t_match != l["num"]:
                per_serie[t_match].append(dict(l, match="titolo"))
                conflitti += 1
                matched_tit += 1
            else:
                per_serie[l["num"]].append(dict(l, match="numero"))
                matched_num += 1
        elif t_match:
            per_serie[t_match].append(dict(l, match="titolo"))
            matched_tit += 1
    print(f"match per numero: {matched_num} | match per titolo: {matched_tit} | conflitti risolti sul titolo: {conflitti} | numeri scartati per anno incoerente: {scartati}")

    # ---------------------------------------------------------- statistiche
    tutte_ita = []
    for s in serie:
        ls = per_serie.get(s["num"], [])
        # priorità: inserzioni di edizione italiana o senza edizione dichiarata
        if s["it"]:
            ita = [l for l in ls if l["ed"] in (None, "IT")]
            pool_all = ita if ita else ls
        else:
            pool_all = ls
        # la quotazione si basa solo su serie complete; le figurine sciolte sono contate a parte
        pool = [l for l in pool_all if not l["singola"]] or []
        prezzi = sorted(l["prezzo"] for l in pool)
        s["offerte"] = len(pool)
        s["offerte_sciolte"] = len(pool_all) - len(pool)
        s["offerte_tot"] = len(ls)
        s["aste"] = sum(1 for l in pool if l["asta"])
        if prezzi:
            s["p_min"] = prezzi[0]
            s["p_med"] = round(statistics.median(prezzi), 2)
            s["p_max"] = prezzi[-1]
            s["fonte_prezzo"] = "mercato"
            tutte_ita.append((s, s["p_med"]))
        else:
            s["p_min"] = s["p_med"] = s["p_max"] = None
            s["fonte_prezzo"] = None
        # nel database finiscono tutte le inserzioni del pool considerato
        # (serie complete e figurine sciolte): quali mostrarne lo decide il sito
        s["_inserzioni"] = sorted(pool_all, key=lambda l: l["prezzo"])

    # ---------------------------------------------------------- stima da comparabili
    # mediana per decennio + numero di figurine, fallback decennio, fallback globale
    globale = statistics.median([pm for _, pm in tutte_ita]) if tutte_ita else 0

    def stima_comparabili(s):
        """Mediana delle serie con mercato osservato entro una finestra temporale,
        prima a pari numero di figurine, poi allargando."""
        if not s["anno"]:
            return round(globale, 2)
        for span, samefig in ((8, True), (8, False), (15, False), (30, False)):
            v = [pm for o, pm in tutte_ita
                 if o["anno"] and abs(o["anno"] - s["anno"]) <= span and o["num"] != s["num"]
                 and (not samefig or o["nfig"] == s["nfig"])]
            if len(v) >= 6:
                return round(statistics.median(v), 2)
        return round(globale, 2)

    for s in serie:
        s["p_stima"] = stima_comparabili(s)
        if s["fonte_prezzo"] == "mercato":
            s["scost"] = round((s["p_med"] - s["p_stima"]) / s["p_stima"] * 100, 1) if s["p_stima"] else None
        else:
            s["p_med"] = s["p_stima"]
            s["scost"] = None
            s["fonte_prezzo"] = "stima"

    # ---------------------------------------------------------- indice di rarità
    # componenti: scarsità di offerta (0-55), epoca (0-25), nota di rarità (0-20)
    max_off = max((s["offerte"] for s in serie), default=1) or 1
    for s in serie:
        off = s["offerte"]
        scarsita = 55 * (1 - min(off, 8) / 8)
        # epoca: lineare dal 1975 (0 punti) al 1872 (25 punti)
        eta = 25 * max(0.0, min(1.0, (1975 - s["anno"]) / 103)) if s["anno"] else 12.5
        nota = 20 if s["nota_rarita"] else 0
        score = round(scarsita + eta + nota, 1)
        s["rarita_score"] = score

    # rarità RELATIVA: quintili sul punteggio composito all'interno del corpus
    ordinate = sorted(serie, key=lambda x: x["rarita_score"])
    n = len(ordinate)
    # attenzione: la variabile del ciclo qui sotto non deve chiamarsi "soglia".
    # Python non delimita lo scope al ciclo: il nome sopravvive fino in fondo a
    # main() e finirebbe nella chiamata a scrivi_supabase() al posto del
    # parametro, portandosi dietro l'ultimo quintile (1.01).
    etichette = [(0.20, "Comune"), (0.40, "Bassa"), (0.60, "Media"), (0.80, "Alta"), (1.01, "Estrema")]
    for i, s in enumerate(ordinate):
        pct = (i + 0.5) / n
        s["percentile"] = round(pct * 100, 1)
        for limite, lab in etichette:
            if pct <= limite:
                s["rarita"] = lab
                break

    # fasce di prezzo
    for s in serie:
        p = s["p_med"] or 0
        s["fascia"] = ("0-5" if p < 5 else "5-15" if p < 15 else "15-40" if p < 40 else
                       "40-100" if p < 100 else "100+")

    meta = {
        "aggiornato": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "n_serie": len(serie),
        "n_serie_it": sum(1 for s in serie if s["it"]),
        "anno_min": min(s["anno"] for s in serie if s["anno"]),
        "anno_max": max(s["anno"] for s in serie if s["anno"]),
        "n_inserzioni": len(listings),
        "n_inserzioni_abbinate": sum(len(v) for v in per_serie.values()),
        "serie_con_mercato": sum(1 for s in serie if s["offerte"] > 0),
        "mediana_globale": round(globale, 2),
    }
    if prova:
        print("--- modalita' di prova: nessuna scrittura sul database ---")
        print(json.dumps(meta, indent=2, ensure_ascii=False))
        print(collections.Counter(s["rarita"] for s in serie))
        print(collections.Counter(s["fascia"] for s in serie))
        return serie, meta

    scrivi_supabase(serie, meta, soglia=soglia, forza=forza)
    return serie, meta

def leggi_opzioni():
    import argparse
    ap = argparse.ArgumentParser(description="Costruisce il rilevamento e lo scrive su Supabase.")
    ap.add_argument("--forza", action="store_true",
                    help="pubblica anche se la raccolta sembra incompleta")
    ap.add_argument("--soglia", type=float, default=0.6,
                    help="quota minima rispetto al rilevamento precedente (default 0.6)")
    ap.add_argument("--prova", action="store_true",
                    help="calcola tutto e mostra il risultato senza scrivere sul database")
    return ap.parse_args()

if __name__ == "__main__":
    o = leggi_opzioni()
    main(soglia=o.soglia, forza=o.forza, prova=o.prova)
