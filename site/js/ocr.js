/* Riconoscimento della serie da una foto della figurina.

   Il titolo della serie e' stampato in cartiglio sul fronte di molte
   edizioni: fotografandolo si puo' risalire alla serie. Due cose, provate sul
   campo, decidono se funziona o no:

   1. La striscia da leggere deve contenere SOLO la riga del titolo. Con la
      didascalia sotto, o un lembo di illustrazione, la sogliatura viene decisa
      da quelli e il testo scuro sul cartiglio colorato sparisce: misurato, la
      stessa fascia alta 311 pixel da' "Nr. 2. PINO. = # N , i Ar MM", la sua
      meta' alta da' "Alberi di differenti latitudini.". Non si pretende
      un'inquadratura perfetta: si provano porzioni via via piu' strette della
      fascia indicata, fermandosi alla prima che aggancia il catalogo.
   2. Il confronto col catalogo va fatto senza spazi e con tolleranza. Su una
      figurina logora l'OCR restituisce "Aberididifierentilatitudini": parola
      per parola non aggancia niente, come sequenza di lettere e' al 94% di
      "ALBERI DI DIFFERENTI LATITUDINI".

   Tesseract si scarica solo quando serve: sono una decina di megabyte, che
   non vanno messi sulle spalle di chi apre il catalogo per consultarlo. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const SOGLIA = 0.70;      // sotto, meglio dire "non riconosciuto" che indovinare
  const RIGHE = new RegExp('[' + String.fromCharCode(13, 10) + ']+');

  let lavoratore = null, immagine = null;

  /* ---------------------------------------------------------- confronto */
  const norm = s => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');

  /* Distanza di Levenshtein tenendo in memoria una riga sola: 1.871 titoli da
     una trentina di caratteri si confrontano in pochi millisecondi. */
  function distanza(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const riga = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prec = riga[0];
      riga[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = riga[j];
        riga[j] = Math.min(riga[j] + 1, riga[j - 1] + 1, prec + (a[i - 1] === b[j - 1] ? 0 : 1));
        prec = tmp;
      }
    }
    return riga[b.length];
  }

  /* Un titolo di serie sta fra una manciata e una settantina di lettere. Le
     righe fuori da questa misura non possono esserlo: scartarle evita di
     confrontare con il catalogo la spazzatura che l'OCR produce quando nel
     ritaglio finisce un'illustrazione invece di una scritta. */
  const MAX_TITOLO = 70;
  const plausibile = t => { const n = norm(t).length; return n >= 6 && n <= MAX_TITOLO; };

  /* Si confronta ogni riga letta separatamente, oltre al blocco intero: se nel
     ritaglio entra anche la didascalia ("Nr. 2. PINO."), confrontare tutto
     insieme abbassa la somiglianza col titolo e la fa scendere sotto soglia.
     Riga per riga, invece, l'inquadratura generosa non fa danno. */
  function candidati(testoGrezzo, quanti = 3) {
    const pezzi = String(testoGrezzo ?? '').split(RIGHE)
      .map(x => x.trim()).filter(plausibile);
    const intero = String(testoGrezzo ?? '').replace(/\s+/g, ' ').trim();
    if (plausibile(intero)) pezzi.push(intero);
    if (!pezzi.length) return [];

    const serie = (window.LIEBIG && window.LIEBIG.serie()) || [];
    const meglio = new Map();
    for (const pezzo of pezzi) {
      const t = norm(pezzo);
      for (const s of serie) {
        const n = norm(s.titolo);
        if (!n) continue;
        const r = 1 - distanza(t, n) / Math.max(t.length, n.length);
        const prec = meglio.get(s.num);
        if (!prec || r > prec.r) meglio.set(s.num, { s, r, pezzo });
      }
    }
    return [...meglio.values()].sort((a, b) => b.r - a.r).slice(0, quanti);
  }

  /* ------------------------------------------------------------ pannello */
  function apri() {
    $('#ocr').hidden = false;
    document.body.classList.add('bloccato');
    const p = document.querySelector('#ocr .drawer-in');
    if (p) p.scrollTop = 0;
  }

  function chiudi() {
    $('#ocr').hidden = true;
    document.body.classList.remove('bloccato');
    if (immagine) { URL.revokeObjectURL(immagine); immagine = null; }
  }

  const corpo = html => { $('#ocrCorpo').innerHTML = html; };
  const scatta = () => $('#ocrFile').click();

  /* ------------------------------------------------- inquadra la fascia */
  function inquadra(url) {
    corpo(
      '<p class="ocr-guida"><b>Tocca il titolo</b> sulla figurina — la scritta in alto — ' +
      'o trascina la fascia. Non serve precisione: la riga giusta la cerco io ' +
      'dentro alla fascia.</p>' +
      '<div class="ocr-telaio">' +
        '<div class="ocr-tela" id="ocrTela">' +
          '<img id="ocrImg" src="' + esc(url) + '" alt="">' +
          '<div class="ocr-ombra" id="ombraSopra"></div>' +
          '<div class="ocr-ombra" id="ombraSotto"></div>' +
          '<div class="ocr-banda" id="ocrBanda">' +
            '<span class="ocr-etichetta">titolo</span>' +
            '<span class="ocr-maniglia alto" data-lato="alto"></span>' +
            '<span class="ocr-maniglia basso" data-lato="basso"></span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ocr-azioni">' +
        '<button class="btn" id="ocrLeggi">Leggi il titolo</button>' +
        '<button class="btn ghost" id="ocrRifai">Rifai la foto</button>' +
      '</div>');

    const tela = $('#ocrTela'), banda = $('#ocrBanda');
    let cima = 0.02, fondo = 0.20;          // frazioni dell'altezza dell'immagine

    /* In percentuali e non in pixel: cosi' non c'e' niente da misurare e la
       fascia e' al posto giusto anche prima che l'immagine sia impaginata.
       Calcolandola su clientHeight, se il contenitore non era ancora alto
       veniva fuori una fascia di altezza zero, cioe' invisibile. */
    function disegna() {
      banda.style.top = (cima * 100) + '%';
      banda.style.height = ((fondo - cima) * 100) + '%';
      $('#ombraSopra').style.top = '0';
      $('#ombraSopra').style.height = (cima * 100) + '%';
      $('#ombraSotto').style.top = (fondo * 100) + '%';
      $('#ombraSotto').style.height = ((1 - fondo) * 100) + '%';
    }
    disegna();

    /* Un tocco sulla foto porta la fascia li': su un telefono e' molto piu'
       comodo che trascinare, e le maniglie restano per la regolazione fine. */
    tela.addEventListener('click', e => {
      if (e.target.closest('.ocr-banda')) return;
      const r = tela.getBoundingClientRect();
      const altezza = fondo - cima;
      cima = Math.min(Math.max(0, (e.clientY - r.top) / r.height - altezza / 2), 1 - altezza);
      fondo = cima + altezza;
      disegna();
    });

    let trascina = null, y0 = 0, c0 = 0, f0 = 0;

    banda.addEventListener('pointerdown', e => {
      trascina = e.target.dataset.lato || 'banda';
      y0 = e.clientY; c0 = cima; f0 = fondo;
      e.target.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    addEventListener('pointermove', e => {
      if (!trascina) return;
      const alt = tela.getBoundingClientRect().height || 1;
      const d = (e.clientY - y0) / alt;
      if (trascina === 'alto') {
        cima = Math.min(Math.max(0, c0 + d), fondo - 0.04);
      } else if (trascina === 'basso') {
        fondo = Math.max(Math.min(1, f0 + d), cima + 0.04);
      } else {
        const altezza = f0 - c0;
        cima = Math.min(Math.max(0, c0 + d), 1 - altezza);
        fondo = cima + altezza;
      }
      disegna();
    });
    const fine = () => { trascina = null; };
    addEventListener('pointerup', fine);
    addEventListener('pointercancel', fine);

    $('#ocrRifai').addEventListener('click', scatta);
    $('#ocrLeggi').addEventListener('click', () => leggi(cima, fondo));
  }

  /* ------------------------------------------------------------- lettura */
  /* Il ritaglio viene ridotto a una larghezza ragionevole: una foto da 12
     megapixel darebbe una striscia da 4.000 pixel, lenta da leggere e ricca
     di grana che l'OCR scambia per caratteri. Per una riga di titolo 1.600
     pixel sono piu' che sufficienti. */
  const LARGHEZZA_MAX = 1200;

  /* L'immagine arriva per riferimento e non cercandola nel documento: il ciclo
     delle fette ritaglia dopo che il pannello e' stato riscritto con lo stato
     di avanzamento, quindi a quel punto #ocrImg non esiste piu'. L'elemento
     staccato resta comunque disegnabile su tela. */
  function ritaglia(img, cima, fondo) {
    const y = Math.round(cima * img.naturalHeight);
    const h = Math.max(8, Math.round((fondo - cima) * img.naturalHeight));
    const k = Math.min(1, LARGHEZZA_MAX / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.max(8, Math.round(h * k));
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, y, img.naturalWidth, h, 0, 0, c.width, c.height);
    return c;
  }

  /* Sottostrisce da provare dentro alla fascia indicata, in frazioni della
     fascia stessa.

     Tesseract legge il titolo solo se la striscia e' stretta attorno alla riga:
     con la didascalia sotto, o un lembo di illustrazione, la sogliatura viene
     decisa da quelli e il testo scuro sul cartiglio colorato sparisce. Misurato:
     la stessa fascia alta 311 pixel restituisce "Nr. 2. PINO. = # N , i Ar MM",
     la sua meta' alta restituisce "Alberi di differenti latitudini."

     Invece di pretendere un'inquadratura perfetta, si prova la fascia intera e
     poi porzioni via via piu' strette, fermandosi alla prima che aggancia il
     catalogo. (Un ritocco del contrasto, prima globale e poi a soglia locale,
     non ha aiutato in nessuno dei due casi: il problema e' cosa entra nella
     striscia, non quanto contrasto ha.) */
  const FETTE = [
    [0, 1], [0, 0.55], [0.45, 1], [0, 0.40], [0.30, 0.70], [0.60, 1]
  ];

  const miglior = testo => {
    const c = candidati(testo, 1);
    return c.length ? c[0].r : 0;
  };

  async function leggi(cima, fondo) {
    const img = $('#ocrImg');                 // da tenere: fra poco sparisce dal documento
    corpo('<p class="ocr-guida" id="ocrStato">Preparo il riconoscimento…</p>');
    const stato = t => { const e = $('#ocrStato'); if (e) e.textContent = t; };

    try {
      if (!window.Tesseract) {
        stato('Scarico il riconoscitore: succede una volta sola, poi resta sul telefono…');
        await new Promise((ris, err) => {
          const s = document.createElement('script');
          s.src = TESSERACT;
          s.onload = ris;
          s.onerror = () => err(new Error('rete'));
          document.head.appendChild(s);
        });
      }
      if (!lavoratore) {
        stato('Preparo il riconoscitore…');
        lavoratore = await Tesseract.createWorker('ita');
      }
      let testo = '', usata = null, punteggio = -1;
      for (let i = 0; i < FETTE.length; i++) {
        stato(i ? 'Cerco la riga del titolo… (' + (i + 1) + ' di ' + FETTE.length + ')'
                : 'Leggo il titolo…');
        const [a, b] = FETTE[i];
        const fetta = ritaglia(img, cima + (fondo - cima) * a, cima + (fondo - cima) * b);
        const { data } = await lavoratore.recognize(fetta);
        const p = miglior(data.text);
        if (p > punteggio) { punteggio = p; testo = data.text; usata = fetta; }
        if (punteggio >= SOGLIA) break;          // agganciato: inutile insistere
      }
      mostra(testo, usata ? usata.toDataURL('image/jpeg', 0.7) : null);
    } catch (e) {
      console.error('riconoscimento', e);
      corpo(
        '<p class="ocr-guida">Non sono riuscito a leggere la foto. ' +
        (navigator.onLine ? ''
          : 'Sei senza rete e il riconoscitore non è ancora stato scaricato: la prima volta serve il collegamento.') +
        '</p><div class="ocr-azioni"><button class="btn" id="ocrRiprova">Riprova</button></div>');
      $('#ocrRiprova').addEventListener('click', scatta);
    }
  }

  function mostra(testoGrezzo, ritaglioUrl) {
    const testo = String(testoGrezzo ?? '').replace(/\s+/g, ' ').trim();
    const cand = candidati(testoGrezzo).filter(c => c.r >= 0.45);
    const buoni = cand.filter(c => c.r >= SOGLIA);

    /* Si mostra sempre il ritaglio effettivamente letto: quando il
       riconoscimento sbaglia, quasi sempre e' perche' la fascia era sul punto
       sbagliato, e vedendola si capisce subito senza dover indovinare. */
    let html = ritaglioUrl
      ? '<p class="ocr-guida">Ho letto questa striscia:</p>' +
        '<div class="ocr-telaio"><img class="ocr-ritaglio" src="' + esc(ritaglioUrl) + '" alt=""></div>'
      : '';

    // il testo grezzo puo' essere lunghissimo: in pagina ne basta un assaggio
    const breve = testo.length > 140 ? testo.slice(0, 140) + '…' : testo;
    html += '<p class="ocr-letto">Ho letto: <b>' + (esc(breve) || '—') + '</b></p>';

    if (!buoni.length) {
      html += testo.length > 400
        ? '<p class="ocr-guida">Nella striscia c’era troppa roba oltre al titolo: l’OCR ha ' +
          'letto anche la trama dell’illustrazione, e non e’ rimasto niente di riconoscibile. ' +
          'Restringi la fascia sulla <b>sola riga del titolo</b> e riprova.</p>'
        : '<p class="ocr-guida">Nessuna serie corrisponde con sicurezza. Prova a inquadrare ' +
          'più da vicino la sola riga del titolo, con la figurina dritta e ben illuminata. ' +
          'Se sul fronte il titolo non c’è, guarda sul retro.</p>';
    }
    if (cand.length) {
      html += '<h3 class="d-h">' + (buoni.length ? 'Serie riconosciuta' : 'Somiglianze deboli') +
        '</h3><ul class="ocr-esiti">' + cand.map(c =>
          '<li><button type="button" data-num="' + c.s.num + '">' +
            '<span class="ocr-pct' + (c.r >= SOGLIA ? ' ok' : '') + '">' +
              Math.round(c.r * 100) + '%</span>' +
            '<span class="ocr-nome"><b>' + c.s.num + ' · ' + esc(c.s.titolo) + '</b>' +
              '<i>' + (c.s.anno || '—') + ' · ' +
              (c.s.fonte_prezzo === 'mercato' ? 'prezzo di mercato' : 'stima') + '</i></span>' +
          '</button></li>').join('') + '</ul>';
    }
    html += '<div class="ocr-azioni">' +
      '<button class="btn ghost" id="ocrRifai2">Rifai la foto</button>' +
      '<button class="btn ghost" id="ocrCerca">Cerca questo testo</button></div>';
    corpo(html);

    $('#ocrRifai2').addEventListener('click', scatta);
    $('#ocrCerca').addEventListener('click', () => {
      window.LIEBIG.cerca(testo.replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim());
      chiudi();
    });
    document.querySelectorAll('.ocr-esiti button').forEach(b =>
      b.addEventListener('click', () => {
        const n = +b.dataset.num;
        chiudi();
        window.LIEBIG.apriSerie(n);
      }));
  }

  /* --------------------------------------------------------------- avvio */
  function avvia() {
    const bottone = $('#btnFoto'), file = $('#ocrFile');
    if (!bottone || !file) return;

    bottone.addEventListener('click', scatta);
    file.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';                       // cosi' riscattare la stessa foto rilancia l'evento
      if (!f) return;
      if (immagine) URL.revokeObjectURL(immagine);
      immagine = URL.createObjectURL(f);
      apri();
      inquadra(immagine);
    });
    document.querySelectorAll('[data-ocr-chiudi]').forEach(el =>
      el.addEventListener('click', chiudi));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#ocr').hidden) chiudi();
    });
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
