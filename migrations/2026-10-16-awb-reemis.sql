-- ═══════════════════════════════════════════════════════════════════════════
-- UN AWB REEMIS AJUNGE SI EL LA eMAG (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Prima urcare mergea. A doua, nu: trecerea din cron cauta `awb_uploaded_at is null`, iar
-- dupa prima urcare campul e scris si comanda nu mai e privita NICIODATA.
--
-- ⚠ Iar nota din `urcaAwbPropriu` spunea limpede ca „cheia poarta si numarul de AWB: la o
-- reexpediere numarul e altul, si atunci chiar TREBUIE urcat din nou". Registrul chiar
-- ingaduia asta — dar planificatorul nu mai ajungea acolo. O intentie scrisa in cod, pe
-- care alt cod o anula.
--
-- CE COSTA: coletul se anuleaza si se reemite (se intampla: adresa gresita, colet pierdut,
-- curier schimbat). eMAG ramane cu numarul VECHI, iar cumparatorul urmareste un AWB care nu
-- mai exista. Nimic nu da eroare.
--
-- ═══ DE CE O FUNCTIE, SI NU INCA UN FILTRU ═══
--
-- Intrebarea corecta e „s-a schimbat ceva de cand m-am uitat ultima oara", adica o
-- comparatie intre `orders.updated_at` si `emag_orders.awb_uploaded_at` — doua coloane din
-- tabele diferite, ceea ce PostgREST nu poate exprima.
--
-- ⚠ SI ANUME ASA, nu prin compararea AWB-ului in SQL: ordinea curierilor (cine bate pe cine
-- cand doua coloane sunt pline) e scrisa in `awbPropriuAlComenzii`. Repetata aici, ar fi
-- fost a doua copie a unei reguli — si s-ar fi despartit de prima la primul curier adaugat.
-- Functia spune doar „uita-te iar la asta"; CE anume s-a schimbat se hotaraste in cod.

alter table public.emag_orders
  add column if not exists awb_uploaded_number text;

comment on column public.emag_orders.awb_uploaded_number is
  'Ce numar de AWB s-a urcat ultima data la eMAG. Comparat cu cel curent, spune daca s-a reemis.';

create or replace function public.emag_comenzi_de_verificat_awb(
  p_business_id uuid,
  p_limita int default 10,
  p_de_la int default 0
)
returns table (
  id uuid,
  order_id uuid,
  emag_order_id bigint,
  order_type int,
  awb_uploaded_number text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select eo.id, eo.order_id, eo.emag_order_id, eo.order_type, eo.awb_uploaded_number
    from public.emag_orders eo
    join public.orders o
      on o.id = eo.order_id and o.business_id = eo.business_id
   where eo.business_id = p_business_id
     and eo.order_id is not null
     -- ⚠ Numai starile in care un AWB are rost: 2 in procesare, 3 pregatita, 4 finalizata.
     -- O comanda anulata sau returnata nu va primi niciodata unul, iar lasata in bazin ar
     -- intarzia lucrul adevarat prin fereastra rotativa.
     and eo.order_status in (2, 3, 4)
     and (
       -- niciodata urcat
       eo.awb_uploaded_at is null
       -- sau comanda s-a atins de atunci: poate fi chiar un AWB reemis. Se uita din nou, si
       -- codul hotaraste daca numarul chiar difera.
       or o.updated_at > eo.awb_uploaded_at
     )
   order by o.updated_at asc
   offset greatest(0, p_de_la)
   limit greatest(1, least(coalesce(p_limita, 10), 100));
$$;

-- ⚠ `PUBLIC` primeste EXECUTE implicit la fiecare `create or replace`, si functia e
-- `security definer`. Fara revoke, oricine cu o cheie anonima ar putea cere comenzile
-- oricarui magazin, dand un `business_id` ghicit.
revoke execute on function public.emag_comenzi_de_verificat_awb(uuid, int, int) from public, anon, authenticated;

-- Indexul urmeaza intrebarea noua.
drop index if exists public.emag_orders_fara_awb_urcat_idx;
create index emag_orders_awb_de_verificat_idx
  on public.emag_orders (business_id, awb_uploaded_at)
  where order_id is not null and order_status in (2, 3, 4);

notify pgrst, 'reload schema';
