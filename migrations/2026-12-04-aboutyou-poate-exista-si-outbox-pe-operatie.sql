-- ═══════════════════════════════════════════════════════════════════════════
-- `last_synced_at` NULL NU INSEAMNA „NU EXISTA NIMIC LA EI"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026)
--
-- `retrageListarileOrfane` stergea pe loc listarile cu `last_synced_at` NULL, cu explicatia „n-au
-- plecat niciodata, deci la ei nu exista nimic de retras". Nu e adevarat, si dovada era chiar in
-- `syncProductNow`, cu cateva randuri mai sus:
--
--     un produs cu 250 de variante pleaca in TREI transe
--     transa 1 -> acceptata la ei ✅
--     transa 2 -> acceptata la ei ✅
--     transa 3 -> pica            ❌
--     `setListingStatus(error)` si `return` — `last_synced_at` NU se scrie
--
-- Codul chiar SCRIE in jurnal „primele N au ajuns deja la About You", si tot el lasa campul gol.
-- Acelasi lucru la `nescrise > 0`, si la orice cadere de proces intre trimitere si scriere.
--
-- Apoi comerciantul sterge produsul, cheia straina pune `product_id` NULL, iar plasa de orfane
-- citeste „n-a plecat niciodata" si STERGE tocmai randul care ne mai ingaduia sa-l retragem. La ei
-- raman doua sute de variante de vanzare, si nu mai exista nimic la noi care sa stie de ele.
--
-- ═══ SEMNUL SE SCRIE INAINTEA CERERII, CA LA `cuLotDurabil` ═══
--
-- `remote_poate_exista` se pune pe `true` INAINTE de prima transa care poate crea ceva acolo, iar
-- daca scrierea aia nu merge, cererea NU se face. Deci nu exista clipa in care la ei sa fie ceva
-- iar la noi sa scrie ca nu e.
--
-- ⚠ UN FALS POZITIV E IEFTIN: cerem o retragere pentru ceva ce poate nu exista, si ei raspund ca
-- n-au ce retrage. Un fals negativ inseamna marfa lasata la vanzare. Deci, la indoiala, `true`.
--
-- ⚠ RANDURILE VECHI SE UMPLU DIN CE STIM: fie au `last_synced_at`, fie au un lot durabil de produs
-- pe cheia lor — iar lotul se scrie inaintea cererii tocmai ca sa supravietuiasca unei caderi. Mai
-- bine de-atat nu se poate afla retroactiv.

alter table public.aboutyou_listings
  add column if not exists remote_poate_exista boolean default false not null;

comment on column public.aboutyou_listings.remote_poate_exista is
  'S-a facut vreodata o cerere care putea crea produsul la About You. Se scrie INAINTEA cererii; la indoiala ramane true, fiindca un fals pozitiv costa o cerere, iar un fals negativ lasa marfa la vanzare.';

update public.aboutyou_listings l
   set remote_poate_exista = true
 where l.remote_poate_exista = false
   and (
     l.last_synced_at is not null
     or exists (
       select 1 from public.aboutyou_batches b
        where b.business_id = l.business_id
          and b.kind in ('product', 'status', 'removal')
          and b.related_ids ? l.style_key
     )
   );

-- ═══════════════════════════════════════════════════════════════════════════
-- SI CATE O DOVADA PENTRU FIECARE FEL DE TRIMITERE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: semnul lasat de declansator putea fi satisfacut DOAR de o trimitere de catalog,
-- fiindca doar ea scria `catalog_citit_la`. Corect pentru o schimbare de descriere — si gresit
-- pentru una de stoc:
--
--     o comanda scade stocul       -> semn scris (declansatorul asculta `stock_quantity`)
--     impingerea dedicata de stoc  -> pleaca, si e chiar ce trebuie ✅
--     dar nu scrie `catalog_citit_la`
--     dupa trei minute: „modificarea n-a plecat prin catalog" -> upsert de produs INTREG
--
-- Adica fiecare comanda ar fi produs, pe langa impingerea de stoc, si o trimitere completa de
-- catalog. La o mie de comenzi pe zi, mii de loturi de produs degeaba — cu tot cu generatii, loturi
-- si curse de urmarit.
--
-- ⚠ LEACUL E SIMETRIC: semnul poarta OPERATIA de care e nevoie, si fiecare fel de trimitere isi
-- scrie propria clipa de citire. Iar un `upsert` le satisface pe toate trei, fiindca duce cu el si
-- stocul, si preturile.

