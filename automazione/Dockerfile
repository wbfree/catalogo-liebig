# Immagine per l'aggiornamento giornaliero del catalogo.
#
# Da quando la raccolta usa la Browse API di eBay non serve piu' un browser:
# niente Chromium, niente dipendenze di sistema, niente /dev/shm da allargare.
# L'immagine e' passata da circa 1,5 GB a poche decine di MB e si costruisce
# in meno di un minuto anche sul Celeron del DS218+.
#
# Se un giorno servisse tornare al raccoglitore a browser
# (automazione/raccolta_ebay.py, tenuto come riserva), quello richiede
# playwright e una base Debian che Playwright riconosca: vedi SYNOLOGY.md.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Europe/Rome

WORKDIR /app

RUN pip install --no-cache-dir "psycopg[binary]>=3.2" "requests>=2.31"

# il codice arriva dal volume montato: qui non si copia nulla, cosi' un
# aggiornamento del repository non richiede di ricostruire l'immagine
ENTRYPOINT ["/bin/sh", "/app/automazione/aggiorna.sh"]
