-- ═══════════════════════════════════════════════════════════════════════════
-- APROBAREA TINE DE CHEIA DE STIL, NU DE RANDUL DE LISTARE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (29.08.2026, noaptea)
--
-- `aprobat_odata` statea pe `aboutyou_listings`. Iar randul ala moare la eliminare — pe cand
-- aprobarea de la ei nu moare deloc:
--
--     L1, `style_key = PROD123`, aprobat la ei, `aprobat_odata = true`
--     omul elimina listarea -> `inactive` la ei -> piatra -> L1 STEARSA
--     omul relisteaza acelasi produs -> L2, `style_key` TOT `PROD123`
--     L2 se naste cu `aprobat_odata = false` ❌
--
-- Dar pentru About You `PROD123` e ACELASI product master, si el ramane aprobat: un produs
-- `inactive` se poate reactiva, iar republicarea lui sare peste aprobare. Deci pe L2 se puteau
-- schimba categoria si marimile — exact ce regula exista sa impiedice, doar ca de-acum cu paza
-- stinsa.
--
-- ⚠ MASURAT INAINTE DE REPARAT: L1 aprobat -> eliminat -> relistat ca L2 -> `aprobat_odata=false`,
-- iar o schimbare de categorie SI de marime a trecut cu `scris`.
--
-- ═══ ACEEASI LECTIE CA LA GENERATIE, INCA O DATA ═══
--
-- Ceasul starii a fost mutat pe `(business_id, style_key)` tocmai fiindca `style_key`
-- SUPRAVIETUIESTE relistarii, iar randul nu. „A fost aprobat vreodata" e o insusire a aceluiasi
-- lucru: a produsului de la EI, nu a randului de la noi.
--
-- ⚠ Deci semnul se muta pe ceas, care traieste deja peste eliminare si relistare. Coloana de pe
-- listare ramane, dar ca oglinda: declansatorul o umple din ceas la nastere, si scrie inapoi in
-- ceas cand se aprinde. Cine citeste nu trebuie sa stie de amandoua.

begin;

alter table public.aboutyou_ceas_stare
  add column if not exists aprobat_odata boolean not null default false;

comment on column public.aboutyou_ceas_stare.aprobat_odata is
  'Produsul cu aceasta cheie de stil a trecut vreodata de aprobarea About You. Traieste peste eliminare si relistare, fiindca la ei product master-ul e acelasi. Randul de listare doar il oglindeste.';

/*
 * ⚠ SI CE STIM ACUM SE MUTA ACOLO. Fara pasul asta, prima eliminare a unei listari aprobate ar
 * pierde tocmai ce am aflat ieri.
 */
insert into public.aboutyou_ceas_stare (business_id, style_key, generatie, aprobat_odata)
select l.business_id, l.style_key, 0, true
  from public.aboutyou_listings l
 where l.aprobat_odata
on conflict (business_id, style_key) do update set aprobat_odata = true;

create or replace function public.aboutyou_marcheaza_aprobarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  /*
   * ⚠ NUMAI IN SUS. Un produs care a fost aprobat si azi e `error` a fost aprobat si ieri.
   * Valoarea veche supravietuieste oricarei scrieri — de-aia declansatorul e pe UPDATE intreg,
   * nu doar `OF status`: o scriere care atinge numai `aprobat_odata` n-ar fi pornit-o.
   */
  if tg_op = 'UPDATE' then
    new.aprobat_odata := coalesce(old.aprobat_odata, false) or coalesce(new.aprobat_odata, false);
  end if;

  /*
   * ⚠ LA NASTERE, SEMNUL SE IA DE PE CEAS. Randul de listare moare la eliminare, ceasul nu — iar
   * pentru About You o relistare pe acelasi `style_key` e ACELASI product master, inca aprobat.
   * Fara pasul asta, L2 s-ar naste „neaprobat" si categoria ar redeveni schimbabila.
   */
  if tg_op = 'INSERT' then
    new.aprobat_odata := coalesce(new.aprobat_odata, false) or coalesce((
      select c.aprobat_odata from public.aboutyou_ceas_stare c
       where c.business_id = new.business_id and c.style_key = new.style_key
    ), false);
  end if;

  /*
   * ⚠ `inactive` NU E AICI, dinadins. E singura stare dintre cele care dovedesc aprobarea pe care
   * o scriem SI NOI, optimist, inainte de verdictul lor — deci singura despre care declansatorul
   * n-are cum sa stie cine a scris-o. Adevarul lor despre `inactive` il aduce `reconcileStatuses`,
   * si tot el aprinde semnul, pe nume.
   */
  if new.status in ('active', 'published', 'pending_active', 'problem') then
    new.aprobat_odata := true;
  end if;

  /*
   * ⚠ SI SE SCRIE INAPOI IN CEAS, ca sa supravietuiasca randului. `generatie` NU se atinge: ea are
   * stapanul ei (`aboutyou_ceas_urmator`), iar un rand nou pornit de aici cu `0` se comporta exact
   * ca unul inexistent — prima alocare il face `1`.
   */
  if new.aprobat_odata then
    insert into public.aboutyou_ceas_stare (business_id, style_key, generatie, aprobat_odata)
    values (new.business_id, new.style_key, 0, true)
    on conflict (business_id, style_key) do update set aprobat_odata = true;
  end if;

  return new;
