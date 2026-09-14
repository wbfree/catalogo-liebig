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

Serve una volta sola. Su questo processore ci vogliono diversi minuti (scarica Chromium
e le sue dipendenze di sistema) e l'immagine occupa circa 1,5 GB.

### Con Container Manager, senza riga di comando

**Container Manager → Progetto → Crea**

- **Nome progetto**: `catalogo-liebig`
- **Percorso**: `/volume1/docker/catalogo-liebig/automazione`
- **Sorgente**: usa il `docker-compose.yml` gia' presente nella cartella

Alla creazione Container Manager costruisce l'immagine e **avvia subito il progetto**:
vale come prima esecuzione completa, quindi mettiti l'anima in pace per mezz'ora e
guarda i log dalla scheda del progetto.

Finita quella, il container esce da solo e il progetto risulta **fermo**: e' normale e
giusto. Questo non e' un servizio che deve restare acceso, e' un lavoro che comincia e
finisce. Per lo stesso motivo nel `docker-compose.yml` c'e' `restart: "no"`, altrimenti
Container Manager lo rimetterebbe in moto in continuazione.

Da li' in poi **non far partire il progetto dalla GUI**: ci pensa il Task Scheduler al
passo 4, che e' l'unico posto dove la pianificazione deve stare. Container Manager resta
utile per guardare i log, l'immagine e lo spazio occupato.

### Oppure da SSH

```bash
cd /volume1/docker/catalogo-liebig/automazione && /usr/local/bin/docker compose build
```

### In entrambi i casi

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
