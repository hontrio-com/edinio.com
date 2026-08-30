-- ═══════════════════════════════════════════════════════════════════════════
-- „A FOST APROBAT VREODATA" NU SE POATE CITI DIN STAREA DE ACUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (29.08.2026, dimineata)
--
-- Regula imutabilitatii intreba `status = any(array['active','published','pending_active',
-- 'inactive'])`. Adica deducea o intamplare din TRECUT dintr-o valoare care se schimba mereu.
--
-- ═══ 1. UN PRODUS APROBAT CARE CADE PE `error` REDEVINE EDITABIL ═══
--
--     produsul e `active` la ei, aprobat, cu categoria 1234
--     o actualizare de mai tarziu pica -> scriem `status = 'error'` (unsprezece locuri o fac)
--     `error` nu e in lista -> regula TACE
--     comerciantul schimba categoria si marimile, iar la ei raman cele aprobate ❌
--
-- Si nu e o cale de colt: `syncProductNow` scrie `error` la fiecare trimitere care nu reuseste.
--
-- ⚠ La fel `problem`, care la ei inseamna chiar „a fost activ si s-a stricat dupa o modificare" —
-- deci un produs `problem` e in mod vadit aprobat, si tot lipsea din lista.
--
-- ═══ LEACUL: SE TINE MINTE, NU SE DEDUCE ═══
--
-- `aprobat_odata` se aprinde cand starea trece prin oricare din starile care DOVEDESC ca produsul
-- a trecut de aprobarea lor, si NU se mai stinge niciodata. O intamplare din trecut se scrie o
-- data; o stare de acum se rescrie de zeci de ori pe zi.
--
-- ⚠ SE APRINDE INTR-UN DECLANSATOR, nu in codul care scrie starea. Statusul se scrie din
-- unsprezece locuri in `sync.ts`, plus reconcilierea, plus loturile — iar o regula pusa in
-- unsprezece locuri e o regula uitata intr-unul din ele.
--
-- ═══ 2. SI CAT TIMP ASTEPTAM VERDICTUL, NU STIM IN CE LUME SUNTEM ═══
--
--     salvam categoria noua cat produsul e `pending_approval`
--     ei aproba produsul intre timp
--     cererea noastra de retragere in ciorna ajunge prea tarziu — dupa aprobare n-o mai accepta
--     la ei: categoria veche, aprobata. La noi: cea noua ❌
--
-- ⚠ Deci `pending_approval` si `draft_pending` se blocheaza si ele. Nu fiindca produsul ar fi
-- aprobat, ci fiindca NU STIM INCA — iar o hotarare luata acum poate fi dezmintita peste o clipa.
-- Blocarea e trecatoare si are iesire scrisa: dupa verdict, un produs respins se poate repara.

begin;

alter table public.aboutyou_listings
  add column if not exists aprobat_odata boolean not null default false;

comment on column public.aboutyou_listings.aprobat_odata is
  'S-a aflat vreodata intr-o stare care dovedeste aprobarea la About You. Se aprinde din declansator si nu se mai stinge: categoria si marimile devin imuabile de-atunci.';

/*
 * ⚠ SI CELE DE ACUM SE MARCHEAZA. Fara pasul asta, orice listare aprobata dinaintea migratiei ar
 * porni cu `false` si ar ramane editabila pana la urmatoarea trecere prin aceleasi stari — adica
 * exact gaura pe care o inchidem, lasata deschisa pentru cei care o au deja.
 */
update public.aboutyou_listings
   set aprobat_odata = true
 where status in ('active', 'published', 'pending_active', 'inactive', 'problem');

create or replace function public.aboutyou_marcheaza_aprobarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * ⚠ NUMAI IN SUS. Un produs care a fost aprobat si azi e `error` a fost aprobat si ieri, si va
   * fi fost aprobat si maine. Semnul asta nu se stinge nici din reconciliere, nici din vreo
   * scriere de stare — de-aia nici nu se uita la `old`.
   */
  if new.status in ('active', 'published', 'pending_active', 'inactive', 'problem') then
    new.aprobat_odata := true;
  end if;
  return new;
end;
$$;

revoke all on function public.aboutyou_marcheaza_aprobarea() from public, anon, authenticated;