end;
$$;

revoke all on function public.aboutyou_marcheaza_aprobarea() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SI SALVAREA INTREABA CEASUL, NU DOAR RANDUL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Randul e oglinda, ceasul e izvorul. Citit numai randul, regula ar depinde de faptul ca
-- oglindirea a apucat sa se faca — iar o paza care se bizuie pe alta paza nu e o paza.

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
  c_in_asteptare constant text[] := array['pending_approval', 'draft_pending'];
begin
  select id, status, category_id, aprobat_odata
    into v_id, v_status, v_categorie, v_aprobat
    from public.aboutyou_listings
   where business_id = p_business_id and style_key = p_style_key
     for update;

  if found then
    if p_listare_asteptata is null or v_id <> p_listare_asteptata then
      return jsonb_build_object('stare', 'depasit');
    end if;
  else
    if p_listare_asteptata is not null then
      return jsonb_build_object('stare', 'depasit');
    end if;

    v_gen := public.aboutyou_ceas_urmator(p_business_id, p_style_key, null);

    insert into public.aboutyou_listings
      (business_id, product_id, style_key, status, status_generatie)
    values (p_business_id, p_product_id, p_style_key, 'local', v_gen)
    on conflict (business_id, style_key) do nothing
    returning id, aprobat_odata into v_id, v_aprobat;

    if v_id is null then
      return jsonb_build_object('stare', 'depasit');
    end if;
    v_nou := true;
    v_status := 'local';
    v_categorie := null;
  end if;

  /*
   * ⚠ SI CEASUL ARE ULTIMUL CUVANT. Randul e oglinda lui; citit singur, regula ar depinde de
   * faptul ca oglindirea a apucat sa se faca. Aprobarea tine de `style_key`, fiindca la ei
   * product master-ul e acelasi si dupa eliminare si relistare.
   */
  v_aprobat := coalesce(v_aprobat, false) or coalesce((
    select c.aprobat_odata from public.aboutyou_ceas_stare c
     where c.business_id = p_business_id and c.style_key = p_style_key
  ), false);

  if v_aprobat or v_status = any(c_in_asteptare) then
    if v_categorie is not null
       and (p_campuri->>'category_id') is not null
       and (p_campuri->>'category_id')::integer <> v_categorie then
      return jsonb_build_object('stare', 'categorie-blocata', 'asteptam', v_aprobat is not true);
    end if;

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

  select string_agg(quote_ident(k), ', ') into v_chei
    from jsonb_object_keys(p_campuri) as k;
  if v_chei is null then
    return jsonb_build_object('stare', 'fara-campuri');
  end if;

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

  v_variante := public.aboutyou_salveaza_variante(p_business_id, v_id, p_randuri);

  return jsonb_build_object(
    'stare', 'scris', 'listing_id', v_id, 'nou', v_nou, 'variante', v_variante);
end;
$$;

revoke all on function public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.aboutyou_salveaza_listarea(uuid, text, uuid, jsonb, jsonb, uuid) to service_role;

commit;

notify pgrst, 'reload schema';
