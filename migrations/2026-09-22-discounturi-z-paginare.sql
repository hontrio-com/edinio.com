-- ═══════════════════════════════════════════════════════════════════════════
-- LISTA DE CODURI SE PAGINEAZA IN BAZA                           (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ DE CE ACUM, CAND CEL MAI INCARCAT MAGAZIN ARE CINCI CODURI.
--
-- Pana azi pagina aducea TOATE codurile magazinului intr-o singura citire, fara
-- `limit` si fara `range`, iar cautarea, filtrele si sortarea lucrau in memoria
-- browserului. Masurat pe productie la 21.09.2026: 14 coduri in 6 magazine, cel
-- mai incarcat are 5, media 2,3. Pe demo, 16.
--
-- Marginea de sus nu era insa numarul acela, ci plafonul PostgREST: o mie de
-- randuri. Un magazin cu peste o mie de coduri — o campanie cu coduri unice, de
-- pilda — ar fi vazut lista TAIATA IN TACERE, fara nicio eroare, iar cifrele din
-- cap ar fi fost socotite pe ce s-a nimerit sa incapa. Cerut de el: sa se
-- rezolve de pe acum, nu cand se va vedea.
--
-- ⚠⚠ SI ASTA ADUCE REGULA DE STARE IN DOUA COPII: una in SQL (aici) si una in
-- TypeScript (`src/lib/discounts/stare.ts`), fiindca filtrul trebuie sa aleaga
-- randurile in baza, iar eticheta trebuie desenata pe ecran. Exact lucrul pe
-- care sectiunea il ocolise pana acum, dinadins.
--
-- Doua copii se despart. De-aia sunt lipite de o proba care compara literal
-- ordinea si conditiile din corpul functiei de mai jos cu cele din `stare.ts`:
-- `src/lib/discounts/starea-e-aceeasi-si-in-baza.test.ts`. Fara ea, filtrul
-- „Expirate" ar fi aratat alte coduri decat cele scrise „Expirat" in tabel, si
-- nimic n-ar fi dat vreo eroare.

-- ── 1. Starea unui cod, scrisa in baza ────────────────────────────────────
--
-- ⚠⚠ ORDINEA E CEA A LUCRULUI DE FACUT, si e aceeasi cu cea din `stare.ts`:
--   1. oprit     comutatorul e pe nu — singura stare pusa de om
--   2. expirat   a trecut data
--   3. epuizat   s-a atins `max_uses`
--   4. programat nu e nimic de reparat: porneste singur
--   5. activ     nimic nu-l tine
-- Un cod poate fi deodata oprit, expirat SI epuizat; pe rand incape o singura
-- eticheta, si trebuie sa fie cea care spune ce ai de facut INTAI.

create or replace function public.discount_state(
  p_is_active boolean,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_max_uses integer,
  p_uses_count integer
)
returns text
language sql
stable
parallel safe
set search_path to ''
as $function$
  select case
    when not p_is_active then 'oprit'
    when p_expires_at is not null and p_expires_at < now() then 'expirat'
    when p_max_uses is not null and p_uses_count >= p_max_uses then 'epuizat'
    when p_starts_at is not null and p_starts_at > now() then 'programat'
    else 'activ'
  end
$function$;

revoke all on function public.discount_state(boolean, timestamptz, timestamptz, integer, integer) from public;
grant execute on function public.discount_state(boolean, timestamptz, timestamptz, integer, integer) to authenticated, service_role;

-- ── 2. O pagina de coduri ─────────────────────────────────────────────────
--
-- ⚠ `security invoker`: granita e RLS-ul de pe `discounts`, ca peste tot in
-- panou. `definer` ar fi dat oricui codurile oricarui magazin.
--
-- ⚠ `count(*) over ()` da numarul TOTAL al multimii filtrate, in acelasi drum.
-- Cerut separat, ar fi fost a doua interogare si a doua sansa sa nu se
-- potriveasca cu pagina.

create or replace function public.discounts_page(
  bid uuid,
  search text default null,
  p_stare text default 'toate',
  sort_key text default 'noi',
  page_limit integer default 25,
  page_offset integer default 0
)
returns table (
  id uuid, code text, type text, value numeric,
  min_order_amount numeric, max_uses integer, uses_count integer,
  is_active boolean, starts_at timestamptz, expires_at timestamptz,
  per_customer_limit integer, doar_prima_comanda boolean, restrangere jsonb,
  created_at timestamptz, updated_at timestamptz,
  stare text,
  comenzi_total bigint, comenzi_valide bigint, comenzi_cazute bigint,
  bani_dati numeric, vanzari numeric, comenzi_cu_transport_oferit bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cautat as (
    /*
      ⚠ `%` si `_` din ce tasteaza omul se ESCAPEAZA. Sunt metacaractere in
      `like`: fara asta, cine scrie `%` primea toate codurile, iar cautarea ar
      fi mintit tocmai cand pare ca merge. (La `validateDiscount` acelasi lucru
      era o gaura de bani — acolo `ilike` scotea cupoane adevarate.)
    */
    select replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') as q
  ),
  randuri as (
    select
      d.*,
      public.discount_state(d.is_active, d.starts_at, d.expires_at, d.max_uses, d.uses_count) as stare,
      coalesce(s.comenzi_total, 0) as st_total,
      coalesce(s.comenzi_valide, 0) as st_valide,
      coalesce(s.comenzi_cazute, 0) as st_cazute,
      coalesce(s.bani_dati, 0) as st_bani,
      coalesce(s.vanzari, 0) as st_vanzari,
      coalesce(s.comenzi_cu_transport_oferit, 0) as st_transport
    from public.discounts d
    left join public.discount_stats(bid) s on s.discount_id = d.id
    cross join cautat c
    where d.business_id = bid
      and (c.q = '' or d.code ilike '%' || c.q || '%' escape '\')
  ),
  filtrate as (
    select r.* from randuri r
    where coalesce(p_stare, 'toate') = 'toate' or r.stare = p_stare
  )
  select
    f.id, f.code, f.type, f.value,
    f.min_order_amount, f.max_uses, f.uses_count,
    f.is_active, f.starts_at, f.expires_at,
    f.per_customer_limit, f.doar_prima_comanda, f.restrangere,
    f.created_at, f.updated_at,
    f.stare,
    f.st_total, f.st_valide, f.st_cazute, f.st_bani, f.st_vanzari, f.st_transport,
    count(*) over () as total_count
  from filtrate f
  order by
    /*
      ⚠ „Alfabetic" cu asezarea ROMANEASCA A CASEI, `public.ro_numeric` — aceeasi
      pe care o folosesc de mult catalogul de produse si categoriile. Pe cea
      implicita, Ș si Ț ajung dupa Z; codurile n-au azi diacritice, dar nimic nu
      opreste un comerciant sa scrie „REDUCEREȘ".

      ⚠⚠ SI E O ASEZARE CU NUMERE (`kn-true`), deci „VARA2" vine inaintea lui
      „VARA10" — nu dupa, cum ar fi iesit din comparatia pe litere. E ALTCEVA
      decat facea `localeCompare(…, "ro")` de pe ecran pana azi, si e mai bine:
      codurile de campanie se numeroteaza. Sortarea din TypeScript se scoate
      odata cu asta, ca sa nu ramana doua raspunsuri la aceeasi intrebare.
    */
    case when sort_key = 'alfabetic' then f.code collate public.ro_numeric end asc nulls last,
    case when sort_key = 'folosite' then f.st_valide end desc nulls last,
    case when sort_key = 'costisitoare' then f.st_bani end desc nulls last,
    f.created_at desc
  limit greatest(1, least(coalesce(page_limit, 25), 100))
  offset greatest(0, coalesce(page_offset, 0))
$function$;

revoke all on function public.discounts_page(uuid, text, text, text, integer, integer) from public;
revoke all on function public.discounts_page(uuid, text, text, text, integer, integer) from anon;
grant execute on function public.discounts_page(uuid, text, text, text, integer, integer) to authenticated;

-- ── 3. Cate coduri are fiecare stare ──────────────────────────────────────
--
-- ⚠⚠ SE NUMARA PESTE CAUTARE, nu peste tot. Altfel omul cauta „VARA", vede
-- „Expirate (3)" si apasa, iar lista iese goala fiindca cele trei expirate erau
-- alte coduri. Cifra de langa un filtru trebuie sa spuna cate randuri VA ARATA
-- apasarea lui. Aceeasi regula ca in `catePeStare`, mutata in baza odata cu
-- filtrul — lasata pe ecran, ar fi numarat doar pagina adusa.

create or replace function public.discount_state_counts(bid uuid, search text default null)
returns table (stare text, cate bigint)
language sql
stable
security invoker
set search_path to ''
as $function$
  with cautat as (
    select replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') as q
  )
  select
    public.discount_state(d.is_active, d.starts_at, d.expires_at, d.max_uses, d.uses_count) as stare,
    count(*) as cate
  from public.discounts d
  cross join cautat c
  where d.business_id = bid
    and (c.q = '' or d.code ilike '%' || c.q || '%' escape '\')
  group by 1
$function$;

revoke all on function public.discount_state_counts(uuid, text) from public;
revoke all on function public.discount_state_counts(uuid, text) from anon;
grant execute on function public.discount_state_counts(uuid, text) to authenticated;

-- ── 4. Cifrele din cap, socotite pe TOT magazinul ─────────────────────────
--
-- ⚠⚠ NU PE PAGINA ADUSA. Pana azi cele patru carduri se adunau in TypeScript din
-- lista incarcata — ceea ce mergea doar cat timp lista era intreaga. Cu paginare,
-- ele ar fi aratat „comenzi aduse" de pe primele douazeci si cinci de coduri, si
-- ar fi scazut cu fiecare pagina. Un raport care scade cand rasfoiesti e mai rau
-- decat niciun raport.

create or replace function public.discount_totaluri(bid uuid)
returns table (
  coduri bigint,
  coduri_folosibile bigint,
  comenzi bigint,
  bani_dati numeric,
  vanzari numeric
)
language sql
stable
security invoker
set search_path to ''
as $function$
  select
    count(*),
    count(*) filter (
      where public.discount_state(d.is_active, d.starts_at, d.expires_at, d.max_uses, d.uses_count) = 'activ'),
    coalesce(sum(coalesce(s.comenzi_valide, 0)), 0),
    round(coalesce(sum(coalesce(s.bani_dati, 0)), 0), 2),
    round(coalesce(sum(coalesce(s.vanzari, 0)), 0), 2)
  from public.discounts d
  left join public.discount_stats(bid) s on s.discount_id = d.id
  where d.business_id = bid
$function$;

revoke all on function public.discount_totaluri(uuid) from public;
revoke all on function public.discount_totaluri(uuid) from anon;
grant execute on function public.discount_totaluri(uuid) to authenticated;

-- ── 5. Ca lista sa nu coste o parcurgere ──────────────────────────────────
--
-- ⚠ Sortarea implicita e „cele mai noi", si e si singura care nu depinde de
-- cifre. Cu mii de coduri pe un magazin, fara index Postgres ar fi sortat toata
-- tabela la fiecare deschidere a paginii.

create index if not exists idx_discounts_business_created
  on public.discounts (business_id, created_at desc);

notify pgrst, 'reload schema';
