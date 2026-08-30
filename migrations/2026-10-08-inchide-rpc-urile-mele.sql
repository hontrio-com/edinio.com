-- ═══════════════════════════════════════════════════════════════════════════
-- Cele două funcții scrise pe 24.08.2026 erau deschise către `anon` și
-- `authenticated`. Se închid, și se pun două plase înăuntru.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE A FOST GREȘIT, ȘI DE CE E UȘOR DE GREȘIT
--
-- Am scris `grant execute … to service_role;` și am crezut că asta e permisiunea.
-- Nu e: Postgres dă EXECUTE lui **PUBLIC** din oficiu, la ORICE funcție nouă. Un `grant`
-- adaugă, nu restrânge. Deci `service_role` a primit ceva ce avea deja toată lumea.
--
-- Măsurat în producție cu `pg_proc.proacl`:
--
--   ajusteaza_stoc_comanda_marketplace → =X/postgres | anon=X | authenticated=X | service_role=X
--   consuma_stoc_comanda_marketplace   → postgres=X  | service_role=X          ← cum trebuie
--
-- A doua e scrisă mai demult, de altcineva, și e închisă corect. Diferența nu e de
-- pricepere, e că acolo cineva a scris `revoke`. Eu nu.
--
-- ⚠ CE PUTEA COSTA. `ajusteaza_stoc_comanda_marketplace` e `SECURITY DEFINER`, deci
-- rulează cu drepturile proprietarului și trece peste RLS. Iar înăuntru avea două găuri:
--
--   1. `if p_business_id is not null and v_biz is distinct from p_business_id` — cu
--      `NULL` trimis din afară, verificarea de magazin se sărea cu totul.
--   2. Id-urile de produs din `p_produse` / `p_variante` nu erau verificate ca fiind ale
--      magazinului: `consuma_stoc_marketplace` face `update products … where id = pid`,
--      fără nicio legătură cu `business_id`.
--
-- Împreună: un comerciant autentificat, cu o comandă a LUI, putea trimite `p_business_id
-- = NULL` și id-uri de produs ale altui magazin, iar stocul acelora se modifica. Nu am
-- executat exploit-ul; calea de cod și granturile sunt de ajuns ca să fie tratată ca
-- vulnerabilitate reală.
--
-- ⚠ Se repară pe TREI straturi, fiindcă oricare singur ar fi fost destul azi, dar nu și
-- peste un an, când altcineva mută un `grant`.

