-- ═══════════════════════════════════════════════════════════════════════════
-- AWB-UL CURENT NU SE MAI GHICESTE DUPA O ORDINE FIXA (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pe 25.08.2026 am inchis bucla AWB-ului reemis: `awb_uploaded_number` tine ce s-a urcat, iar
-- o comanda atinsa de atunci se priveste din nou. Merge perfect cand se schimba ACELASI camp:
-- FAN123 -> FAN456.
--
-- ⚠ DAR NU CAND SE SCHIMBA CURIERUL, si aia e o gaura in chiar reparatia aceea.
--
--   1. comerciantul emite FAN123        -> fan_courier_awb_number = FAN123
--   2. FAN123 se urca la eMAG           -> awb_uploaded_number = FAN123
--   3. renunta la FAN si emite GLS999   -> gls_awb_number = GLS999 (FAN ramane plin)
--   4. `awbPropriuAlComenzii` parcurge coloanele in ORDINE FIXA, cu FAN primul
--                                       -> intoarce tot FAN123
--   5. FAN123 === awb_uploaded_number   -> „acelasi AWB", se sare
--
-- GLS999 nu ajunge NICIODATA la eMAG, iar cumparatorul urmareste un colet care nu mai vine.
--
-- ⚠ MASURAT INAINTE DE REPARATIE: nicio comanda din productie n-are doua coloane de AWB
-- pline (134 au exact una, 89 niciuna). Deci n-a lovit inca pe nimeni — dar e o pierdere
-- tacuta, si tacerea e chiar lucrul pe care il vanam in integrarea asta.
--
-- ═══ DE CE O MULTIME, SI NU UN CAMP „CURENT" ═══
--
-- Solutia curata ar fi `orders.current_awb_number`, scris de ORICE integrare de curier. Dar
-- asta inseamna cincisprezece integrari atinse, fiecare cu propriile ei cai de emitere si
-- anulare — mult risc pentru o gaura care nu s-a deschis inca.
--
-- Aici se tine MULTIMEA numerelor deja urcate, iar alegerea ia primul AWB care NU e in ea.
-- Atunci pasul 4 de mai sus intoarce GLS999, fiindca FAN123 e deja dus.
--
-- ⚠ SI SE TERMINA, spre deosebire de o comparatie cu un singur numar: cand toate AWB-urile
-- prezente sunt in multime, nu se mai alege nimic si comanda se stampileaza. Cu un singur
-- numar, doua AWB-uri s-ar fi urcat pe rand la nesfarsit, fiecare scotandu-l pe celalalt.

alter table public.emag_orders
  add column if not exists awb_uploaded_numbers text[] not null default '{}';

comment on column public.emag_orders.awb_uploaded_numbers is
  'MULTIMEA numerelor de AWB deja atasate la eMAG. Un singur numar nu ajunge: la schimbarea curierului, coloana veche ramane plina si alegerea dupa prioritate fixa l-ar intoarce la nesfarsit pe cel vechi.';

-- Ce s-a urcat pana acum, mutat in multime, ca reparatia sa porneasca din adevar.
update public.emag_orders
   set awb_uploaded_numbers = array[awb_uploaded_number]
 where awb_uploaded_number is not null
   and awb_uploaded_number <> ''
   and awb_uploaded_numbers = '{}';

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- SI INTENTIA DE `auto_publish` PENTRU UN PRODUS NOU (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Comentariul din `queue.ts` o spunea deja, fara menajamente: daca la crearea unui produs NOU
-- configul nu se poate citi chiar in clipa aceea, intentia nu se recupereaza mai tarziu, iar
-- „publicarea automata se degradeaza tacit in publicare manuala". Nu e „produs pierdut", dar
-- nici ce promite comutatorul.
--
-- ═══ ⚠ DE CE O FEREASTRA DE TIMP, SI NU UN STEAG SCRIS LA CREARE ═══
--
-- Un steag (`emag_publish_pending_at`) ar fi trebuit scris chiar in inserarea produsului, in
-- toate caile care creeaza produse — panou, import, feed. O cale uitata inseamna acelasi
-- defect, doar mutat.
--
-- Aici nu se scrie nimic nou nicaieri. Se INTREABA: exista un produs activ, facut in ultimele
-- ore, care n-are nicio oferta eMAG, intr-un magazin cu `auto_publish` aprins?
--
-- ⚠ SI FEREASTRA E TOT ROSTUL. Fara ea, prima aprindere a comutatorului ar trimite catalogul
-- intreg la publicare. Pe 24.08.2026 exact asta s-a intamplat: o plasa care nu deosebea
-- „n-a plecat niciodata" de „s-a pierdut o schimbare" a publicat singura 116 oferte pe care
-- nu le ceruse nimeni. Cu fereastra, un produs vechi nu poate intra NICIODATA.

create or replace function public.emag_produse_noi_nepublicate(
  p_business_id uuid,
  p_ore int default 24,
  p_limita int default 50
)
returns table (id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.created_at
    from public.products p
   where p.business_id = p_business_id
     and p.is_active
     and p.created_at > now() - make_interval(hours => greatest(1, least(coalesce(p_ore, 24), 72)))
     and not exists (
       select 1 from public.emag_offers e
        where e.business_id = p.business_id and e.product_id = p.id
     )
   order by p.created_at asc
   limit greatest(1, least(coalesce(p_limita, 50), 200));
$$;

comment on function public.emag_produse_noi_nepublicate(uuid, int, int) is
  'Produse NOI (fereastra de ore) fara nicio oferta eMAG. Pentru recuperarea intentiei de auto_publish cand punerea in coada s-a pierdut.';

revoke execute on function public.emag_produse_noi_nepublicate(uuid, int, int) from public, anon, authenticated;
grant execute on function public.emag_produse_noi_nepublicate(uuid, int, int) to service_role;

-- ⚠ Si functia de AWB isi schimba forma: intoarce si multimea.
drop function if exists public.emag_comenzi_de_verificat_awb(uuid, int, int);

create or replace function public.emag_comenzi_de_verificat_awb(
  p_business_id uuid, p_limita int default 10, p_de_la int default 0
)
returns table (
  id uuid, order_id uuid, emag_order_id bigint, order_type int,
  awb_uploaded_number text, awb_uploaded_numbers text[]
)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select eo.id, eo.order_id, eo.emag_order_id, eo.order_type,
         eo.awb_uploaded_number, eo.awb_uploaded_numbers
    from public.emag_orders eo
    join public.orders o on o.id = eo.order_id and o.business_id = eo.business_id
   where eo.business_id = p_business_id
     and eo.order_id is not null
     and eo.order_status in (2, 3, 4)
     and (eo.awb_uploaded_at is null or o.updated_at > eo.awb_uploaded_at)
   order by o.updated_at asc
   offset greatest(0, p_de_la)
   limit greatest(1, least(coalesce(p_limita, 10), 100));
$$;

revoke execute on function public.emag_comenzi_de_verificat_awb(uuid, int, int) from public, anon, authenticated;
grant execute on function public.emag_comenzi_de_verificat_awb(uuid, int, int) to service_role;

notify pgrst, 'reload schema';