drop trigger if exists trg_aboutyou_marcheaza_aprobarea on public.aboutyou_listings;
create trigger trg_aboutyou_marcheaza_aprobarea
  before insert or update of status on public.aboutyou_listings
  for each row execute function public.aboutyou_marcheaza_aprobarea();

-- ═══════════════════════════════════════════════════════════════════════════
-- SI SALVAREA: REGULA CITESTE SEMNUL, IAR `null` INSEAMNA STRICT „N-A EXISTAT"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ A DOUA GAURA: `p_listare_asteptata = null` inseamna „editorul s-a deschis fara listare". Dar
-- daca pana la salvare CHIAR a aparut una, o acceptam si scriam peste ea:
--
--     fila A: deschide editorul, nu exista listare -> incarnare = null
--     fila B: creeaza listarea L1, o completeaza, o trimite
--     fila A: sta zece minute, apoi „Salvează"
--     -> RPC-ul gaseste L1, dar nu verifica nimic, si SCRIE PESTE ea ❌
--
-- Adica exact semantica pe care o introdusesem, contrazisa de propriul cod: o actiune pornita in
-- lumea „nu exista listare" n-are ce cauta intr-una in care exista.

drop function if exists public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb, uuid);

create or replace function public.aboutyou_salveaza_listarea(
  p_business_id uuid,
  p_style_key text,
  p_product_id uuid,
  p_campuri jsonb,
  p_randuri jsonb,
  p_listare_asteptata uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text;
  v_categorie integer;
  v_aprobat boolean;
  v_gen integer;
  v_nou boolean := false;
  v_chei text;
  v_straina text;
  v_skuri text[];
  v_variante jsonb;
  /*
   * ⚠ Starile in care nu stim inca in ce lume suntem: am cerut ceva si asteptam raspunsul lor.
   * Blocarea e trecatoare — dupa verdict, un produs respins se poate repara.
   */
  c_in_asteptare constant text[] := array['pending_approval', 'draft_pending'];
begin
  select id, status, category_id, aprobat_odata
    into v_id, v_status, v_categorie, v_aprobat
    from public.aboutyou_listings
   where business_id = p_business_id and style_key = p_style_key
     for update;

  if found then
    /*
     * ⚠ `null` INSEAMNA STRICT „N-A EXISTAT NICIUNA", nu „oricare merge". O fila deschisa cand nu
     * exista listare n-are ce cauta peste una nascuta intre timp.
     */
    if p_listare_asteptata is null or v_id <> p_listare_asteptata then
      return jsonb_build_object('stare', 'depasit');
    end if;
  else
    /* ⚠ A pornit de la o listare care intre timp a fost ELIMINATA: nu se creeaza alta in locul ei. */
    if p_listare_asteptata is not null then
      return jsonb_build_object('stare', 'depasit');
    end if;

    /*
     * ⚠ CEASUL SE AVANSEAZA INAINTE CA RANDUL NOU SA EXISTE (2026-12-09). Nemiscat, un lot de
     * scoatere ramas deschis din viata dinainte ar gasi acelasi numar si ar sterge listarea noua.
     */
    v_gen := public.aboutyou_ceas_urmator(p_business_id, p_style_key, null);

    insert into public.aboutyou_listings
      (business_id, product_id, style_key, status, status_generatie)
    values (p_business_id, p_product_id, p_style_key, 'local', v_gen)
    on conflict (business_id, style_key) do nothing
    returning id into v_id;

    /*
     * ⚠ SI CURSA PIERDUTA LA INSERT E TOT „DEPASIT". Alta salvare a creat randul intre timp;
     * a scrie peste el ar fi acelasi lucru cu a scrie peste unul aparut intre timp, doar cu
     * cateva milisecunde mai devreme.
     */
    if v_id is null then
      return jsonb_build_object('stare', 'depasit');
    end if;
    v_nou := true;
    v_status := 'local';
    v_categorie := null;
    v_aprobat := false;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- REGULA IMUTABILITATII, SUB ACEEASI INCUIETOARE CU SCRIEREA
  -- ═══════════════════════════════════════════════════════════════════════
  /*
   * ⚠ SE CITESTE SEMNUL, NU STAREA DE ACUM. `status` se rescrie de zeci de ori pe zi — inclusiv
   * pe `error`, dintr-unsprezece locuri — iar „a fost aprobat" e o intamplare din trecut, care nu
   * se poate deduce dintr-o valoare de acum.
   */
  if v_aprobat or v_status = any(c_in_asteptare) then
    /*
     * ⚠ Se opreste numai o SCHIMBARE. O categorie nescrisa inca (null la noi) sau necerută (null
     * in cerere) nu e o schimbare.
     */
    if v_categorie is not null
       and (p_campuri->>'category_id') is not null
       and (p_campuri->>'category_id')::integer <> v_categorie then
      return jsonb_build_object('stare', 'categorie-blocata', 'asteptam', v_aprobat is not true);
    end if;

    /*
     * ⚠ Marimea se compara PE SKU, nu pe pozitie: variantele se pot reordona intre doua deschideri
     * ale editorului, iar comparate pe indice ar fi parut schimbate toate.
     *
     * ⚠ Si numai variantele care EXISTA deja: una noua n-are ce sa incalce. La fel, una a carei
     * marime veche e nescrisa (`size_id` null) n-a fost niciodata aprobata cu o marime.
     *
     * ⚠ SE NUMESC TOATE, IN ORDINE. `limit 1` fara `order by` numea oricare — iar comerciantul
     * urca scara reparatiilor in alta ordine decat cea de pe ecran.
     */
    select array_agg(distinct v.sku order by v.sku) into v_skuri
      from jsonb_array_elements(p_randuri) as r
      join public.aboutyou_variants v
        on v.listing_id = v_id and v.sku = r->>'sku'
     where v.size_id is not null
       and (v.size_id is distinct from (r->>'size_id')::integer
         or v.second_size_id is distinct from (r->>'second_size_id')::integer);
    if v_skuri is not null and array_length(v_skuri, 1) > 0 then
      return jsonb_build_object(
        'stare', 'marime-blocata', 'skuri', to_jsonb(v_skuri), 'asteptam', v_aprobat is not true);
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ABIA ACUM SCRIERILE
  -- ═══════════════════════════════════════════════════════════════════════
  select string_agg(quote_ident(k), ', ') into v_chei
    from jsonb_object_keys(p_campuri) as k;
  if v_chei is null then
    return jsonb_build_object('stare', 'fara-campuri');
  end if;

  /* ⚠ O cheie care nu e coloana opreste salvarea. Tacuta, ar fi o scriere care pare facuta. */
  select k into v_straina
    from jsonb_object_keys(p_campuri) as k
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'aboutyou_listings'
        and c.column_name = k
   )
   limit 1;
  if v_straina is not null then
    raise exception 'camp necunoscut pe aboutyou_listings: %', v_straina;
  end if;

  execute format(
    'update public.aboutyou_listings set (%s) = '
    || '(select %s from jsonb_populate_record(null::public.aboutyou_listings, $1)) where id = $2',
    v_chei, v_chei)
  using p_campuri, v_id;

  /* Variantele, in aceeasi tranzactie: ori se schimba tot, ori nimic. */
  v_variante := public.aboutyou_salveaza_variante(p_business_id, v_id, p_randuri);

  return jsonb_build_object(
    'stare', 'scris', 'listing_id', v_id, 'nou', v_nou, 'variante', v_variante);
end;
$$;

revoke all on function public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- SI CEASUL RECONCILIERII SE IA DE LA BAZA, NU DE LA NODE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Paza reconcilierii compara `created_at` — scris de Postgres — cu o clipa luata din Node. Doua
-- ceasuri deosebite. Amandoua sunt sincronizate cu NTP si abaterea obisnuita e sub o sutime, mult
-- sub fereastra pe care o aparam; dar o paza care se bizuie pe potrivirea a doua ceasuri e o paza
-- cu o presupunere ascunsa in ea. Aici presupunerea nu costa nimic sa fie scoasa.

create or replace function public.ceasul_bazei()
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$ select now() $$;

revoke all on function public.ceasul_bazei() from public, anon, authenticated;
grant execute on function public.ceasul_bazei() to service_role;

commit;

notify pgrst, 'reload schema';
