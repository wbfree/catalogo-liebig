# Estrae {t,p,r,u} dalle pagine di ricerca eBay salvate come HTML.
import glob, json, sys, re
from bs4 import BeautifulSoup

def txt(e):
    return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def parse(path):
    soup = BeautifulSoup(open(path, encoding="utf-8", errors="ignore").read(), "html.parser")
    out = []
    for li in soup.select("li.s-card, li.s-item"):
        t = txt(li.select_one(".s-card__title, .s-item__title"))
        if not t or re.search(r"Shop on eBay", t, re.I):
            continue
        p = txt(li.select_one(".s-card__price, .s-item__price"))
        r = " | ".join(x for x in (txt(e) for e in li.select(".s-card__attribute-row, .s-item__detail")) if x)
        a = li.select_one('a[href*="/itm/"]')
        if not p or not a:
            continue
        out.append({"t": t, "p": p, "r": r, "u": a["href"].split("?")[0]})
    return out

if __name__ == "__main__":
    seen, rows = set(), []
    for f in sorted(glob.glob(sys.argv[1])):
        for b in parse(f):
            if b["u"] not in seen:
                seen.add(b["u"]); rows.append(b)
    json.dump(rows, open(sys.argv[2], "w"), ensure_ascii=False)
    print(len(rows))
