-- ═══════════════════════════════════════════════════════════════════════════
-- EDITAREA COMENZII: SI SCOATEREA DE LINII, NU DOAR ADAUGAREA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Panoul putea doar sa ADAUGE produse pe o comanda. Scoaterea unei linii si
-- scaderea unei cantitati cer inversul: marfa se intoarce pe raft.
--
-- ═══ DE CE NU AJUNGE `elibereaza_stoc_complet` CHEMATA DIN APLICATIE ═══
--
-- `orders.stoc_rezervat` retine ce a consumat comanda, si din el se da inapoi la
-- anulare (`elibereaza_stoc_comanda`). `editeaza_comanda_atomic` stia doar sa
-- CONCATENEZE la el:
--
--     stoc_rezervat = jsonb_build_object(
--       'produse',  coalesce(stoc_rezervat->'produse','[]') || coalesce(p_produse,'[]'),
--       ...
--
-- Nu exista nicaieri, nici in baza nici in cod, vreo cale de scadere. Deci o
-- scoatere care ar fi dat stocul inapoi pe loc l-ar fi dat inapoi INCA O DATA la
-- anularea de peste doua zile: scoti o linie de 5 bucati, anulezi comanda, iar
-- catalogul creste cu 10. Un stoc umflat vinde marfa care nu exista, adica e mai
-- rau decat unul blocat.
--
-- Cele doua miscari — ce se scrie pe comanda si ce se da inapoi la stoc — trebuie
-- deci sa se intample IMPREUNA, sub acelasi lacat pe randul comenzii. De aia
-- eliberarea se muta INAUNTRUL functiei de editare, si nu ramane un al doilea RPC
-- chemat din aplicatie: doua RPC-uri sunt doua tranzactii, iar intre ele incape
-- exact esecul care lasa comanda scrisa si marfa nereturnata.
--
-- ═══ SE DA INAPOI CEL MULT CAT DATORA LINIA, NU CAT A LUAT COMANDA ═══
--
-- Cantitatile cerute se clemeaza de DOUA ori:
--
--   1. la ce scrie in `stoc_rezervat` — nu se da inapoi ce nu s-a luat;
--   2. la ce mai DATOREAZA comanda dupa editare (`p_*_necesar`) — nu se scade
--      rezervarea sub marfa care inca trebuie livrata.
--
-- A doua nu e prisos. `stoc_rezervat` tine socoteala pe PRODUS, pe toata comanda,
-- fiindca pachetele nu-si scriu componentele in `items`. Cand acelasi produs e
-- consumat de doua linii — o componenta de pachet plus vanzarea lui separata — iar
-- compozitia pachetului se schimba intre vanzare si editare, desfacerea prin
-- compozitia de AZI cere inapoi mai mult decat i se cuvine liniei scoase si mananca
-- rezervarea celeilalte:
--
--   C are stoc 10; pachetul B = 2 x C. Comanda: 1 x B + 3 x C  -> rezervat C = 5.
--   Comerciantul schimba compozitia la 5 x C, apoi scoate linia de pachet.
--   Fara clema a doua: se cer inapoi 5, se elibereaza 5, rezervarea ajunge la ZERO —
--   desi comanda mai are 3 bucati de C de livrat. Stocul se umfla cu 3, iar
--   anularea de mai tarziu nu mai are ce da inapoi.
--
-- Cu ea: necesarul ramas e 3, deci se poate elibera cel mult 5 - 3 = 2.
--
-- Necesarul vine din aplicatie desfacut prin ACEEASI functie ca eliberarea
-- (`expandBundleRelease`), dinadins: doua desfaceri diferite ar readuce chiar
-- nepotrivirea pe care clema o repara.
--
-- Verificat pe date sintetice, in tranzactie anulata:
--   rezervat 5, cerut 2, necesar 0 -> eliberat 2, ramas 3
--   rezervat 5, cerut 9, necesar 0 -> eliberat 5, ramas 0 (randul dispare)
--   rezervat 5, cerut 5, necesar 3 -> eliberat 2, ramas 3
--   rezervat 5, cerut 5, necesar 9 -> eliberat 0, ramas 5 (compozitie crescuta)
--   rezervat -, cerut 3            -> eliberat 0 (nu se inventeaza ce nu s-a luat)
--   stoc_rezervat NULL             -> ramane NULL, nimic eliberat, `stoc_cunoscut: false`

-- ── Aritmetica clemei, separata ca sa poata fi citita si probata singura ──────
--
-- Intoarce trei liste: `rezervat` (ce ramane pe comanda), `produse` si `variante`
-- (ce se da inapoi acum). Listele se si COMPACTEAZA pe cheie — pana acum
-- `stoc_rezervat` crestea cu cate un rand la fiecare editare, iar o scadere pe o
-- lista cu duplicate n-ar fi avut de unde sa stie din care rand sa taie.
create or replace function public.scade_din_rezervat(
  p_rez              jsonb,
  p_produse_minus    jsonb,
  p_variante_minus   jsonb,
  p_produse_necesar  jsonb default '[]'::jsonb,
  p_variante_necesar jsonb default '[]'::jsonb
) returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  with rez_p as (
    select e->>'product_id' as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_rez->'produse', '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
  ),
  min_p as (
    select e->>'product_id' as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse_minus, '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
  ),
  nec_p as (
    select e->>'product_id' as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse_necesar, '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
  ),
  calc_p as (
    -- Se poate elibera cel mult ce prisoseste peste ce mai datoreaza comanda.
    select r.pid,
           least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0)))         as eliberat,
           r.qty - least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0))) as ramas
      from rez_p r
      left join min_p m on m.pid = r.pid
      left join nec_p n on n.pid = r.pid
  ),
  rez_v as (
    select e->>'product_id' as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_rez->'variante', '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null
     group by 1, 2
  ),
  min_v as (
    select e->>'product_id' as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_variante_minus, '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null
     group by 1, 2
  ),
  nec_v as (
    select e->>'product_id' as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_variante_necesar, '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null
     group by 1, 2
  ),
  calc_v as (
    select r.pid, r.titlu,
           least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0)))         as eliberat,
           r.qty - least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0))) as ramas
      from rez_v r
      left join min_v m on m.pid = r.pid and m.titlu = r.titlu
      left join nec_v n on n.pid = r.pid and n.titlu = r.titlu
  )
  select jsonb_build_object(
    'rezervat', jsonb_build_object(
      'produse', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', ramas) order by pid)
                             from calc_p where ramas > 0), '[]'::jsonb),
      'variante', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', ramas) order by pid, titlu)
                             from calc_v where ramas > 0), '[]'::jsonb)),
    'produse', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', eliberat) order by pid)
                           from calc_p where eliberat > 0), '[]'::jsonb),
    'variante', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', eliberat) order by pid, titlu)
                           from calc_v where eliberat > 0), '[]'::jsonb));
