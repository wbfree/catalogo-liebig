# Aggiornamento giornaliero su Synology DS218+

Dalla versione 2 la raccolta usa la **Browse API di eBay** invece di un browser: niente
Chromium, immagine di poche decine di MB, costruzione in meno di un minuto e
aggiornamento completo in circa due. Sul DS218+ (Celeron J3355, 2 GB) il lavoro e'
diventato trascurabile.

Servono le chiavi eBay in `.env`: `EBAY_CLIENT_ID` e `EBAY_CLIENT_SECRET`, dal keyset di
**produzione**.

Serve **solo per il job giornaliero**. Il sito e' fatto di file statici che
parlano direttamente con Supabase: non ha bisogno di questo contenitore, ne' di
essere sullo stesso computer.

Chi fa cosa, per non confondersi:

| | |
|---|---|
| **Container Manager** | costruisce l'immagine e mostra log, immagini e spazio occupato |
| **Task Scheduler** | e' l'unico posto dove vive la pianificazione giornaliera |

Un lavoro che comincia e finisce non e' un servizio: non va lasciato in moto dalla GUI di
Container Manager, va avviato dal Task Scheduler una volta al giorno.

## 1. Preparazione

Su DSM 7, da Package Center, installa **Container Manager** (nelle versioni piu'
vecchie si chiama Docker).

Porta il repository sul NAS, per esempio in `/volume1/docker/catalogo-liebig`:
via File Station da una cartella condivisa, oppure con `git clone` se hai Git.

Dentro quella cartella deve esserci il file **`.env`** con le credenziali
Supabase. Non e' nel repository (e' escluso apposta): copialo a mano dal tuo
computer. Serve la riga `SUPABASE_DB_URL`, con il pooler:

```
SUPABASE_DB_URL=postgresql://postgres.twkhcynefhltiuwlzkqe:LA_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Metti i permessi stretti, visto che contiene una password:

```bash
chmod 600 /volume1/docker/catalogo-liebig/.env
```

## 2. Costruzione dell'immagine

**Non serve fare niente a mano.** Alla prima esecuzione `nas_job.sh` si accorge che
l'immagine non c'e' e la costruisce da solo. Salta al passo 4, crea il compito
pianificato e premi **Run** dalla GUI del Task Scheduler: la prima esecuzione costruisce
e poi aggiorna. Ci vogliono diversi minuti in piu' perche' scarica Chromium; l'immagine
occupa circa 1,5 GB.

### Perche' non il Progetto di Container Manager

Sconsigliato, e non per gusto. Il `docker-compose.yml` usa percorsi **relativi alla
propria posizione**: il `Dockerfile` accanto e il repository in `..`. Creando un Progetto,
Container Manager puo' collocare il compose in una cartella propria, e allora quei
percorsi puntano nel vuoto:

```
unable to prepare context: unable to evaluate symlinks in Dockerfile path
```

`nas_job.sh` non ha questo problema perche' entra nella cartella giusta prima di lanciare
compose. Se proprio vuoi usare un Progetto, deve puntare esattamente a
`/volume1/docker/catalogo-liebig/automazione`, la cartella dove stanno **sia** il compose
**sia** il Dockerfile.

### Oppure da SSH

```bash
cd /volume1/docker/catalogo-liebig/automazione && /usr/local/bin/docker compose build
```

### In ogni caso

Il codice del progetto **non** entra nell'immagine, arriva dal volume montato: quando
aggiorni il repository con `git pull` non devi ricostruire nulla. La ricostruzione serve
solo se cambi le versioni di `psycopg` o `playwright` nel `Dockerfile`.

## 3. Prova a mano

Prima di pianificare, esegui una volta guardando cosa succede:

```bash
cd /volume1/docker/catalogo-liebig/automazione && /usr/local/bin/docker compose run --rm aggiornamento
```

Dura circa 25-30 minuti. Alla fine devi vedere le due righe di riepilogo: quante
inserzioni sono state raccolte e quale rilevamento e' stato scritto.

Per una prova piu' corta, meno pagine per query:

```bash
/usr/local/bin/docker compose run --rm aggiornamento --pagine 2 --minimo 500
```

Attenzione: con poche pagine la raccolta e' volutamente incompleta, quindi
`build_dataset.py` la **rifiutera'** confrontandola con il rilevamento
precedente. E' il comportamento giusto; e' anche il modo piu' semplice per
verificare che la protezione funzioni.

## 4. Pianificazione

**Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script**

- **Utente**: `root` (serve per parlare con Docker)
- **Pianificazione**: ogni giorno alle 07:30
- **Comando**: una riga sola

```bash
/volume1/docker/catalogo-liebig/automazione/nas_job.sh
```

`nas_job.sh` si occupa del resto: trova il comando compose giusto (`docker compose`
su Container Manager, `docker-compose` sul vecchio pacchetto), entra nella cartella
giusta, scrive un log datato in `log/` tenendo gli ultimi 60 giorni, e soprattutto
**propaga il codice di uscita** dell'aggiornamento.

Quest'ultimo punto non e' un dettaglio: in una pipeline `comando | tee`, `$?` e' l'esito
di `tee`, non del comando. Senza l'accorgimento che c'e' nello script, ogni esecuzione
risulterebbe riuscita anche quando fallisce, e la notifica per posta non arriverebbe mai.

Rendilo eseguibile la prima volta:

```bash
chmod +x /volume1/docker/catalogo-liebig/automazione/nas_job.sh
```

Nella scheda **Task Settings** spunta **Send run details by email** e
**Send run details only when the script terminates abnormally**: cosi' ricevi un
messaggio solo quando qualcosa e' andato storto, che e' quello che serve per un job non
presidiato.

Non modificare `/etc/crontab` a mano: DSM lo riscrive agli aggiornamenti di sistema e il
job sparirebbe senza preavviso.

L'aggiornamento completo dura un paio di minuti, quindi partendo alle 07:30 il
rilevamento e' pubblicato entro le 07:35. Non serve che il sito venga ripubblicato: legge i dati dal database.

### La raccolta sembra ferma

Con la Browse API non dovrebbe succedere: l'intera raccolta dura circa 90 secondi e ogni
chiave lascia una riga. Se invece stai usando la riserva a browser e non compaiono righe
con la CPU vicina allo zero, non e' lentezza ma attesa. Per capire dove:

```bash
cd /volume1/docker/catalogo-liebig/automazione
/usr/local/bin/docker compose run --rm --entrypoint python aggiornamento     automazione/raccolta_ebay.py --diagnosi
```

Prova un pezzo alla volta cronometrando: DNS, connessione a eBay, avvio di Chromium,
apertura della scheda, caricamento della home, caricamento di una pagina di ricerca ed
estrazione. La prima riga che si ferma o fallisce dice dove e' il problema.

| Dove si ferma | Cosa vuol dire |
|---|---|
| DNS o connessione TCP | il container non ha rete o non risolve i nomi |
| avvio di Chromium | dipendenze mancanti nell'immagine, oppure `/dev/shm` troppo piccolo |
| caricamento delle pagine | eBay non risponde da quell'indirizzo IP |
| estrazione a zero inserzioni | i selettori sono cambiati, o eBay serve una pagina di blocco |

Con la CPU a zero e nessuna riga di log, guarda anche se il container e' davvero vivo:

```bash
/usr/local/bin/docker stats --no-stream
/usr/local/bin/docker ps
```

### La costruzione dell'immagine fallisce sui font

```
E: Package 'ttf-unifont' has no installation candidate
E: Package 'ttf-ubuntu-font-family' has no installation candidate
Failed to install browsers
```

`playwright install --with-deps` sta cercando pacchetti **Ubuntu** su una base **Debian**.
Succede quando la versione di Debian dell'immagine di base e' piu' recente di quelle che
quella versione di Playwright conosce: ripiega sull'elenco Ubuntu, dove i font si chiamano
`ttf-*` invece di `fonts-*`.

Per questo il `Dockerfile` appunta `python:3.12-slim-bookworm` e non `python:3.12-slim`:
il secondo oggi e' Debian 13 (trixie), che Playwright 1.47 non riconosce. Se alzi la
versione di Playwright, guarda prima quali distribuzioni conosce, in
`playwright/driver/package/lib/server/registry/nativeDeps.js`.

Dopo aver corretto il `Dockerfile` la costruzione va rifatta da zero:

```bash
cd /volume1/docker/catalogo-liebig/automazione && /usr/local/bin/docker compose build --no-cache
```

## 5. Quando qualcosa va storto

La catena e' costruita perche' un guasto non produca mai un catalogo sbagliato:

| Cosa succede | Conseguenza |
|---|---|
| eBay risponde male, raccolta sotto le 3.000 inserzioni | `ebay_active.json` **non** viene sostituito, la catena si ferma, il sito resta su ieri |
| Raccolta completata ma molto piu' magra del solito (sotto il 60 %) | `build_dataset.py` rifiuta di pubblicare e spiega di quanto e' calato |
| Errore a meta' scrittura sul database | la transazione torna indietro, il rilevamento precedente resta corrente |

Se il calo e' reale e non un guasto, si pubblica a mano:

```bash
/usr/local/bin/docker compose run --rm aggiornamento --pagine 8
# poi, solo se sei convinto:
/usr/local/bin/docker compose run --rm --entrypoint python aggiornamento build_dataset.py --forza
```

Per tornare a un rilevamento precedente basta spostare il flag, senza
ricostruire niente:

```sql
update rilevamenti set corrente = false where corrente;
update rilevamenti set corrente = true  where id = <id del rilevamento buono>;
```

## 6. Manutenzione

`storico/` accumula una copia di `ebay_active.json` al giorno, circa 2,8 MB
l'una: poco meno di 1 GB l'anno. Su un NAS non e' un problema, ma se vuoi
tenerla corta aggiungi una riga alla fine di `aggiorna.sh`:

```sh
find /app/storico -name 'ebay_active_*.json' -mtime +90 -delete
```

Nel database le **quotazioni non vengono mai potate** (sono lo storico dei
prezzi, il motivo per cui il catalogo sta su un database), mentre le singole
inserzioni si conservano solo per gli ultimi 7 rilevamenti. La soglia e'
`RILEVAMENTI_CON_INSERZIONI` in `build_dataset.py`.

Un ultimo avviso: i progetti Supabase gratuiti vengono **sospesi dopo una
settimana di inattivita'**. Finche' il job gira ogni giorno il progetto resta
sveglio da solo; se spegni il NAS per una vacanza lunga, al ritorno potresti
dover riattivare il progetto dal pannello prima che il sito torni a caricare.

## 7. Tornare alla riserva a browser

`automazione/raccolta_ebay.py` legge le pagine con Playwright ed e' conservato nel caso
l'accesso all'API venga meno. Non funziona con l'immagine attuale, che non contiene
Chromium. Per usarlo servono due modifiche al `Dockerfile`:

```dockerfile
FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir "psycopg[binary]>=3.2" "playwright==1.47.0"  && playwright install --with-deps chromium
```

La base **deve** essere `bookworm` e non `python:3.12-slim`: quest'ultimo e' Debian 13
(trixie), che Playwright 1.47 non riconosce, e la costruzione muore cercando pacchetti
Ubuntu (`ttf-unifont`). Vanno rimessi anche `shm_size: '1gb'` nel compose, perche' i
64 MB predefiniti di `/dev/shm` fanno morire Chromium, e un `mem_limit` piu' alto.

Poi in `aggiorna.sh` si sostituisce `raccolta_ebay_api.py` con `raccolta_ebay.py`.
