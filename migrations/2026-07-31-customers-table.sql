-- Clienti care NU vin din comenzi: importati sau adaugati de mana.
--
-- De ce e nevoie de tabel. Pana acum, „Clienti" era in intregime calculat din
-- `orders`: numele, telefonul, orasul, cate comenzi, cat a cheltuit. Nu exista
-- niciun loc in care sa incapa un client care n-a cumparat inca. Cine migreaza de
-- pe alta platforma are insa o baza de clienti pe care vrea sa o aduca cu el.
--
-- ALTERNATIVA RESPINSA: sa fabricam comenzi pentru clientii importati. Ar fi mers
-- fara nicio migratie, dar ar fi umflat venitul, media pe comanda si lista de
-- comenzi cu ceva ce nu s-a intamplat. Datele contabile nu se murdaresc ca sa ne
-- fie noua mai comod.
--
-- Ce se schimba in afara tabelului: `customers_aggregate` si `customers_summary`
-- unesc acum cele doua surse. Pe o baza fara clienti importati, ambele intorc
-- EXACT ce intorceau inainte.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),

  business_id uuid not null references public.businesses(id) on delete cascade,

  name text not null default '',
  email text,
  phone text,

  address text,
  city text,
  county text,
  postcode text,

  -- De unde a venit: 'import' sau 'manual'. Text liber, ca `orders.source`.
  source text not null default 'import',
  -- Id-ul din platforma de provenienta (ex. „Customer id" din OpenCart), pastrat
  -- ca sa se poata urmari inapoi un client anume dupa un import.
  external_id text,

  -- Cheia de identitate, ACEEASI regula ca `public.order_customer_key`: telefonul
  -- normalizat, iar daca lipseste, emailul. Asa un client importat se lipeste de
  -- fisa lui din comenzi in clipa in care cumpara.
  --
  -- Calculata de baza, nu de aplicatie, ca sa nu poata fi scrisa greșit de la vreo
  -- cale de cod uitata. DACA MODIFICI `normalize_phone`, valorile deja scrise aici
  -- NU se recalculeaza singure: trebuie un UPDATE care sa le atinga.
  --
  -- `not null` e regula, nu intamplare: un client fara telefon si fara email nu se
  -- poate lega niciodata de o comanda, deci ar fi un rand mort. Importatorul il
  -- respinge inainte, cu motiv scris; asta e doar plasa de siguranta.
  key text generated always as (
    coalesce(
      nullif(public.normalize_phone(phone), ''),
      case
        when nullif(lower(trim(coalesce(email, ''))), '') is not null
        then 'email:' || lower(trim(email))
      end
    )
  ) stored not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Acelasi client nu intra de doua ori, nici la reimportarea aceluiasi fisier.
  constraint customers_business_key_unique unique (business_id, key)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Doar proprietarul magazinului. FARA politica publica de SELECT: aici stau nume,
-- telefoane, emailuri si adrese de oameni.
alter table public.customers enable row level security;

drop policy if exists "customers_select_own" on public.customers;
create policy "customers_select_own"
  on public.customers for select
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

drop policy if exists "customers_insert_own" on public.customers;
create policy "customers_insert_own"
  on public.customers for insert
  with check (business_id in (select id from public.businesses where user_id = auth.uid()));

drop policy if exists "customers_update_own" on public.customers;
create policy "customers_update_own"
  on public.customers for update
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

drop policy if exists "customers_delete_own" on public.customers;
create policy "customers_delete_own"
  on public.customers for delete
  using (business_id in (select id from public.businesses where user_id = auth.uid()));

create or replace function public.touch_customers()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch
  before update on public.customers
  for each row execute function public.touch_customers();


-- ═══════════════════════════════════════════════════════════════════════════
-- Unirea celor doua surse.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.customers_aggregate(
  bid uuid,
  search text default null::text,
  sort_key text default 'recent'::text,
  page_limit integer default 50,
  page_offset integer default 0
)
returns table(
  key text, name text, phone text, email text, city text, county text, address text,
  order_count bigint, paid_order_count bigint, total_spent numeric, aov numeric,
  first_order_at timestamp with time zone, last_order_at timestamp with time zone,
  last_status text, total_count bigint
)
language sql
stable
set search_path to ''
as $function$
  with ord as (
    select
      public.order_customer_key(o.customer_phone, o.customer_email, o.id) as key,
      -- Fara `coalesce(..., 'Client')` aici, dinadins: daca o comanda a venit fara
      -- nume dar clientul importat are unul, vrem numele adevarat. Implicitul se
      -- pune o singura data, la unire.
      (array_agg(nullif(trim(o.customer_name), '') order by o.created_at desc)
        filter (where nullif(trim(o.customer_name), '') is not null))[1] as name,
      (array_agg(nullif(trim(o.customer_phone), '') order by o.created_at desc)
        filter (where nullif(trim(o.customer_phone), '') is not null))[1] as phone,
      (array_agg(nullif(lower(trim(o.customer_email)), '') order by o.created_at desc)
        filter (where nullif(lower(trim(o.customer_email)), '') is not null))[1] as email,
      (array_agg(nullif(trim(o.shipping_address->>'city'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'city'), '') is not null))[1] as city,
      (array_agg(nullif(trim(o.shipping_address->>'county'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'county'), '') is not null))[1] as county,
      (array_agg(nullif(trim(o.shipping_address->>'address'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'address'), '') is not null))[1] as address,
      count(*) as order_count,
      count(*) filter (where o.status not in ('cancelled', 'refunded')) as paid_order_count,
      round(coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0), 2) as total_spent,
      min(o.created_at) as first_order_at,
      max(o.created_at) as last_order_at,
      (array_agg(o.status order by o.created_at desc))[1] as last_status
    from public.orders o
    where o.business_id = bid
    group by 1
  ),
  imp as (
    -- Cel mult un rand per cheie: UNIQUE (business_id, key) o garanteaza.
    select
      c.key,
      nullif(trim(c.name), '') as name,
      nullif(trim(c.phone), '') as phone,
      nullif(lower(trim(c.email)), '') as email,
      nullif(trim(c.city), '') as city,
      nullif(trim(c.county), '') as county,
      nullif(trim(c.address), '') as address
    from public.customers c
    where c.business_id = bid
  ),
  merged as (
    -- Comenzile au prioritate: ele spun ce e adevarat ACUM. Importul completeaza
    -- doar golurile, de exemplu adresa unui client care a comandat prin telefon.
    select
      coalesce(o.key, i.key) as key,
      coalesce(o.name, i.name, 'Client') as name,
      coalesce(o.phone, i.phone, '') as phone,
      coalesce(o.email, i.email) as email,
      coalesce(o.city, i.city) as city,
      coalesce(o.county, i.county) as county,
      coalesce(o.address, i.address) as address,
      coalesce(o.order_count, 0) as order_count,
      coalesce(o.paid_order_count, 0) as paid_order_count,
      coalesce(o.total_spent, 0::numeric) as total_spent,
      -- Rimane NULL pentru un client fara comenzi. Interfata arata „fara comenzi".
      o.first_order_at,
      o.last_order_at,
      o.last_status
    from ord o
    full outer join imp i on i.key = o.key
  ),
  filtered as (
    select m.*,
      case when m.paid_order_count > 0
           then round(m.total_spent / m.paid_order_count, 2) else 0 end as aov
    from merged m
    where coalesce(search, '') = ''
       or m.name ilike '%' || search || '%' escape '\'
       or coalesce(m.email, '') ilike '%' || search || '%' escape '\'
       or (length(public.normalize_phone(search)) >= 3
           and public.normalize_phone(m.phone) like '%' || public.normalize_phone(search) || '%')
  )
  select f.key, f.name, f.phone, f.email, f.city, f.county, f.address,
         f.order_count, f.paid_order_count, f.total_spent, f.aov,
         f.first_order_at, f.last_order_at, f.last_status,
         count(*) over () as total_count
  from filtered f
  order by
    case when sort_key = 'spent' then f.total_spent end desc nulls last,
    case when sort_key = 'orders' then f.order_count end desc nulls last,
    case when sort_key = 'name' then f.name end asc nulls last,
    -- `nulls last` E OBLIGATORIU, nu cosmetic. Clientii importati n-au comenzi,
    -- deci `last_order_at` e NULL, iar in Postgres `desc` pune NULL-urile PRIMELE.
    -- Fara asta, un import de 1200 de clienti ar acoperi, chiar in capul listei,
    -- exact clientii care conteaza.
    f.last_order_at desc nulls last
  limit page_limit offset page_offset
