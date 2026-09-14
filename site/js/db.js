/* Client minimo per PostgREST: il catalogo non usa autenticazione, quindi
   supabase-js non servirebbe a niente se non ad aggiungere peso. */
window.DB = (() => {
  const cfg = window.LIEBIG_CONFIG || {};
  const base = (cfg.url || '').replace(/\/$/, '') + '/rest/v1/';
  const headers = { apikey: cfg.publishableKey, Authorization: 'Bearer ' + cfg.publishableKey };

  const configurata = () => !!cfg.url && !!cfg.publishableKey && cfg.publishableKey !== 'DA_COMPILARE';

  async function chiedi(risorsa, query = '', extra = {}) {
    const r = await fetch(base + risorsa + (query ? '?' + query : ''), { ...extra, headers: { ...headers, ...(extra.headers || {}) } });
    const testo = await r.text();
    if (!r.ok) throw new Error(`${risorsa}: ${r.status} ${testo.slice(0, 200)}`);
    // scritture e cancellazioni rispondono senza corpo: JSON.parse('') solleverebbe
    return testo ? JSON.parse(testo) : null;
  }

  /* PostgREST limita il numero di righe per risposta (il tetto lo decide il
     server, non il client): il catalogo va letto a blocchi con Range.
     Si avanza di quante righe sono arrivate davvero, non di quante ne sono
     state chieste, altrimenti un tetto piu' basso del blocco troncherebbe il
     catalogo senza errore. count=exact da' il totale per sapere quando fermarsi. */
  async function tutte(risorsa, query = '', blocco = 1000) {
    const out = [];
    for (let giro = 0; giro < 100; giro++) {
      const r = await fetch(base + risorsa + '?' + query, {
        headers: { ...headers, Range: `${out.length}-${out.length + blocco - 1}`,
                   'Range-Unit': 'items', Prefer: 'count=exact' }
      });
      if (!r.ok) throw new Error(`${risorsa}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      const righe = await r.json();
      out.push(...righe);
      if (!righe.length) return out;
      const totale = Number(((r.headers.get('content-range') || '').split('/')[1] || '').trim());
      if (Number.isFinite(totale) && out.length >= totale) return out;
    }
    throw new Error(`${risorsa}: troppe pagine, lettura interrotta`);
  }

  const scrivi = (risorsa, corpo, query = '', metodo = 'POST', prefer = 'resolution=merge-duplicates') =>
    chiedi(risorsa, query, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Prefer: prefer },
      body: JSON.stringify(corpo)
    });

  const elimina = (risorsa, query) => chiedi(risorsa, query, { method: 'DELETE' });

  return { configurata, chiedi, tutte, scrivi, elimina };
})();
