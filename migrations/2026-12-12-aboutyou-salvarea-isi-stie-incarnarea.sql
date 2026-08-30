-- ═══════════════════════════════════════════════════════════════════════════
-- SALVAREA ISI STIE INCARNAREA, SI ISI VERIFICA REGULA SUB INCUIETOARE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, noaptea)
--
-- Ieri am legat schimbarile de stare de RANDUL de la care au pornit. Salvarea a ramas pe dinafara,
-- si prin ea intrau doua lucruri deodata.
--
-- ═══ 1. O SALVARE VECHE PUTEA INVIA O LISTARE TOCMAI ELIMINATA ═══
--
--     `saveAboutYouListing` citeste listarea L1 si merge mai departe
--     (citeste variantele, cauta coliziuni de SKU, cauta in istoric — patru drumuri la baza)
--     intre timp: scoaterea se incheie -> `inactive` la ei -> piatra -> L1 STEARSA
--     salvarea ajunge la RPC: nu mai gaseste nimic dupa (business_id, style_key)
--     -> intra pe ramura de CREARE -> insereaza L2
--     iar daca omul apasase „Salvează și trimite", produsul pleaca din nou la ei ❌
--
-- ⚠ O ACTIUNE PORNITA CA „ACTUALIZEAZA" N-ARE VOIE SA SE FACA „CREEAZA" PE DRUM. Crearea ramane
-- ingaduita numai unei salvari care a inceput chiar in lipsa unei listari.
--
-- ═══ 2. REGULA IMUTABILITATII SE VERIFICA INTR-UN LOC SI SE SCRIA IN ALTUL ═══
--
-- „Categoria si marimea nu se mai schimba dupa aprobare" se citea in TypeScript, cu cateva cereri
-- inaintea scrierii. In fereastra aia, cronul apuca sa mute statusul:
--
--     salvarea citeste: status `pending_approval` -> regula ingaduie schimbarea
--     About You aproba produsul; reconcilierea scrie `active`
--     salvarea ajunge la RPC si scrie categoria noua
--     -> la ei categoria aprobata veche, la noi cea noua ❌
--
-- Adica exact starea pe care regula exista ca s-o impiedice.
--
-- ⚠ LEACUL NU E O VERIFICARE MAI BUNA, CI ACELASI LOC. Mutata in RPC, sub `for update` pe randul
-- de listare, nu mai are fereastra: scrierea cronului asteapta la aceeasi incuietoare. Si se
-- STERGE din TypeScript, ca sa nu ramana doua liste care se pot departa tacut.
--
-- ═══ FARA FEREASTRA INTRE MIGRATIE SI DESFASURARE ═══
--
-- ⚠ Parametrul nou are IMPLICIT `null`, iar semnatura veche se sterge in aceeasi tranzactie.
-- Masurat pe baza adevarata: PostgREST alege functia dupa cheile din corpul JSON, iar un apel cu
-- cinci chei nimereste varianta cu sase si primeste implicitul. Deci codul care ruleaza in clipa
-- migratiei se poarta exact ca inainte, si nu ramane o a doua semnatura pe care s-o uite cineva.

drop function if exists public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb);

create or replace function public.aboutyou_salveaza_listarea(
  p_business_id uuid,
  p_style_key text,
  p_product_id uuid,
  p_campuri jsonb,
  p_randuri jsonb,
  /*
   * Incarnarea de la care a pornit salvarea: `aboutyou_listings.id`, asa cum l-a citit apelantul.
   *
   * ⚠ `null` inseamna „am inceput fara listare", si numai atunci se poate crea una.
   */
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
  v_gen integer;
  v_nou boolean := false;
  v_chei text;
  v_straina text;
  v_sku text;
  v_variante jsonb;
  /*
   * ⚠ Starile in care produsul e APROBAT la ei, deci categoria si marimea nu se mai pot schimba.
   * `draft`, `pending_approval`, `rejected` si `problem` lipsesc DINADINS: acolo comerciantul inca
   * trebuie sa poata repara ce l-au respins. O regula care refuza si reparatia ar fi o usa
   * incuiata fara clanta.
   */
  c_aprobate constant text[] := array['active', 'published', 'pending_active', 'inactive'];
begin
  select id, status, category_id into v_id, v_status, v_categorie
    from public.aboutyou_listings
   where business_id = p_business_id and style_key = p_style_key
     for update;

  if found then
    /* ⚠ RANDUL E INCARNAREA: sters si refacut, are alt `id`, desi `style_key` e acelasi. */
    if p_listare_asteptata is not null and v_id <> p_listare_asteptata then
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

    if v_id is null then
      /*
       * ⚠ O A DOUA SALVARE A ACELUIASI PRODUS a creat randul intre timp. Nu e o eroare: se scrie
       * peste el ca la o listare existenta — si atunci regula de mai jos i se aplica si lui.
       */
      select id, status, category_id into v_id, v_status, v_categorie
        from public.aboutyou_listings
       where business_id = p_business_id and style_key = p_style_key
         for update;
      if not found then
        return jsonb_build_object('stare', 'lipsa');
      end if;
    else
      v_nou := true;
      v_status := 'local';
      v_categorie := null;
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- REGULA IMUTABILITATII, SUB ACEEASI INCUIETOARE CU SCRIEREA
  -- ═══════════════════════════════════════════════════════════════════════
  if v_status = any(c_aprobate) then
    /*
     * ⚠ Se opreste numai o SCHIMBARE. O categorie nescrisa inca (null la noi) sau necerută (null
     * in cerere) nu e o schimbare — la fel ca in verificarea de dinainte, pe care o inlocuieste.
     */
    if v_categorie is not null
       and (p_campuri->>'category_id') is not null
       and (p_campuri->>'category_id')::integer <> v_categorie then
      return jsonb_build_object('stare', 'categorie-blocata');
    end if;

    /*
     * ⚠ Marimea se compara PE SKU, nu pe pozitie: variantele se pot reordona intre doua deschideri
     * ale editorului, iar comparate pe indice ar fi parut schimbate toate.
     *
     * ⚠ Si numai variantele care EXISTA deja: una noua n-are ce sa incalce. La fel, una a carei
     * marime veche e nescrisa (`size_id` null) n-a fost niciodata aprobata cu o marime.
     */
    select r->>'sku' into v_sku
      from jsonb_array_elements(p_randuri) as r
      join public.aboutyou_variants v
        on v.listing_id = v_id and v.sku = r->>'sku'
     where v.size_id is not null
       and (v.size_id is distinct from (r->>'size_id')::integer
         or v.second_size_id is distinct from (r->>'second_size_id')::integer)
     limit 1;
    if v_sku is not null then
      return jsonb_build_object('stare', 'marime-blocata', 'sku', v_sku);
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ABIA ACUM SCRIERILE
  -- ═══════════════════════════════════════════════════════════════════════
  /*
   * ⚠ `status` NU E NICIODATA IN `p_campuri`, si de-aia nici nu se atinge la actualizare: o
   * listare deja activa pe About You, editata si resalvata, n-are voie sa se intoarca la „local".
   * Statusul se scrie o singura data, la nastere, mai sus.
   */
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

notify pgrst, 'reload schema';
