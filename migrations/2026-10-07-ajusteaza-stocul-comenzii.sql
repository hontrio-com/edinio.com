-- ═══════════════════════════════════════════════════════════════════════════
-- Modificarea unei comenzi de marketplace: stocul urmează liniile
-- 24.08.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE SE REPARĂ
--
-- `consuma_stoc_comanda_marketplace` e idempotentă prin `stoc_marketplace_la`: odată
-- pus marcajul, răspunde `deja: true` și NU compară nimic. Asta e corect pentru ce a
-- fost scrisă — o a doua trecere peste aceeași comandă nu are voie să scadă de două ori.
--
-- Dar liniile comenzii CHIAR se rescriu la o modificare venită de la ei
-- (`orders.ts` actualizează `items`, `subtotal`, `total`, `vat_amount`), iar stocul
-- rămânea al vechilor linii. Două feluri de pagubă, amândouă tăcute:
--
--   Un produs ADĂUGAT pe o comandă deja preluată pleacă din depozit fără să fie scăzut
--   vreodată. Magazinul propriu și celelalte canale vând mai departe ce nu mai există.
--
--   Un storno PARȚIAL lasă bucăți marcate „vândute" care sunt de fapt pe raft și nu se
--   mai vând niciodată. Marfă îngropată, fără nicio urmă.
--
-- În amândouă cazurile fiecare pas raportează reușit. Specificația lor le cere explicit
-- („Adding a product to an existing order…", „Partial storno requires the order in
-- status 4 and at least one product quantity reduced"), iar câmpurile `storno_qty` și
-- `initial_qty` sunt deja în răspunsul real.
--
-- ⚠ DE CE O FUNCȚIE NOUĂ ȘI NU O SCHIMBARE ÎN CEA VECHE
--
-- Fiindcă sunt două întrebări diferite. „Consumă prima oară" trebuie să fie idempotentă
-- și să nu facă nimic la a doua chemare. „Adu stocul la zi cu liniile" trebuie să
-- compare de fiecare dată. Contopite, prima ar fi pierdut idempotența — adică exact
-- plasa care o face sigură de rechemat după o cădere.
--
-- ⚠ CE NU FACE
--
-- Nu atinge o comandă care nu și-a consumat încă stocul (`stoc_marketplace_la is null`):
-- acolo lucrează calea obișnuită, iar o ajustare ar scădea pe lângă ea.
-- Și nu atinge una care și-a ELIBERAT stocul (anulată, rambursată): marfa s-a întors pe
-- raft, iar o ajustare ar scădea-o a doua oară pentru o comandă care nu mai există.

create or replace function public.ajusteaza_stoc_comanda_marketplace(
  p_order_id uuid,
  p_business_id uuid,
  p_produse jsonb,
  p_variante jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_biz uuid; v_marcaj timestamptz; v_eliberat timestamptz; v_rez jsonb;
  v_cons_p jsonb := '[]'::jsonb; v_cons_v jsonb := '[]'::jsonb;
  v_elib_p jsonb := '[]'::jsonb; v_elib_v jsonb := '[]'::jsonb;
  v_luat jsonb; v_nou_p jsonb; v_nou_v jsonb;
begin
  select business_id, stoc_marketplace_la, stoc_eliberat_la, stoc_rezervat
    into v_biz, v_marcaj, v_eliberat, v_rez
    from public.orders where id = p_order_id for update;

  if not found then return jsonb_build_object('gasit', false); end if;
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  /* Prima consumare n-a avut loc: o face calea obisnuita, nu asta. */
  if v_marcaj is null then
    return jsonb_build_object('gasit', true, 'neconsumat', true, 'schimbat', false);
  end if;
  /* Stocul s-a intors deja: comanda e anulata sau rambursata. */
  if v_eliberat is not null then
    return jsonb_build_object('gasit', true, 'eliberat', true, 'schimbat', false);
  end if;

  /* ── Diferenta pe produse ─────────────────────────────────────────────── */
  with vechi as (
    select (e->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as q
      from jsonb_array_elements(coalesce(v_rez->'produse', '[]'::jsonb)) e
     where e->>'product_id' is not null group by 1
  ), nou as (
    select (e->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as q
      from jsonb_array_elements(coalesce(p_produse, '[]'::jsonb)) e
     where e->>'product_id' is not null group by 1
  ), dif as (
    select coalesce(n.pid, v.pid) as pid, coalesce(n.q, 0) - coalesce(v.q, 0) as d
      from nou n full join vechi v on v.pid = n.pid
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', d))
             filter (where d > 0), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', -d))
             filter (where d < 0), '[]'::jsonb)
    into v_cons_p, v_elib_p
    from dif;

  /* ── Diferenta pe variante ────────────────────────────────────────────── */
  with vechi as (
    select (e->>'product_id')::uuid as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as q
      from jsonb_array_elements(coalesce(v_rez->'variante', '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null group by 1, 2
  ), nou as (
    select (e->>'product_id')::uuid as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as q
      from jsonb_array_elements(coalesce(p_variante, '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null group by 1, 2
  ), dif as (
    select coalesce(n.pid, v.pid) as pid, coalesce(n.titlu, v.titlu) as titlu,
           coalesce(n.q, 0) - coalesce(v.q, 0) as d
      from nou n full join vechi v on v.pid = n.pid and v.titlu = n.titlu
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', d))
             filter (where d > 0), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', -d))
             filter (where d < 0), '[]'::jsonb)
    into v_cons_v, v_elib_v
    from dif;

  if jsonb_array_length(v_cons_p) = 0 and jsonb_array_length(v_cons_v) = 0
     and jsonb_array_length(v_elib_p) = 0 and jsonb_array_length(v_elib_v) = 0 then
    return jsonb_build_object('gasit', true, 'schimbat', false);
  end if;

  /*
   * ⚠ SE ELIBEREAZA INTAI, apoi se consuma.
   *
   * La un schimb — o bucata scoasa de pe un produs si adaugata pe altul, sau pe alta
   * marime a aceluiasi — ordinea inversa ar fi cerut stoc care tocmai urmeaza sa se
   * intoarca. Pe un produs cu ultima bucata, consumul s-ar fi plafonat la zero si
   * comanda ar fi ramas cu marfa nescazuta, desi in depozit ea exista.
   */
  perform public.elibereaza_stoc_complet(v_elib_p, v_elib_v);
  v_luat := public.consuma_stoc_marketplace(v_cons_p, v_cons_v);

  /*
   * ⚠ `stoc_rezervat` primeste CE S-A INTAMPLAT, nu ce s-a cerut.
   *
   * Consumul se plafoneaza la cat exista pe raft, deci „cerut" si „luat" chiar difera.
   * Scris cu ce s-a cerut, anularea de mai tarziu ar fi dat inapoi stoc care n-a
   * existat niciodata — chiar regula scrisa la `consuma_stoc_comanda_marketplace`.
   */
  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', q)), '[]'::jsonb)
    into v_nou_p
    from (
      select pid, sum(q)::int as q from (
        select (e->>'product_id')::uuid as pid, coalesce((e->>'quantity')::int, 0) as q
          from jsonb_array_elements(coalesce(v_rez->'produse', '[]'::jsonb)) e
         where e->>'product_id' is not null
        union all
        select (e->>'product_id')::uuid, coalesce((e->>'quantity')::int, 0)
          from jsonb_array_elements(coalesce(v_luat->'consumat'->'produse', '[]'::jsonb)) e
        union all
        select (e->>'product_id')::uuid, -coalesce((e->>'quantity')::int, 0)
          from jsonb_array_elements(v_elib_p) e
      ) t group by pid having sum(q) > 0
    ) u;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', pid, 'variant_title', titlu, 'quantity', q)), '[]'::jsonb)
    into v_nou_v
    from (
      select pid, titlu, sum(q)::int as q from (
        select (e->>'product_id')::uuid as pid, e->>'variant_title' as titlu,
               coalesce((e->>'quantity')::int, 0) as q
          from jsonb_array_elements(coalesce(v_rez->'variante', '[]'::jsonb)) e
         where e->>'product_id' is not null and e->>'variant_title' is not null
        union all
        select (e->>'product_id')::uuid, e->>'variant_title', coalesce((e->>'quantity')::int, 0)
          from jsonb_array_elements(coalesce(v_luat->'consumat'->'variante', '[]'::jsonb)) e
        union all
        select (e->>'product_id')::uuid, e->>'variant_title', -coalesce((e->>'quantity')::int, 0)
          from jsonb_array_elements(v_elib_v) e
      ) t group by pid, titlu having sum(q) > 0
    ) u;

  update public.orders
     set stoc_rezervat = jsonb_build_object('produse', v_nou_p, 'variante', v_nou_v),
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'gasit', true, 'schimbat', true,
    'consumat', coalesce(v_luat->'consumat', '{}'::jsonb),
    'eliberat', jsonb_build_object('produse', v_elib_p, 'variante', v_elib_v),
    'lipsa', coalesce(v_luat->'lipsa', '[]'::jsonb));
end;
$$;

grant execute on function public.ajusteaza_stoc_comanda_marketplace(uuid, uuid, jsonb, jsonb)
  to service_role;

notify pgrst, 'reload schema';
