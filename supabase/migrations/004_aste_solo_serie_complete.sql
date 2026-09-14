-- Le aste mostrate nel monitoraggio devono essere le stesse contate nel campo
-- `aste` di quotazioni, che considera solo le serie complete: senza questo
-- filtro la tabella elencava anche le figurine sciolte e il totale non
-- coincideva con il riquadro in testa alla pagina.
create or replace view public.v_aste
with (security_invoker = on) as
select i.serie_num, s.titolo as serie_titolo, i.titolo, i.prezzo, i.url,
       q.p_med as mediana_serie
from public.inserzioni i
join public.rilevamenti r on r.corrente and r.id = i.rilevamento_id
join public.serie       s on s.num = i.serie_num
join public.quotazioni  q on q.rilevamento_id = r.id and q.serie_num = i.serie_num
where i.asta and not i.singola;

grant select on public.v_aste to anon, authenticated;
