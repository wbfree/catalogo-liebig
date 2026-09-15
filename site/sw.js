/* Service worker del Catalogo Liebig.

   Due compiti:
   - tenere in cache l'applicazione (HTML, CSS, JS, icone) cosi' si apre anche
     senza rete, come ci si aspetta da un'applicazione installata;
   - tenere una copia dell'ultimo catalogo letto da Supabase, per poterlo
     mostrare offline invece di una schermata di errore.

   Quello che NON viene mai messo in cache: le scritture dell'inventario. Una
   modifica alla collezione deve arrivare al database o fallire in modo
   visibile, mai essere servita da una copia vecchia. */

const VERSIONE = 'liebig-v6';
const GUSCIO = VERSIONE + '-guscio';
const DATI = VERSIONE + '-dati';

const FILE = [
  './', './index.html', './css/app.css',
  './js/config.js', './js/db.js', './js/app.js', './js/ocr.js',
  './manifest.json',
  './icone/icona-192.png', './icone/icona-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

/* Le letture del catalogo sono paginate con l'intestazione Range: stessa URL,
   contenuti diversi. La chiave di cache deve quindi includere il Range, o la
   seconda pagina sovrascriverebbe la prima. */
function chiave(richiesta) {
  const range = richiesta.headers.get('Range');
  if (!range) return richiesta.url;
  return richiesta.url + (richiesta.url.includes('?') ? '&' : '?') + '__range=' + encodeURIComponent(range);
}

/* Le risposte parziali (206) non si possono mettere in cache: cache.put le
   rifiuta. Si riconfeziona il corpo in una risposta 200 conservando le
   intestazioni, fra cui Content-Range, che serve all'applicazione per sapere
   quante righe ci sono in tutto. */
async function conservabile(risposta) {
  if (risposta.status !== 206) return risposta.clone();
  const copia = risposta.clone();
  return new Response(await copia.blob(), {
    status: 200,
    statusText: 'OK (da 206)',
    headers: copia.headers
  });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(GUSCIO);
    // uno per uno: se una risorsa esterna non risponde, l'installazione
    // non deve fallire in blocco
    await Promise.all(FILE.map(f => cache.add(f).catch(() => null)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi.filter(n => !n.startsWith(VERSIONE)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const supabase = url.hostname.endsWith('.supabase.co');

  // tutto cio' che non e' una lettura passa dritto: scritture dell'inventario,
  // autenticazione, qualunque POST o DELETE
  if (req.method !== 'GET') return;

  // navigazione: si serve il guscio, cosi' l'applicazione parte comunque
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // dati del catalogo: prima la rete, e se non risponde l'ultima copia buona
  if (supabase) {
    e.respondWith((async () => {
      const k = chiave(req);
      try {
        const risposta = await fetch(req);
        if (risposta.ok) {
          const cache = await caches.open(DATI);
          cache.put(k, await conservabile(risposta));
        }
        return risposta;
      } catch (err) {
        const salvata = await caches.match(k);
        if (salvata) return salvata;
        throw err;
      }
    })());
    return;
  }

  // applicazione e risorse: prima la cache, e intanto si aggiorna
  e.respondWith((async () => {
    const salvata = await caches.match(req);
    const dallaRete = fetch(req).then(async r => {
      if (r.ok) (await caches.open(GUSCIO)).put(req, r.clone());
      return r;
    }).catch(() => salvata);
    return salvata || dallaRete;
  })());
});
