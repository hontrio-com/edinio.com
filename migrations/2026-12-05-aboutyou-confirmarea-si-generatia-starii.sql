-- ═══════════════════════════════════════════════════════════════════════════
-- „AM TRIMIS" NU E „S-A APLICAT"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, seara)
--
-- Semnul de stoc se stingea cand impingerea PLECA, nu cand se ASEZA. Dar `PUT /products/stocks`
-- intoarce un `batchRequestId`, iar verdictul vine mult mai tarziu, din `/results/stocks` — si
-- documentatia lor spune limpede ca un lot `completed` poate contine articole cu `success: false`.
--
--     stocul scade 10 -> 2
--     impingerea pleaca, e acceptata     ✅
--     dovada se scrie, semnul dispare    ✅
--     rezultatul: `success: false`       ❌
--
-- La noi 2, la ei 10, si nimic care sa mai revina acolo. Exact peste stoc, unde greseala se
-- plateste in marfa vanduta si neexistenta.
--
-- ⚠ SI LA CATALOG LA FEL: `catalog_confirmat_la` se scria la trimitere, iar un lot respins mai
-- tarziu („Size is invalid") stergea intre timp si semnul de stoc, care fusese satisfacut prin el.
--
-- ═══ DOVADA E O CLIPA DE CITIRE, PURTATA DE LOT ═══
--
-- Lotul tine minte CAND a fost citita valoarea pe care o duce (`citit_la`). Cand se aseaza cu bine,
-- clipa aia trece pe listare. Deci „confirmat pana la" inseamna: tot ce era adevarat la clipa aia a
-- ajuns acolo — nu „am trimis la clipa aia".

alter table public.aboutyou_batches
  add column if not exists citit_la timestamp with time zone;

comment on column public.aboutyou_batches.citit_la is
  'Cand a fost CITITA valoarea pe care o duce lotul. La asezare reusita trece pe listare, ca dovada ca tot ce era adevarat atunci a ajuns la ei. Vezi rezolvaIntentiile.';

-- ⚠ Campurile vechi purtau clipa TRIMITERII si se numeau `*_citit_la`. Numele era bun, momentul
-- scrierii nu. Se sterg, nu se redenumesc: o valoare veche cu inteles nou e o capcana pentru cine
-- citeste maine.
alter table public.aboutyou_listings drop column if exists catalog_citit_la;
alter table public.aboutyou_listings drop column if exists stoc_citit_la;
alter table public.aboutyou_listings drop column if exists pret_citit_la;

alter table public.aboutyou_listings
  add column if not exists catalog_confirmat_la timestamp with time zone;
alter table public.aboutyou_listings
  add column if not exists stoc_confirmat_la timestamp with time zone;
alter table public.aboutyou_listings
  add column if not exists pret_confirmat_la timestamp with time zone;

comment on column public.aboutyou_listings.catalog_confirmat_la is
  'Clipa de citire a celui mai nou lot de PRODUS asezat cu bine. Tot ce era adevarat atunci a ajuns la ei. Nu e clipa trimiterii.';
comment on column public.aboutyou_listings.stoc_confirmat_la is
  'Ca `catalog_confirmat_la`, pentru impingerea dedicata de stoc.';
comment on column public.aboutyou_listings.pret_confirmat_la is
  'Ca `catalog_confirmat_la`, pentru impingerea dedicata de pret.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SI STAREA ARE ACUM GENERATIE, CA SI CONTINUTUL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: `PUT /products/status` e tot asincron, si nimic nu garanteaza ordinea intre doua
-- loturi de status.
--
--     10:00 omul cere „Publica"   -> lotul pleaca, raspunsul se pierde
--     10:02 omul cere „Retrage"   -> lotul pleaca si se incheie -> la ei `inactive` ✅
--     10:05 lotul vechi se aseaza -> la ei `published` ❌
--
-- Continutul avea de mult generatii tocmai pentru asta; starea nu avea nimic. Reconcilierea ar fi
-- citit `published` si l-ar fi scris la noi, ca si cum ar fi fost ce a cerut comerciantul.
--
-- ⚠ `status_dorit` E ULTIMA CERERE A OMULUI, si de-aia se pastreaza: cand un lot dintr-o generatie
-- depasita se aseaza, nu ajunge sa nu-i credem starea — trebuie sa retrimitem ce s-a cerut ultima
-- oara. Altfel la ei ramane ce a apucat lotul vechi.

alter table public.aboutyou_listings
  add column if not exists status_dorit text;
alter table public.aboutyou_listings
  add column if not exists status_generatie integer default 0 not null;

comment on column public.aboutyou_listings.status_dorit is
  'Ultima stare ceruta de comerciant la About You (published/inactive/draft). Cand un lot de status dintr-o generatie depasita se aseaza, ea se retrimite.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SI EDITARILE DIN FISA About You LASA SI ELE URMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: cutia de iesire era doar pe `products`. Dar EAN-ul, marimea, culoarea, pretul manual
-- in euro, bifa variantei, categoria si materialele stau in `aboutyou_listings` si
-- `aboutyou_variants` — deci o editare din fisa About You nu lasa NICIUN semn. Iar „Salveaza si
-- trimite" sunt doua cereri separate ale browserului: daca a doua nu mai pleaca (fila inchisa,
-- retea cazuta), comerciantul a apasat „Trimite" si s-a salvat doar configurarea.
--
-- ⚠ SE ASCULTA DOAR COLOANELE OMULUI. `status`, `error`, `catalog_confirmat_la`, `ay_status` si
-- restul le scriem NOI, la fiecare trecere a cronului; ascultate, semnul s-ar rescrie la nesfarsit
-- si cutia de iesire ar deveni zgomot.

create or replace function public.aboutyou_marcheaza_listarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.product_id is null then
    return new;
  end if;
  insert into public.aboutyou_intentii (business_id, product_id, op)
  values (new.business_id, new.product_id, 'upsert')
  on conflict (business_id, product_id, op)
  do update set creat_la = now(), recuperari = 0, status = 'deschis', last_error = null;
  return new;
end;
$$;

revoke execute on function public.aboutyou_marcheaza_listarea() from public;

drop trigger if exists aboutyou_marcheaza_listarea on public.aboutyou_listings;
create trigger aboutyou_marcheaza_listarea
  after update of brand_id, category_id, color_id, attributes, material_composition,
                  country_of_origin, hs_code
  on public.aboutyou_listings
  for each row
  when (old.* is distinct from new.*)
  execute function public.aboutyou_marcheaza_listarea();

drop trigger if exists aboutyou_marcheaza_varianta on public.aboutyou_variants;
create trigger aboutyou_marcheaza_varianta
  after update of sku, ean, size_id, second_size_id, color_id, quantity,
                  retail_price_eur, sale_price_eur, enabled
  on public.aboutyou_variants
  for each row
  when (old.* is distinct from new.*)
  execute function public.aboutyou_marcheaza_listarea();

notify pgrst, 'reload schema';