-- ── 1. Ușa: numai service_role ──────────────────────────────────────────────
revoke all on function public.ajusteaza_stoc_comanda_marketplace(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.ajusteaza_stoc_comanda_marketplace(uuid, uuid, jsonb, jsonb)
  to service_role;

-- ⚠ Și cea de numărare: nu mișcă nimic, dar spune câte oferte are un magazin ORICUI îi
-- trimite `business_id`-ul. E scurgere de informație, nu pagubă — se închide la fel.
revoke all on function public.numara_ofertele_emag(uuid) from public, anon, authenticated;
grant execute on function public.numara_ofertele_emag(uuid) to service_role;

-- ── 2. și 3. Plasele dinăuntru ──────────────────────────────────────────────
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
  v_luat jsonb; v_nou_p jsonb; v_nou_v jsonb; v_straine int;
begin
  /*
   * ⚠ MAGAZINUL SE CERE, NU SE PRESUPUNE.
   *
   * Forma dinainte accepta `NULL` si sarea peste verificare. Copiasem tiparul din
   * `consuma_stoc_comanda_marketplace`, unde e la fel — dar aceea nu e expusa nimanui in
   * afara de `service_role`, deci acolo `NULL` vine doar din codul nostru.
   */
  if p_business_id is null then
    return jsonb_build_object('gasit', false, 'motiv', 'business_id lipsa');
  end if;

  select business_id, stoc_marketplace_la, stoc_eliberat_la, stoc_rezervat
    into v_biz, v_marcaj, v_eliberat, v_rez
    from public.orders where id = p_order_id for update;

  if not found then return jsonb_build_object('gasit', false); end if;
  if v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  /*
   * ⚠ SI PRODUSELE TREBUIE SA FIE ALE LUI.
   *
   * `consuma_stoc_marketplace` face `update products … where id = pid`, fara nicio
   * legatura cu `business_id`. Deci o lista de id-uri straine ar fi modificat stocul
   * altui magazin, sub drepturile proprietarului functiei.
   *
   * Se numara ce NU e al lui; daca exista macar unul, nu se atinge nimic. Filtrarea
   * tacuta ar fi fost mai blanda si mai rea: cererea ar fi „reusit" pe jumatate.
   */
  select count(*) into v_straine
    from (
      select (e->>'product_id')::uuid as pid
        from jsonb_array_elements(coalesce(p_produse, '[]'::jsonb)) e
       where e->>'product_id' is not null
      union
      select (e->>'product_id')::uuid
        from jsonb_array_elements(coalesce(p_variante, '[]'::jsonb)) e
       where e->>'product_id' is not null
    ) t
   where not exists (
     select 1 from public.products p where p.id = t.pid and p.business_id = v_biz
   );

  if v_straine > 0 then
    return jsonb_build_object('gasit', false, 'motiv', 'produse din alt magazin', 'straine', v_straine);
  end if;

  if v_marcaj is null then
    return jsonb_build_object('gasit', true, 'neconsumat', true, 'schimbat', false);
  end if;
  if v_eliberat is not null then
    return jsonb_build_object('gasit', true, 'eliberat', true, 'schimbat', false);
  end if;

  with vechi as (
    select (e->>'product_id')::uuid as pid, sum(greatest(0, coalesce((e->>'quantity')::int,0)))::int as q
      from jsonb_array_elements(coalesce(v_rez->'produse','[]'::jsonb)) e
     where e->>'product_id' is not null group by 1
  ), nou as (
    select (e->>'product_id')::uuid as pid, sum(greatest(0, coalesce((e->>'quantity')::int,0)))::int as q
      from jsonb_array_elements(coalesce(p_produse,'[]'::jsonb)) e
     where e->>'product_id' is not null group by 1
  ), dif as (
    select coalesce(n.pid, v.pid) as pid, coalesce(n.q,0) - coalesce(v.q,0) as d
      from nou n full join vechi v on v.pid = n.pid
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', d)) filter (where d > 0), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', -d)) filter (where d < 0), '[]'::jsonb)
    into v_cons_p, v_elib_p from dif;

  with vechi as (
    select (e->>'product_id')::uuid as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int,0)))::int as q
      from jsonb_array_elements(coalesce(v_rez->'variante','[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null group by 1,2
  ), nou as (
    select (e->>'product_id')::uuid as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int,0)))::int as q
      from jsonb_array_elements(coalesce(p_variante,'[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null group by 1,2
  ), dif as (
    select coalesce(n.pid, v.pid) as pid, coalesce(n.titlu, v.titlu) as titlu,
           coalesce(n.q,0) - coalesce(v.q,0) as d
      from nou n full join vechi v on v.pid = n.pid and v.titlu = n.titlu
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', d)) filter (where d > 0), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', -d)) filter (where d < 0), '[]'::jsonb)
    into v_cons_v, v_elib_v from dif;

  if jsonb_array_length(v_cons_p) = 0 and jsonb_array_length(v_cons_v) = 0
     and jsonb_array_length(v_elib_p) = 0 and jsonb_array_length(v_elib_v) = 0 then
    return jsonb_build_object('gasit', true, 'schimbat', false);
  end if;

  perform public.elibereaza_stoc_complet(v_elib_p, v_elib_v);
  v_luat := public.consuma_stoc_marketplace(v_cons_p, v_cons_v);

  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', q)), '[]'::jsonb)
    into v_nou_p from (
      select pid, sum(q)::int as q from (
        select (e->>'product_id')::uuid as pid, coalesce((e->>'quantity')::int,0) as q
          from jsonb_array_elements(coalesce(v_rez->'produse','[]'::jsonb)) e where e->>'product_id' is not null
        union all
        select (e->>'product_id')::uuid, coalesce((e->>'quantity')::int,0)
          from jsonb_array_elements(coalesce(v_luat->'consumat'->'produse','[]'::jsonb)) e
        union all
        select (e->>'product_id')::uuid, -coalesce((e->>'quantity')::int,0)
          from jsonb_array_elements(v_elib_p) e
      ) t group by pid having sum(q) > 0
    ) u;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', q)), '[]'::jsonb)
    into v_nou_v from (
      select pid, titlu, sum(q)::int as q from (
        select (e->>'product_id')::uuid as pid, e->>'variant_title' as titlu, coalesce((e->>'quantity')::int,0) as q
          from jsonb_array_elements(coalesce(v_rez->'variante','[]'::jsonb)) e
         where e->>'product_id' is not null and e->>'variant_title' is not null
        union all
        select (e->>'product_id')::uuid, e->>'variant_title', coalesce((e->>'quantity')::int,0)
          from jsonb_array_elements(coalesce(v_luat->'consumat'->'variante','[]'::jsonb)) e
        union all
        select (e->>'product_id')::uuid, e->>'variant_title', -coalesce((e->>'quantity')::int,0)
          from jsonb_array_elements(v_elib_v) e
      ) t group by pid, titlu having sum(q) > 0
    ) u;

  update public.orders
     set stoc_rezervat = jsonb_build_object('produse', v_nou_p, 'variante', v_nou_v), updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('gasit', true, 'schimbat', true,
    'consumat', coalesce(v_luat->'consumat','{}'::jsonb),
    'eliberat', jsonb_build_object('produse', v_elib_p, 'variante', v_elib_v),
    'lipsa', coalesce(v_luat->'lipsa','[]'::jsonb));
end;
$$;

-- ⚠ `create or replace` REFACE granturile implicite. Deci se revocă DIN NOU, dupa el.
revoke all on function public.ajusteaza_stoc_comanda_marketplace(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.ajusteaza_stoc_comanda_marketplace(uuid, uuid, jsonb, jsonb)
  to service_role;

notify pgrst, 'reload schema';
