# Immagine per l'aggiornamento giornaliero del catalogo su Synology DS218+
# (Celeron J3355, x86-64). Si parte da python:slim e si installa Chromium con
# Playwright invece di usare le immagini mcr.microsoft.com/playwright, cosi'
# non c'e' da inseguire la corrispondenza fra tag dell'immagine e versione
# della libreria.
#
# La versione di Debian e' appuntata di proposito e NON va aggiornata alla
# leggera: "playwright install --with-deps" ha un elenco di pacchetti diverso
# per ogni distribuzione, e la 1.47 conosce solo debian11, debian12 e le
# ubuntu 20.04/22.04/24.04. Il tag python:3.12-slim oggi e' Debian 13
# (trixie), che Playwright non riconosce: ripiega sui nomi Ubuntu e la
# costruzione muore con
#     E: Package 'ttf-unifont' has no installation candidate
# Se alzi la versione di playwright, controlla prima cosa c'e' in
# playwright/driver/package/lib/server/registry/nativeDeps.js.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TZ=Europe/Rome

WORKDIR /app

# psycopg per il database, playwright per la raccolta
RUN pip install --no-cache-dir "psycopg[binary]>=3.2" "playwright==1.47.0" \
 && playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

# il codice arriva dal volume montato: qui non si copia nulla, cosi' un
# aggiornamento del repository non richiede di ricostruire l'immagine
ENTRYPOINT ["/bin/sh", "/app/automazione/aggiorna.sh"]
