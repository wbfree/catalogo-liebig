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
     Archivio: { "<numero serie>": { own: true, album: "", pag: "", note: "" } }
     Conservato nel browser dell'utente in cookie di lunga durata, suddivisi in
     segmenti da 3.400 caratteri per rispettare il limite dei 4 KB per cookie.
     Nessun dato lascia il browser. Se i cookie non sono scrivibili, l'archivio
     resta in memoria per la sessione corrente e l'avviso lo segnala. */
  const CK = '__Host-lbg', CK_MAX = 3400, CK_N = 40;
  let COLL = {}, COLL_OK = true;

  const ckRead = () => document.cookie.split('; ').reduce((m, c) => {
    const i = c.indexOf('='); if (i > 0) m[c.slice(0, i)] = c.slice(i + 1); return m;
  }, {});
  const ckSet = (name, val) => {
    document.cookie = `${name}=${val}; path=/; max-age=${60 * 60 * 24 * 3650}; samesite=lax; secure`;
  };
  const ckDel = name => { document.cookie = `${name}=; path=/; max-age=0; samesite=lax; secure`; };

  function collLoad() {
    try {
      const ck = ckRead();
      let raw = '';
      for (let i = 0; i < CK_N; i++) {
        const part = ck[CK + i];
        if (part == null) break;
        raw += part;
      }
      COLL = raw ? (JSON.parse(decodeURIComponent(raw)) || {}) : {};
    } catch (e) { COLL = {}; }
  }
  function collSave() {
    try {
      const raw = encodeURIComponent(JSON.stringify(COLL));
      const parts = [];
      for (let i = 0; i < raw.length; i += CK_MAX) parts.push(raw.slice(i, i + CK_MAX));
      if (parts.length > CK_N) throw new Error('archivio troppo grande');
      parts.forEach((p, i) => ckSet(CK + i, p));
      const ck = ckRead();
      for (let i = parts.length; i < CK_N; i++) { if (ck[CK + i] != null) ckDel(CK + i); else break; }
      COLL_OK = parts.length === 0 || ckRead()[CK + '0'] != null;
    } catch (e) { COLL_OK = false; }
    collWarn();
  }
  const rec = n => COLL[n] || {};
  const owned = n => !!rec(n).own;
  function collSet(n, patch) {
    const r = { ...rec(n), ...patch };
    if (!r.own && !r.album && !r.pag && !r.note) delete COLL[n]; else COLL[n] = r;
    collSave(); collStat();
  }
  function collWarn() {
    const el = $('#collWarn');
    el.hidden = COLL_OK;
    if (!COLL_OK) el.innerHTML = 'Questo browser non sta conservando i dati della collezione: le spunte e i riferimenti di album restano validi solo fino alla chiusura della pagina. Apri il catalogo direttamente su <b>liebig.pplx.app</b>, anziché dentro un\'anteprima, oppure usa <b>Esporta la collezione</b> per conservare un file di backup.';
  }
  function collStat() {
    const nums = Object.keys(COLL).filter(n => COLL[n].own);
    const cat = nums.map(n => SERIE.find(s => s.num === +n)).filter(Boolean);
    const val = cat.reduce((a, s) => a + (s.p_med || 0), 0);
    const loc = nums.filter(n => COLL[n].album || COLL[n].pag).length;
    $('#collStat').innerHTML = nums.length
      ? `<b>${nums.length.toLocaleString('it-IT')}</b> serie nella tua collezione su ${META.n_serie ? META.n_serie.toLocaleString('it-IT') : '—'} ` +
        `(${(nums.length / (META.n_serie || 1) * 100).toFixed(1).replace('.', ',')}%) · valore di mercato complessivo <b>${eur0(val)}</b> · ` +
        `<b>${loc}</b> con collocazione indicata`
      : 'Nessuna serie ancora contrassegnata come tua. Spunta la casella nella colonna <b>Mia</b> per iniziare a costruire l\'inventario.';
  }

  function collExport() {
    const payload = { formato: 'collezione-liebig/1', esportato: new Date().toISOString(), voci: COLL };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }));
    a.download = `collezione-liebig-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }
  function collImport(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        const voci = d && d.voci ? d.voci : d;
        if (!voci || typeof voci !== 'object') throw 0;
        let n = 0;
        for (const [k, v] of Object.entries(voci)) {
          if (!/^\d{1,4}$/.test(k) || !v || typeof v !== 'object') continue;
          COLL[k] = {
            own: !!v.own,
            album: String(v.album ?? '').slice(0, 60),
            pag: String(v.pag ?? '').slice(0, 30),
            note: String(v.note ?? '').slice(0, 300)
          };
          if (!COLL[k].own && !COLL[k].album && !COLL[k].pag && !COLL[k].note) delete COLL[k]; else n++;
        }
        collSave(); collStat(); renderTable();
        alert(`Importate ${n} voci della collezione.`);
      } catch (e) { alert('File non riconosciuto: serve un file esportato da questo catalogo.'); }
    };
    fr.readAsText(file);
  }

  /* ------------------------------------------------------------------ init */
  fetch('data/catalogo.json').then(r => r.json()).then(d => {
    SERIE = d.serie; META = d.meta;
    collLoad(); collWarn();
    renderKpis(); bind(); collStat(); apply(); renderMonitor();
  }).catch(e => {
    $('#tbody').innerHTML = `<tr><td colspan="10" class="empty">Impossibile caricare i dati del catalogo.</td></tr>`;
    console.error(e);
  });

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

    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.toggle('is-on', x === t));
      $$('.view').forEach(v => v.hidden = v.id !== 'view-' + t.dataset.view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));

    $$('[data-close]').forEach(el => el.addEventListener('click', () => $('#drawer').hidden = true));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#drawer').hidden = true; });
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

    const tot = VIEW.reduce((a, s) => a + (s.p_med || 0), 0);
    $('#count').innerHTML = `<b>${VIEW.length.toLocaleString('it-IT')}</b> serie corrispondono ai filtri · valore complessivo delle quotazioni <b>${eur0(tot)}</b>` +
      (VIEW.length ? ` · mediana <b>${eur(median(VIEW.map(s => s.p_med)))}</b>` : '');
    renderTable();
  }

  const median = a => { const v = a.filter(x => x != null).sort((p, q) => p - q); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

  /* ------------------------------------------------------------------ tabella */
  function renderTable() {
    const rows = VIEW.slice(0, state.limit);
    $('#tbody').innerHTML = rows.length ? rows.map(s => {
      const mk = s.fonte_prezzo === 'mercato';
      const sc = s.scost;
      const r = rec(s.num);
      const coll = r.album || r.pag
        ? `<span class="loc">${r.album ? esc(r.album) : 'album non indicato'}${r.pag ? ' · p. ' + esc(r.pag) : ''}</span>`
        : '';
      return `<tr data-n="${s.num}"${r.own ? ' class="mine"' : ''}>
        <td class="chk"><input type="checkbox" class="own" data-n="${s.num}"${r.own ? ' checked' : ''}
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
      collSet(n, { own: e.target.checked });
      e.target.closest('tr').classList.toggle('mine', e.target.checked);
      if (state.owns.size === 1) apply();
    }));
  }

  /* ------------------------------------------------------------------ dettaglio */
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

      <h3 class="d-h">Inserzioni attive abbinate${s.offerte_tot > s.offerte ? ` (${s.offerte_tot} totali con altre edizioni)` : ''}</h3>
      ${s.listings.length ? `<ul class="lst">${s.listings.map(l => `
        <li><a href="${url(l.url)}" target="_blank" rel="noopener">${esc(l.t)}</a>
            <span class="pz">${eur(l.prezzo)}${l.asta ? ' <span class="tag tag-au">asta</span>' : ''}</span></li>`).join('')}</ul>`
      : `<p class="empty">Nessuna inserzione attiva di serie completa rilevata per questa serie al momento del rilevamento.</p>`}

      ${s.sciolte && s.sciolte.length ? `<h3 class="d-h">Figurine sciolte in vendita <span class="hint">escluse dal calcolo della quotazione</span></h3>
        <ul class="lst">${s.sciolte.map(l => `<li><a href="${url(l.url)}" target="_blank" rel="noopener">${esc(l.t)}</a><span class="pz">${eur(l.prezzo)}</span></li>`).join('')}</ul>` : ''}

      <h3 class="d-h">La mia collezione</h3>
      <div class="d-coll">
        <label class="d-own"><input type="checkbox" id="dOwn"${rec(s.num).own ? ' checked' : ''}>
          <span>Possiedo questa serie</span></label>
        <div class="d-fields">
          <label>Album
            <input type="text" id="dAlbum" maxlength="60" placeholder="es. Album 3 — serie tedesche" value="${esc(rec(s.num).album || '')}">
          </label>
          <label>Pagina
            <input type="text" id="dPag" maxlength="30" placeholder="es. 12 oppure 12–13" value="${esc(rec(s.num).pag || '')}">
          </label>
        </div>
        <label class="d-note">Note
          <textarea id="dNote" maxlength="300" rows="2" placeholder="stato di conservazione, provenienza, doppioni…">${esc(rec(s.num).note || '')}</textarea>
        </label>
        <p class="d-saved" id="dSaved">I dati della collezione restano nel tuo browser.</p>
      </div>

      <div class="d-links">
        <a href="${url(s.ebay_q)}" target="_blank" rel="noopener">Cerca «sang ${s.num}» su eBay ↗</a>
        <a href="${url(s.ebay_q2)}" target="_blank" rel="noopener">Cerca per titolo ↗</a>
      </div>`;

    const flash = () => {
      const el = $('#dSaved');
      el.textContent = 'Salvato.'; el.classList.add('ok');
      clearTimeout(flash.t);
      flash.t = setTimeout(() => { el.textContent = 'I dati della collezione restano nel tuo browser.'; el.classList.remove('ok'); }, 1600);
    };
    $('#dOwn').addEventListener('change', e => {
      collSet(s.num, { own: e.target.checked }); flash();
      const cb = document.querySelector(`#tbody input.own[data-n="${s.num}"]`);
      if (cb) { cb.checked = e.target.checked; cb.closest('tr').classList.toggle('mine', e.target.checked); }
      if (state.owns.size === 1) apply();
    });
    const fld = (id, key) => $(id).addEventListener('input', e => {
      collSet(s.num, { [key]: e.target.value }); flash(); renderRowLoc(s.num);
    });
    fld('#dAlbum', 'album'); fld('#dPag', 'pag'); fld('#dNote', 'note');

    $('#drawer').hidden = false;
  }

  /* aggiorna la riga in tabella con la collocazione, senza ridisegnare tutto */
  function renderRowLoc(num) {
    const tr = document.querySelector(`#tbody tr[data-n="${num}"]`);
    if (!tr) return;
    const r = rec(num), cell = tr.children[2];
    let el = cell.querySelector('.loc');
    if (!r.album && !r.pag) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('span'); el.className = 'loc'; cell.appendChild(el); }
    el.innerHTML = `${r.album ? esc(r.album) : 'album non indicato'}${r.pag ? ' · p. ' + esc(r.pag) : ''}`;
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

    const auct = [];
    SERIE.forEach(s => s.listings.filter(l => l.asta).forEach(l => auct.push({ s, l })));
    auct.sort((a, b) => b.l.prezzo - a.l.prezzo);
    $('#auctLead').textContent = auct.length
      ? `${auct.length} inserzioni in formato asta abbinate a una serie del catalogo al momento del rilevamento. Il confronto con la mediana della serie indica se il prezzo corrente è sopra o sotto il livello dell'offerta.`
      : 'Nessuna asta in corso abbinata a una serie del catalogo al momento del rilevamento.';
    $('#auctBody').innerHTML = auct.length ? auct.slice(0, 40).map(({ s, l }) => `
      <tr data-n="${s.num}">
        <td class="num"><span class="n">${s.num}</span></td>
        <td class="ttl">${esc(l.t)}</td>
        <td class="num price">${eur(l.prezzo)}</td>
        <td class="num">${eur(s.p_med)}</td>
        <td class="num"><a href="${url(l.url)}" target="_blank" rel="noopener">apri ↗</a></td>
      </tr>`).join('') : `<tr><td colspan="5" class="empty" style="padding:var(--space-6)">Nessuna asta rilevata.</td></tr>`;

    charts();
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
})();
