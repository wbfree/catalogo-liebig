/* Riconoscimento della serie da una foto della figurina.

   Il titolo della serie e' stampato in cartiglio sul fronte di molte
   edizioni: fotografandolo si puo' risalire alla serie. Due cose, provate sul
   campo, decidono se funziona o no:

   1. Va inquadrata SOLO la fascia del titolo. Su una foto intera Tesseract
      perde il testo scuro sulla banda colorata, perche' la sogliatura globale
      lo confonde con lo sfondo: legge la didascalia sotto e non il titolo.
      Ritagliando la fascia, la stessa identica foto viene letta bene.
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

  /* Si confronta ogni riga letta separatamente, oltre al blocco intero: se nel
     ritaglio entra anche la didascalia ("Nr. 2. PINO."), confrontare tutto
     insieme abbassa la somiglianza col titolo e la fa scendere sotto soglia.
     Riga per riga, invece, l'inquadratura generosa non fa danno. */
  function candidati(testoGrezzo, quanti = 3) {
    const pezzi = String(testoGrezzo ?? '').split(RIGHE)
      .map(x => x.trim()).filter(x => norm(x).length >= 6);
    const intero = String(testoGrezzo ?? '').replace(/\s+/g, ' ').trim();
    if (norm(intero).length >= 6) pezzi.push(intero);
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
      '<p class="ocr-guida">Sposta la fascia sul <b>titolo della serie</b>, la scritta in alto ' +
      'sulla figurina. Lascia fuori la didascalia e il numero.</p>' +
      '<div class="ocr-tela" id="ocrTela">' +
        '<img id="ocrImg" src="' + esc(url) + '" alt="">' +
        '<div class="ocr-ombra" id="ombraSopra"></div>' +
        '<div class="ocr-ombra" id="ombraSotto"></div>' +
        '<div class="ocr-banda" id="ocrBanda">' +
          '<span class="ocr-maniglia alto" data-lato="alto"></span>' +
          '<span class="ocr-maniglia basso" data-lato="basso"></span>' +
        '</div>' +
      '</div>' +
      '<div class="ocr-azioni">' +
        '<button class="btn" id="ocrLeggi">Leggi il titolo</button>' +
        '<button class="btn ghost" id="ocrRifai">Rifai la foto</button>' +
      '</div>');

    const tela = $('#ocrTela'), banda = $('#ocrBanda');
    let cima = 0.02, fondo = 0.20;          // frazioni dell'altezza dell'immagine

    function disegna() {
      const h = tela.clientHeight;
      banda.style.top = (cima * h) + 'px';
      banda.style.height = ((fondo - cima) * h) + 'px';
      $('#ombraSopra').style.top = '0px';
      $('#ombraSopra').style.height = (cima * h) + 'px';
      $('#ombraSotto').style.top = (fondo * h) + 'px';
      $('#ombraSotto').style.height = ((1 - fondo) * h) + 'px';
    }
    $('#ocrImg').addEventListener('load', disegna);
    addEventListener('resize', disegna);
    setTimeout(disegna, 60);

    let trascina = null, y0 = 0, c0 = 0, f0 = 0;

    banda.addEventListener('pointerdown', e => {
      trascina = e.target.dataset.lato || 'banda';
      y0 = e.clientY; c0 = cima; f0 = fondo;
      e.target.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    addEventListener('pointermove', e => {
      if (!trascina) return;
      const d = (e.clientY - y0) / tela.clientHeight;
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
  function ritaglia(cima, fondo) {
    const img = $('#ocrImg');
    const y = Math.round(cima * img.naturalHeight);
    const h = Math.max(8, Math.round((fondo - cima) * img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, y, c.width, h, 0, 0, c.width, h);
    return c;
  }

  async function leggi(cima, fondo) {
    const tela = ritaglia(cima, fondo);
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
      stato('Leggo il titolo…');
      const { data } = await lavoratore.recognize(tela);
      mostra(data.text);
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

  function mostra(testoGrezzo) {
    const testo = String(testoGrezzo ?? '').replace(/\s+/g, ' ').trim();
    const cand = candidati(testoGrezzo).filter(c => c.r >= 0.45);
    const buoni = cand.filter(c => c.r >= SOGLIA);
    let html = '<p class="ocr-letto">Ho letto: <b>' + (esc(testo) || '—') + '</b></p>';

    if (!buoni.length) {
      html += '<p class="ocr-guida">Nessuna serie corrisponde con sicurezza. Prova a inquadrare ' +
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
