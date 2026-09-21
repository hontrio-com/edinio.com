-- ═══════════════════════════════════════════════════════════════════════════
-- DE CATE ORI POATE FOLOSI UN OM ACELASI COD                     (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Etapa F a redesignului sectiunii Discounturi.
--
-- ⚠⚠ CE NU SE POATE FACE, SI DE CE. Forma care se scrie prima data e o
-- numaratoare peste `orders`, pusa in WHERE-ul revendicarii:
--
--     and (per_customer_limit is null or (select count(*) from orders o
--          where o.discount_id = ... and order_customer_key(...) = ...) < per_customer_limit)
--
-- Arata atomic si NU E, din doua motive independente:
--
--   1. La clipa revendicarii, comanda INCA NU EXISTA. `claim_discount_use` se
--      cheama la `order.actions.ts:1887`, iar randul din `orders` se scrie abia
--      la `:1914`, dupa revendicarea stocului. Doua cereri trimise deodata de
--      acelasi om numara AMANDOUA zero.
--   2. Chiar daca ar exista: zavorul e randul din `discounts`. Sub READ
--      COMMITTED, a doua tranzactie asteapta lacatul si RECITESTE randul incuiat
--      — dar subinterogarea peste `orders` se citeste mai departe pe instantaneul
--      de la inceputul instructiunii. Adevarul nu sta in randul zavorat.
--
-- ⚠⚠ DE-AIA UTILIZAREA NU SE NUMARA, SE REZERVA. Un rand intr-un registru al ei,
-- cu index UNIC pe (cod, om, a cata oara). Indexul unic e singurul lucru care
-- serializeaza doua tranzactii care nu ating acelasi rand deja existent: a doua
-- se ciocneste de el, reia, si atunci chiar vede randul vecinei.

-- ── 1. Cheia omului, dintr-un singur loc ──────────────────────────────────
--
-- ⚠⚠ MAI INTAI, O REPARATIE: `normalize_phone` NU ERA IDEMPOTENTA. Taia UN
-- SINGUR zero din fata, deci:
--     0722334455   -> 722334455
--     00722334455  -> 0722334455   (alt om)
--     000722334455 -> 00722334455  (al treilea om)
-- Acelasi telefon adevarat, la nesfarsit alti oameni — si comanda ajunge tot la
-- el, fiindca numarul e bun. Fara reparatia asta, „o data per client" se trece
-- adaugand un zero.
--
-- ⚠ MASURAT PE PRODUCTIE INAINTE (21.09.2026): din 541 de comenzi se schimba
-- DOUA chei — una e un numar german scris `0049…`, cealalta e telefonul-fantoma
-- `0000000000` pus de eMAG la o comanda fara telefon (acela iese din chei cu
-- totul, si asa si trebuie: nu e un om). Din cele 1.592 de randuri din
-- `customers`, se schimba ZERO.

create or replace function public.normalize_phone(raw text)
returns text
language sql
immutable parallel safe
as $function$
  -- ⚠ `^0+`, nu un singur zero: altfel functia nu e idempotenta si fiecare zero
  -- in plus scoate alt om din acelasi telefon.
  select regexp_replace(s2, '^0+', '')
  from (
    select case
      when s like '0040%' then substr(s, 5)
      when s like '40%' and length(s) > 9 then substr(s, 3)
      else s
    end as s2
    from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as s) t1
  ) t2
$function$;

-- ⚠ Indexul e scris PE functie, deci valorile din el sunt cele vechi.
-- Nereconstruit, o cautare dupa telefon ar fi sarit chiar randurile indreptate.
reindex index public.idx_orders_business_normphone;

-- ⚠⚠ SI `customers.key` E O COLOANA GENERATA **STORED**, cu aceeasi formula
-- scrisa in ea. Postgres NU recalculeaza coloanele stocate cand se schimba o
-- functie: randurile vechi ar fi ramas pe raspunsul vechi, iar cele noi ar fi
-- primit raspunsul nou — doua adevaruri in aceeasi coloana, fara nicio eroare.
--
-- ⚠ NU SE POT ATINGE TOATE RANDURILE ca sa se recalculeze: pe `customers` sta
-- declansatorul `customers_touch`, deci un `update` peste tot ar rescrie data
-- ultimei modificari la toti clientii magazinelor — o schimbare vizibila in
-- panou, facuta dintr-o migratie care spune ca repara o normalizare.
--
-- ⚠⚠ DE-AIA MIGRATIA ISI DOVEDESTE SINGURA PREMISA, pe baza pe care chiar
-- ruleaza: daca vreun rand ar capata alta cheie, se opreste. Masurat inainte pe
-- productie si pe demo — zero randuri din 1.592, respectiv din 67 — dar o
-- masuratoare de ieri nu e o garantie de azi.
do $$
declare
  v_cate integer;
