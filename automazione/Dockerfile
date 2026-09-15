# Immagine per l'aggiornamento giornaliero del catalogo.
#
# La raccolta parla con la Browse API di eBay, quindi qui dentro non serve
# altro che Python e due librerie: poche decine di MB, e la costruzione sta
# sotto il minuto anche sul Celeron del DS218+.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Europe/Rome

WORKDIR /app

RUN pip install --no-cache-dir "psycopg[binary]>=3.2" "requests>=2.31"

# il codice arriva dal volume montato: qui non si copia nulla, cosi' un
# aggiornamento del repository non richiede di ricostruire l'immagine
ENTRYPOINT ["/bin/sh", "/app/automazione/aggiorna.sh"]