alter table public.aboutyou_listings
  add column if not exists stoc_citit_la timestamp with time zone;
alter table public.aboutyou_listings
  add column if not exists pret_citit_la timestamp with time zone;

comment on column public.aboutyou_listings.stoc_citit_la is
  'Cand a fost CITIT stocul pentru ultima impingere dedicata reusita. Nu clipa trimiterii: intre citire si trimitere valoarea se poate schimba iar.';
comment on column public.aboutyou_listings.pret_citit_la is
  'Ca `stoc_citit_la`, pentru impingerea dedicata de pret.';

-- ── Semnul, pe operatii ─────────────────────────────────────────────────────

alter table public.aboutyou_intentii add column if not exists op text not null default 'upsert';
alter table public.aboutyou_intentii add column if not exists status text not null default 'deschis';
alter table public.aboutyou_intentii add column if not exists last_error text;

alter table public.aboutyou_intentii drop constraint if exists aboutyou_intentii_op_check;
alter table public.aboutyou_intentii add constraint aboutyou_intentii_op_check
  check (op = any (array['upsert'::text, 'stock'::text, 'price'::text]));
alter table public.aboutyou_intentii drop constraint if exists aboutyou_intentii_status_check;
alter table public.aboutyou_intentii add constraint aboutyou_intentii_status_check
  check (status = any (array['deschis'::text, 'abandonat'::text]));

alter table public.aboutyou_intentii
  drop constraint if exists aboutyou_intentii_business_id_product_id_key;
create unique index if not exists aboutyou_intentii_unic_idx
  on public.aboutyou_intentii (business_id, product_id, op);

-- ⚠ Indexul urmeaza chiar interogarea cronului: ce e deschis, cel mai vechi intai.
drop index if exists public.aboutyou_intentii_scadente_idx;
create index if not exists aboutyou_intentii_deschise_idx
  on public.aboutyou_intentii (business_id, creat_la)
  where status = 'deschis';

-- ═══════════════════════════════════════════════════════════════════════════
-- DECLANSATORUL: CE S-A SCHIMBAT HOTARASTE CE SE CERE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `page_sections` MERGE LA CATALOG, desi poarta si stocul si preturile variantelor. Un `upsert`
-- le duce pe toate; invers n-ar fi adevarat, iar o schimbare de titlu de varianta trimisa doar ca
-- stoc n-ar ajunge niciodata acolo.
--
-- ⚠ SI `recuperari` REPORNESTE LA O MODIFICARE NOUA. Pastrat, un produs care avusese nevoie de
-- patru recuperari intra la a cincea direct in abandon — pentru o modificare care n-are nicio
-- legatura cu incidentul de atunci. Aceeasi regula ca la `incident` in veghea loturilor oarbe.

create or replace function public.aboutyou_marcheaza_modificarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ops text[] := '{}';
  v_op text;
begin
  if not exists (
    select 1 from public.aboutyou_listings l
     where l.product_id = new.id and l.business_id = new.business_id
  ) then
    return new;
  end if;

  if new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.images is distinct from old.images
     or new.category is distinct from old.category
     or new.sku is distinct from old.sku
     or new.weight_grams is distinct from old.weight_grams
     or new.page_sections is distinct from old.page_sections
     or new.is_active is distinct from old.is_active then
    v_ops := array_append(v_ops, 'upsert');
  end if;

  if new.stock_quantity is distinct from old.stock_quantity
     or new.track_inventory is distinct from old.track_inventory then
    v_ops := array_append(v_ops, 'stock');
  end if;

  if new.price is distinct from old.price
     or new.compare_at_price is distinct from old.compare_at_price then
    v_ops := array_append(v_ops, 'price');
  end if;

  foreach v_op in array v_ops loop
    insert into public.aboutyou_intentii (business_id, product_id, op)
    values (new.business_id, new.id, v_op)
    on conflict (business_id, product_id, op)
    do update set creat_la = now(), recuperari = 0, status = 'deschis', last_error = null;
  end loop;

  return new;
end;
$$;

revoke execute on function public.aboutyou_marcheaza_modificarea() from public;

drop trigger if exists aboutyou_marcheaza_modificarea on public.products;

create trigger aboutyou_marcheaza_modificarea
  after update of name, description, price, compare_at_price, images, category, sku,
                  weight_grams, page_sections, is_active, track_inventory, stock_quantity
  on public.products
  for each row
  when (old.* is distinct from new.*)
  execute function public.aboutyou_marcheaza_modificarea();

notify pgrst, 'reload schema';