begin
  select count(*) into v_cate
  from public.customers c
  where c.key is not null and c.key <> regexp_replace(c.key, '^0+', '');

  if v_cate > 0 then
    raise exception
      'OPRIT: % randuri din public.customers ar capata alta cheie, iar `key` e o coloana GENERATA STORED care NU se recalculeaza singura. Recalculeaza-le anume inainte sa rulezi migratia asta.', v_cate;
  end if;
end $$;

/**
 * Cine e „acelasi om", cand inca nu exista nicio comanda.
 *
 * ⚠⚠ ARE DOUA ARGUMENTE, NU TREI, SI ASTA E TOT ROSTUL EI. `order_customer_key`
 * cade pe `'order:' || order_id` cand lipsesc si telefonul, si emailul — adica
 * da un om NOU la fiecare comanda. La revendicare nici nu exista `order_id`, iar
 * o limita per client cheiata pe asa ceva n-ar margini niciodata pe nimeni.
 *
 * Aici, cazul acela intoarce `null`, si cel care o cheama hotaraste ce face cu
 * el. Vezi `claim_discount_use`: refuza codul.
 */
create or replace function public.discount_customer_key(customer_phone text, customer_email text)
returns text
language sql
immutable parallel safe
as $function$
  select coalesce(
    nullif(public.normalize_phone(customer_phone), ''),
    case when nullif(lower(trim(coalesce(customer_email, ''))), '') is not null
         then 'email:' || lower(trim(customer_email)) end
  )
$function$;

-- ⚠ Si cea veche se sprijina de azi pe ea, ca sa NU fie doua raspunsuri la
-- „cine e omul asta". Corpul de dinainte era aceeasi formula, scrisa a doua oara.
create or replace function public.order_customer_key(customer_phone text, customer_email text, order_id uuid)
returns text
language sql
immutable parallel safe
as $function$
  select coalesce(
    public.discount_customer_key(customer_phone, customer_email),
    'order:' || order_id::text
  )
$function$;

-- ── 2. Cat are voie fiecare om ────────────────────────────────────────────

alter table public.discounts
  add column if not exists per_customer_limit integer;

alter table public.discounts
  drop constraint if exists discounts_per_customer_limit_pozitiv;
alter table public.discounts
  add constraint discounts_per_customer_limit_pozitiv
  check (per_customer_limit is null or per_customer_limit >= 1);

comment on column public.discounts.per_customer_limit is
  'De cate ori poate folosi ACELASI om codul. Null = fara limita. „Acelasi om" = discount_customer_key: telefon normalizat, altfel email:<adresa>.';

-- ── 3. Registrul utilizarilor ─────────────────────────────────────────────

create table if not exists public.discount_customer_uses (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  /*
    ⚠ POATE FI NULL, si asta are un inteles anume: „nu se stie cine" — o comanda
    fara telefon si fara email, pe un cod FARA limita per client. Randul se scrie
    oricum, ca registrul sa fie jurnalul intreg al folosirilor, nu doar al celor
    marginite. Un `null` nu se ciocneste de indexul unic, deci nu margineste
    nimic — exact ce trebuie, fiindca acolo nu exista niciun „acelasi om".
  */
  customer_key text,
  /*
    ⚠ A CATA FOLOSIRE A OMULUI ASTA. Nu e infrumusetare: el poarta indexul unic,
    si indexul unic e singurul lucru care serializeaza doua rezervari simultane
    ale aceluiasi om. Fara el, o limita de 3 ar fi lasat sa treaca oricate, daca
    veneau in aceeasi clipa.
  */
  ordinal integer not null,
  created_at timestamp with time zone not null default now(),
  unique (discount_id, customer_key, ordinal)
);

create index if not exists idx_discount_customer_uses_cod_om
  on public.discount_customer_uses (discount_id, customer_key);

comment on table public.discount_customer_uses is
  'Cate folosiri a rezervat fiecare om din fiecare cod. Un rand = o folosire VIE: se sterge cand utilizarea se da inapoi (anulare, plata nereusita, comanda stearsa).';

