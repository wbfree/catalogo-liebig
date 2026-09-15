#!/usr/bin/env python3
"""Genera le icone della PWA dal segno del catalogo.

Lo stesso barattolo del favicon, inchiostro oxblood su carta d'archivio.
Le icone sono file binari: averle prodotte da uno script invece che a mano
significa poterle rifare identiche se cambiano dimensioni o colori.

    python automazione/genera_icone.py
"""
import pathlib
from PIL import Image, ImageDraw

RADICE = pathlib.Path(__file__).resolve().parent.parent
USCITA = RADICE / "site" / "icone"

CARTA = (246, 241, 231)
OXBLOOD = (140, 28, 34)
SCALA = 8          # si disegna in grande e si riduce: bordi puliti

# coordinate del favicon, su una tela di 32
BARATTOLO = [(9, 10), (23, 10), (23, 13), (21, 24), (11, 24), (9, 13)]
COPERCHIO = [(12, 7), (20, 7)]

def disegna(lato, margine=0.0, sfondo=CARTA):
    """margine 0 = icona normale; 0.2 = icona mascherabile, con il segno
    rimpicciolito perche' Android puo' ritagliarla in cerchio."""
    grande = lato * SCALA
    img = Image.new("RGB", (grande, grande), sfondo)
    d = ImageDraw.Draw(img)

    utile = grande * (1 - 2 * margine)
    k = utile / 32
    off = grande * margine

    def punto(p):
        return (off + p[0] * k, off + p[1] * k)

    spessore = max(1, int(2.2 * k))
    # si ripetono i primi DUE punti: con uno solo la giunzione di chiusura
    # resta senza raccordo e in quell'angolo compare uno scalino
    chiuso = BARATTOLO + [BARATTOLO[0], BARATTOLO[1]]
    d.line([punto(x) for x in chiuso], fill=OXBLOOD, width=spessore, joint="curve")
    d.line([punto(p) for p in COPERCHIO], fill=OXBLOOD, width=spessore)
    return img.resize((lato, lato), Image.LANCZOS)

def main():
    USCITA.mkdir(parents=True, exist_ok=True)
    fatti = []
    for nome, lato, margine in [("icona-192.png", 192, 0.0),
                                ("icona-512.png", 512, 0.0),
                                ("icona-maskable-512.png", 512, 0.18),
                                ("apple-touch-icon.png", 180, 0.06)]:
        img = disegna(lato, margine)
        p = USCITA / nome
        img.save(p, "PNG", optimize=True)
        fatti.append(f"  {nome:<26} {lato}x{lato}  {p.stat().st_size / 1024:.1f} KB")
    print("\n".join(fatti))

if __name__ == "__main__":
    main()
