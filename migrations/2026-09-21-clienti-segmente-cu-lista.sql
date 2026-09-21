-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI: al doilea fel de segment, cu lista fixa             (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cerut de proprietar ca actiune in masa: „adaugă într-un segment". I-am spus
-- limpede, cand a ales, ca nu se potriveste cu felul in care sunt facute
-- segmentele; a ales-o oricum. Se face cum a cerut, dar cu deosebirea scrisa pe
-- ecran, ca sa n-o afle peste o luna dintr-o campanie.
--
-- ⚠⚠ ACUM SUNT DOUA FELURI DE SEGMENT, SI SE POARTA DEOSEBIT:
--
--   `criterii`  pastreaza INTREBAREA (segment + valoare + judet + canal + cautare)
--               si se RECALCULEAZA la fiecare deschidere. Cine devine maine
--               inactiv intra singur.
--
--   `lista`     pastreaza OAMENII, asa cum erau in clipa bifarii. Nu se mai
--               schimba niciodata singur: cine cumpara maine NU intra, iar cine
--               s-a dezabonat RAMANE.
--
-- Al doilea e chiar capcana de care ne feream la primul. De-aia:
--   - coloana `fel` spune limpede care e care, si nu se ghiceste;
--   - pe ecran, langa un segment cu lista, scrie ca e inghetat si de cand;
--   - `creat_la` e data listei, nu o podoaba: „lista de acum trei luni".

alter table public.customer_segments
  add column if not exists fel text not null default 'criterii';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_segments_fel_check'
  ) then
    alter table public.customer_segments
      add constraint customer_segments_fel_check check (fel in ('criterii', 'lista'));
  end if;
end $$;

-- ── Oamenii dintr-un segment cu lista ──────────────────────────────────────
--
-- ⚠ Se tine CHEIA clientului, nu un `customer_id`: un cumparator n-are rand in
-- `customers`, e o grupare peste comenzile lui. O cheie straina catre
-- `customers` ar fi putut cuprinde numai contactele importate — adica exact
-- oamenii care n-au cumparat niciodata.
--
-- ⚠ Si de-aia nu exista nici `on delete cascade` catre client: n-are catre ce.
-- Cand cineva e anonimizat, cheia lui se schimba, iar randul de aici ramane
-- aratand catre nimeni. Se curata la citire (un `join` care nu gaseste nimic nu
-- intoarce nimic), nu printr-un declansator care ar trebui sa stie de fiecare
-- fel de stergere.

create table if not exists public.customer_segment_members (
  segment_id uuid not null references public.customer_segments(id) on delete cascade,
  cheie text not null,
  primary key (segment_id, cheie)
);

create index if not exists customer_segment_members_segment_idx
  on public.customer_segment_members (segment_id);

alter table public.customer_segment_members enable row level security;

/* ⚠ Supabase da implicit toate drepturile pe o tabela noua din `public`. */
revoke select on public.customer_segment_members from anon;

/*
  ⚠ Politica trece prin segment, care trece prin magazin. Scrisa pe `segment_id`
  fara legatura catre `businesses`, oricine ar fi putut citi lista altcuiva
  ghicind un uuid.
*/
drop policy if exists "owner_all_customer_segment_members" on public.customer_segment_members;
create policy "owner_all_customer_segment_members" on public.customer_segment_members
  for all using (
    segment_id in (
      select s.id from public.customer_segments s
      join public.businesses b on b.id = s.business_id
      where b.user_id = auth.uid()
    )
  ) with check (
    segment_id in (
      select s.id from public.customer_segments s
      join public.businesses b on b.id = s.business_id
      where b.user_id = auth.uid()
    )
  );

-- ── Lista, cu inca un filtru: „numai cheile astea" ─────────────────────────
--
-- ⚠ `p_chei` e cum se deschide un segment cu lista. Restul filtrelor raman si
-- se pot pune peste: un segment inghetat filtrat apoi dupa judet e o intrebare
-- cu inteles.

drop function if exists public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text);

create function public.customers_aggregate(
  bid uuid,
  search text default null,
  sort_key text default 'recent',
  page_limit integer default 50,
  page_offset integer default 0,
  p_segment text default 'toti',
  p_valoare_min numeric default null,
  p_valoare_max numeric default null,
  p_vip_comenzi integer default 3,
  p_vip_lei numeric default 1000,
  p_judet text default null,
  p_canal text default null,
  p_chei text[] default null
)
returns table (
  key text, name text, phone text, email text, city text, county text, address text,
  order_count bigint, valid_order_count bigint, cancelled_count bigint, refunded_count bigint,
  orders_value numeric, collected_total numeric, aov numeric,
  first_order_at timestamptz, last_order_at timestamptz, last_status text,
  source text, canal text,
  total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $$
  with filtered as (
    select m.*,
      case when m.valid_order_count > 0
           then round(m.orders_value / m.valid_order_count, 2) else 0 end as aov
    from public.customers_merged(bid) m
    where (coalesce(search, '') = ''
       or m.name ilike '%' || search || '%' escape '\'
       or coalesce(m.email, '') ilike '%' || search || '%' escape '\'
       or (length(public.normalize_phone(search)) >= 3
           and public.normalize_phone(m.phone) like '%' || public.normalize_phone(search) || '%'))
      and public.customer_in_segment(
            coalesce(p_segment, 'toti'),
            m.order_count, m.valid_order_count, m.cancelled_count, m.refunded_count,
            m.orders_value, m.first_order_at, m.last_order_at,
            p_vip_comenzi, p_vip_lei)
      and (p_valoare_min is null or m.orders_value >= p_valoare_min)
      and (p_valoare_max is null or m.orders_value < p_valoare_max)
      and (p_judet is null or m.county = p_judet)
      and (p_canal is null or m.canal = p_canal)
      /*
        ⚠ `null` inseamna „fara filtru pe chei", nu „nicio cheie". Scris
        `m.key = any(coalesce(p_chei, '{}'))`, orice apel obisnuit ar fi intors
        lista goala — adica pagina de clienti s-ar fi golit pentru toata lumea.
      */
      and (p_chei is null or m.key = any(p_chei))
  )
  select f.key, f.name, f.phone, f.email, f.city, f.county, f.address,
         f.order_count, f.valid_order_count, f.cancelled_count, f.refunded_count,
         f.orders_value, f.collected_total, f.aov,
         f.first_order_at, f.last_order_at, f.last_status,
         f.source, f.canal,
         count(*) over () as total_count
  from filtered f
  order by
    case when sort_key = 'spent' then f.orders_value end desc nulls last,
    case when sort_key = 'orders' then f.order_count end desc nulls last,
    case when sort_key = 'name' then f.name end asc nulls last,
    f.last_order_at desc nulls last
  limit page_limit offset page_offset
$$;

revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text, text[]) from public;
revoke all on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text, text[]) from anon;
grant execute on function public.customers_aggregate(uuid, text, text, integer, integer, text, numeric, numeric, integer, numeric, text, text, text[]) to authenticated;

notify pgrst, 'reload schema';
