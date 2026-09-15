#!/bin/sh
# Involucro da agganciare al Task Scheduler di DSM. Un solo percorso da
# incollare, e ogni esecuzione lascia una traccia leggibile.
#
#   Control Panel -> Task Scheduler -> Create -> Scheduled Task -> User-defined script
#   Utente: root      Comando: /volume1/docker/catalogo-liebig/automazione/nas_job.sh
#
# Esce con 0 se l'aggiornamento e' andato a buon fine, con il codice dello
# script fallito altrimenti: cosi' la spunta "Send run details only when the
# script terminates abnormally" manda la posta solo quando serve davvero.

RADICE="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$RADICE/log"
LOG="$LOG_DIR/aggiornamento-$(date '+%Y-%m-%d').log"

mkdir -p "$LOG_DIR"

# Container Manager (DSM 7.2) usa "docker compose"; il vecchio pacchetto
# Docker usa "docker-compose". Si prende quello che c'e'.
if [ -x /usr/local/bin/docker ] && /usr/local/bin/docker compose version >/dev/null 2>&1; then
    COMPOSE="/usr/local/bin/docker compose"
elif [ -x /usr/local/bin/docker-compose ]; then
    COMPOSE="/usr/local/bin/docker-compose"
else
    echo "Non trovo ne' 'docker compose' ne' 'docker-compose'. Container Manager e' installato?" >&2
    exit 127
fi

cd "$RADICE/automazione" || exit 1

# "docker compose version" risponde anche a demone spento o irraggiungibile,
# quindi il controllo qui sopra non basta: per sapere se si puo' davvero
# parlare con Docker bisogna chiedergli qualcosa di vero. Senza questa verifica
# un errore di permessi sul socket verrebbe scambiato per "immagine assente",
# avviando una costruzione di diversi minuti gia' condannata.
ERRORE="$(mktemp)"
IMMAGINE="$($COMPOSE images -q aggiornamento 2>"$ERRORE")"
ESITO_IMMAGINI=$?
if [ "$ESITO_IMMAGINI" -ne 0 ]; then
    {
        echo "Non riesco a parlare con Docker (codice $ESITO_IMMAGINI):"
        cat "$ERRORE"
        echo
        echo "Se l'errore parla di permessi negati sul socket, il compito sta"
        echo "girando con un utente qualunque: deve girare come 'root'."
        echo "Control Panel -> Task Scheduler -> il compito -> Edit -> General -> User: root"
    } | tee -a "$LOG" >&2
    rm -f "$ERRORE"
    exit "$ESITO_IMMAGINI"
fi
rm -f "$ERRORE"

# Prima esecuzione: se l'immagine non c'e' la si costruisce qui. Cosi' non
# serve ne' SSH ne' un progetto di Container Manager, e i percorsi relativi
# del compose (il Dockerfile accanto, il repository in ..) sono corretti
# perche' siamo gia' nella cartella giusta.
if [ -z "$IMMAGINE" ]; then
    echo "Immagine assente: la costruisco (meno di un minuto)." | tee -a "$LOG"
    STATO_BUILD="$(mktemp)"
    { $COMPOSE build 2>&1; echo $? > "$STATO_BUILD"; } | tee -a "$LOG"
    ESITO_BUILD="$(cat "$STATO_BUILD")"
    rm -f "$STATO_BUILD"
    if [ "$ESITO_BUILD" -ne 0 ]; then
        echo "COSTRUZIONE FALLITA (codice $ESITO_BUILD). Dettaglio in $LOG" | tee -a "$LOG" >&2
        exit "$ESITO_BUILD"
    fi
fi

# stdout e stderr finiscono sia nel log sia nella posta del Task Scheduler.
# L'esito passa da un file perche' in una pipeline $? e' quello di tee, non
# quello del comando: senza questo accorgimento ogni esecuzione risulterebbe
# riuscita anche quando fallisce.
STATO="$(mktemp)"
{ $COMPOSE run --rm aggiornamento "$@" 2>&1; echo $? > "$STATO"; } | tee -a "$LOG"
ESITO="$(cat "$STATO")"
rm -f "$STATO"

# i log piu' vecchi di 60 giorni non servono a nessuno
find "$LOG_DIR" -name 'aggiornamento-*.log' -mtime +60 -delete 2>/dev/null

if [ "$ESITO" -ne 0 ]; then
    echo "AGGIORNAMENTO FALLITO (codice $ESITO). Dettaglio in $LOG" | tee -a "$LOG" >&2
fi
exit "$ESITO"