-- ⚠⚠ Supabase da ALL pe orice tabela noua catre anon si authenticated. RLS e a
-- doua broasca, nu prima — si TRUNCATE nu e filtrat de RLS deloc.
alter table public.discount_customer_uses enable row level security;
revoke all on table public.discount_customer_uses from anon, authenticated;
grant select on table public.discount_customer_uses to authenticated;

drop policy if exists discount_customer_uses_ale_magazinului on public.discount_customer_uses;
create policy discount_customer_uses_ale_magazinului
  on public.discount_customer_uses for select to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = discount_customer_uses.business_id and b.user_id = (select auth.uid())
  ));

-- ── 4. Legatura dinspre comanda ───────────────────────────────────────────
--
-- ⚠ RANDUL DE REGISTRU SE TINE MINTE PE COMANDA, nu invers. Asa, eliberarea si
-- reluarea — care pornesc amandoua de la `order_id` — gasesc randul dintr-o
-- singura citire, iar scrierea se face in CHIAR insertul comenzii: nu exista o a
-- doua scriere care sa pice si sa lase utilizarea omului agatata in aer.
--
-- ⚠ `on delete set null`, nu `cascade`: stergerea unui rand de registru inseamna
-- „utilizarea s-a dat inapoi", si n-are voie sa stearga comanda.

alter table public.orders
  add column if not exists discount_use_id uuid;

alter table public.orders
  drop constraint if exists orders_discount_use_id_fkey;
alter table public.orders
  add constraint orders_discount_use_id_fkey
  foreign key (discount_use_id) references public.discount_customer_uses(id) on delete set null;

comment on column public.orders.discount_use_id is
  'Randul din discount_customer_uses pe care il tine comanda asta. Null la comenzile fara cupon si la cele de dinainte de 21.09.2026.';

-- ── 5. Rezervarea, scrisa O SINGURA DATA ──────────────────────────────────
--
-- ⚠⚠ SCOASA DEOPARTE FIINDCA O CER DOUA DRUMURI CU PORTI DEOSEBITE:
--
--   * `claim_discount_use` — checkout. Cere si calendarul, si comutatorul, si
--     plafonul campaniei.
--   * `reclaim_order_discount` — o comanda anulata, readusa la viata din panou.
--     Cere plafonul si limita pe om, dar NU calendarul: comanda exista deja si a
--     fost platita, iar o campanie incheiata intre timp n-are de ce sa opreasca
--     desfacerea unei anulari. Scrisa a doua oara in reclaim, regula s-ar fi
--     despartit de prima — chiar asa era pana azi, si de-aia reclaim trecea
--     peste orice, numarand doar `max_uses`.

