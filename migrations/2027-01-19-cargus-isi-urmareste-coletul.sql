-- Urmarirea coletului Cargus: ce spun EI despre el ajunge pe comanda - 15.09.2026
--
-- ═══ CE LIPSEA ═══
--
-- Cargus era, alaturi de inca vreo doi, fara nicio bucla de urmarire: clientul se oprea la
-- creare, anulare, tiparire si ridicare. Comerciantul nu afla niciodata din Edinio ce s-a
-- intamplat cu coletul dupa ce a plecat, desi API-ul lor o spune pe doua cai.
--
-- ═══ ⚠ DE CE CRONUL INREGISTREAZA SI NU HOTARASTE ═══
--
-- Fiindca ei NU publica nicio enumerare de stari. In toata documentatia V3 (68 de pagini,
-- citita integral) statusul apare ca TEXT liber: singurul exemplu e „Tiparit". Nu exista
-- niciun tabel de coduri, asa cum are DPD in „Appendix 1", si nici un boolean cumulativ, asa
-- cum are Sameday in `expeditionSummary.delivered`.
--
-- Un `switch` pe textul lor ar fi fost o presupunere imbracata in logica, iar prima formulare
-- neprevazuta ar fi cazut tacut pe ramura implicita. Aceeasi cumpana s-a luat la Woot
-- (migratia `2027-01-14`), si acolo a iesit bine: cronul a strans perechile din trafic, iar
-- harta s-a scris DIN DATE cateva ore mai tarziu.
--
-- Deci: se scrie ce spun ei, se striga in jurnal fiecare formulare noua, si comanda NU se
-- misca singura. Cand vocabularul se aduna din trafic adevarat, harta se cableaza.
--
-- ═══ ⚠ SINGURUL SEMNAL STRUCTURAT: CONFIRMAREA ═══
--
-- `AwbTrace/GetDeltaEvents` si `AwbTrace/WithRedirect` intorc `ConfirmationDate` si
-- `ConfirmationPersonaName` („confirmation date", „confirmation name"). Sunt campuri, nu
-- text liber, deci se pastreaza separat: cand harta se va scrie, ele vor fi temelia ei.
--
-- ⚠ Dar NICI ELE nu muta comanda azi. Documentatia lor nu spune daca o confirmare inseamna
-- livrare sau doar „cineva a semnat ceva" (un refuz se confirma si el, de catre curier). Un
-- „Livrat" pus pe o confirmare de REFUZ ar emite si factura, si aia e greu de intors.
--
-- ═══ CE NU FACE ═══
--
-- Nimic retroactiv, si n-are ce: masurat pe 15.09.2026, ZERO AWB-uri Cargus emise in toata
-- viata platformei. ⚠ In special `cargus_awb_at` NU se umple din `created_at`: ar fi o data
-- INVENTATA a expedierii, care intra apoi in fereastra de urmarire ca si cum ar fi masurata.
--
-- Coloanele sunt aditive si anulabile; nicio citire existenta nu se schimba.

alter table public.orders
  add column if not exists cargus_awb_at timestamptz,
  add column if not exists cargus_status text,
  add column if not exists cargus_status_at timestamptz,
  add column if not exists cargus_status_checked_at timestamptz,
  add column if not exists cargus_confirmat_la timestamptz,
  add column if not exists cargus_confirmat_de text;

comment on column public.orders.cargus_awb_at is
  'Cand a fost emis AWB-ul Cargus. Fereastra de urmarire a cronului se masoara de aici, nu din `created_at`.';
comment on column public.orders.cargus_status is
  'Starea lor, ca TEXT, asa cum o scriu ei. ⚠ Cargus nu publica nicio enumerare de coduri, deci textul asta e pentru OM si pentru a aduna vocabularul; nu se compara in cod.';
comment on column public.orders.cargus_status_at is
  'Data ultimului eveniment pe care ni l-au spus ei, nu data la care l-am citit noi.';
comment on column public.orders.cargus_status_checked_at is
  'Cand a fost intrebat ultima oara Cargus despre acest colet. Cronul ia mereu cele mai vechi, NULLS FIRST.';
comment on column public.orders.cargus_confirmat_la is
  'ConfirmationDate de la ei: singurul semnal STRUCTURAT din raspunsul lor. ⚠ Nu muta comanda: documentatia lor nu spune daca o confirmare inseamna livrare sau refuz semnat.';
comment on column public.orders.cargus_confirmat_de is
  'ConfirmationPersonaName de la ei: cine a semnat.';

create index if not exists orders_cargus_urmarire_idx
  on public.orders using btree (cargus_status_checked_at nulls first)
  where cargus_awb_number is not null
    and status = any (array['pending', 'confirmed', 'processing', 'shipped']);
