# Aggiornamento giornaliero su Synology DS218+

Il DS218+ (Celeron J3355, x86-64, 2 GB) regge il lavoro: Chromium headless gira,
a patto di non fargli caricare immagini e di dargli abbastanza `/dev/shm`. Sono
entrambe cose gia' previste in `raccolta_ebay.py` e `docker-compose.yml`.

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

La raccolta dura 25-30 minuti, quindi partendo alle 07:30 il rilevamento e' pubblicato
verso le 08:00. Non serve che il sito venga ripubblicato: legge i dati dal database.

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
