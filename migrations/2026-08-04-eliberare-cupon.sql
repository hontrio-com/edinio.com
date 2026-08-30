-- Eliberarea utilizarii unui cupon cand comanda nu se mai face.
--
-- Utilizarea se revendica atomic la plasarea comenzii (`claim_discount_use`),
-- dar nu se intorcea niciodata: nici la anulare, nici la returnare, nici cand
-- clientul abandoneaza pagina procesatorului. Un cupon cu 100 de utilizari se
-- epuiza cu 100 de comenzi care n-au adus niciun leu.
--
-- Masurat in productie azi (2026-08-04): 9 cupoane, 8 active, doar 2 cu limita
-- (CADOU30 cu max_uses 4 si PRIMA cu 100000). O SINGURA comanda din 96 a purtat
-- vreodata un cod — PRIMA, transport gratuit, livrata si platita — iar
-- `uses_count` al lui PRIMA e 1. Deci drift zero azi. 26 de comenzi in
-- `cancelled`/`refunded`, niciuna cu cupon; 2 comenzi online neplatite mai vechi de 24 de ore,
-- niciuna cu cupon. Nu e nimic de reparat retroactiv: paguba e a primei campanii
-- cu cupon limitat, si aceea e CADOU30, cu patru utilizari cu totul.
--
-- Ce adauga migratia:
--   1. `orders.discount_id` — care cupon a fost revendicat. Pana acum comanda
--      pastra doar `discount_code` ca text, iar un cod redenumit intre timp nu
--      s-ar mai fi gasit, si nici nu se putea deosebi un cod purtat de o comanda
--      veche (dinainte de revendicare) de unul chiar revendicat.
--   2. `orders.discount_released_at` — marcajul „utilizarea a fost deja data
--      inapoi". Fara el, o comanda anulata, apoi anulata din nou (sau anulata si
--      pe urma stearsa) ar scadea contorul de doua ori.
--   3. `release_order_discount` / `reclaim_order_discount` — singurele doua cai
--      prin care contorul se misca dupa plasare. Marcajul si contorul se ating in
--      aceeasi tranzactie, sub lock pe randul comenzii, deci doua apeluri
--      simultane nu pot scadea de doua ori.
--
-- Migratia asta trebuie aplicata INAINTE de codul care o foloseste: pana atunci
-- `discount_id` ramane NULL peste tot, iar `release_order_discount` intoarce
-- „nimic" — adica exact purtarea de azi, fara nicio miscare de contor.

alter table public.orders
  add column if not exists discount_id uuid references public.discounts(id) on delete set null,
  add column if not exists discount_released_at timestamptz;

comment on column public.orders.discount_id is
  'Cuponul a carui utilizare a fost revendicata de comanda asta. NULL = fara cupon revendicat. ON DELETE SET NULL: cuponul sters de comerciant nu mai are ce contor sa primeasca inapoi.';
comment on column public.orders.discount_released_at is
  'Cand a fost data inapoi utilizarea revendicata. Zavor: se scade o singura data, oricat de des s-ar anula comanda.';

-- Backfill pentru comenzile care au deja un cod scris.
--
-- Potrivirea se face pe (business_id, code), care e UNIQUE pe `discounts`, deci
-- nu poate nimeri doua cupoane. Conditia pe date exclude cazul in care un cod cu
-- acelasi nume a fost creat DUPA comanda (cod redenumit si reciclat): acolo
-- preferam sa nu legam nimic decat sa legam gresit.
--
-- Masurat: atinge exact 1 rand (comanda ccbf5e0e cu PRIMA, din 2026-06-21,
-- cuponul fiind creat pe 2026-06-19). Comenzile deja anulate NU se marcheaza ca
-- eliberate si nici nu se elibereaza: utilizarea lor a fost consumata inainte sa
-- existe mecanismul, iar codul nou nu re-anuleaza o comanda deja anulata.
update public.orders o
set discount_id = d.id
from public.discounts d
where o.discount_id is null
  and o.discount_code is not null
  and d.business_id = o.business_id
  and d.code = o.discount_code
  and d.created_at <= o.created_at;

-- Indexul pe care il foloseste maturatoarea de comenzi online neplatite.
-- Astazi tabelul are 96 de randuri si scanarea e gratuita; o campanie cu cupon
-- schimba asta, iar cronul ruleaza din ora in ora.
create index if not exists orders_cupon_neplatit_idx
  on public.orders (payment_status, status, created_at)
  where discount_code is not null;

