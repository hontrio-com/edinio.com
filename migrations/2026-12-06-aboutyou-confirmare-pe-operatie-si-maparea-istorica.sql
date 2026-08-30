-- ═══════════════════════════════════════════════════════════════════════════
-- STAREA CERUTA SE RETRIMITE CA STARE, NU CA PRODUS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, noaptea)
--
-- Cand un lot de stare dintr-o generatie depasita se aseza, retrimiteam `status_dorit` — dar
-- puneam in coada `publish` pentru „published" si `upsert` pentru orice altceva. `upsert` inseamna
-- `syncProductNow`, adica trimiterea CONTINUTULUI; nu e nici pe departe `PUT /products/status`
-- cu `inactive`. Deci:
--
--     10:00 „Publica" -> lotul pleaca, raspunsul se pierde
--     10:02 „Retrage" -> se incheie, la ei `inactive` ✅
--     10:05 lotul vechi se aseaza -> la ei `published` ❌
--     retrimitem… continutul produsului, si la ei ramane `published`
--
-- ⚠ SI PROBA CEREA EXACT FORMA GRESITA (`op: … ? "publish" : "upsert"`). E a treia oara in doua
-- zile cand o proba verde apara alegerea care strica invariantul.
--
-- Coada primeste o operatie adevarata: `status`. Lucratorul citeste `status_dorit` de pe listare si
-- cheama aceeasi masina de stari, cu aceeasi generatie.

alter table public.aboutyou_sync_queue drop constraint if exists aboutyou_sync_queue_op_check;
alter table public.aboutyou_sync_queue add constraint aboutyou_sync_queue_op_check
  CHECK ((op = ANY (ARRAY['upsert'::text, 'delete'::text, 'publish'::text, 'stock'::text,
                          'price'::text, 'ship'::text, 'status'::text])));

-- ═══════════════════════════════════════════════════════════════════════════
-- SI MAPAREA SKU NU MOARE ODATA CU LISTAREA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA
--
-- `reconciliazaVariante` are scris, negru pe alb, ca randul de varianta NU se sterge NICIODATA —
-- fiindca e singura urma a maparii `sku -> product_id + variant_title`, iar `orders.ts` o
-- foloseste ca sa lege o comanda de produs si sa scada stocul combinatiei. Sters, o comanda sosita
-- pe acel SKU intra cu `product_id` null si fara nicio scadere de stoc.
--
-- Si totusi `stergeListare` face `DELETE FROM aboutyou_listings`, iar `aboutyou_variants.listing_id`
-- e `ON DELETE CASCADE`. Deci exact ce spunea comentariul ca nu se intampla, se intampla — pentru
-- toate variantele deodata:
--
--     10:00 clientul comanda SKU X
--     webhook intarziat / inbox indisponibil
--     10:02 comerciantul apasa „Elimina" -> listarea si toate variantele dispar
--     10:05 comanda ajunge -> SKU X necunoscut -> stocul NU se scade
--
-- ⚠ MAPAREA E ISTORIE, NU STARE. Nu tine de faptul ca produsul mai e sau nu listat: tine de faptul
-- ca s-a vandut candva cu SKU-ul ala. De-aia se muta intr-un tabel propriu inainte de stergere, si
-- nu se sterge niciodata odata cu listarea.

create table if not exists public.aboutyou_sku_istoric (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sku text not null,
  product_id uuid,
  variant_title text,
  scos_la timestamp with time zone default now() not null,
  -- Acelasi SKU poate fi listat si retras de mai multe ori; ultima mapare o inlocuieste pe cea
  -- veche, fiindca ea e cea dupa care se leaga o comanda sosita acum.
  unique (business_id, sku)
);

comment on table public.aboutyou_sku_istoric is
  'Maparea sku -> product_id/variant_title pastrata dupa ce listarea About You a fost eliminata. Comenzile intarziate se leaga de aici, ca sa scada stocul corect.';

create index if not exists aboutyou_sku_istoric_cautare_idx
  on public.aboutyou_sku_istoric (business_id, sku);

alter table public.aboutyou_sku_istoric enable row level security;

drop policy if exists owner_select_aboutyou_sku_istoric on public.aboutyou_sku_istoric;
create policy owner_select_aboutyou_sku_istoric on public.aboutyou_sku_istoric
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SI SEMNUL NU SE SCRIE PENTRU O LISTARE CARE N-A PLECAT NICIODATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Declansatoarele de pe `aboutyou_listings` / `aboutyou_variants` scriau semnul la orice editare.
-- Dar pentru o listare care n-a ajuns niciodata la ei, o editare nu are ce sa „nu ajunga": nu e
-- nimic de recuperat, iar plasa ar fi TRIMIS un produs pe care comerciantul doar il pregatea.
-- Plasa repara ce s-a stricat; nu porneste ce n-a fost cerut.
--
-- ⚠ TRIMITEREA DE LA PRIMA SALVARE nu se sprijina pe declansatorul asta, ci pe actiunea de server
-- care scrie semnul ea insasi cand omul a apasat „Salveaza si trimite" — vezi
-- `saveAboutYouListing`. Declansatoarele raman ca plasa pentru orice ALTA cale care ar atinge
-- randurile (un script, o migrare de date).

create or replace function public.aboutyou_marcheaza_listarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.product_id is null or new.remote_poate_exista is not true then
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

-- ⚠ Varianta n-are `remote_poate_exista`: se intreaba listarea ei.
create or replace function public.aboutyou_marcheaza_varianta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.product_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.aboutyou_listings l
     where l.id = new.listing_id and l.remote_poate_exista
  ) then
    return new;
  end if;
  insert into public.aboutyou_intentii (business_id, product_id, op)
  values (new.business_id, new.product_id, 'upsert')
  on conflict (business_id, product_id, op)
  do update set creat_la = now(), recuperari = 0, status = 'deschis', last_error = null;
  return new;
end;
$$;

revoke execute on function public.aboutyou_marcheaza_varianta() from public;

drop trigger if exists aboutyou_marcheaza_varianta on public.aboutyou_variants;

-- ⚠ SI `INSERT`, NU DOAR `UPDATE`. Salvarea reala din editor trece prin `aboutyou_salveaza_variante`,
-- care face DELETE + INSERT — nu exista niciun UPDATE, deci declansatorul de pana acum nu rula
-- NICIODATA pe calea normala. Proba il verifica pe coloane, nu pe calea reala: al treilea test verde
-- peste un drum care nu se executa.
create trigger aboutyou_marcheaza_varianta
  after insert or update of sku, ean, size_id, second_size_id, color_id, quantity,
                            retail_price_eur, sale_price_eur, enabled
  on public.aboutyou_variants
  for each row
  execute function public.aboutyou_marcheaza_varianta();

notify pgrst, 'reload schema';
