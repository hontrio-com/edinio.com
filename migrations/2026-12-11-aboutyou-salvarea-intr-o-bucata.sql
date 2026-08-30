-- ═══════════════════════════════════════════════════════════════════════════
-- LISTAREA SI VARIANTELE SE SCRIU IMPREUNA SAU DELOC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, seara)
--
-- Salvarea din editor scria in doua randuri: intai randul de listare, apoi variantele, prin doua
-- cereri. Intre ele incape orice — un hop de-o clipa, o pana, o repornire:
--
--     randul de listare se scrie cu categoria, brandul si compozitia noi ✅
--     `aboutyou_salveaza_variante` PICA ❌
--     comerciantul citeste „Eroare la salvarea variantelor"
--     dar jumatate din ce a scris E SALVATA, iar variantele au ramas cele vechi
--
-- Si e chiar calea cea mai folosita din toata integrarea: fiecare apasare pe „Salvează".
--
-- ⚠ VERIFICARILE S-AU MUTAT DEJA INAINTEA SCRIERII (vezi `salvarea-nu-lasa-jumatati.test.ts`),
-- deci o salvare RESPINSA nu mai atinge nimic. Ce ramanea era jumatatea de dupa: o salvare
-- ACCEPTATA care se rupe la mijloc. Asta o inchide.
--
-- ═══ CUM ═══
--
-- Un singur RPC, deci o singura tranzactie. Nu-si scrie singur nici ceasul, nici variantele:
-- cheama functiile care fac deja lucrurile astea, in aceeasi tranzactie. Asa nu se dubleaza nici
-- lista de coloane a variantelor, nici socoteala ceasului — si nu apare o a doua cale prin care
-- se poate misca starea, pe care sa n-o mai pazeasca nimeni.
--
-- ⚠ SI CAMPURILE DE PE LISTARE SE SCRIU FARA SA FIE NUMITE AICI. Numite, lista din SQL si cea din
-- TypeScript ar incepe sa se departeze tacut la prima coloana adaugata — chiar tiparul care ne-a
-- costat o zi la `page_sections`. Cu `jsonb_populate_record` peste tipul tabelei, numele si
-- tipurile vin de la tabela insasi, iar o cheie inventata opreste salvarea in loc s-o taca.

create or replace function public.aboutyou_salveaza_listarea(
  p_business_id uuid,
  p_style_key text,
  p_product_id uuid,
  p_campuri jsonb,
  p_randuri jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_gen integer;
  v_nou boolean := false;
  v_chei text;
  v_straina text;
  v_variante jsonb;
begin
  select id into v_id from public.aboutyou_listings
   where business_id = p_business_id and style_key = p_style_key
     for update;

  if not found then
    /*
     * ⚠ CEASUL SE AVANSEAZA INAINTE CA RANDUL NOU SA EXISTE (2026-12-09). Nemiscat, un lot de
     * scoatere ramas deschis din viata dinainte ar gasi acelasi numar si ar sterge listarea noua.
     * Se cheama functia care exista, nu se rescrie socoteala aici.
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
       * peste el ca la o listare existenta — fara sa se atinga `status`, ca peste tot.
       */
      select id into v_id from public.aboutyou_listings
       where business_id = p_business_id and style_key = p_style_key
         for update;
      if not found then
        return jsonb_build_object('stare', 'lipsa');
      end if;
    else
      v_nou := true;
    end if;
  end if;

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

revoke all on function public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