$function$;


create or replace function public.customers_summary(bid uuid)
returns table(
  total_customers bigint, returning_customers bigint,
  total_revenue numeric, average_order_value numeric
)
language sql
stable
set search_path to ''
as $function$
  with ord as (
    select
      public.order_customer_key(o.customer_phone, o.customer_email, o.id) as key,
      count(*) filter (where o.status not in ('cancelled', 'refunded')) as paid_cnt,
      coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0) as spent
    from public.orders o
    where o.business_id = bid
    group by 1
  ),
  toti as (
    select o.key, o.paid_cnt, o.spent from ord o
    union all
    -- Doar clientii importati care NU au nicio comanda. Cei care au deja una sunt
    -- numarati o singura data, mai sus: altfel „total clienti" i-ar numara dublu.
    select c.key, 0::bigint, 0::numeric
    from public.customers c
    where c.business_id = bid
      and not exists (select 1 from ord o2 where o2.key = c.key)
  )
  select
    count(*)::bigint,
    (count(*) filter (where paid_cnt > 1))::bigint,
    -- Venitul si media pe comanda NU se schimba: clientii importati aduc 0 si 0.
    round(coalesce(sum(spent), 0), 2),
    case when coalesce(sum(paid_cnt), 0) > 0
         then round(coalesce(sum(spent), 0) / sum(paid_cnt), 2) else 0 end
  from toti
$function$;
