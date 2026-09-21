-- ═══════════════════════════════════════════════════════════════════════════
-- DISCOUNTURI: cifrele fiecarui cod                            (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ecranul de discounturi nu stia pana acum nimic despre ce a facut un cod: arata
-- regulile lui si un contor. Functia asta aduce ce s-a intamplat.
--
-- ⚠⚠ DE CE E NEVOIE DE EA CHIAR DE LA PRIMA ETAPA: contorul `uses_count` SCADE
-- inapoi cand o comanda se anuleaza, iar pe ecran scria doar „Utilizari".
-- Masurat pe demo: `BINEAIVENIT10` scria 26, dar codul e pe 30 de comenzi.
-- Ca sa se poata scrie „26 folosite · 30 în total", trebuie numarate comenzile.
--
-- ⚠ SE LEAGA PE `discount_id`, nu pe text. `discount_code` e o fotografie a
-- codului din clipa comenzii: un cod redenumit ar rupe legatura, iar doua coduri
-- scrise la fel in magazine deosebite s-ar amesteca. Masurat pe demo: 67 de
-- comenzi cu cod, 67 cu legatura, zero nepotriviri.
--
-- ⚠ Dar se numara SI comenzile care ar avea cod FARA legatura (`fara_legatura`).
-- Azi sunt zero peste tot; daca apar vreodata, trebuie sa se vada, nu sa dispara
-- tacut dintr-un raport de bani.
--
-- ⚠⚠ CE NU SE POATE AFLA, si nu se inventeaza: cat a costat un cod de TRANSPORT
-- GRATUIT. Economia sta in `shipping_cost`, care ajunge 0 si nu pastreaza
-- nicaieri cat ar fi fost. Pe demo, `TRANSPORTGRATUIT` are 5 comenzi in care
-- transportul chiar a fost oferit, si `bani_dati` iese 0,00 — adevarat pentru
-- campul acela, fals ca raspuns la „cat m-a costat". De-aia se intoarce si
-- `comenzi_cu_transport_oferit`: se poate spune CATE comenzi, nu CATI lei.

create or replace function public.discount_stats(bid uuid)
returns table (
  discount_id uuid,
  comenzi_total bigint,
  comenzi_valide bigint,
  comenzi_cazute bigint,
  bani_dati numeric,
  vanzari numeric,
  comenzi_cu_transport_oferit bigint
)
language sql
stable
security invoker
set search_path to ''
as $$
  select
    d.id,
    count(o.id),
    count(o.id) filter (where o.status not in ('cancelled', 'refunded')),
    count(o.id) filter (where o.status in ('cancelled', 'refunded')),
    round(coalesce(sum(o.discount_amount) filter (
      where o.status not in ('cancelled', 'refunded')), 0), 2),
    round(coalesce(sum(o.total) filter (
      where o.status not in ('cancelled', 'refunded')), 0), 2),
    -- ⚠⚠ NUMAI LA CODURILE DE TRANSPORT GRATUIT, si asta a fost o reparatie.
    -- Numarata fara `d.type`, cifra prindea ORICE comanda cu transport zero:
    -- masurat pe demo la 21.09.2026, 26 din 31 de comenzi numarate asa erau ale
    -- unor coduri de procent sau suma fixa, unde transportul a ajuns zero din
    -- pragul magazinului sau din ridicare personala, fara nicio legatura cu
    -- codul. Ecranul o arata doar sub codurile de transport, deci comerciantul
    -- n-a vazut niciodata numarul gresit — dar functia il intorcea.
    --
    -- ⚠ Nici asa nu e o socoteala de bani: daca cosul trecea oricum de pragul
    -- de transport gratuit al magazinului, codul n-a adaugat nimic. Nicaieri nu
    -- se pastreaza cat ar fi costat transportul, deci asta NU se poate afla din
    -- comanda. De-aia se spune CATE comenzi, si se scrie pe ecran ce inseamna.
    count(o.id) filter (
      where o.status not in ('cancelled', 'refunded')
        and d.type = 'free_shipping'
        and coalesce(o.shipping_cost, 0) = 0)
  from public.discounts d
  left join public.orders o
    on o.discount_id = d.id and o.business_id = d.business_id
  where d.business_id = bid
  group by d.id
$$;

revoke all on function public.discount_stats(uuid) from public;
revoke all on function public.discount_stats(uuid) from anon;
grant execute on function public.discount_stats(uuid) to authenticated;

-- ── Comenzile ramase fara legatura ─────────────────────────────────────────
--
-- ⚠ O singura cifra pe magazin, nu pe cod: nici n-am cum sa stiu al cui e un
-- cod fara legatura. Daca iese mai mare decat zero, inseamna ca `discount_id`
-- nu s-a scris undeva pe drum, si toate cifrele de mai sus sunt incomplete.
-- Mai bine o cifra care spune asta decat un raport care tace.

create or replace function public.discount_orders_fara_legatura(bid uuid)
returns bigint
language sql
stable
security invoker
set search_path to ''
as $$
  select count(*)
  from public.orders o
  where o.business_id = bid
    and nullif(btrim(o.discount_code), '') is not null
    and o.discount_id is null
$$;

revoke all on function public.discount_orders_fara_legatura(uuid) from public;
revoke all on function public.discount_orders_fara_legatura(uuid) from anon;
grant execute on function public.discount_orders_fara_legatura(uuid) to authenticated;

notify pgrst, 'reload schema';
