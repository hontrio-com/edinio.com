-- ═══════════════════════════════════════════════════════════════════════════
-- OFERTA „REDUCERE CANTITATE": PRAGURILE SE SCRIU PE PRODUSE, DINTR-O DATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE O FUNCTIE SI NU UN `update` PE RAND, DIN COD.
--
-- Prima scriere trimitea cate un `update` pentru fiecare produs. La magazinul
-- demo, cu 63 de produse, actiunea se intindea cat sa nu mai apuce sa raspunda,
-- iar comutatorul din lista sarea inapoi: oferta parea ca nu se stinge. La
-- eSafe, cu 3.351 de produse, ar fi fost 3.351 de dus-intors - adica minute, si
-- o cadere sigura de timeout.
--
-- Aici totul e o singura fraza: PostgreSQL atinge randurile o data.
--
-- ⚠ NU SE CALCA PESTE CE A PUS OMUL. Un produs cu upsell aprins pe fisa lui
-- (`enabled = true` si FARA `dinOferta`) e sarit. Cine si-a facut pachetele de
-- mana nu si le pierde fiindca a pornit cineva o oferta pe tot magazinul.
--
-- ⚠ SE SI RETRAGE. Randurile atinse candva de oferta asta care nu mai intra in
-- tinta (s-a ingustat declansatorul, ori s-a stins oferta) raman curate. Fara
-- pasul asta, o reducere oprita din panou s-ar fi incasat mai departe.
--
-- ⚠ SECURITY INVOKER (implicit): RLS de pe `products` ramane poarta.
-- `p_business` e un filtru, nu o permisiune.

create or replace function public.aplica_praguri_oferta(
  p_business    uuid,
  p_oferta      uuid,
  p_scope       text,                      -- 'all' | 'categories' | 'products'
  p_produse     uuid[]  default '{}',
  p_categorii   text[]  default '{}',
  p_praguri     jsonb   default '[]'::jsonb,
  p_activa      boolean default true
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scrie   boolean := p_activa and jsonb_array_length(coalesce(p_praguri, '[]'::jsonb)) > 0;
  v_valoare jsonb := jsonb_build_object(
                       'enabled', true, 'mode', 'percent',
                       'praguri', p_praguri, 'dinOferta', p_oferta::text);
  v_scrise  int := 0;
  v_sarite  int := 0;
  v_retrase int := 0;
begin
  -- Cine intra in tinta acum.
  create temporary table if not exists _tinte (id uuid primary key) on commit drop;
  /*
    ⚠ `where true` NU E DE PRISOS. Depozitul are o plasa care refuza orice
    `delete` fara `where` (vezi `safeupdate`), iar ea nu face deosebirea intre
    o tabela temporara si una adevarata: `delete from _tinte;` cadea cu
    „DELETE requires a WHERE clause", si toata aplicarea se oprea in tacere -
    oferta se stingea din lista, dar pragurile ramaneau pe produse.
  */
  delete from _tinte where true;

  if v_scrie then
    insert into _tinte (id)
    select p.id from public.products p
     where p.business_id = p_business
       and (
         p_scope = 'all'
         or (p_scope = 'products'   and p.id = any(coalesce(p_produse, '{}')))
         or (p_scope = 'categories' and p.category = any(coalesce(p_categorii, '{}')))
       );
  end if;

  -- Cate sar, fiindca au upsell pus de om.
  select count(*) into v_sarite
    from public.products p join _tinte t on t.id = p.id
   where coalesce((p.page_sections -> 'quantity_tiers' ->> 'enabled')::boolean, false)
     and p.page_sections -> 'quantity_tiers' ->> 'dinOferta' is null;

  -- 1. Se scrie pe tinte, mai putin pe cele alese de om.
  with de_scris as (
    select p.id from public.products p join _tinte t on t.id = p.id
     where not (
       coalesce((p.page_sections -> 'quantity_tiers' ->> 'enabled')::boolean, false)
       and p.page_sections -> 'quantity_tiers' ->> 'dinOferta' is null
     )
       -- Randurile deja identice nu se ating: `updated_at` nu trebuie miscat degeaba.
       and coalesce(p.page_sections -> 'quantity_tiers', 'null'::jsonb) is distinct from v_valoare
  ), scrise as (
    update public.products p
       set page_sections = jsonb_set(coalesce(p.page_sections, '{}'::jsonb), '{quantity_tiers}', v_valoare, true),
           updated_at = now()
      from de_scris d
     where p.id = d.id and p.business_id = p_business
    returning 1
  )
  select count(*) into v_scrise from scrise;

  -- 2. Se retrage de pe ce a atins candva oferta si nu mai e tinta.
  with retrase as (
    update public.products p
       set page_sections = p.page_sections - 'quantity_tiers',
           updated_at = now()
     where p.business_id = p_business
       and p.page_sections -> 'quantity_tiers' ->> 'dinOferta' = p_oferta::text
       and not exists (select 1 from _tinte t where t.id = p.id)
    returning 1
  )
  select count(*) into v_retrase from retrase;

  return jsonb_build_object('scrise', v_scrise, 'sarite', v_sarite, 'retrase', v_retrase);
end;
$$;

-- ── Drepturi ────────────────────────────────────────────────────────────────
-- ⚠ Si de la `anon`, PE NUME: privilegiile implicite ale proiectului dau
-- grantul pe nume fiecarei functii noi, iar `revoke ... from public` nu-l
-- stinge. Fara randurile astea, oricine cu cheia publica ar putea rescrie
-- preturile de treapta ale oricarui magazin.
revoke execute on function public.aplica_praguri_oferta(uuid, uuid, text, uuid[], text[], jsonb, boolean) from public, anon;
grant execute on function public.aplica_praguri_oferta(uuid, uuid, text, uuid[], text[], jsonb, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
