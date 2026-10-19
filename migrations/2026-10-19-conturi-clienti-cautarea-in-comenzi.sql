-- ═══════════════════════════════════════════════════════════════════════════
-- CONTUL CLIENTULUI: CAUTAREA IN „COMENZILE MELE”                (19.10.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de el: in contul clientului, o bara de cautare si de selectare, dupa
-- numarul comenzii, dupa stare si altele. Lista e paginata (20 pe pagina) si un
-- cont are pe productie 234 de comenzi, deci filtrul NU se poate face pe pagina
-- adusa: ar cauta numai in cele 20 de pe ecran. Se face aici, inaintea paginarii,
-- iar `count(*) over ()` numara ce a ramas dupa filtru.
--
-- Trei filtre noi, toate cu valoare implicita NULL (= fara filtru), deci un apel
-- vechi, cu patru argumente, intoarce exact ce intorcea:
--   p_cautare  numarul comenzii („1337” gaseste „#1337”) sau numele unui produs,
--              fara diacritice si fara majuscule, pe ambele parti. Pe CUVINTE:
--              fiecare cuvant trebuie sa se gaseasca in numar sau in numele unei
--              linii, deci „perna verde” gaseste „Perna decorativa ... (Verde
--              smarald)”, iar „1355 perna” comanda #1355 daca are o perna;
--   p_stare    starea din baza (`pending` ... `refunded`);
--   p_de_la    comenzile plasate de la clipa asta incoace.
--
-- ⚠ Corpul e cel din PRODUCTIE (md5 pe `prosrc` 077657b8e1876fe9c23c0228c60d4ac2,
-- identic cu schema de referinta), cu filtrele adaugate in WHERE. Pe demo corpul
-- era altul (459e2775...): demo primeste acum corpul productiei plus filtrele.
--
-- ⚠ DROP + CREATE, nu `create or replace`: lista de argumente se schimba, iar
-- `create or replace` ar fi lasat ALATURI functia veche, cu patru argumente.
-- Doua functii cu acelasi nume si un apel cu patru argumente numite inseamna
-- „could not choose the best candidate function” la PostgREST, adica pagina
-- „Comenzile mele” cazuta la toti. Nicio alta functie nu o cheama (verificat in
-- schema de referinta), deci DROP-ul nu rupe nimic.
--
-- ⚠ LIKE pe textul omului: `%`, `_` si `\` se scapa, altfel „50%” ar insemna
-- „orice dupa 50”, iar un singur `_` ar potrivi orice litera.
--
-- ⚠ Drepturile se refac: o functie NOUA primeste EXECUTE pentru `anon` si
-- `authenticated` din drepturile implicite Supabase. Verificarea sta la capat.

drop function if exists public.cont_comenzile_mele(uuid, uuid, integer, integer);
/* Si forma noua, ca fisierul sa se poata rula din nou (pe demo s-a rulat de doua ori). */
drop function if exists public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz);

create function public.cont_comenzile_mele(
  p_business uuid,
  p_cont uuid,
  p_limita integer default 20,
  p_decalaj integer default 0,
  p_cautare text default null,
  p_stare text default null,
  p_de_la timestamptz default null
) returns table (
  order_id uuid,
  numar text,
  creata_la timestamptz,
  stare text,
  incasata boolean,
  total numeric,
  bucati bigint,
  vedere text,
  total_randuri bigint,
  miniaturi jsonb,
  produse integer,
  are_factura boolean
)
language sql stable security definer set search_path = '' as $fn$
  with cautarea as (
    /* Cuvintele omului, curatate o data: fara diacritice si majuscule, fara „#” in
       fata, cu `%`, `_` si `\` scapate, cel mult opt. Lista goala = fara filtru. */
    select coalesce(array_agg('%' || replace(replace(replace(x.w, '\', '\\'), '%', '\%'), '_', '\_') || '%' order by x.n), '{}') as tipare
      from (
        select ltrim(w.w, '#') as w, w.n
          from regexp_split_to_table(lower(public.fara_diacritice(btrim(coalesce(p_cautare, '')))), '\s+')
               with ordinality as w(w, n)
      ) x
     where x.w <> '' and x.n <= 8
  )
  select
    o.id,
    o.order_number,
    o.created_at,
    o.status,
    public.comanda_incasata(o.status, o.payment_status, o.payment_method),
    o.total,
    m.bucati,
    l.vedere,
    count(*) over (),
    m.miniaturi,
    m.produse,
    case when l.vedere = 'intreaga' then privat.cont_documentul_comenzii(o) is not null else false end
  from privat.cont_comanda l
  join public.orders o
    on o.id = l.order_id
   and o.business_id = l.business_id
  cross join cautarea c
  cross join lateral (
    select
      coalesce(sum(
        case when x.li->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$' then (x.li->>'quantity')::numeric else 0 end
      ) filter (where not x.extra), 0)::bigint as bucati,
      (count(*) filter (where not x.extra))::integer as produse,
      coalesce((
        select jsonb_agg(jsonb_build_object('nume', y.li->>'name', 'imagine', y.imagine) order by y.ord)
          from (
            select z.li, z.ord,
                   (select case when jsonb_typeof(p.images->0) = 'string' then p.images->>0 end
                      from public.products p
                     where p.business_id = o.business_id
                       and p.id = case
                                    when coalesce(z.li->>'product_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                      then (z.li->>'product_id')::uuid
                                  end) as imagine
              from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) with ordinality as z(li, ord)
             where not (coalesce(z.li->>'product_id', '') like 'extra\_%')
             order by z.ord
             limit 4
          ) y
      ), '[]'::jsonb) as miniaturi
    from (
      select t.li, coalesce(t.li->>'product_id', '') like 'extra\_%' as extra
        from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as t(li)
    ) x
  ) m
  where l.business_id = p_business
    and l.cont_id = p_cont
    and (p_stare is null or o.status = p_stare)
    and (p_de_la is null or o.created_at >= p_de_la)
    /* Niciun cuvant care sa nu se gaseasca: fiecare, in numarul comenzii SAU in numele
       unei linii (si al unei extraoptiuni: „cadou” gaseste comanda cu ambalaj cadou,
       ceea ce omul chiar cauta). Fara cuvinte, `not exists` pe lista goala trece tot. */
    and not exists (
      select 1
        from unnest(c.tipare) as t(tipar)
       where not (
         lower(public.fara_diacritice(coalesce(o.order_number, ''))) like t.tipar
         or exists (
           select 1
             from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as s(li)
            where lower(public.fara_diacritice(coalesce(s.li->>'name', ''))) like t.tipar
         )
       )
    )
  /* ⚠ Departajator pe `id`: fara el, doua comenzi din aceeasi secunda pot aparea
     pe doua pagini deodata si alta poate lipsi. */
  order by o.created_at desc, o.id desc
  limit greatest(1, least(100, coalesce(p_limita, 20)))
  offset greatest(0, coalesce(p_decalaj, 0));
$fn$;

revoke all on function public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz) to service_role;

do $$
declare f constant text := 'public.cont_comenzile_mele(uuid, uuid, integer, integer, text, text, timestamptz)';
begin
  if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
    raise exception 'anon sau authenticated poate chema %', f;
  end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'service_role NU poate chema %', f;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cont_comenzile_mele'
       and pg_get_function_identity_arguments(p.oid) <> 'p_business uuid, p_cont uuid, p_limita integer, p_decalaj integer, p_cautare text, p_stare text, p_de_la timestamp with time zone'
  ) then
    raise exception 'a ramas o a doua forma a lui cont_comenzile_mele';
  end if;
end $$;

notify pgrst, 'reload schema';
