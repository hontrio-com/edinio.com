-- ═══════════════════════════════════════════════════════════════════════════
-- UN LOT LA EI NU E O OPERATIE DE-A NOASTRA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, noaptea tarziu)
--
-- Runda trecuta am tratat deduplicarea lor asa: daca About You intoarce un `batchRequestId` pe care
-- il avem deja, si felul si cheile se potrivesc, stergem randul nou si spunem „urmarit". Suna
-- rezonabil si e gresit in fond: `batchRequestId` identifica LOTUL LOR, nu operatia NOASTRA.
--
--     GEN 5, payload X -> lotul XYZ, `citit_la` T1
--     GEN 6, acelasi payload -> ei dedupliceaza, tot XYZ
--     noi stergem randul GEN 6 si spunem ca e urmarit
--
-- Numai ca operatia GEN 6 nu mai exista nicaieri: n-are cine sa-i confirme `citit_la` T2, iar daca
-- XYZ era deja `completed`, nici nu se mai sondeaza (selectia ia doar
-- `pending/processing/retry/stalled`). Publicarea nu mai porneste, confirmarile nu mai avanseaza,
-- iar cutia de iesire retrimite pana la prag si apoi striga degeaba.
--
-- ⚠ SI CHIAR CODUL NOSTRU O SPUNE: `operatiaSAIncheiat` foloseste `citit_la` drept identitate a
-- operatiei logice. Deduplicarea de ieri o ignora tocmai pe ea.
--
-- ═══ LEACUL E SA NU MAI CONFUNDAM CELE DOUA IDENTITATI ═══
--
-- Un lot al lor poate sta la temelia mai multor operatii de-ale noastre. Deci constrangerea unica
-- pica, si ramane un index obisnuit: fiecare operatie isi tine randul ei, cu generatia, clipa de
-- citire si numarul de transe proprii, si se aseaza singura. Ruta de rezultate se poate citi de
-- oricate ori — un lot `completed` intors a doua oara da acelasi raspuns.
--
-- ⚠ COSTA O CERERE IN PLUS pe operatia duplicata. Alternativa — doua tabele, unul pentru loturile
-- lor si unul pentru operatiile noastre — e mai curata pe hartie si cere rescris tot ce sondeaza,
-- tot ce aseaza si tot ce numara frati. Pretul nu merita: o cerere la o coincidenta rara, fata de
-- o rescriere a intregii masinarii de loturi.

alter table public.aboutyou_batches
  drop constraint if exists aboutyou_batches_business_id_batch_request_id_key;

