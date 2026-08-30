-- ═══════════════════════════════════════════════════════════════════════════
-- CARE MARIME E BLOCATA NU POATE FI „ORICARE"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, noaptea tarziu)
--
-- Regula mutata ieri in SQL numea SKU-ul vinovat cu `limit 1` FARA `order by`. Postgres n-are
-- nicio datorie sa intoarca acelasi rand de doua ori, deci:
--
--     comerciantul schimba marimea la trei variante aprobate
--     salvarea e oprita si i se spune de una din ele — nu neaparat prima de pe ecran
--     o repara, apasa iar, si afla de urmatoarea
--     o scara pe care o urca in alta ordine decat cea pe care o vede
--
-- Bucla veche din TypeScript mergea prin variante in ordinea de pe ecran si numea prima. Nu e o
-- diferenta de corectitudine, e una de rabdare — dar tocmai rabdarea o cheltuie comerciantul.
--
-- ⚠ SE NUMESC TOATE, nu doar prima, si in ordine. Trei drumuri prin editor pentru trei marimi e
-- exact felul de refuz care il face pe om sa creada ca aplicatia se joaca cu el.
--
-- ⚠ SI FISIERUL SE INCADREAZA IN TRANZACTIE. `drop` + `create` fara `begin`/`commit` lasa, pe un
-- rulator cu autocommit, o clipa in care functia NU EXISTA — iar in clipa aia fiecare salvare din
-- tot magazinul cade cu `PGRST202`. Migratia de ieri a mers, dar a mers din noroc.

begin;

drop function if exists public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb, uuid);

create or replace function public.aboutyou_salveaza_listarea(
  p_business_id uuid,
  p_style_key text,
  p_product_id uuid,
  p_campuri jsonb,
  p_randuri jsonb,
  /*
   * Incarnarea de la care a pornit salvarea: `aboutyou_listings.id`, asa cum l-a vazut OMUL cand
   * i s-a deschis editorul — nu cum il reciteste serverul cu trei cereri inainte.
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
  v_skuri text[];
  v_variante jsonb;
  /*
   * ⚠ Starile in care produsul e APROBAT la ei, deci categoria si marimea nu se mai pot schimba.
   * `draft`, `pending_approval`, `rejected` si `problem` lipsesc DINADINS: acolo comerciantul inca
   * trebuie sa poata repara ce l-au respins. O regula care refuza si reparatia ar fi o usa
   * incuiata fara clanta.
   *
   * ⚠ ACEEASI LISTA E SI IN TypeScript, la avertismentul din editor — care nu poate chema functia
   * asta, fiindca el doar prezice, nu scrie. Cele doua se pot departa tacut, deci o proba le
   * confrunta: vezi `dupa-aprobare-si-reasertare.test.ts`.
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
     *
     * ⚠ Si nu se retrage pe calea `do nothing` de mai jos: o salvare care pierde cursa arde o
     * generatie. Ceasul e monoton, deci o generatie arsa nu strica nimic — doar nu e gratis.
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
       * peste el ca la o listare existenta — si atunci regula de mai jos i se aplica si lui, de-aia
       * se recitesc si `status`, si `category_id`.
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
     * in cerere) nu e o schimbare — la fel ca in verificarea din TypeScript, pe care o inlocuieste.
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
      return jsonb_build_object('stare', 'marime-blocata', 'skuri', to_jsonb(v_skuri));
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

commit;

notify pgrst, 'reload schema';