-- Da inapoi utilizarea revendicata de o comanda. Intoarce true doar daca chiar a
-- scazut contorul acum.
--
-- Efect adiacent stiut: `orders` are declansatorul `set_orders_updated_at`, deci
-- marcarea urca si `updated_at`-ul comenzii. Comanda nu se schimba in niciun alt
-- fel — nici status, nici bani.
create or replace function public.release_order_discount(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_discount_id uuid;
begin
  -- Marcajul se pune PRIMUL, si numai daca lipsea. Instructiunea asta e in
  -- acelasi timp verificarea si zavorul: doua anulari simultane intra amandoua,
  -- dar a doua asteapta lock-ul pe randul comenzii si pe urma nu mai gaseste
  -- `discount_released_at is null`, deci nu scade nimic.
  update public.orders
  set discount_released_at = now()
  where id = p_order_id
    and discount_id is not null
    and discount_released_at is null
  returning discount_id into v_discount_id;

  if v_discount_id is null then
    return false;
  end if;

  -- `greatest(..., 0)`, ca `release_discount_use`: un contor negativ ar face
  -- limita campaniei sa creasca in loc sa se pastreze.
  update public.discounts
  set uses_count = greatest(uses_count - 1, 0), updated_at = now()
  where id = v_discount_id;

  return true;
end;
$$;

-- Inversul: comanda anulata din greseala si adusa inapoi in lucru isi ia
-- utilizarea la loc.
--
-- Fara asta, eliberarea ar deschide o gaura noua exact pe dos: o comanda anulata
-- si reactivata ar ramane cu reducerea acordata dar necontorizata, iar o campanie
-- de 4 cupoane ar putea servi 5 clienti. Aici contorul creste doar daca limita
-- mai are loc; daca nu mai are, comanda ramane valida, marcajul ramane pus si
-- raspunsul spune 'plin', ca sa se poata vedea in jurnal.
create or replace function public.reclaim_order_discount(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_discount_id uuid;
  v_randuri     integer;
begin
  -- `for update` pe randul comenzii, ca sa nu se incruciseze cu o eliberare
  -- pornita in aceeasi clipa din alta parte (panou, stergere, cron).
  select discount_id into v_discount_id
  from public.orders
  where id = p_order_id
    and discount_id is not null
    and discount_released_at is not null
  for update;

  if v_discount_id is null then
    return 'nimic';
  end if;

  update public.discounts
  set uses_count = uses_count + 1, updated_at = now()
  where id = v_discount_id
    and (max_uses is null or uses_count < max_uses);

  get diagnostics v_randuri = row_count;
  if v_randuri = 0 then
    return 'plin';
  end if;

  update public.orders
  set discount_released_at = null
  where id = p_order_id;

  return 'reluat';
end;
$$;

-- Numai `service_role`, ca la `decrement_stock_batch`. Amandoua se cheama doar
-- din actiuni de server cu clientul admin.
revoke all on function public.release_order_discount(uuid) from public;
revoke all on function public.release_order_discount(uuid) from anon;
revoke all on function public.release_order_discount(uuid) from authenticated;
grant execute on function public.release_order_discount(uuid) to service_role;

revoke all on function public.reclaim_order_discount(uuid) from public;
revoke all on function public.reclaim_order_discount(uuid) from anon;
revoke all on function public.reclaim_order_discount(uuid) from authenticated;
grant execute on function public.reclaim_order_discount(uuid) to service_role;

-- Si drepturile celor doua functii vechi, care azi sunt executabile de `anon`.
--
-- Verificat in `pg_proc.proacl`: `claim_discount_use` si `release_discount_use`
-- au `anon=X` si `authenticated=X`, adica oricine are cheia publica din pachetul
-- browserului poate creste sau scadea `uses_count` al oricarui cupon al carui id
-- il stie. Cautare pe tot `src/`: amandoua se cheama exclusiv prin clientul admin
-- (`order.actions.ts`, 2 apeluri fiecare), deci retragerea nu rupe niciun drum.
-- Fara ea, contorul pe care il reparam ramane la mana oricui.
revoke all on function public.claim_discount_use(uuid) from public;
revoke all on function public.claim_discount_use(uuid) from anon;
revoke all on function public.claim_discount_use(uuid) from authenticated;
grant execute on function public.claim_discount_use(uuid) to service_role;

revoke all on function public.release_discount_use(uuid) from public;
revoke all on function public.release_discount_use(uuid) from anon;
revoke all on function public.release_discount_use(uuid) from authenticated;
grant execute on function public.release_discount_use(uuid) to service_role;