-- ⚠ Ramane INDEX, nu constrangere: sondarea si asezarea cauta dupa el des.
create index if not exists aboutyou_batches_request_idx
  on public.aboutyou_batches (business_id, batch_request_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SI CEASUL STARII E UNUL SINGUR, PE CHEIA DE STIL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: generatia starii statea in DOUA locuri — pe listare si pe piatra de mormant — iar
-- alocarea la relistare era citit-calculeaza-scrie:
--
--     piatra = generatia 5
--     un lot vechi reactiveaza produsul -> reasertarea vrea generatia 6
--     in acelasi timp omul relisteaza   -> citeste piatra 5, creeaza listarea cu 6
--     cele doua operatii au ACEEASI generatie
--     cand reasertarea se incheie: 6 < 6 e fals -> e socotita curenta -> sterge listarea NOUA
--
-- ⚠ CEASUL APARTINE CHEII DE STIL, nu randului — chiar asa scrie si comentariul de ieri, dar
-- implementarea tinea doua ceasuri. Aici e unul singur, si se cere ATOMIC. Doua operatii
-- concurente nu mai pot primi niciodata acelasi numar.

create table if not exists public.aboutyou_ceas_stare (
  business_id uuid not null,
  style_key text not null,
  generatie integer default 0 not null,
  -- Ultima stare ceruta de om. Supravietuieste stergerii listarii, deci reasertarea stie ce sa ceara.
  dorit text,
  actualizat_la timestamp with time zone default now() not null,
  primary key (business_id, style_key)
);

comment on table public.aboutyou_ceas_stare is
  'Ceasul starii, unul singur pe cheia de stil About You. Publicarea, dezactivarea, ciorna, scoaterea, reasertarea si relistarea cer toate de aici, atomic: doua operatii concurente nu pot primi acelasi numar.';

alter table public.aboutyou_ceas_stare enable row level security;

drop policy if exists owner_select_aboutyou_ceas_stare on public.aboutyou_ceas_stare;
create policy owner_select_aboutyou_ceas_stare on public.aboutyou_ceas_stare
  for select using (
    business_id in (
      select businesses.id from public.businesses
       where businesses.user_id = (select auth.uid())
    )
  );

-- ⚠ Umplut din ce stim: ce e mai mare intre listare si piatra. Pornit de la zero, un lot vechi din
-- viata dinainte n-ar mai fi recunoscut ca depasit.
insert into public.aboutyou_ceas_stare (business_id, style_key, generatie, dorit)
select l.business_id, l.style_key, greatest(l.status_generatie, 0), l.status_dorit
  from public.aboutyou_listings l
on conflict (business_id, style_key) do nothing;

insert into public.aboutyou_ceas_stare (business_id, style_key, generatie)
select s.business_id, s.style_key, s.status_generatie
  from public.aboutyou_listari_scoase s
on conflict (business_id, style_key)
do update set generatie = greatest(public.aboutyou_ceas_stare.generatie, excluded.generatie);

/*
 * Numarul urmator, cerut atomic.
 *
 * ⚠ `on conflict do update … returning` intoarce valoarea NOUA, scrisa sub incuietoarea randului.
 * Doua cereri simultane se serializeaza si primesc numere diferite — chiar asta se probeaza.
 */
create or replace function public.aboutyou_ceas_urmator(
  p_business_id uuid, p_style_key text, p_dorit text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gen integer;
begin
  insert into public.aboutyou_ceas_stare (business_id, style_key, generatie, dorit)
  values (p_business_id, p_style_key, 1, p_dorit)
  on conflict (business_id, style_key)
  do update set generatie = public.aboutyou_ceas_stare.generatie + 1,
                dorit = p_dorit,
                actualizat_la = now()
  returning generatie into v_gen;

  -- Oglinda de pe listare, cat timp exista: codul care o citeste azi continua sa mearga.
  update public.aboutyou_listings
     set status_generatie = v_gen, status_dorit = p_dorit
   where business_id = p_business_id and style_key = p_style_key;

  return v_gen;
end;
$$;

revoke execute on function public.aboutyou_ceas_urmator(uuid, text, text) from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- SI SCOATEREA SE INCHEIE INTR-O SINGURA TRANZACTIE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA: verificarea „mai e scoaterea cea mai noua?" si stergerea listarii erau doua
-- operatii separate. Intre ele incape o cerere noua:
--
--     ceasul 6, lotul de scoatere 6
--     citim: 6 < 6 e fals -> avem voie sa stergem
--     ⟵ AICI omul apasa „Publica" -> ceasul 7, lotul pleaca
--     scriem piatra si STERGEM listarea
--     la ei: publicat. La noi: nimic.
--
-- ⚠ Verificarea si stergerea trebuie sa fie acelasi lucru. Aici se incuie randul de ceas, se
-- compara sub incuietoare, si abia atunci se scrie si se sterge — sau nu se face nimic.
--
-- ⚠ SI MAPAREA SKU SE MUTA TOT AICI, in aceeasi tranzactie: `aboutyou_variants.listing_id` e
-- `ON DELETE CASCADE`, deci pastrarea ei nu are voie sa fie o scriere separata care poate lipsi.

create or replace function public.aboutyou_incheie_scoaterea(
  p_business_id uuid, p_style_key text, p_generatie integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ceas integer;
  v_listing uuid;
  v_product uuid;
begin
  select generatie into v_ceas
    from public.aboutyou_ceas_stare
   where business_id = p_business_id and style_key = p_style_key
     for update;

  -- Fara ceas nu se poate dovedi nimic: mai bine se reia decat sa se stearga orbeste.
  if not found then
    return 'fara-ceas';
  end if;

  -- ⚠ S-a cerut altceva intre timp: scoaterea nu mai are dreptul sa stearga.
  if p_generatie is null or p_generatie < v_ceas then
    return 'depasit';
  end if;

  select id, product_id into v_listing, v_product
    from public.aboutyou_listings
   where business_id = p_business_id and style_key = p_style_key
     for update;
  if not found then
    return 'lipsa';
  end if;

  -- Maparea SKU, pastrata inaintea cascadei.
  insert into public.aboutyou_sku_istoric (business_id, sku, product_id, variant_title, scos_la)
  select v.business_id, v.sku, v.product_id, v.variant_title, now()
    from public.aboutyou_variants v
   where v.listing_id = v_listing
  on conflict (business_id, sku)
  do update set product_id = excluded.product_id,
                variant_title = excluded.variant_title,
                scos_la = excluded.scos_la;

  -- Piatra de mormant, cu contor NOU: un incident nou nu mosteneste bugetul celui vechi.
  insert into public.aboutyou_listari_scoase
    (business_id, style_key, product_id, status_generatie, scos_la, reasertari)
  values (p_business_id, p_style_key, v_product, v_ceas, now(), 0)
  on conflict (business_id, style_key)
  do update set product_id = excluded.product_id,
                status_generatie = excluded.status_generatie,
                scos_la = excluded.scos_la,
                reasertari = 0;

  delete from public.aboutyou_listings where id = v_listing;
  return 'sters';
end;
$$;

revoke execute on function public.aboutyou_incheie_scoaterea(uuid, text, integer) from public;

notify pgrst, 'reload schema';