$$;

comment on function public.scade_din_rezervat(jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Cat se poate da inapoi din ce a consumat o comanda: clemat la ce scrie in stoc_rezervat SI la ce mai datoreaza comanda dupa editare. Intoarce si ce ramane rezervat.';

-- ── Semnatura veche se STERGE, nu se lasa alaturi ─────────────────────────────
--
-- Argumentele noi au valori implicite, deci un `create or replace` ar fi lasat
-- DOUA functii cu acelasi nume, iar apelul pe nume de argument ar fi devenit
-- ambiguu („function is not unique"). Acelasi motiv pentru care s-a sters si
-- semnatura de 5 argumente cand a aparut `p_status_asteptat`: o cale ramasa in
-- picioare e o cale pe care se poate ajunge din greseala, aici cu scoaterea
-- neaplicata si stocul nereturnat.
drop function if exists public.editeaza_comanda_atomic(uuid, uuid, jsonb, jsonb, jsonb, text);

create or replace function public.editeaza_comanda_atomic(
  p_order_id         uuid,
  p_business_id      uuid,
  p_patch            jsonb,
  p_produse          jsonb,
  p_variante         jsonb,
  p_status_asteptat  text  default null,
  p_produse_minus    jsonb default '[]'::jsonb,
  p_variante_minus   jsonb default '[]'::jsonb,
  p_produse_necesar  jsonb default '[]'::jsonb,
  p_variante_necesar jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_biz      uuid;
  v_rez      jsonb;
  v_status   text;
  v_eliberat timestamptz;
  v_calc     jsonb;
  v_nou      jsonb;
  v_misca    boolean;
begin
  select business_id, stoc_rezervat, status, stoc_eliberat_la
    into v_biz, v_rez, v_status, v_eliberat
    from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('gasit', false); end if;
  -- Limita de magazin, ca la celelalte: actiunile de server se pot chema cu orice
  -- argumente, printr-un POST direct.
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  /*
   * ═══ STATUSUL SE VERIFICA SUB LACAT ═══
   *
   * Comerciantul citeste comanda, ii vede statusul, rezerva stocul pentru liniile
   * noi — si abia apoi ajunge aici. Intre citire si scriere, altcineva (panoul,
   * un lot, un webhook de marketplace) poate ANULA comanda si elibera stocul ei.
   * Fara verificarea de aici, editarea se aplica peste o comanda deja anulata si
   * ii adauga stoc rezervat proaspat — pe care anularea, deja intamplata, nu-l mai
   * elibereaza niciodata.
   */
  if p_status_asteptat is not null and v_status is distinct from p_status_asteptat then
    return jsonb_build_object('gasit', false, 'motiv', 'status schimbat',
                              'status_curent', v_status, 'asteptat', p_status_asteptat);
  end if;

  v_misca := jsonb_array_length(coalesce(p_produse,        '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_variante,       '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_produse_minus,  '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_variante_minus, '[]'::jsonb)) > 0;

  /*
   * ═══ STOCUL DEJA ELIBERAT NU SE MAI MISCA ═══
   *
   * `stoc_eliberat_la` inseamna ca marfa comenzii s-a intors deja pe raft —
   * comanda e anulata, rambursata, sau doar cu `payment_status = 'refunded'`
   * (`aplica_tranzitia_comenzii` elibereaza si pe drumul asta, fara sa schimbe
   * statusul). Ultimul caz TRECE azi de garda din aplicatie, care se uita doar la
   * status.
   *
   * Peste o comanda in starea asta, o adaugare ar scadea stoc pe care anularea
   * l-a dat deja inapoi, iar o scoatere ar da inapoi bucati intoarse o data.
   * Datele clientului se pot corecta oricand; marfa, nu.
   */
  if v_eliberat is not null and v_misca then
    return jsonb_build_object('gasit', false, 'motiv', 'stoc eliberat');
  end if;

  /*
   * Comanda dinainte de coloana (`stoc_rezervat is null`) ramane NULL.
   *
   * Nu se stie ce a consumat, deci nu se poate nici da inapoi, nici scrie acum
   * doar liniile atinse: scrisa asa, ar arata ca si cum atat ar fi consumat, iar
   * `elibereaza_stoc_comanda` ar raporta „eliberat" dupa ce ar da inapoi o farama.
   * Apelantul afla din `stoc_cunoscut` si spune omului sa corecteze de mana.
   */
  if v_rez is null then
    v_nou  := null;
    v_calc := jsonb_build_object('produse', '[]'::jsonb, 'variante', '[]'::jsonb);
  else
    v_calc := public.scade_din_rezervat(v_rez, p_produse_minus, p_variante_minus,
                                        p_produse_necesar, p_variante_necesar);
    v_nou  := jsonb_build_object(
      'produse',  coalesce(v_calc->'rezervat'->'produse',  '[]'::jsonb) || coalesce(p_produse,  '[]'::jsonb),
      'variante', coalesce(v_calc->'rezervat'->'variante', '[]'::jsonb) || coalesce(p_variante, '[]'::jsonb));
  end if;

  update public.orders set
    customer_name    = coalesce(p_patch->>'customer_name', customer_name),
    customer_phone   = coalesce(p_patch->>'customer_phone', customer_phone),
    customer_email   = case when p_patch ? 'customer_email' then nullif(p_patch->>'customer_email','') else customer_email end,
    shipping_address = coalesce(p_patch->'shipping_address', shipping_address),
    items            = coalesce(p_patch->'items', items),
    subtotal         = coalesce((p_patch->>'subtotal')::numeric, subtotal),
    shipping_cost    = coalesce((p_patch->>'shipping_cost')::numeric, shipping_cost),
    cod_fee_amount   = coalesce((p_patch->>'cod_fee_amount')::numeric, cod_fee_amount),
    vat_amount       = coalesce((p_patch->>'vat_amount')::numeric, vat_amount),
    vat_rate         = coalesce((p_patch->>'vat_rate')::numeric, vat_rate),
    total            = coalesce((p_patch->>'total')::numeric, total),
    updated_at       = now(),
    stoc_rezervat    = v_nou
  where id = p_order_id;

  /*
   * Darea inapoi, in ACEEASI tranzactie cu scrierea de mai sus.
   *
   * Produsele intai, variantele dupa — ordinea impusa de declansatorul care pune
   * `stock_quantity` = suma combinatiilor. Vezi antetul lui
   * `2026-08-17-eliberare-stoc-comanda.sql`.
   */
  perform public.elibereaza_stoc_complet(v_calc->'produse', v_calc->'variante');

  return jsonb_build_object(
    'gasit', true,
    'stoc_cunoscut', v_rez is not null,
    'eliberat', jsonb_build_object('produse', v_calc->'produse', 'variante', v_calc->'variante'));
end;
$$;

revoke all on function public.scade_din_rezervat(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.scade_din_rezervat(jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.editeaza_comanda_atomic(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.editeaza_comanda_atomic(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
