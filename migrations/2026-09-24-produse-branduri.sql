-- ═══════════════════════════════════════════════════════════════════════════
-- BRANDURILE PRODUSELOR: lista, setarea in masa, redenumirea   (24.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar: „unele magazine au Brand, dar cum a fost pus daca atunci
-- cand adaugi un produs nou nu ai camp de Brand? ... Si sa avem ca submeniu la
-- Produse si sectiunea Branduri de unde se pot administra toate Brandurile."
--
-- ⚠⚠ BRANDUL RAMANE UNDE ERA: `products.page_sections -> 'google' -> 'brand'`.
-- De acolo il citesc deja pagina produsului, filtrul din magazin, datele
-- structurate, feedurile Google si Facebook, eMAG, Trendyol, OLX, Pepita, About
-- You, exportul si importul. O coloana noua ar fi insemnat a doua copie a
-- aceluiasi lucru, si doua copii se despart. Aici sunt numai functii noi; nu se
-- schimba nicio coloana si nicio functie existenta.
--
-- Masurat pe productie, 24.09.2026: eSAFE 3351/3351 produse cu brand (7 branduri),
-- OKXI 2418/2418 (42), Bricosmart 813/1058 (13), Mokka 20/39, cu „Armaf” si
-- „ARMAF” ca doua branduri diferite. Campul se vedea in formular NUMAI cu Google
-- Merchant conectat, deci aproape tot ce exista a venit din importuri.
--
-- ⚠ `security invoker`: functiile ruleaza cu drepturile celui care cheama, deci
-- RLS-ul de pe `products` le margineste la magazinul lui. Actiunile de server
-- verifica oricum proprietarul inainte, ca la toate actiunile in masa.

-- ═══ 1. Brandurile magazinului, cu cate produse are fiecare ═════════════════

create or replace function public.produse_branduri(p_business uuid)
returns table (brand text, produse bigint)
language sql stable security invoker set search_path = '' as $$
  select x.b, count(*)
    from (select nullif(btrim(p.page_sections -> 'google' ->> 'brand'), '') as b
            from public.products p
           where p.business_id = p_business) x
   where x.b is not null
   group by x.b
   order by lower(x.b), x.b;
$$;

-- ═══ 2. Brandul pe produsele alese (gol = scos) ══════════════════════════════
--
-- ⚠ Se scrie NUMAI cheia `brand` din `google`: restul campurilor Google completate
-- din panou (GTIN, MPN, categorie Google...) raman neatinse. Un `google` lipsa sau
-- care nu e obiect devine obiect.

create or replace function public.produse_seteaza_brandul(p_business uuid, p_ids uuid[], p_brand text)
returns setof uuid
language sql volatile security invoker set search_path = '' as $$
  update public.products p
     set page_sections =
           case
             when nullif(btrim(coalesce(p_brand, '')), '') is null then
               case when jsonb_typeof(p.page_sections -> 'google') = 'object'
                    then jsonb_set(p.page_sections, '{google}', (p.page_sections -> 'google') - 'brand')
                    else p.page_sections end
             else
               coalesce(p.page_sections, '{}'::jsonb)
               || jsonb_build_object('google',
                    coalesce(case when jsonb_typeof(p.page_sections -> 'google') = 'object'
                                  then p.page_sections -> 'google' end, '{}'::jsonb)
                    || jsonb_build_object('brand', left(btrim(p_brand), 120)))
           end,
         updated_at = now()
   where p.business_id = p_business and p.id = any(p_ids)
  returning p.id;
$$;

-- ═══ 3. Redenumirea, unirea si stergerea unui brand ════════════════════════
--
-- Toate trei sunt aceeasi operatie: produsele cu brandul VECHI (exact, dupa
-- `btrim`) primesc brandul NOU. Unirea „ARMAF” in „Armaf” e o redenumire spre un
-- nume care exista deja; stergerea e o redenumire spre nimic.

create or replace function public.produse_redenumeste_brandul(p_business uuid, p_vechi text, p_nou text)
returns setof uuid
language sql volatile security invoker set search_path = '' as $$
  select * from public.produse_seteaza_brandul(
    p_business,
    array(select p.id from public.products p
           where p.business_id = p_business
             and nullif(btrim(p.page_sections -> 'google' ->> 'brand'), '') = btrim(coalesce(p_vechi, ''))),
    p_nou);
$$;

-- ═══ Drepturile ═══════════════════════════════════════════════════════════════

do $$
declare f text;
begin
  foreach f in array array[
    'public.produse_branduri(uuid)',
    'public.produse_seteaza_brandul(uuid, uuid[], text)',
    'public.produse_redenumeste_brandul(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'anon poate chema %', f;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception '% trebuie sa fie security invoker (RLS-ul o margineste)', f;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