create or replace function public.reserve_discount_for_customer(
  p_discount_id uuid,
  p_customer_key text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  for i in 1..5 loop
    begin
      /*
        ⚠⚠ PAZA LIMITEI STA IN CHIAR INSERTUL CARE REZERVA. Scoasa intr-un
        `select` de dinainte, doua comenzi simultane ale aceluiasi om ar numara
        amandoua acelasi lucru si ar trece amandoua.
      */
      insert into public.discount_customer_uses (discount_id, business_id, customer_key, ordinal)
      select p_discount_id, d.business_id, p_customer_key,
             1 + coalesce((
               select max(u.ordinal) from public.discount_customer_uses u
               where u.discount_id = p_discount_id
                 and u.customer_key is not distinct from p_customer_key
             ), 0)
      from public.discounts d
      where d.id = p_discount_id
        and (
          d.per_customer_limit is null
          or p_customer_key is null
          or (
            select count(*) from public.discount_customer_uses u
            where u.discount_id = p_discount_id and u.customer_key = p_customer_key
          ) < d.per_customer_limit
        )
      returning id into v_id;

      return v_id;

    exception
      when unique_violation then
        /*
          ⚠ ALTCINEVA A LUAT ORDINALUL in chiar clipa asta — adica exact cursa de
          care ne aparam. Subtranzactia blocului s-a intors; se reia, si acum
          numaratoarea il vede si pe randul vecinei.
        */
        v_id := null;
        continue;
    end;
  end loop;

  -- Cinci incercari si tot nu s-a asezat: se refuza, nu se forteaza.
  return null;
end;
$function$;

revoke all on function public.reserve_discount_for_customer(uuid, text) from public;
revoke all on function public.reserve_discount_for_customer(uuid, text) from anon, authenticated;
grant execute on function public.reserve_discount_for_customer(uuid, text) to service_role;

-- ── 6. Revendicarea de la checkout ────────────────────────────────────────
--
-- ⚠⚠ SEMNATURA SE SCHIMBA, deci forma veche NU dispare singura: ar fi ramas in
-- baza ca supraincarcare care ocoleste toata regula noua. Se sterge pe fata.
-- ⚠ Si granturile NU se mostenesc de noua semnatura: se scriu din nou mai jos.

drop function if exists public.claim_discount_use(uuid);

create or replace function public.claim_discount_use(
  p_discount_id uuid,
  p_customer_phone text,
  p_customer_email text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
  v_lim integer;
  v_id  uuid;
begin
  select per_customer_limit into v_lim
  from public.discounts where id = p_discount_id;

  v_key := public.discount_customer_key(p_customer_phone, p_customer_email);

  /*
    ⚠⚠ FARA TELEFON SI FARA EMAIL, UN COD CU LIMITA PER CLIENT SE REFUZA.
    Nu e o subtilitate: acolo nu exista niciun fel de „acelasi om", deci limita
    n-ar margini nimic si codul s-ar lua de oricate ori dintr-un singur browser.
    Masurat pe productie: ZERO comenzi din 541 n-au nici telefon, nici email,
    deci refuzul nu atinge pe nimeni azi.
  */
  if v_lim is not null and v_key is null then
    return null;
  end if;

  begin
    v_id := public.reserve_discount_for_customer(p_discount_id, v_key);
    -- Omul si-a folosit dreptul. Nimic scris, nimic de dat inapoi.
    if v_id is null then return null; end if;

    /*
      ⚠⚠ PORTILE CAMPANIEI SI CONTORUL GLOBAL, intr-o singura instructiune.
      ⚠ Si vin DUPA rezervarea pe om, dinadins: daca ele refuza, blocul asta
      intoarce tot ce s-a scris — inclusiv randul de registru. Scrise invers, un
      refuz al campaniei ar fi lasat omul cu o folosire arsa degeaba.
    */
    update public.discounts
    set uses_count = uses_count + 1, updated_at = now()
    where id = p_discount_id
      and (max_uses is null or uses_count < max_uses)
      and is_active
      and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at >= now());

    if not found then
      -- ⚠ Aruncat ca sa se intoarca SUBTRANZACTIA blocului, nu ca sa iasa afara.
      raise exception 'campania refuza' using errcode = 'P0001';
    end if;

    return v_id;

  exception
    when sqlstate 'P0001' then
      -- Subtranzactia s-a intors, deci si rezervarea. Nimic de compensat.
      return null;
  end;
end;
$function$;

revoke all on function public.claim_discount_use(uuid, text, text) from public;
revoke all on function public.claim_discount_use(uuid, text, text) from anon, authenticated;
grant execute on function public.claim_discount_use(uuid, text, text) to service_role;

-- ── 7. Cele trei drumuri pe care utilizarea se da inapoi ──────────────────
--
-- ⚠⚠ TOATE TREI trebuie sa atinga SI registrul. Lasate sa miste doar contorul
-- global, un om caruia i-a picat plata cu cardul si-ar fi ars definitiv singura
-- folosire — si ar fi primit pe veci acelasi mesaj unic, care nu are voie sa-i
-- spuna de ce. Nicio urma nicaieri, nici pentru el, nici pentru comerciant.

/**
 * Eliberarea DE DINAINTE de comanda: insertul a picat, stocul a refuzat.
 *
 * ⚠⚠ PRIMESTE MARCA, NU ID-UL CUPONULUI. `release_discount_use(p_discount_id)`,
 * cea de pana azi, nu avea de unde sti CINE revendicase, deci randul omului ar
 * fi ramas pe loc pentru totdeauna. Marca e si legatura catre cupon, deci nu mai
 * exista nici sansa ca cele doua argumente sa nu se potriveasca intre ele.
 *
 * ⚠ E idempotenta: chemata de doua ori, a doua oara nu sterge si nu scade nimic.
 */
create or replace function public.release_discount_claim(p_use_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_discount_id uuid;
begin
  if p_use_id is null then return false; end if;

  delete from public.discount_customer_uses
  where id = p_use_id
  returning discount_id into v_discount_id;

  if v_discount_id is null then return false; end if;

  update public.discounts
  set uses_count = greatest(uses_count - 1, 0), updated_at = now()
  where id = v_discount_id;

  return true;
end;
$function$;

revoke all on function public.release_discount_claim(uuid) from public;
revoke all on function public.release_discount_claim(uuid) from anon, authenticated;
grant execute on function public.release_discount_claim(uuid) to service_role;

/** Eliberarea unei comenzi care EXISTA: anulata, rambursata, plata neterminata. */
create or replace function public.release_order_discount(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_discount_id uuid;
  v_use_id      uuid;
begin
  update public.orders
  set discount_released_at = now()
  where id = p_order_id
    and discount_id is not null
    and discount_released_at is null
  returning discount_id, discount_use_id into v_discount_id, v_use_id;

  if v_discount_id is null then
    return false;
  end if;

  /*
    ⚠⚠ SI DREPTUL OMULUI SE DA INAPOI, nu doar cel al campaniei.
    Hotarare luata pe fata, fiindca cele doua raspunsuri sunt opuse ca risc:
    dat inapoi, cineva poate recicla codul abandonand plata la nesfarsit (24 de
    ore pe ciclu, si comerciantul vede comenzile); NEdat inapoi, un cumparator
    cinstit caruia i-a picat cardul ramane blocat pe veci, cu un mesaj care nu-i
    poate explica nimic. A doua e mai rea, si e si nepotrivita cu regula de
    alaturi: campania isi ia utilizarea inapoi. O singura regula pentru amandoua.

    ⚠ Randul de registru poarta si scaderea contorului global, deci pe drumul cu
    marca NU se mai scade a doua oara aici.
  */
  if v_use_id is not null then
    perform public.release_discount_claim(v_use_id);
    update public.orders set discount_use_id = null where id = p_order_id;
  else
    -- Comanda e de dinainte de registru (sau n-a avut cheie de om).
    update public.discounts
    set uses_count = greatest(uses_count - 1, 0), updated_at = now()
    where id = v_discount_id;
  end if;

  return true;
end;
$function$;

/** Comanda eliberata se intoarce la viata (anulare desfacuta). */
create or replace function public.reclaim_order_discount(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_discount_id uuid;
  v_phone       text;
  v_email       text;
  v_key         text;
  v_lim         integer;
  v_use_id      uuid;
begin
  select o.discount_id, o.customer_phone, o.customer_email
    into v_discount_id, v_phone, v_email
  from public.orders o
  where o.id = p_order_id
    and o.discount_id is not null
    and o.discount_released_at is not null
  for update;

  if v_discount_id is null then
    return 'nimic';
  end if;

  select per_customer_limit into v_lim from public.discounts where id = v_discount_id;
  v_key := public.discount_customer_key(v_phone, v_email);

  begin
    /*
      ⚠⚠ ACEEASI REZERVARE CA LA CHECKOUT, nu o copie a regulii. Pana azi aici
      era scrisa a doua oara numai verificarea de plafon: o comanda anulata si
      readusa trecea peste ORICE limita per client, si nimic n-o semnala.

      ⚠ DAR FARA PORTILE DE CALENDAR, si asta e dinadins: comanda exista deja si
      a fost platita. O campanie incheiata intre timp n-are de ce sa opreasca
      desfacerea unei anulari facute din greseala.
    */
    if v_lim is not null and v_key is null then
      return 'plin';
    end if;

    v_use_id := public.reserve_discount_for_customer(v_discount_id, v_key);
    if v_use_id is null then
      -- Omul si-a folosit intre timp dreptul pe codul asta.
      return 'plin';
    end if;

    -- Plafonul campaniei, ca pana acum.
    update public.discounts
    set uses_count = uses_count + 1, updated_at = now()
    where id = v_discount_id
      and (max_uses is null or uses_count < max_uses);

    if not found then
      raise exception 'campania e plina' using errcode = 'P0001';
    end if;

    update public.orders
    set discount_released_at = null,
        discount_use_id = v_use_id
    where id = p_order_id;

    return 'reluat';

  exception
    when sqlstate 'P0001' then
      -- Subtranzactia s-a intors, deci si rezervarea.
      return 'plin';
  end;
end;
$function$;

-- ⚠ Cea veche, cu un singur argument, ramane STEARSA: nimic nu mai are voie sa
-- scada contorul fara sa stie cine l-a crescut.
drop function if exists public.release_discount_use(uuid);

notify pgrst, 'reload schema';
