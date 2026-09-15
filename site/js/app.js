/* Catalogo Liebig · tutte le serie 1872–1975 — logica di catalogo, filtri e monitoraggio */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const eur = n => n == null ? '—' : '€ ' + n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = n => n == null ? '—' : '€ ' + n.toLocaleString('it-IT', { maximumFractionDigits: 0 });
  // consente solo URL http(s): impedisce href pericolosi provenienti dai dati
  const url = u => { const v = String(u ?? ''); return /^https?:\/\//i.test(v) ? esc(v) : '#'; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const state = { bands: new Set(), rars: new Set(), srcs: new Set(), eds: new Set(), owns: new Set(), onlyAuct: false, q: '', y1: 1872, y2: 1975, pmin: null, pmax: null, sort: 'num', limit: 200 };
  let SERIE = [], META = {}, VIEW = [];

  /* ------------------------------------------------------------------ la mia collezione
     Archivio su Supabase, tabella `inventario`: una riga per serie, senza
     proprietario, perche' il catalogo e' a utente singolo. Sostituisce i
     cookie della versione precedente, che a qualche centinaio di serie
     superavano i limiti di dimensione degli header HTTP.
     Le modifiche sono accorpate: si scrive mezzo secondo dopo l'ultima
     battuta, non a ogni tasto. */
  const INV = {};
  let INV_OK = true;

  const rec = n => INV[n] || {};
  const owned = n => !!rec(n).posseduta;
  const vuota = r => !r.posseduta && !r.album && !r.pagina && !r.note;

  async function invCarica() {
    const righe = await DB.tutte('inventario', 'select=serie_num,posseduta,album,pagina,note&order=serie_num');
    righe.forEach(r => INV[r.serie_num] = {
      posseduta: !!r.posseduta, album: r.album || '', pagina: r.pagina || '', note: r.note || ''
    });
  }

  const inSospeso = {};
  // serie la cui scrittura non e' andata a buon fine: si riprova da sole
  // appena torna il collegamento, cosi' una spunta messa in cantina non si
  // perde solo perche' li' non prende
  const daRisalvare = new Set();

  function collSet(n, patch) {
    INV[n] = { ...rec(n), ...patch };
    collStat();
    clearTimeout(inSospeso[n]);
    inSospeso[n] = setTimeout(() => invSalva(n), 500);
  }

  async function invSalva(n) {
    const r = rec(n);
    try {
      if (vuota(r)) {
        await DB.elimina('inventario', `serie_num=eq.${+n}`);
        delete INV[n];
      } else {
        await DB.scrivi('inventario', {
          serie_num: +n, posseduta: !!r.posseduta,
          album: r.album || null, pagina: r.pagina || null, note: r.note || null
        }, 'on_conflict=serie_num');
      }
      INV_OK = true;
      daRisalvare.delete(String(n));
    } catch (e) {
      INV_OK = false;
      daRisalvare.add(String(n));
      console.error('salvataggio inventario', e);
    }
    collWarn();
  }

  /* Stato del collegamento: l'avviso compare quando si e' offline, e al
     ritorno della rete le scritture rimaste indietro partono da sole. */
  function rete() {
    const off = !navigator.onLine;
    $('#offline').hidden = !off;
    if (!off && daRisalvare.size) {
      [...daRisalvare].forEach(n => invSalva(n));
    }
  }

  function collWarn() {
    const el = $('#collWarn');
    el.hidden = INV_OK;
    if (!INV_OK) el.innerHTML = 'Le ultime modifiche alla collezione <b>non sono ancora state salvate</b>: il database non ha risposto. Restano in attesa e partiranno da sole appena torna il collegamento; non chiudere la pagina nel frattempo.';
  }

  function collStat() {
    const nums = Object.keys(INV).filter(n => INV[n].posseduta);
    const cat = nums.map(n => SERIE.find(s => s.num === +n)).filter(Boolean);
    const val = cat.reduce((a, s) => a + (s.p_med || 0), 0);
    const loc = nums.filter(n => INV[n].album || INV[n].pagina).length;
    $('#collStat').innerHTML = nums.length
      ? `<b>${nums.length.toLocaleString('it-IT')}</b> serie nella tua collezione su ${META.n_serie ? META.n_serie.toLocaleString('it-IT') : '—'} ` +
        `(${(nums.length / (META.n_serie || 1) * 100).toFixed(1).replace('.', ',')}%) · valore di mercato complessivo <b>${eur0(val)}</b> · ` +
        `<b>${loc}</b> con collocazione indicata`
      : "Nessuna serie ancora contrassegnata come tua. Spunta la casella nella colonna <b>Mia</b> per iniziare a costruire l'inventario.";
  }

  function collExport() {
    const payload = { formato: 'collezione-liebig/2', esportato: new Date().toISOString(), voci: INV };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }));
    a.download = `collezione-liebig-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  function collImport(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const d = JSON.parse(fr.result);
        const voci = d && d.voci ? d.voci : d;
        if (!voci || typeof voci !== 'object') throw 0;
        const righe = [];
        for (const [k, v] of Object.entries(voci)) {
          if (!/^\d{1,4}$/.test(k) || !v || typeof v !== 'object') continue;
          // il formato 1 (cookie) usava own/pag, il formato 2 posseduta/pagina
          const r = {
            posseduta: !!(v.posseduta ?? v.own),
            album: String(v.album ?? '').slice(0, 60),
            pagina: String(v.pagina ?? v.pag ?? '').slice(0, 30),
            note: String(v.note ?? '').slice(0, 300)
          };
          if (vuota(r)) continue;
          INV[k] = r;
          righe.push({ serie_num: +k, posseduta: r.posseduta, album: r.album || null, pagina: r.pagina || null, note: r.note || null });
        }
        if (righe.length) await DB.scrivi('inventario', righe, 'on_conflict=serie_num');
        INV_OK = true; collWarn(); collStat(); renderTable();
        alert(`Importate ${righe.length} voci della collezione.`);
      } catch (e) {
        console.error(e);
        alert('Importazione non riuscita: serve un file esportato da questo catalogo, e il database deve essere raggiungibile.');
      }
    };
    fr.readAsText(file);
  }

  /* ------------------------------------------------------------------ init
     Il catalogo arriva da Supabase: v_catalogo (una riga per serie, senza
     inserzioni) e v_meta (intestazione del rilevamento corrente). Le
     inserzioni si leggono solo aprendo la scheda di una serie. */
  const NUMERICI = ['p_med', 'p_min', 'p_max', 'p_stima', 'scost', 'rarita_score', 'percentile'];

  function errore(msg) {
    $('#tbody').innerHTML = `<tr><td colspan="10" class="empty" style="padding:var(--space-8) var(--space-6)">${esc(msg)}</td></tr>`;
  }

  (async () => {
    mostraVersione();          // prima di tutto: serve anche se il catalogo non carica
    if (!DB.configurata()) {
      return errore("Il catalogo non e' configurato: manca la chiave Supabase in js/config.js.");
    }
    try {
      const [meta, serie] = await Promise.all([
        DB.chiedi('v_meta', 'select=data,aggiornato,meta'),
        DB.tutte('v_catalogo', 'select=*&order=num')
      ]);
      if (!meta.length || !serie.length) return errore("Il catalogo e vuoto: nessun rilevamento pubblicato.");
      META = { ...meta[0].meta, data: meta[0].data, aggiornato: meta[0].meta.aggiornato || meta[0].aggiornato };
      // PostgREST puo' restituire i numerici come stringhe: si normalizza una volta sola
      SERIE = serie.map(s => {
        NUMERICI.forEach(k => { if (s[k] != null) s[k] = Number(s[k]); });
        return s;
      });
    } catch (e) {
      console.error(e);
      return errore('Impossibile caricare i dati del catalogo dal database.');
    }
    try { await invCarica(); } catch (e) { INV_OK = false; console.error('lettura inventario', e); }
    collWarn(); rete();
    addEventListener('online', rete);
    addEventListener('offline', rete);
    renderKpis(); bind(); collStat(); apply(); renderMonitor();
  })();

  /* Versione in chiaro: senza, dopo un aggiornamento non c'e' modo di sapere
     se quello che si ha davanti e' la copia nuova o quella in cache. */
  function mostraVersione() {
    const v = (window.LIEBIG_CONFIG || {}).versione;
    if (!v) return;
    $('#ver').textContent = 'v' + v;
    document.title = 'Catalogo Liebig v' + v + ' · tutte le serie 1872–1975';
  }

  function renderKpis() {
    const dt = new Date(META.aggiornato);
    const when = dt.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) +
      ' · ' + dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const aste = SERIE.reduce((a, s) => a + (s.aste || 0), 0);
    $('#stamp').innerHTML = `Ultimo rilevamento delle inserzioni attive su eBay.it: <b>${when}</b> · aggiornamento automatico giornaliero`;
    $('#kpis').innerHTML = [
      ['Serie nel catalogo', META.n_serie.toLocaleString('it-IT'), ''],
      ['Con edizione italiana', META.n_serie_it.toLocaleString('it-IT'), ''],
      ['Serie con mercato attivo', META.serie_con_mercato.toLocaleString('it-IT'), 'accent'],
      ['Inserzioni eBay lette', META.n_inserzioni.toLocaleString('it-IT'), ''],
      ['Inserzioni abbinate', META.n_inserzioni_abbinate.toLocaleString('it-IT'), ''],
      ['Aste in corso', aste.toLocaleString('it-IT'), ''],
      ['Mediana di mercato', eur(META.mediana_globale), ''],
    ].map(([l, v, c]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  /* ------------------------------------------------------------------ bind */
  function bind() {
    $('#q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); state.limit = 200; apply(); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; apply(); });
    $('#pmin').addEventListener('input', e => { state.pmin = e.target.value === '' ? null : +e.target.value; apply(); });
    $('#pmax').addEventListener('input', e => { state.pmax = e.target.value === '' ? null : +e.target.value; apply(); });

    const toggle = (btn, set, key) => { btn.classList.toggle('is-on'); set.has(key) ? set.delete(key) : set.add(key); state.limit = 200; apply(); };
    $$('#bands .chip').forEach(b => b.addEventListener('click', () => toggle(b, state.bands, b.dataset.band)));
    $$('#rars .chip').forEach(b => b.addEventListener('click', () => toggle(b, state.rars, b.dataset.rar)));
    $$('#srcs .chip').forEach(b => b.addEventListener('click', () => toggle(b, state.srcs, b.dataset.src)));
    $$('#eds .chip').forEach(b => b.addEventListener('click', () => toggle(b, state.eds, b.dataset.ed)));
    $$('#owns .chip').forEach(b => b.addEventListener('click', () => toggle(b, state.owns, b.dataset.own)));

    $('#collExport').addEventListener('click', collExport);
    $('#collImportBtn').addEventListener('click', () => $('#collImport').click());
    $('#collImport').addEventListener('change', e => { if (e.target.files[0]) collImport(e.target.files[0]); e.target.value = ''; });
    $('#onlyAuct').addEventListener('click', e => { state.onlyAuct = !state.onlyAuct; e.target.classList.toggle('is-on', state.onlyAuct); apply(); });
    $('#reset').addEventListener('click', reset);

    const y1 = $('#y1'), y2 = $('#y2');
    const syncY = () => {
      let a = +y1.value, b = +y2.value;
      if (a > b) { [a, b] = [b, a]; }
      state.y1 = a; state.y2 = b;
      $('#yrlab').textContent = `${a} – ${b}`;
      state.limit = 200; apply();
    };
    y1.addEventListener('input', syncY); y2.addEventListener('input', syncY);

    $('#more').addEventListener('click', () => { state.limit += 200; renderTable(); });

    /* Le tre viste stanno in un menu a tendina invece che in tre pulsanti
       affiancati: in testata ci sta comodo anche su schermo stretto, dove
       andavano a capo occupando due righe. */
    const menu = $('#menuVoci'), bottoneMenu = $('#menuBtn');
    const apriMenu = apri => {
      menu.hidden = !apri;
      bottoneMenu.setAttribute('aria-expanded', apri ? 'true' : 'false');
    };
    bottoneMenu.addEventListener('click', e => {
      e.stopPropagation();
      apriMenu(menu.hidden);
    });
    document.addEventListener('click', e => {
      if (!menu.hidden && !e.target.closest('.menu')) apriMenu(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') apriMenu(false); });

    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.toggle('is-on', x === t));
      $$('.view').forEach(v => v.hidden = v.id !== 'view-' + t.dataset.view);
      $('#menuOra').textContent = t.textContent.trim();
      apriMenu(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));

    $$('[data-close]').forEach(el => el.addEventListener('click', () => chiudiPannello()));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiPannello(); });
    // sul telefono il tasto indietro deve chiudere la scheda, non uscire dal sito
    addEventListener('popstate', () => chiudiPannello(true));

    /* Su schermo stretto i filtri partono richiusi: aperti occupavano da soli
       tre schermate prima di arrivare al catalogo. Legato alla media query e
       non al solo caricamento, altrimenti ruotando il telefono o allargando
       la finestra si resterebbe con la scelta sbagliata. */
    const stretto = matchMedia('(max-width:640px)');
    const adattaFiltri = () => { $('#fAcc').open = !stretto.matches; };
    adattaFiltri();
    stretto.addEventListener('change', adattaFiltri);
  }

  function reset() {
    state.bands.clear(); state.rars.clear(); state.srcs.clear(); state.eds.clear(); state.owns.clear();
    state.onlyAuct = false; state.q = ''; state.pmin = state.pmax = null;
    state.y1 = 1872; state.y2 = 1975; state.limit = 200; state.sort = 'num';
    $$('.chip').forEach(c => c.classList.remove('is-on'));
    $('#q').value = ''; $('#pmin').value = ''; $('#pmax').value = '';
    $('#y1').value = 1872; $('#y2').value = 1975; $('#yrlab').textContent = '1872 – 1975';
    $('#sort').value = 'num';
    apply();
  }

  /* ------------------------------------------------------------------ filtri */
  function apply() {
    const q = state.q;
    VIEW = SERIE.filter(s => {
      if (s.anno != null && (s.anno < state.y1 || s.anno > state.y2)) return false;
      if (state.eds.size === 1) { if (state.eds.has('it') && !s.it) return false; if (state.eds.has('noit') && s.it) return false; }
      if (state.bands.size && !state.bands.has(s.fascia)) return false;
      if (state.rars.size && !state.rars.has(s.rarita)) return false;
      if (state.srcs.size && !state.srcs.has(s.fonte_prezzo)) return false;
      if (state.owns.size === 1) { if (state.owns.has('si') && !owned(s.num)) return false; if (state.owns.has('no') && owned(s.num)) return false; }
      if (state.onlyAuct && !s.aste) return false;
      if (state.pmin != null && (s.p_med ?? 0) < state.pmin) return false;
      if (state.pmax != null && (s.p_med ?? 0) > state.pmax) return false;
      if (q) {
        const hay = s.num + ' ' + s.titolo.toLowerCase() + ' ' + (s.anno_raw || '');
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const k = state.sort.replace('-', ''), desc = state.sort.startsWith('-');
    VIEW.sort((a, b) => {
      let x = a[k], y = b[k];
      if (x == null) x = desc ? -Infinity : Infinity;
      if (y == null) y = desc ? -Infinity : Infinity;
      if (typeof x === 'string') return desc ? y.localeCompare(x) : x.localeCompare(y);
      return desc ? y - x : x - y;
    });

    contaFiltri();
    const tot = VIEW.reduce((a, s) => a + (s.p_med || 0), 0);
    $('#count').innerHTML = `<b>${VIEW.length.toLocaleString('it-IT')}</b> serie corrispondono ai filtri · valore complessivo delle quotazioni <b>${eur0(tot)}</b>` +
      (VIEW.length ? ` · mediana <b>${eur(median(VIEW.map(s => s.p_med)))}</b>` : '');
    renderTable();
  }

  /* quanti filtri sono attivi: con il pannello richiuso e' l'unico modo per
     accorgersi che il catalogo e' filtrato. La ricerca libera non si conta,
     perche' e' sempre in vista. */
  function contaFiltri() {
    const n = state.bands.size + state.rars.size + state.srcs.size + state.eds.size + state.owns.size
      + (state.onlyAuct ? 1 : 0)
      + (state.pmin != null ? 1 : 0) + (state.pmax != null ? 1 : 0)
      + (state.y1 !== 1872 || state.y2 !== 1975 ? 1 : 0);
    $('#fQuanti').textContent = n ? ` · ${n} attiv${n === 1 ? 'o' : 'i'}` : '';
  }

  const median = a => { const v = a.filter(x => x != null).sort((p, q) => p - q); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

  /* ------------------------------------------------------------------ tabella */
  function renderTable() {
    const rows = VIEW.slice(0, state.limit);
    $('#tbody').innerHTML = rows.length ? rows.map(s => {
      const mk = s.fonte_prezzo === 'mercato';
      const sc = s.scost;
      const r = rec(s.num);
      const coll = r.album || r.pagina
        ? `<span class="loc">${r.album ? esc(r.album) : 'album non indicato'}${r.pagina ? ' · p. ' + esc(r.pagina) : ''}</span>`
        : '';
      return `<tr data-n="${s.num}"${r.posseduta ? ' class="mine"' : ''}>
        <td class="chk"><input type="checkbox" class="own" data-n="${s.num}"${r.posseduta ? ' checked' : ''}
            aria-label="Serie ${s.num} in mio possesso" title="Serie in mio possesso"></td>
        <td class="num"><span class="n">${s.num}</span></td>
        <td><span class="ttl">${esc(s.titolo)}</span>
            <span class="sub">${mk ? `<span class="tag tag-mk">mercato</span>` : `<span class="tag tag-st">stima</span>`}
            ${s.aste ? `<span class="tag tag-au">asta</span>` : ''}
            ${s.it ? '' : '<span class="tag tag-ed">no ed. IT</span> '}Unificato ${esc(s.uni || '—')} · De Magistris ${esc(s.dem || '—')}</span>${coll}</td>
        <td class="num">${s.anno ?? '<span class="nil">—</span>'}</td>
        <td class="num">${s.nfig ?? '—'}</td>
        <td class="num price">${eur(s.p_med)}</td>
        <td class="num">${mk ? `<small>${eur0(s.p_min)} – ${eur0(s.p_max)}</small>` : '<span class="nil">—</span>'}</td>
        <td class="num">${s.offerte || '<span class="nil">0</span>'}${s.offerte_sciolte ? `<span class="pct"> +${s.offerte_sciolte}<abbr title="figurine sciolte, escluse dal calcolo della quotazione">f</abbr></span>` : ''}</td>
        <td><span class="rar r-${s.rarita}"><i class="dot"></i>${s.rarita} <span class="pct">p${s.percentile}</span></span></td>
        <td class="num">${sc == null ? '<span class="nil">—</span>' : `<span class="${sc >= 0 ? 'up' : 'down'}">${sc > 0 ? '+' : ''}${sc.toFixed(0)}%</span>`}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" class="empty" style="padding:var(--space-8) var(--space-6)">Nessuna serie corrisponde ai filtri selezionati. Prova ad allargare la fascia di prezzo o l'intervallo di anni.</td></tr>`;

    $('#more').hidden = VIEW.length <= state.limit;
    $('#more').textContent = `Mostra altre ${Math.min(200, VIEW.length - state.limit)} serie (${VIEW.length - state.limit} rimanenti)`;
    $$('#tbody tr[data-n]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('.chk')) return;   // la casella non apre la scheda
      openDrawer(+tr.dataset.n);
    }));
    $$('#tbody input.own').forEach(cb => cb.addEventListener('change', e => {
      const n = +e.target.dataset.n;
      collSet(n, { posseduta: e.target.checked });
      e.target.closest('tr').classList.toggle('mine', e.target.checked);
      if (state.owns.size === 1) apply();
    }));
  }

  /* ------------------------------------------------------------------ pannello */
  function apriPannello() {
    const giaAperto = !$('#drawer').hidden;
    $('#drawer').hidden = false;
    document.body.classList.add('bloccato');
    $('.drawer-in').scrollTop = 0;
    // una voce di cronologia sola, cosi' un indietro chiude e basta
    if (!giaAperto) history.pushState({ scheda: true }, '');
  }

  function chiudiPannello(daCronologia) {
    if ($('#drawer').hidden) return;
    $('#drawer').hidden = true;
    document.body.classList.remove('bloccato');
    if (!daCronologia && history.state && history.state.scheda) history.back();
  }

  /* ------------------------------------------------------------------ dettaglio */
  const cercaEbay = q => 'https://www.ebay.it/sch/i.html?_nkw=' + encodeURIComponent(q);

  const NAZ = { IT: 'Italiana', BL: 'Belga', BLT: 'Belga-tedesca', TD: 'Tedesca', FR: 'Francese', OL: 'Olandese', FM: 'Fiamminga', SP: 'Spagnola', IN: 'Inglese', SV: 'Svizzera', SVE: 'Svedese', DN: 'Danese', BO: 'Boema', UN: 'Ungherese', RS: 'Russa' };

  function openDrawer(num) {
    const s = SERIE.find(x => x.num === num);
    if (!s) return;
    const mk = s.fonte_prezzo === 'mercato';
    $('#dBody').innerHTML = `
      <p class="d-num">Serie Sanguinetti n° ${s.num} · ${s.it ? 'edizione italiana' : 'senza edizione italiana'}</p>
      <h2 class="d-ttl" id="dTitle">${esc(s.titolo)}</h2>
      <p class="d-meta">Emissione ${esc(s.anno_raw || 'non documentata')}${s.nfig ? ` · ${s.nfig} figurine` : ''} ·
        ${mk ? '<span class="tag tag-mk">prezzo di mercato osservato</span>' : '<span class="tag tag-st">stima da comparabili</span>'}</p>

      <div class="d-grid">
        <div class="d-cell"><b>${eur(s.p_med)}</b><span>${mk ? 'mediana richiesta' : 'stima'}</span></div>
        <div class="d-cell"><b>${mk ? eur0(s.p_min) : '—'}</b><span>minimo</span></div>
        <div class="d-cell"><b>${mk ? eur0(s.p_max) : '—'}</b><span>massimo</span></div>
        <div class="d-cell"><b>${s.offerte}</b><span>offerte attive</span></div>
      </div>

      <div class="d-grid">
        <div class="d-cell"><b>${s.rarita}</b><span>rarità relativa · percentile ${s.percentile}</span></div>
        <div class="d-cell"><b>${eur0(s.p_stima)}</b><span>stima da comparabili</span></div>
        <div class="d-cell"><b class="${s.scost == null ? 'nil' : s.scost >= 0 ? 'up' : 'down'}">${s.scost == null ? '—' : (s.scost > 0 ? '+' : '') + s.scost.toFixed(0) + '%'}</b><span>scostamento</span></div>
      </div>

      <h3 class="d-h">Numerazioni di conversione</h3>
      <p class="d-meta">Sanguinetti <b>${s.num}</b> · Unificato <b>${esc(s.uni || '—')}</b> ·
         De Magistris <b>${esc(s.dem || '—')}</b>${s.cil ? ` · CIL <b>${esc(s.cil)}</b>` : ''}</p>

      <h3 class="d-h">Edizioni linguistiche esistenti</h3>
      <p class="d-meta">${s.edizioni.map(e => NAZ[e] || e).join(' · ')}</p>

      <h3 class="d-h">Andamento della quotazione</h3>
      <div class="d-storico" id="dStorico"><p class="d-attesa">lettura dello storico...</p></div>

      <h3 class="d-h">Inserzioni attive abbinate${s.offerte_tot > s.offerte ? ` (${s.offerte_tot} totali con altre edizioni)` : ''}</h3>
      <div id="dIns"><p class="d-attesa">lettura delle inserzioni...</p></div>

      <h3 class="d-h">La mia collezione</h3>
      <div class="d-coll">
        <label class="d-own"><input type="checkbox" id="dOwn"${rec(s.num).posseduta ? ' checked' : ''}>
          <span>Possiedo questa serie</span></label>
        <div class="d-fields">
          <label>Album
            <input type="text" id="dAlbum" maxlength="60" placeholder="es. Album 3 — serie tedesche" value="${esc(rec(s.num).album || '')}">
          </label>
          <label>Pagina
            <input type="text" id="dPag" maxlength="30" placeholder="es. 12 oppure 12–13" value="${esc(rec(s.num).pagina || '')}">
          </label>
        </div>
        <label class="d-note">Note
          <textarea id="dNote" maxlength="300" rows="2" placeholder="stato di conservazione, provenienza, doppioni…">${esc(rec(s.num).note || '')}</textarea>
        </label>
        <p class="d-saved" id="dSaved">Le modifiche sono salvate nel catalogo.</p>
      </div>

      <div class="d-links">
        <a href="${cercaEbay('liebig sang ' + s.num)}" target="_blank" rel="noopener">Cerca «sang ${s.num}» su eBay ↗</a>
        <a href="${cercaEbay('liebig ' + s.titolo.slice(0, 40))}" target="_blank" rel="noopener">Cerca per titolo ↗</a>
      </div>`;

    const flash = () => {
      const el = $('#dSaved');
      el.textContent = 'Salvato.'; el.classList.add('ok');
      clearTimeout(flash.t);
      flash.t = setTimeout(() => { el.textContent = 'Le modifiche sono salvate nel catalogo.'; el.classList.remove('ok'); }, 1600);
    };
    $('#dOwn').addEventListener('change', e => {
      collSet(s.num, { posseduta: e.target.checked }); flash();
      const cb = document.querySelector(`#tbody input.own[data-n="${s.num}"]`);
      if (cb) { cb.checked = e.target.checked; cb.closest('tr').classList.toggle('mine', e.target.checked); }
      if (state.owns.size === 1) apply();
    });
    const fld = (id, key) => $(id).addEventListener('input', e => {
      collSet(s.num, { [key]: e.target.value }); flash(); renderRowLoc(s.num);
    });
    fld('#dAlbum', 'album'); fld('#dPag', 'pagina'); fld('#dNote', 'note');

    $('#dTestaTtl').textContent = `${s.num} · ${s.titolo}`;
    apriPannello();
    // le due letture sono asincrone: se nel frattempo si apre un'altra serie,
    // il risultato in ritardo viene scartato
    const token = ++openDrawer.token;
    caricaInserzioni(s, token);
    caricaStorico(s, token);
  }
  openDrawer.token = 0;

  async function caricaInserzioni(s, token) {
    let righe;
    try {
      righe = await DB.tutte('v_inserzioni',
        `select=titolo,prezzo,url,asta,singola&serie_num=eq.${s.num}&order=prezzo`);
    } catch (e) {
      console.error(e);
      if (token === openDrawer.token) $('#dIns').innerHTML = '<p class="empty">Lettura delle inserzioni non riuscita.</p>';
      return;
    }
    if (token !== openDrawer.token) return;
    const complete = righe.filter(l => !l.singola).slice(0, 8);
    const sciolte = righe.filter(l => l.singola).slice(0, 4);
    const voce = l => `<li><a href="${url(l.url)}" target="_blank" rel="noopener">${esc(l.titolo)}</a>` +
      `<span class="pz">${eur(Number(l.prezzo))}${l.asta ? ' <span class="tag tag-au">asta</span>' : ''}</span></li>`;
    $('#dIns').innerHTML = (complete.length
        ? `<ul class="lst">${complete.map(voce).join('')}</ul>`
        : '<p class="empty">Nessuna inserzione attiva di serie completa rilevata per questa serie al momento del rilevamento.</p>')
      + (sciolte.length
        ? `<h3 class="d-h">Figurine sciolte in vendita <span class="hint">escluse dal calcolo della quotazione</span></h3>
           <ul class="lst">${sciolte.map(voce).join('')}</ul>`
        : '');
  }

  /* Lo storico e' il motivo principale per cui il catalogo sta su un database:
     ogni rilevamento lascia una riga in quotazioni, e qui se ne legge la serie. */
  async function caricaStorico(s, token) {
    let righe;
    try {
      righe = await DB.tutte('v_storico',
        `select=data,p_med,offerte,fonte_prezzo&serie_num=eq.${s.num}&order=data`);
    } catch (e) {
      console.error(e);
      if (token === openDrawer.token) $('#dStorico').innerHTML = '';
      return;
    }
    if (token !== openDrawer.token) return;
    if (righe.length < 2) {
      $('#dStorico').innerHTML = '<p class="d-attesa">Un solo rilevamento in archivio: la serie storica comincia con il prossimo aggiornamento.</p>';
      return;
    }
    $('#dStorico').innerHTML = '<canvas id="dChart" height="150"></canvas>';
    new Chart($('#dChart'), {
      type: 'line',
      data: {
        labels: righe.map(r => new Date(r.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })),
        datasets: [{
          data: righe.map(r => Number(r.p_med)),
          borderColor: '#8c1c22', backgroundColor: 'rgba(140,28,34,.08)',
          borderWidth: 2, pointRadius: 2, tension: .25, fill: true
        }]
      },
      options: {
        maintainAspectRatio: false, plugins: { legend: { display: false },
          tooltip: { callbacks: { label: c => eur(c.parsed.y) + ' · ' + righe[c.dataIndex].offerte + ' offerte' } } },
        scales: { y: { grid: { color: '#ebe2d1' }, ticks: { callback: v => '€' + v } }, x: { grid: { display: false } } }
      }
    });
  }

  /* aggiorna la riga in tabella con la collocazione, senza ridisegnare tutto */
  function renderRowLoc(num) {
    const tr = document.querySelector(`#tbody tr[data-n="${num}"]`);
    if (!tr) return;
    const r = rec(num), cell = tr.children[2];
    let el = cell.querySelector('.loc');
    if (!r.album && !r.pagina) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('span'); el.className = 'loc'; cell.appendChild(el); }
    el.innerHTML = `${r.album ? esc(r.album) : 'album non indicato'}${r.pagina ? ' · p. ' + esc(r.pagina) : ''}`;
  }

  /* ------------------------------------------------------------------ monitoraggio */
  function renderMonitor() {
    const withM = SERIE.filter(s => s.scost != null && s.offerte >= 1);
    const up = [...withM].sort((a, b) => b.scost - a.scost).slice(0, 12);
    const down = [...withM].sort((a, b) => a.scost - b.scost).slice(0, 12);
    const li = s => `<li><div class="body"><b>${s.num} · ${esc(s.titolo)}</b>
        <span>${s.anno} · ${s.offerte} offert${s.offerte === 1 ? 'a' : 'e'} · mediana ${eur(s.p_med)} vs comparabili ${eur0(s.p_stima)}</span></div>
      <span class="d ${s.scost >= 0 ? 'up' : 'down'}">${s.scost > 0 ? '+' : ''}${s.scost.toFixed(0)}%</span></li>`;
    $('#rankUp').innerHTML = up.map(li).join('');
    $('#rankDown').innerHTML = down.map(li).join('');

    renderAste();
    charts();
  }

  async function renderAste() {
    let aste;
    try {
      aste = await DB.chiedi('v_aste',
        'select=serie_num,titolo,prezzo,url,mediana_serie&order=prezzo.desc&limit=40');
    } catch (e) {
      console.error(e);
      $('#auctLead').textContent = 'Lettura delle aste non riuscita.';
      return;
    }
    // il totale viene dal catalogo gia' caricato: la query e' limitata a 40 righe
    const totale = SERIE.reduce((a, s) => a + (s.aste || 0), 0);
    $('#auctLead').textContent = aste.length
      ? `${totale} inserzioni in formato asta abbinate a una serie del catalogo al momento del rilevamento` +
        (totale > aste.length ? `; qui sotto le ${aste.length} di prezzo più alto` : '') +
        `. Il confronto con la mediana della serie indica se il prezzo corrente è sopra o sotto il livello dell'offerta.`
      : 'Nessuna asta in corso abbinata a una serie del catalogo al momento del rilevamento.';
    $('#auctBody').innerHTML = aste.length ? aste.map(a => `
      <tr data-n="${a.serie_num}">
        <td class="num"><span class="n">${a.serie_num}</span></td>
        <td class="ttl">${esc(a.titolo)}</td>
        <td class="num price">${eur(Number(a.prezzo))}</td>
        <td class="num">${eur(Number(a.mediana_serie))}</td>
        <td class="num"><a href="${url(a.url)}" target="_blank" rel="noopener">apri ↗</a></td>
      </tr>`).join('') : `<tr><td colspan="5" class="empty" style="padding:var(--space-6)">Nessuna asta rilevata.</td></tr>`;
  }

  function charts() {
    const font = { family: 'Switzer, sans-serif', size: 12 };
    Chart.defaults.font = font;
    Chart.defaults.color = '#5d5449';

    const decs = {};
    SERIE.filter(s => s.fonte_prezzo === 'mercato' && s.anno).forEach(s => {
      const d = Math.floor(s.anno / 10) * 10;
      (decs[d] = decs[d] || []).push(s.p_med);
    });
    const keys = Object.keys(decs).map(Number).sort((a, b) => a - b);
    new Chart($('#chDec'), {
      type: 'bar',
      data: {
        labels: keys.map(k => k + 's'),
        datasets: [{
          label: 'Mediana di mercato (€)', data: keys.map(k => median(decs[k])),
          backgroundColor: '#8c1c22', borderRadius: 2, maxBarThickness: 46
        }]
      },
      options: {
        maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Mediana di mercato per decennio di emissione', font: { size: 13, weight: '600' }, padding: { bottom: 12 } } },
        scales: { y: { grid: { color: '#ebe2d1' }, ticks: { callback: v => '€' + v } }, x: { grid: { display: false } } }
      }
    });

    const order = ['0-5', '5-15', '15-40', '40-100', '100+'];
    const cnt = order.map(b => SERIE.filter(s => s.fascia === b).length);
    new Chart($('#chBand'), {
      type: 'bar',
      data: {
        labels: order.map(b => '€ ' + b), datasets: [{
          data: cnt, backgroundColor: ['#c2b9a8', '#9ab08f', '#d7b25a', '#d0743c', '#8c1c22'], borderRadius: 2, maxBarThickness: 46
        }]
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'Serie per fascia di prezzo', font: { size: 13, weight: '600' }, padding: { bottom: 12 } } },
        scales: { x: { grid: { color: '#ebe2d1' } }, y: { grid: { display: false } } }
      }
    });
  }
  /* Interfaccia minima per il riconoscimento da foto (js/ocr.js), che vive
     fuori da questa chiusura e ha bisogno del catalogo gia' caricato. */
  window.LIEBIG = {
    serie: () => SERIE,
    apriSerie: n => openDrawer(n),
    cerca: t => {
      $('#q').value = t;
      state.q = String(t).trim().toLowerCase();
      state.limit = 200;
      apply();
    }
  };
})();
