-- GENERAT din productie de public.genereaza_schema_baseline().
-- NU se editeaza de mana: se regenereaza cu scripts/schema-baseline.sh
-- Vezi antetul din scriptul acela pentru DE CE exista fisierul.
--
-- Schemele aplicatiei: public + privat. Cele ale Supabase (auth, storage,
-- vault, realtime) le pune platforma la crearea proiectului.

set check_function_bodies = off;

create schema if not exists privat;

-- ── EXTENSII ──────────────────────────────────────────────
create extension if not exists fuzzystrmatch with schema extensions;
create extension if not exists pg_graphql with schema graphql;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- ── TIPURI ────────────────────────────────────────────────
create type public.difficulty_level as enum ('incepator', 'intermediar', 'avansat');
create type public.pricing_type as enum ('gratuit', 'freemium', 'platit');

-- ── SECVENTE ──────────────────────────────────────────────
create sequence if not exists public.emag_family_id_seq;
create sequence if not exists public.emag_offers_emag_id_seq;
create sequence if not exists public.order_number_seq;

-- ── FUNCTII ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION privat.cheie_integrari()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'vault', 'pg_temp'
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'integrari_enc_key' limit 1;
$function$
;

CREATE OR REPLACE FUNCTION privat.cripteaza(p_val text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'extensions', 'public', 'pg_temp'
AS $function$
begin
  if p_val is null or p_val = '' or p_val like 'enc.v1.%' then return p_val; end if;
  return 'enc.v1.' || encode(
    pgp_sym_encrypt(p_val, privat.cheie_integrari(),
                    'compress-algo=0, s2k-mode=0, cipher-algo=aes256'), 'base64');
end $function$
;

CREATE OR REPLACE FUNCTION privat.cripteaza_config(p_cfg jsonb, p_cai text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'extensions', 'public', 'pg_temp'
AS $function$
declare cale text; parti text[]; v text; r jsonb := p_cfg;
begin
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then return p_cfg; end if;
  foreach cale in array p_cai loop
    parti := string_to_array(cale, '.');
    if jsonb_typeof(r #> parti) = 'string' then
      v := r #>> parti;
      if v <> '' then r := jsonb_set(r, parti, to_jsonb(privat.cripteaza(v))); end if;
    end if;
  end loop;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION privat.cripteaza_rand(p_rand jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'privat', 'public', 'pg_temp'
AS $function$
declare m record; r jsonb := p_rand;
begin
  for m in select coloana, array_agg(cale) as cai from privat.campuri_secrete group by coloana loop
    if jsonb_typeof(r -> m.coloana) = 'object' then
      r := jsonb_set(r, array[m.coloana], privat.cripteaza_config(r -> m.coloana, m.cai));
    end if;
  end loop;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION privat.decripteaza(p_val text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'extensions', 'public', 'pg_temp'
AS $function$
begin
  if p_val is null or p_val not like 'enc.v1.%' then return p_val; end if;
  return pgp_sym_decrypt(decode(substring(p_val from 8), 'base64'), privat.cheie_integrari());
exception when others then
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION privat.decripteaza_config(p_cfg jsonb, p_cai text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'extensions', 'public', 'pg_temp'
AS $function$
declare cale text; parti text[]; v text; d text; r jsonb := p_cfg;
begin
  -- Vederea e `security_invoker`, deci functia ruleaza cu rolul apelantului:
  -- `anon`/`authenticated` cand cererea vine din browser SAU de pe server cu
  -- clientul utilizatorului, `service_role` prin `createAdminClient()`.
  -- Verificarea e pe rolurile de client, nu pe `= 'service_role'`, ca migratiile
  -- si consola SQL (rulate ca `postgres`) sa vada in continuare datele.
  if current_user in ('anon', 'authenticated') then return p_cfg; end if;

  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then return p_cfg; end if;
  foreach cale in array p_cai loop
    parti := string_to_array(cale, '.');
    if jsonb_typeof(r #> parti) = 'string' then
      v := r #>> parti;
      if v like 'enc.v1.%' then
        d := privat.decripteaza(v);
        r := jsonb_set(r, parti, to_jsonb(coalesce(d, '')));
      end if;
    end if;
  end loop;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION privat.reconstruieste_store_settings()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'privat', 'public', 'pg_temp'
AS $function$
declare col record; lista text := ''; cai text;
begin
  for col in select column_name from information_schema.columns
             where table_schema='privat' and table_name='store_settings' order by ordinal_position loop
    select array_agg(cale)::text into cai from privat.campuri_secrete where coloana = col.column_name;
    lista := lista || case when lista='' then '' else ', ' end ||
      case when cai is null then quote_ident(col.column_name)
           else 'privat.decripteaza_config('||quote_ident(col.column_name)||', '||
                quote_literal(cai)||'::text[]) as '||quote_ident(col.column_name) end;
  end loop;
  execute 'create or replace view public.store_settings with (security_invoker = true) as select '
          || lista || ' from privat.store_settings';
  -- Valorile implicite NU se mostenesc: fara ele, un insert care nu numeste
  -- `currency` ar trimite NULL intr-o coloana NOT NULL.
  for col in select column_name, column_default from information_schema.columns
             where table_schema='privat' and table_name='store_settings' and column_default is not null loop
    execute format('alter view public.store_settings alter column %I set default %s',
                   col.column_name, col.column_default);
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION privat.reconstruieste_store_settings_upd()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'privat', 'public', 'pg_temp'
AS $function$
declare lista text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into lista
  from information_schema.columns where table_schema='privat' and table_name='store_settings';
  execute format($f$
    create or replace function privat.store_settings_upd() returns trigger
    language plpgsql set search_path = privat, public, pg_temp as $c$
    declare j jsonb;
    begin
      j := privat.cripteaza_rand(to_jsonb(new));
      update privat.store_settings s
         set (%s) = (select r.* from jsonb_populate_record(null::privat.store_settings, j) r)
       where s.id = old.id;
      return new;
    end $c$;
  $f$, lista);
end $function$
;

CREATE OR REPLACE FUNCTION privat.store_settings_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'privat', 'public', 'pg_temp'
AS $function$
begin
  delete from privat.store_settings where id = old.id;
  return old;
end $function$
;

CREATE OR REPLACE FUNCTION privat.store_settings_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'privat', 'public', 'pg_temp'
AS $function$
declare j jsonb;
begin
  j := privat.cripteaza_rand(to_jsonb(new));
  insert into privat.store_settings
  select * from jsonb_populate_record(null::privat.store_settings, j);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION privat.store_settings_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'privat', 'public', 'pg_temp'
AS $function$
    declare j jsonb;
    begin
      j := privat.cripteaza_rand(to_jsonb(new));
      update privat.store_settings s
         set (id, business_id, currency, shipping_enabled, free_shipping_threshold, default_shipping_cost, shipping_zones, payment_methods, min_order_amount, store_policies, created_at, updated_at, page_content, order_number_format, order_counter, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown, notifications_config, smso_config, smartbill_config, stripe_config, netopia_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config, fan_courier_config, sameday_config, marketing_config, ipay_config, abandoned_cart_enabled, abandoned_cart_automation, google_merchant_config, card_discount_config, cookie_banner_config, notice_config, google_analytics_config, mailchimp_config, brevo_config, klaviyo_config, returns_config, klarna_config, revolut_config, olx_config, aboutyou_config, trendyol_config, email_config, cod_discount_config, shipping_classes, shipping_rules, storefront_design, storefront_design_draft, storefront_design_pub_at, cod_fee_config, show_vat_label, gls_config, pallex_config, ecolet_config, facebook_feeds, posta_config, innoship_config, packeta_config, smartship_config, shipo_config, fedex_config, ups_config, dhl_config, emag_config) = (select r.* from jsonb_populate_record(null::privat.store_settings, j) r)
       where s.id = old.id;
      return new;
    end $function$
;

CREATE OR REPLACE FUNCTION public.adauga_stoc_rezervat(p_order_id uuid, p_produse jsonb, p_variante jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rez jsonb;
begin
  select stoc_rezervat into v_rez from public.orders where id = p_order_id for update;
  if not found then return; end if;
  if v_rez is null then return; end if;

  update public.orders
     set stoc_rezervat = jsonb_build_object(
           'produse',  coalesce(v_rez->'produse',  '[]'::jsonb) || coalesce(p_produse,  '[]'::jsonb),
           'variante', coalesce(v_rez->'variante', '[]'::jsonb) || coalesce(p_variante, '[]'::jsonb))
   where id = p_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agregeaza_analitice(p_zile integer DEFAULT 2)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_de_la date := (now() at time zone 'Europe/Bucharest')::date - greatest(coalesce(p_zile, 2), 1) + 1;
  v_scrise int;
begin
  delete from public.business_daily_stats where zi >= v_de_la;

  insert into public.business_daily_stats (business_id, zi, event_type, device, source, nr)
  select a.business_id,
         (a.created_at at time zone 'Europe/Bucharest')::date as zi,
         a.event_type,
         coalesce(a.device, ''),
         coalesce(a.source, ''),
         count(*)
    from public.site_analytics a
   where (a.created_at at time zone 'Europe/Bucharest')::date >= v_de_la
     and exists (select 1 from public.businesses b where b.id = a.business_id)
   group by 1, 2, 3, 4, 5;

  get diagnostics v_scrise = row_count;
  return v_scrise;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aplica_tranzitia_comenzii(p_order_id uuid, p_status text, p_payment_status text DEFAULT NULL::text, p_business_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_intoarse constant text[] := array['refunded', 'cancelled'];
  v_status_vechi text;
  v_plata_veche  text;
  v_cupon        text;
  v_biz          uuid;
  v_plata_noua   text;
  v_status_schimbat boolean;
  v_plata_schimbata boolean;
  v_bana_restituita boolean;
  v_intoarce        boolean;
  v_reia            boolean;
  v_rez_cupon text := 'nimic';
  v_rez_stoc  text := 'nimic';
  v_negative  jsonb := '[]'::jsonb;
  v_bool      boolean;
  v_json      jsonb;
begin
  select status, payment_status, discount_code, business_id
    into v_status_vechi, v_plata_veche, v_cupon, v_biz
    from public.orders where id = p_order_id for update;

  if not found then return jsonb_build_object('gasit', false); end if;

  /*
   * LIMITA DE MAGAZIN, verificata AICI si nu la apelant.
   *
   * Lotul din panou o avea in interogare (`.eq("business_id", ...)`) si a pierdut-o
   * cand a trecut pe un apel per comanda: un utilizator care isi are magazinul lui
   * putea trimite id-uri de comenzi din ALT magazin, si li s-ar fi schimbat
   * statusul si li s-ar fi eliberat stocul. Actiunile de server se pot chema cu
   * orice argumente, printr-un POST direct — vezi manifestul global de actiuni.
   *
   * `null` = apelantul a verificat deja apartenenta pe alt drum (`updateOrder`
   * citeste comanda si magazinul cu clientul utilizatorului, sub RLS).
   */
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  v_plata_noua := coalesce(p_payment_status, v_plata_veche);
  v_status_schimbat := p_status is distinct from v_status_vechi;
  v_plata_schimbata := v_plata_noua is distinct from v_plata_veche;
  v_bana_restituita := v_plata_noua = 'refunded' and v_plata_veche is distinct from 'refunded';
  v_intoarce := v_bana_restituita
                or (p_status = any(c_intoarse) and not (v_status_vechi = any(c_intoarse)));
  v_reia := not (p_status = any(c_intoarse));

  update public.orders
     set status = p_status, payment_status = v_plata_noua, updated_at = now()
   where id = p_order_id;

  if v_status_schimbat or v_bana_restituita then
    if v_cupon is not null then
      if v_intoarce then
        v_bool := public.release_order_discount(p_order_id);
        v_rez_cupon := case when v_bool then 'eliberat' else 'nimic' end;
      elsif v_reia then
        v_rez_cupon := coalesce(public.reclaim_order_discount(p_order_id), 'nimic');
      end if;
    end if;

    if v_intoarce then
      v_rez_stoc := coalesce(public.elibereaza_stoc_comanda(p_order_id), 'nimic');
    elsif v_reia then
      v_json := public.revendica_stoc_comanda(p_order_id);
      v_rez_stoc := coalesce(v_json->>'fel', 'nimic');
      v_negative := coalesce(v_json->'negative', '[]'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
    'gasit', true, 'status_vechi', v_status_vechi, 'plata_veche', v_plata_veche,
    'status_schimbat', v_status_schimbat, 'plata_schimbata', v_plata_schimbata,
    'vanzarea_se_intoarce', v_intoarce, 'cupon', v_rez_cupon,
    'stoc', v_rez_stoc, 'negative', v_negative);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.blocheaza_domeniu_platforma()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d text := lower(coalesce(new.custom_domain, ''));
begin
  if d = '' then return new; end if;
  if d in ('edinio.com','www.edinio.com','localhost')
     or d like '%.edinio.com'
     or d like '%.vercel.app' then
    raise exception 'Domeniul % apartine platformei si nu poate fi conectat.', d
      using errcode = '42501';
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.blocheaza_escaladare_users_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_user not in ('anon','authenticated') then return new; end if;
  if new.role is distinct from old.role
  or new.plan is distinct from old.plan
  or new.plan_interval is distinct from old.plan_interval
  or new.plan_expires_at is distinct from old.plan_expires_at
  or new.suspended_until is distinct from old.suspended_until
  or new.payment_failed_at is distinct from old.payment_failed_at
  or new.stripe_customer_id is distinct from old.stripe_customer_id
  or new.admin_notes is distinct from old.admin_notes
  or new.onboarding_completed is distinct from old.onboarding_completed
  or new.mfa_otp is distinct from old.mfa_otp
  or new.mfa_otp_expires_at is distinct from old.mfa_otp_expires_at
  or new.mfa_email_enabled is distinct from old.mfa_email_enabled
  or new.mfa_confirmat_la is distinct from old.mfa_confirmat_la
  or new.mfa_sesiuni_confirmate is distinct from old.mfa_sesiuni_confirmate
  or new.id is distinct from old.id then
    raise exception 'Camp privilegiat modificat din client (rol/plan/suspendare/facturare/MFA). Operatiune respinsa.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_aplica_proiectii(p_randuri jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_afectate int;
begin
  update public.catalog_produs cp set
    price_min        = (r->>'price_min')::numeric,
    price_max        = (r->>'price_max')::numeric,
    has_range        = (r->>'has_range')::boolean,
    fara_oferta      = (r->>'fara_oferta')::boolean,
    optiuni          = case when jsonb_typeof(r->'optiuni') = 'null' then null else r->'optiuni' end,
    descriere_scurta = coalesce(r->>'descriere_scurta', ''),
    cauta_norm       = coalesce(r->>'cauta_norm', ''),
    -- `text[]` dintr-un array jsonb de siruri. `coalesce` pe array gol, nu pe
    -- null: coloana e `not null`.
    fatete           = coalesce(
                         (select array_agg(x #>> '{}') from jsonb_array_elements(r->'fatete') x),
                         '{}'::text[]),
    proiectat_la     = (r->>'proiectat_la')::timestamptz
  from jsonb_array_elements(p_randuri) r
  where cp.product_id = (r->>'product_id')::uuid;

  get diagnostics v_afectate = row_count;
  return v_afectate;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_candidati(p_business uuid, p_cuvinte text[], p_filtre jsonb)
 RETURNS TABLE(product_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  with cerute as (
    select w, public.semnatura_cuvant(w) as semn,
           case when length(w) >= 7 then 2 when length(w) >= 4 then 1 else 0 end as buget
      from unnest(coalesce(p_cuvinte, '{}'::text[])) w
     where length(w) >= 1
  ),
  potrivite as (
    select distinct c.w as cerut, v.cuvant
      from cerute c
      join public.catalog_cuvant v
        on v.business_id = p_business
       and (
         v.cuvant like c.w || '%'
         or (length(c.w) >= 3 and v.cuvant like '%' || c.w || '%')
         or (c.buget > 0
             and extensions.levenshtein_less_equal(v.cuvant, c.w, c.buget) <= c.buget)
         or (c.buget > 0 and length(v.cuvant) > length(c.w) and exists (
              select 1 from generate_series(greatest(1, length(c.w) - 1), length(c.w) + c.buget) k
               where extensions.levenshtein_less_equal(left(v.cuvant, k), c.w, c.buget) <= c.buget
                  or public.semnatura_cuvant(left(v.cuvant, k)) = c.semn))
         or v.semnatura = c.semn
       )
  ),
  pe_cerut as (
    select distinct p.cerut, i.product_id
      from potrivite p
      join public.catalog_index_cuvant i
        on i.business_id = p_business and i.cuvant = p.cuvant
  ),
  gasite as (
    select g.product_id
      from pe_cerut g
     group by g.product_id
    having count(*) = (select count(*) from cerute)
  ),
  filtru as (
    select coalesce((p_filtre->>'faraImagini')::boolean, false)     as fara_img,
           coalesce((p_filtre->>'faraStocAscuns')::boolean, false)  as fara_stoc_ascuns,
           case when jsonb_typeof(p_filtre->'categorii') = 'array'
                then (select array_agg(x #>> '{}') from jsonb_array_elements(p_filtre->'categorii') x)
                else null end                                      as categorii,
           public.categorii_ascunse(p_business)                     as ascunse,
           nullif(p_filtre->>'pretMin', '')::numeric               as pmin,
           nullif(p_filtre->>'pretMax', '')::numeric               as pmax,
           coalesce((p_filtre->>'reduceri')::boolean, false)        as reduceri,
           coalesce((p_filtre->>'stoc')::boolean, false)            as stoc,
           case when jsonb_typeof(p_filtre->'fatete') = 'array'
                then p_filtre->'fatete' else '[]'::jsonb end        as grupuri
  )
  select c.product_id
    from public.catalog_produs c
    join gasite g on g.product_id = c.product_id
   cross join filtru f
   where c.business_id = p_business
     and (not f.fara_img or c.are_imagine)
     and (not f.fara_stoc_ascuns or not c.fara_stoc)
     and (c.category is null or c.category <> all (f.ascunse))
     and (f.categorii is null or c.category = any (f.categorii))
     and (f.pmin is null or c.price_min >= f.pmin)
     and (f.pmax is null or c.price_min <= f.pmax)
     and (not f.reduceri or (c.compare_at_price is not null and c.compare_at_price > c.price_min))
     and (not f.stoc or not c.fara_stoc)
     and (
       jsonb_array_length(f.grupuri) = 0
       or not exists (
         select 1
           from jsonb_array_elements(f.grupuri) g2
          where jsonb_typeof(g2) = 'array'
            and not (c.fatete && (select array_agg(x #>> '{}') from jsonb_array_elements(g2) x))
       )
     )
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_cauta(p_business uuid, p_cuvinte text[], p_filtre jsonb, p_plafon integer DEFAULT 3000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
declare
  v_plafon    int := least(greatest(coalesce(p_plafon, 3000), 1), 6000);
  v_vocabular int;
  v_nr        int;
  v_out       jsonb;
begin
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  select count(*) into v_vocabular from public.catalog_cuvant where business_id = p_business;
  if v_vocabular = 0 then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', 0, 'prea_larg', false, 'cuvant_scurt', false);
  end if;

  if exists (select 1 from unnest(coalesce(p_cuvinte, '{}'::text[])) w where length(w) < 3) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular,
                              'prea_larg', false, 'cuvant_scurt', true);
  end if;

  select count(*) into v_nr from public.catalog_candidati(p_business, p_cuvinte, p_filtre);
  if v_nr > v_plafon then
    return jsonb_build_object('randuri', '[]'::jsonb, 'vocabular', v_vocabular, 'prea_larg', true, 'cuvant_scurt', false);
  end if;

  select coalesce(
           jsonb_agg(to_jsonb(c) - 'business_id' - 'cauta_norm' - 'proiectat_la'),
           '[]'::jsonb)
    into v_out
    from public.catalog_produs c
    join public.catalog_candidati(p_business, p_cuvinte, p_filtre) k
      on k.product_id = c.product_id;

  return jsonb_build_object(
    'randuri', coalesce(v_out, '[]'::jsonb),
    'vocabular', v_vocabular,
    'prea_larg', false,
    'cuvant_scurt', false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_fara_stoc(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with s as (
    select p.is_bundle, p.track_inventory, p.stock_quantity, p.business_id,
           p.page_sections->'bundle'->'items' as items
      from public.products p
     where p.id = p_id
  ),
  it as (
    select (e->>'product_id') as pid,
           greatest(1, floor(coalesce(
             case when btrim(coalesce(e->>'quantity','')) ~ '^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$'
                  then btrim(e->>'quantity')::numeric
             end, 1)))::int as qty
      from s, lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) e
     where jsonb_typeof(e->'product_id') = 'string'
  )
  select case
    when not coalesce((select is_bundle from s), false)
      then coalesce((select track_inventory and stock_quantity = 0 from s), false)
    when (select count(*) from it) = 0
      then true
    else exists (
      select 1
        from it
        left join public.products c
               on c.id::text = it.pid
              and c.business_id = (select business_id from s)
       where c.id is null or not c.is_active
          or (c.track_inventory
              and floor(coalesce(c.stock_quantity, 0)::numeric / it.qty) < 1)
    )
  end
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_pagina(p_business uuid, p_filtre jsonb, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lim        int := least(greatest(coalesce(p_limit, 20), 1), 96);
  v_off        int := greatest(coalesce(p_offset, 0), 0);
  v_sort       text := coalesce(p_filtre->>'sortare', '');
  v_categorii  text[] := case
    when jsonb_typeof(p_filtre->'categorii') = 'array'
      then (select array_agg(x #>> '{}') from jsonb_array_elements(p_filtre->'categorii') x)
    else null end;
  v_ascunse    text[] := public.categorii_ascunse(p_business);
  v_pmin       numeric := nullif(p_filtre->>'pretMin', '')::numeric;
  v_pmax       numeric := nullif(p_filtre->>'pretMax', '')::numeric;
  v_reduceri   boolean := coalesce((p_filtre->>'reduceri')::boolean, false);
  v_stoc       boolean := coalesce((p_filtre->>'stoc')::boolean, false);
  v_fara_img   boolean := coalesce((p_filtre->>'faraImagini')::boolean, false);
  v_fara_stoc  boolean := coalesce((p_filtre->>'faraStocAscuns')::boolean, false);
  v_grupuri    jsonb := case when jsonb_typeof(p_filtre->'fatete') = 'array'
                             then p_filtre->'fatete' else '[]'::jsonb end;
  v_samanta    bigint := coalesce(nullif(p_filtre->>'samanta', '')::bigint, 0);
  v_ordine     jsonb := case
    when jsonb_typeof(p_filtre->'ordine') = 'object' and p_filtre->'ordine' <> '{}'::jsonb
      then p_filtre->'ordine'
    else null end;
  v_baza       text := case
    when v_sort = 'manual' then coalesce(nullif(p_filtre->>'ordineRest', ''), 'newest')
    else v_sort end;
  v_out        jsonb;
begin
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('randuri', '[]'::jsonb, 'total', 0);
  end if;

  with vizibile as (
    select c.*
      from public.catalog_produs c
     where c.business_id = p_business
       and (not v_fara_img  or c.are_imagine)
       and (not v_fara_stoc or not c.fara_stoc)
       and (c.category is null or c.category <> all (v_ascunse))
  ),
  filtrate as (
    select v.*
      from vizibile v
     where (v_categorii is null or v.category = any(v_categorii))
       and (v_pmin is null or v.price_min >= v_pmin)
       and (v_pmax is null or v.price_min <= v_pmax)
       and (not v_reduceri or (v.compare_at_price is not null and v.compare_at_price > v.price_min))
       and (not v_stoc or not v.fara_stoc)
       and (
         jsonb_array_length(v_grupuri) = 0
         or not exists (
           select 1
             from jsonb_array_elements(v_grupuri) g
            where jsonb_typeof(g) = 'array'
              and not (v.fatete && (select array_agg(x #>> '{}') from jsonb_array_elements(g) x))
         )
       )
  ),
  pagina as (
    select f.*, count(*) over () as total_filtrate
      from filtrate f
     order by
       case when v_sort = 'manual' and v_ordine is not null
            then coalesce((v_ordine ->> f.product_id::text)::int, 2147483647) end asc nulls last,
       case when v_baza = 'price_asc'  then f.price_min end asc  nulls last,
       case when v_baza = 'price_desc' then f.price_min end desc nulls last,
       case when v_baza = 'name_asc'   then f.name collate public.ro_numeric end asc nulls last,
       case when v_baza = 'newest'     then f.creat end desc nulls last,
       case when v_baza = 'random'
            then (('x' || substr(f.product_id::text, 1, 8))::bit(32)::bigint # v_samanta) end asc nulls last,
       case when v_baza in ('price_asc','price_desc','name_asc','newest','random') then null
            else (case when f.is_featured then 0 else 1 end) end asc nulls last,
       case when v_baza in ('price_asc','price_desc','name_asc','newest','random') then null
            else f.sort_order end asc nulls last,
       f.product_id asc
     limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', coalesce((select max(total_filtrate) from pagina), 0),
    'randuri', coalesce(jsonb_agg(to_jsonb(p) - 'total_filtrate' - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
  ) into v_out
  from pagina p;

  return coalesce(v_out, jsonb_build_object('randuri', '[]'::jsonb, 'total', 0));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_randuri(p_business uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fara_img  boolean := coalesce((p_spec->>'faraImagini')::boolean, false);
  v_fara_stoc boolean := coalesce((p_spec->>'faraStocAscuns')::boolean, false);
  v_featured  int     := coalesce((p_spec->>'featuredLimit')::int, 0);
  v_sectiuni  jsonb   := case when jsonb_typeof(p_spec->'sectiuni') = 'array'
                              then p_spec->'sectiuni' else '[]'::jsonb end;
  v_ascunse   text[]  := public.categorii_ascunse(p_business);
  v_out       jsonb   := '{}'::jsonb;
  v_randuri   jsonb;
  s           jsonb;
  v_mod       text;
  v_lim       int;
  v_ids       uuid[];
  v_cat       text[];
begin
  if not exists (
    select 1 from public.businesses b
     where b.id = p_business and (b.is_published or b.user_id = auth.uid())
  ) then
    return jsonb_build_object('featured', '[]'::jsonb, 'sectiuni', '{}'::jsonb);
  end if;

  if v_featured > 0 then
    select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
      into v_randuri
      from (
        select c.* from public.catalog_produs c
         where c.business_id = p_business
           and c.is_featured
           and (not v_fara_img  or c.are_imagine)
           and (not v_fara_stoc or not c.fara_stoc)
           and (c.category is null or c.category <> all (v_ascunse))
         order by c.sort_order, c.product_id
         limit least(v_featured, 96)
      ) t;
    v_out := jsonb_set(v_out, '{featured}', v_randuri);
  else
    v_out := jsonb_set(v_out, '{featured}', '[]'::jsonb);
  end if;

  v_out := jsonb_set(v_out, '{sectiuni}', '{}'::jsonb);

  for s in select * from jsonb_array_elements(v_sectiuni) loop
    v_mod := s->>'mode';
    v_lim := least(greatest(coalesce((s->>'limit')::int, 8), 1), 24);

    if v_mod = 'selected' then
      v_ids := case when jsonb_typeof(s->'productIds') = 'array'
                    then (select array_agg((x #>> '{}')::uuid) from jsonb_array_elements(s->'productIds') x)
               end;
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and v_ids is not null and c.product_id = any(v_ids)
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
             and (c.category is null or c.category <> all (v_ascunse))
           order by array_position(v_ids, c.product_id)
           limit v_lim
        ) t;

    elsif v_mod = 'category' then
      v_cat := case when jsonb_typeof(s->'categorii') = 'array'
                    then (select array_agg(x #>> '{}') from jsonb_array_elements(s->'categorii') x)
               end;
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and v_cat is not null and c.category = any(v_cat)
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
             and (c.category is null or c.category <> all (v_ascunse))
           order by (case when c.is_featured then 0 else 1 end), c.sort_order, c.product_id
           limit v_lim
        ) t;

    else
      select coalesce(jsonb_agg(to_jsonb(t) - 'business_id' - 'cauta_norm' - 'proiectat_la'), '[]'::jsonb)
        into v_randuri
        from (
          select c.* from public.catalog_produs c
           where c.business_id = p_business
             and c.is_bundle
             and (not v_fara_img  or c.are_imagine)
             and (not v_fara_stoc or not c.fara_stoc)
             and (c.category is null or c.category <> all (v_ascunse))
           order by (case when c.is_featured then 0 else 1 end), c.sort_order, c.product_id
           limit v_lim
        ) t;
    end if;

    v_out := jsonb_set(v_out, array['sectiuni', s->>'id'], coalesce(v_randuri, '[]'::jsonb));
  end loop;

  return v_out;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_reface_cuvinte(p_business uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_nr int;
begin
  create temporary table if not exists _per (cuvant text, product_id uuid) on commit drop;
  -- `where true` NU e decor: rolul `service_role` ruleaza cu paza „safeupdate", care
  -- respinge orice DELETE fara WHERE. Un `delete from _per;` gol facea functia sa
  -- arunce „DELETE requires a WHERE clause" — deci reconstructia vocabularului
  -- esua TACUT ori de cate ori era chemata din cron, si mergea doar cand o
  -- rulam de mana din consola (unde rolul e altul, fara paza).
  delete from _per where true;
  insert into _per (cuvant, product_id)
  select distinct w, c.product_id
    from public.catalog_produs c
    cross join lateral regexp_split_to_table(
      regexp_replace(regexp_replace(c.cauta_norm, '([0-9])([a-z])', '\1 \2', 'g'),
                     '([a-z])([0-9])', '\1 \2', 'g'), '[^a-z0-9]+') w
   where c.business_id = p_business and length(w) >= 3;

  delete from public.catalog_cuvant
   where business_id = p_business and cuvant not in (select cuvant from _per);
  insert into public.catalog_cuvant (business_id, cuvant, cate)
  select p_business, cuvant, count(*) from _per group by cuvant
  on conflict (business_id, cuvant) do update set cate = excluded.cate;

  delete from public.catalog_index_cuvant i
   where i.business_id = p_business
     and not exists (select 1 from _per p where p.cuvant = i.cuvant and p.product_id = i.product_id);
  insert into public.catalog_index_cuvant (business_id, cuvant, product_id)
  select p_business, cuvant, product_id from _per on conflict do nothing;

  select count(distinct cuvant) into v_nr from _per;
  return v_nr;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_scrie_rezumat(p_randuri jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_afectate int;
begin
  insert into public.catalog_rezumat (
    business_id, fara_imagini, fara_stoc_ascuns, total, price_min, price_max,
    categorii, fatete, calculat_la)
  select (r->>'business_id')::uuid,
         (r->>'fara_imagini')::boolean,
         (r->>'fara_stoc_ascuns')::boolean,
         (r->>'total')::int,
         (r->>'price_min')::numeric,
         (r->>'price_max')::numeric,
         coalesce((select array_agg(x #>> '{}') from jsonb_array_elements(r->'categorii') x), '{}'::text[]),
         coalesce(r->'fatete', '{}'::jsonb),
         now()
    from jsonb_array_elements(p_randuri) r
  on conflict (business_id, fara_imagini, fara_stoc_ascuns) do update set
    total       = excluded.total,
    price_min   = excluded.price_min,
    price_max   = excluded.price_max,
    categorii   = excluded.categorii,
    fatete      = excluded.fatete,
    calculat_la = excluded.calculat_la;

  get diagnostics v_afectate = row_count;
  return v_afectate;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.catalog_verifica(p_esantion integer DEFAULT 300)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lipsa int; v_in_plus int; v_stoc int; v_total int;
begin
  select count(*) into v_lipsa
    from (select p.id from public.products p
           where p.is_active
             and not exists (select 1 from public.catalog_produs c where c.product_id = p.id)
           limit p_esantion) t;

  select count(*) into v_in_plus
    from (select c.product_id from public.catalog_produs c
           where not exists (select 1 from public.products p
                              where p.id = c.product_id and p.is_active)
           limit p_esantion) t;

  select count(*) into v_stoc
    from (select c.product_id from public.catalog_produs c
           where c.proiectat_la is not null
             and not exists (select 1 from public.catalog_murdar m where m.product_id = c.product_id)
             and c.fara_stoc is distinct from public.catalog_fara_stoc(c.product_id)
           limit p_esantion) t;

  v_total := v_lipsa + v_in_plus + v_stoc;

  if v_total > 0 then
    insert into public.error_logs (severity, action, message, details)
    values ('error', 'catalog_verifica',
            format('Proiectia catalogului a divergat: %s lipsa, %s in plus, %s cu stoc gresit',
                   v_lipsa, v_in_plus, v_stoc),
            jsonb_build_object('lipsa', v_lipsa, 'in_plus', v_in_plus, 'stoc', v_stoc,
                               'esantion', p_esantion));
  end if;

  return v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.categorii_ascunse(p_business uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with recursive ascunse as (
    select c.id, c.name
      from public.categories c
     where c.business_id = p_business
       and not c.is_active
    union
    select k.id, k.name
      from public.categories k
      join ascunse a on k.parent_id = a.id
     where k.business_id = p_business
  )
  select coalesce(array_agg(distinct a.name), '{}'::text[])
    from ascunse a
   where not exists (
     select 1
       from public.categories v
      where v.business_id = p_business
        and v.name = a.name
        and not exists (select 1 from ascunse b where b.id = v.id)
   );
$function$
;

CREATE OR REPLACE FUNCTION public.claim_discount_use(p_discount_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claimed integer;
BEGIN
  UPDATE public.discounts
  SET uses_count = uses_count + 1, updated_at = now()
  WHERE id = p_discount_id
    AND (max_uses IS NULL OR uses_count < max_uses);

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consuma_limita(p_cheie text, p_limita integer, p_fereastra_sec integer, p_blocare_sec integer DEFAULT 0)
 RETURNS TABLE(permis boolean, blocat_pana timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_acum timestamptz := clock_timestamp();
  v_start timestamptz; v_lovituri integer; v_blocat timestamptz;
begin
  insert into public.rate_limits (cheie, fereastra_start, lovituri)
  values (p_cheie, v_acum, 0) on conflict (cheie) do nothing;

  select r.fereastra_start, r.lovituri, r.blocat_pana
    into v_start, v_lovituri, v_blocat
  from public.rate_limits r where r.cheie = p_cheie for update;

  if v_blocat is not null and v_blocat > v_acum then
    return query select false, v_blocat; return;
  end if;

  if v_start < v_acum - make_interval(secs => p_fereastra_sec) then
    v_start := v_acum; v_lovituri := 0;
  end if;

  v_lovituri := v_lovituri + 1;
  v_blocat := null;
  if v_lovituri > p_limita and p_blocare_sec > 0 then
    v_blocat := v_acum + make_interval(secs => p_blocare_sec);
  end if;

  update public.rate_limits
     set fereastra_start = v_start, lovituri = v_lovituri,
         blocat_pana = v_blocat, actualizat_la = v_acum
   where cheie = p_cheie;

  return query select (v_lovituri <= p_limita), v_blocat;
end; $function$
;

CREATE OR REPLACE FUNCTION public.consuma_stoc_comanda_marketplace(p_order_id uuid, p_business_id uuid, p_produse jsonb, p_variante jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_biz uuid;
  v_deja timestamptz;
  v_r jsonb;
begin
  /*
   * Consumul de stoc al unei comenzi de marketplace, INTR-O SINGURA TRANZACTIE cu
   * inregistrarea lui.
   *
   * ═══ CE REPARA ═══
   *
   * Erau trei pasi separati: insert comanda -> insert rand lateral -> consum stoc
   * -> scriere `stoc_rezervat`. Iar `isNew` se hotara dupa INSERAREA COMENZII
   * (unicitate pe `order_number`), nu dupa consum.
   *
   * Deci daca consumul pica — o eroare de doua secunde —, sincronizarea urmatoare
   * gasea comanda deja creata, punea `isNew = false` si SAREA blocul de stoc. Pe
   * vecie. Exact tiparul „s-a intamplat o data, apoi idempotenta impiedica
   * repararea".
   *
   * Acum marcajul e `stoc_marketplace_la`, pus in ACEEASI instructiune cu
   * scrierea consumului. Cat timp e NULL, consumul se reincearca la fiecare
   * sincronizare — deci greseala se repara singura. Odata pus, nu se mai repeta.
   *
   * Si `stoc_rezervat` primeste CE S-A CONSUMAT, nu ce s-a cerut: pe marketplace
   * se plafoneaza, deci cele doua chiar difera, iar anularea ar da inapoi mai mult
   * decat s-a luat.
   */
  select business_id, stoc_marketplace_la into v_biz, v_deja
    from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('gasit', false); end if;
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;
  if v_deja is not null then
    return jsonb_build_object('gasit', true, 'deja', true);
  end if;

  v_r := public.consuma_stoc_marketplace(p_produse, p_variante);

  update public.orders
     set stoc_rezervat = v_r->'consumat',
         stoc_marketplace_la = now(),
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object('gasit', true, 'deja', false, 'lipsa', coalesce(v_r->'lipsa','[]'::jsonb));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.consuma_stoc_marketplace(p_produse jsonb, p_variante jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record; v_vechi int; v_luat int;
  v_lipsa jsonb := '[]'::jsonb; v_prod_consumat jsonb := '[]'::jsonb; v_v jsonb;
begin
  for r in
    select (e->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int,0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse,'[]'::jsonb)) e
     where e->>'product_id' is not null group by 1
    having sum(greatest(0, coalesce((e->>'quantity')::int,0))) > 0 order by 1
  loop
    select stock_quantity into v_vechi from products
     where id = r.pid and track_inventory = true and stock_quantity is not null for update;
    if v_vechi is null then continue; end if;
    v_luat := least(r.qty, greatest(0, v_vechi));
    if v_vechi < r.qty then
      v_lipsa := v_lipsa || jsonb_build_object('product_id', r.pid, 'cerut', r.qty, 'disponibil', v_vechi);
    end if;
    if v_luat > 0 then
      v_prod_consumat := v_prod_consumat || jsonb_build_object('product_id', r.pid, 'quantity', v_luat);
    end if;
    update products set stock_quantity = greatest(0, stock_quantity - r.qty) where id = r.pid;
  end loop;

  v_v := public.scade_variante_raportat(coalesce(p_variante,'[]'::jsonb));
  return jsonb_build_object(
    'ok', true,
    'lipsa', v_lipsa || coalesce(v_v->'lipsa','[]'::jsonb),
    -- CE S-A LUAT CU ADEVARAT. Se scrie in `stoc_rezervat`, ca anularea sa nu dea
    -- inapoi mai mult decat s-a consumat: pe marketplace se plafoneaza, deci
    -- „cerut" si „luat" chiar difera.
    'consumat', jsonb_build_object('produse', v_prod_consumat, 'variante', coalesce(v_v->'consumat','[]'::jsonb)));
end; $function$
;

CREATE OR REPLACE FUNCTION public.curata_analitice_brute(p_pastreaza_zile integer DEFAULT 8, p_max integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_sterse int;
begin
  with vechi as (
    select a.id from public.site_analytics a
     where (a.created_at at time zone 'Europe/Bucharest')::date
           < (now() at time zone 'Europe/Bucharest')::date - greatest(coalesce(p_pastreaza_zile, 8), 3)
     limit greatest(coalesce(p_max, 5000), 1)
  )
  delete from public.site_analytics a using vechi v where a.id = v.id;
  get diagnostics v_sterse = row_count;
  return v_sterse;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.curata_limite()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sterse as (
    delete from public.rate_limits
    where actualizat_la < now() - interval '24 hours'
      and (blocat_pana is null or blocat_pana < now())
    returning 1)
  select coalesce(count(*), 0)::integer from sterse;
$function$
;

CREATE OR REPLACE FUNCTION public.customer_orders(bid uuid, cust_key text, page_limit integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, order_number text, total numeric, status text, payment_method text, payment_status text, created_at timestamp with time zone, item_count integer, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select o.id, o.order_number, o.total, o.status, o.payment_method, o.payment_status, o.created_at,
    (case when jsonb_typeof(o.items) = 'array' then
      coalesce((
        select sum(case when jsonb_typeof(el->'quantity') = 'number' and (el->>'quantity')::numeric > 0
                        then (el->>'quantity')::numeric else 1 end)
        from jsonb_array_elements(o.items) el
      ), 0)
    else 0 end)::int as item_count,
    count(*) over () as total_count
  from public.orders o
  where o.business_id = bid
    and (
      (cust_key not like 'email:%' and cust_key not like 'order:%'
        and public.normalize_phone(o.customer_phone) = cust_key)
      or (cust_key like 'email:%'
        and nullif(public.normalize_phone(o.customer_phone), '') is null
        and nullif(lower(trim(coalesce(o.customer_email, ''))), '') = substr(cust_key, 7))
      or (cust_key like 'order:%' and o.id::text = substr(cust_key, 7))
    )
  order by o.created_at desc
  limit page_limit offset page_offset
$function$
;

CREATE OR REPLACE FUNCTION public.customers_aggregate(bid uuid, search text DEFAULT NULL::text, sort_key text DEFAULT 'recent'::text, page_limit integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(key text, name text, phone text, email text, city text, county text, address text, order_count bigint, paid_order_count bigint, total_spent numeric, aov numeric, first_order_at timestamp with time zone, last_order_at timestamp with time zone, last_status text, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with ord as (
    select
      public.order_customer_key(o.customer_phone, o.customer_email, o.id) as key,
      (array_agg(nullif(trim(o.customer_name), '') order by o.created_at desc)
        filter (where nullif(trim(o.customer_name), '') is not null))[1] as name,
      (array_agg(nullif(trim(o.customer_phone), '') order by o.created_at desc)
        filter (where nullif(trim(o.customer_phone), '') is not null))[1] as phone,
      (array_agg(nullif(lower(trim(o.customer_email)), '') order by o.created_at desc)
        filter (where nullif(lower(trim(o.customer_email)), '') is not null))[1] as email,
      (array_agg(nullif(trim(o.shipping_address->>'city'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'city'), '') is not null))[1] as city,
      (array_agg(nullif(trim(o.shipping_address->>'county'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'county'), '') is not null))[1] as county,
      (array_agg(nullif(trim(o.shipping_address->>'address'), '') order by o.created_at desc)
        filter (where nullif(trim(o.shipping_address->>'address'), '') is not null))[1] as address,
      count(*) as order_count,
      count(*) filter (where o.status not in ('cancelled', 'refunded')) as paid_order_count,
      round(coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0), 2) as total_spent,
      min(o.created_at) as first_order_at,
      max(o.created_at) as last_order_at,
      (array_agg(o.status order by o.created_at desc))[1] as last_status
    from public.orders o
    where o.business_id = bid
    group by 1
  ),
  imp as (
    select
      c.key,
      nullif(trim(c.name), '') as name,
      nullif(trim(c.phone), '') as phone,
      nullif(lower(trim(c.email)), '') as email,
      nullif(trim(c.city), '') as city,
      nullif(trim(c.county), '') as county,
      nullif(trim(c.address), '') as address
    from public.customers c
    where c.business_id = bid
  ),
  merged as (
    select
      coalesce(o.key, i.key) as key,
      coalesce(o.name, i.name, 'Client') as name,
      coalesce(o.phone, i.phone, '') as phone,
      coalesce(o.email, i.email) as email,
      coalesce(o.city, i.city) as city,
      coalesce(o.county, i.county) as county,
      coalesce(o.address, i.address) as address,
      coalesce(o.order_count, 0) as order_count,
      coalesce(o.paid_order_count, 0) as paid_order_count,
      coalesce(o.total_spent, 0::numeric) as total_spent,
      o.first_order_at,
      o.last_order_at,
      o.last_status
    from ord o
    full outer join imp i on i.key = o.key
  ),
  filtered as (
    select m.*,
      case when m.paid_order_count > 0
           then round(m.total_spent / m.paid_order_count, 2) else 0 end as aov
    from merged m
    where coalesce(search, '') = ''
       or m.name ilike '%' || search || '%' escape '\'
       or coalesce(m.email, '') ilike '%' || search || '%' escape '\'
       or (length(public.normalize_phone(search)) >= 3
           and public.normalize_phone(m.phone) like '%' || public.normalize_phone(search) || '%')
  )
  select f.key, f.name, f.phone, f.email, f.city, f.county, f.address,
         f.order_count, f.paid_order_count, f.total_spent, f.aov,
         f.first_order_at, f.last_order_at, f.last_status,
         count(*) over () as total_count
  from filtered f
  order by
    case when sort_key = 'spent' then f.total_spent end desc nulls last,
    case when sort_key = 'orders' then f.order_count end desc nulls last,
    case when sort_key = 'name' then f.name end asc nulls last,
    f.last_order_at desc nulls last
  limit page_limit offset page_offset
$function$
;

CREATE OR REPLACE FUNCTION public.customers_summary(bid uuid)
 RETURNS TABLE(total_customers bigint, returning_customers bigint, total_revenue numeric, average_order_value numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with ord as (
    select
      public.order_customer_key(o.customer_phone, o.customer_email, o.id) as key,
      count(*) filter (where o.status not in ('cancelled', 'refunded')) as paid_cnt,
      coalesce(sum(o.total) filter (where o.status not in ('cancelled', 'refunded')), 0) as spent
    from public.orders o
    where o.business_id = bid
    group by 1
  ),
  toti as (
    select o.key, o.paid_cnt, o.spent from ord o
    union all
    select c.key, 0::bigint, 0::numeric
    from public.customers c
    where c.business_id = bid
      and not exists (select 1 from ord o2 where o2.key = c.key)
  )
  select
    count(*)::bigint,
    (count(*) filter (where paid_cnt > 1))::bigint,
    round(coalesce(sum(spent), 0), 2),
    case when coalesce(sum(paid_cnt), 0) > 0
         then round(coalesce(sum(spent), 0) / sum(paid_cnt), 2) else 0 end
  from toti
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE products
  SET stock_quantity = GREATEST(0, stock_quantity - p_quantity)
  WHERE id = p_product_id
    AND track_inventory = true
    AND stock_quantity IS NOT NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_stock_batch(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE products
    SET stock_quantity = GREATEST(0, stock_quantity - (item->>'quantity')::int)
    WHERE id = (item->>'product_id')::uuid
      AND track_inventory = true
      AND stock_quantity IS NOT NULL;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_variant_stock_batch(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item    jsonb;
  v_pid   uuid;
  v_titlu text;
  v_cerut int;
  v_idx   int;
  v_stoc  int;
  v_tip   text;
  v_nou   int;
begin
  for item in select * from jsonb_array_elements(p_items)
  loop
    v_pid   := (item->>'product_id')::uuid;
    v_titlu := item->>'variant_title';
    v_cerut := greatest(0, coalesce((item->>'quantity')::int, 0));
    if v_pid is null or v_titlu is null or v_cerut = 0 then
      continue;
    end if;

    perform 1 from products where id = v_pid for update;

    v_idx := null;
    select t.idx,
           floor((t.c->>'stock_quantity')::numeric)::int,
           jsonb_typeof(t.c->'stock_quantity')
      into v_idx, v_stoc, v_tip
    from products p,
         lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                 with ordinality as t(c, idx)
    where p.id = v_pid
      and t.c->>'title' = v_titlu
      and (t.c->>'enabled')::boolean is true
      and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
    order by t.idx
    limit 1;

    if v_idx is null then
      continue;
    end if;

    v_nou := greatest(0, v_stoc - v_cerut);

    update products p
    set page_sections = jsonb_set(
          p.page_sections,
          array['variants', 'combinations', (v_idx - 1)::text, 'stock_quantity'],
          case when v_tip = 'string' then to_jsonb(v_nou::text) else to_jsonb(v_nou) end
        )
    where p.id = v_pid;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.editeaza_comanda_atomic(p_order_id uuid, p_business_id uuid, p_patch jsonb, p_produse jsonb, p_variante jsonb, p_status_asteptat text DEFAULT NULL::text, p_produse_minus jsonb DEFAULT '[]'::jsonb, p_variante_minus jsonb DEFAULT '[]'::jsonb, p_produse_necesar jsonb DEFAULT '[]'::jsonb, p_variante_necesar jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_biz      uuid;
  v_rez      jsonb;
  v_status   text;
  v_eliberat timestamptz;
  v_calc     jsonb;
  v_nou      jsonb;
  v_misca    boolean;
begin
  select business_id, stoc_rezervat, status, stoc_eliberat_la
    into v_biz, v_rez, v_status, v_eliberat
    from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('gasit', false); end if;
  -- Limita de magazin, ca la celelalte: actiunile de server se pot chema cu orice
  -- argumente, printr-un POST direct.
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  /*
   * === STATUSUL SE VERIFICA SUB LACAT ===
   *
   * Comerciantul citeste comanda, ii vede statusul, rezerva stocul pentru liniile
   * noi - si abia apoi ajunge aici. Intre citire si scriere, altcineva (panoul,
   * un lot, un webhook de marketplace) poate ANULA comanda si elibera stocul ei.
   * Fara verificarea de aici, editarea se aplica peste o comanda deja anulata si
   * ii adauga stoc rezervat proaspat - pe care anularea, deja intamplata, nu-l mai
   * elibereaza niciodata.
   */
  if p_status_asteptat is not null and v_status is distinct from p_status_asteptat then
    return jsonb_build_object('gasit', false, 'motiv', 'status schimbat',
                              'status_curent', v_status, 'asteptat', p_status_asteptat);
  end if;

  v_misca := jsonb_array_length(coalesce(p_produse,        '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_variante,       '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_produse_minus,  '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_variante_minus, '[]'::jsonb)) > 0;

  /*
   * === STOCUL DEJA ELIBERAT NU SE MAI MISCA ===
   *
   * `stoc_eliberat_la` inseamna ca marfa comenzii s-a intors deja pe raft -
   * comanda e anulata, rambursata, sau doar cu `payment_status = 'refunded'`
   * (`aplica_tranzitia_comenzii` elibereaza si pe drumul asta, fara sa schimbe
   * statusul). Ultimul caz TRECE de garda din aplicatie, care se uita doar la
   * status.
   *
   * Peste o comanda in starea asta, o adaugare ar scadea stoc pe care anularea
   * l-a dat deja inapoi, iar o scoatere ar da inapoi bucati intoarse o data.
   * Datele clientului se pot corecta oricand; marfa, nu.
   */
  if v_eliberat is not null and v_misca then
    return jsonb_build_object('gasit', false, 'motiv', 'stoc eliberat');
  end if;

  /*
   * Comanda dinainte de coloana (`stoc_rezervat is null`) ramane NULL.
   *
   * Nu se stie ce a consumat, deci nu se poate nici da inapoi, nici scrie acum
   * doar liniile atinse: scrisa asa, ar arata ca si cum atat ar fi consumat, iar
   * `elibereaza_stoc_comanda` ar raporta „eliberat" dupa ce ar da inapoi o farama.
   * Apelantul afla din `stoc_cunoscut` si spune omului sa corecteze de mana.
   */
  if v_rez is null then
    v_nou  := null;
    v_calc := jsonb_build_object('produse', '[]'::jsonb, 'variante', '[]'::jsonb);
  else
    v_calc := public.scade_din_rezervat(v_rez, p_produse_minus, p_variante_minus,
                                        p_produse_necesar, p_variante_necesar);
    v_nou  := jsonb_build_object(
      'produse',  coalesce(v_calc->'rezervat'->'produse',  '[]'::jsonb) || coalesce(p_produse,  '[]'::jsonb),
      'variante', coalesce(v_calc->'rezervat'->'variante', '[]'::jsonb) || coalesce(p_variante, '[]'::jsonb));
  end if;

  update public.orders set
    customer_name    = coalesce(p_patch->>'customer_name', customer_name),
    customer_phone   = coalesce(p_patch->>'customer_phone', customer_phone),
    customer_email   = case when p_patch ? 'customer_email' then nullif(p_patch->>'customer_email','') else customer_email end,
    shipping_address = coalesce(p_patch->'shipping_address', shipping_address),
    items            = coalesce(p_patch->'items', items),
    subtotal         = coalesce((p_patch->>'subtotal')::numeric, subtotal),
    shipping_cost    = coalesce((p_patch->>'shipping_cost')::numeric, shipping_cost),
    cod_fee_amount   = coalesce((p_patch->>'cod_fee_amount')::numeric, cod_fee_amount),
    vat_amount       = coalesce((p_patch->>'vat_amount')::numeric, vat_amount),
    vat_rate         = coalesce((p_patch->>'vat_rate')::numeric, vat_rate),
    total            = coalesce((p_patch->>'total')::numeric, total),
    updated_at       = now(),
    stoc_rezervat    = v_nou
  where id = p_order_id;

  /*
   * Darea inapoi, in ACEEASI tranzactie cu scrierea de mai sus.
   *
   * Produsele intai, variantele dupa - ordinea impusa de declansatorul care pune
   * `stock_quantity` = suma combinatiilor. Vezi antetul lui
   * `2026-08-17-eliberare-stoc-comanda.sql`.
   */
  perform public.elibereaza_stoc_complet(v_calc->'produse', v_calc->'variante');

  return jsonb_build_object(
    'gasit', true,
    'stoc_cunoscut', v_rez is not null,
    'eliberat', jsonb_build_object('produse', v_calc->'produse', 'variante', v_calc->'variante'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.elibereaza_stoc_batch(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
begin
  for r in
    select (i->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
    from jsonb_array_elements(p_items) i
    where i->>'product_id' is not null
    group by 1
    having sum(greatest(0, coalesce((i->>'quantity')::int, 0))) > 0
    order by 1
  loop
    update products
    set stock_quantity = stock_quantity + r.qty
    where id = r.pid
      and track_inventory = true
      and stock_quantity is not null;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.elibereaza_stoc_comanda(p_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rez jsonb;
  v_are boolean;
begin
  select stoc_rezervat is not null into v_are from public.orders where id = p_order_id;
  if v_are is null then return 'nimic'; end if;
  if not v_are then return 'necunoscut'; end if;

  update public.orders
     set stoc_eliberat_la = now()
   where id = p_order_id
     and stoc_eliberat_la is null
  returning stoc_rezervat into v_rez;

  if v_rez is null then return 'nimic'; end if;

  perform public.elibereaza_stoc_batch(coalesce(v_rez->'produse', '[]'::jsonb));
  perform public.restaureaza_variante_batch(coalesce(v_rez->'variante', '[]'::jsonb));

  return 'eliberat';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.elibereaza_stoc_complet(p_produse jsonb, p_variante jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.elibereaza_stoc_batch(coalesce(p_produse, '[]'::jsonb));
  perform public.restaureaza_variante_batch(coalesce(p_variante, '[]'::jsonb));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.emag_familie_noua()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nextval('public.emag_family_id_seq');
$function$
;

CREATE OR REPLACE FUNCTION public.emag_ridica_sirurile(p_oferta bigint, p_familie bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_o bigint;
  v_f bigint;
begin
  select last_value into v_o from public.emag_offers_emag_id_seq;
  if p_oferta is not null and p_oferta >= v_o then
    perform setval('public.emag_offers_emag_id_seq', p_oferta + 1, false);
    v_o := p_oferta + 1;
  end if;

  select last_value into v_f from public.emag_family_id_seq;
  if p_familie is not null and p_familie >= v_f then
    perform setval('public.emag_family_id_seq', p_familie + 1, false);
    v_f := p_familie + 1;
  end if;

  return jsonb_build_object('oferta', v_o, 'familie', v_f);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.genereaza_schema_baseline()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
declare
  c_scheme constant text[] := array['public', 'privat'];
  o text := '';
  p text;
begin
  o := o || E'-- GENERAT din productie de public.genereaza_schema_baseline().\n'
         || E'-- NU se editeaza de mana: se regenereaza cu scripts/schema-baseline.sh\n'
         || E'-- Vezi antetul din scriptul acela pentru DE CE exista fisierul.\n'
         || E'--\n-- Schemele aplicatiei: public + privat. Cele ale Supabase (auth, storage,\n'
         || E'-- vault, realtime) le pune platforma la crearea proiectului.\n\n'
         || E'set check_function_bodies = off;\n\n'
         || E'create schema if not exists privat;\n\n';

  select coalesce(string_agg(format('create extension if not exists %I with schema %I;', e.extname, n.nspname), E'\n' order by e.extname), '')
    into p from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname <> 'plpgsql';
  o := o || E'-- ── EXTENSII ──────────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('create type %I.%I as enum (%s);', n.nspname, t.typname, vals), E'\n' order by n.nspname, t.typname), '')
    into p from pg_type t join pg_namespace n on n.oid = t.typnamespace
    cross join lateral (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as vals from pg_enum e where e.enumtypid = t.oid) v
   where n.nspname = any(c_scheme) and t.typtype = 'e';
  o := o || E'-- ── TIPURI ────────────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('create sequence if not exists %I.%I;', schemaname, sequencename), E'\n' order by schemaname, sequencename), '')
    into p from pg_sequences where schemaname = any(c_scheme);
  o := o || E'-- ── SECVENTE ──────────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(pg_get_functiondef(pr.oid) || ';', E'\n\n' order by n.nspname, pr.proname, pr.oid), '')
    into p from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
   where n.nspname = any(c_scheme) and pr.prokind in ('f', 'p');
  o := o || E'-- ── FUNCTII ───────────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(ddl, E'\n\n' order by schema, tabela), '') into p
  from (
    select n.nspname as schema, c.relname as tabela,
           format('create table if not exists %I.%I (%s%s);', n.nspname, c.relname, E'\n  ', cols) as ddl
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join lateral (
        select string_agg(
                 format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                        case
                          /*
                           * COLOANELE GENERATE, nu `default`.
                           *
                           * `pg_attrdef` tine si expresia unei coloane generate, iar
                           * forma dintai o scria ca `default <expresie>`. Doua urmari,
                           * amandoua rele: pe o baza goala nici nu se aplica (un
                           * `default` nu poate citi alta coloana), iar daca s-ar fi
                           * aplicat ar fi iesit o coloana OBISNUITA cu valoare
                           * initiala — care nu se recalculeaza niciodata.
                           * `customers.key` e cheia de dedublare a clientilor: ca
                           * `default`, n-ar mai urmari schimbarea telefonului sau a
                           * emailului. Gasit de proba de restaurare pe baza goala.
                           */
                          when a.attgenerated = 's'
                            then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
                          when a.attidentity <> '' then ' generated ' ||
                             case a.attidentity when 'a' then 'always' else 'by default' end || ' as identity'
                          when ad.adbin is not null then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
                          else '' end,
                        case when a.attnotnull then ' not null' else '' end),
                 E',\n  ' order by a.attnum) as cols
          from pg_attribute a
          left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
         where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) k
     where n.nspname = any(c_scheme) and c.relkind = 'r'
  ) t;
  o := o || E'-- ── TABELE ────────────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('alter table %I.%I add constraint %I %s;', n.nspname, r.relname, c.conname, pg_get_constraintdef(c.oid)), E'\n'
           order by case c.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, n.nspname, r.relname, c.conname), '')
    into p from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace
   where n.nspname = any(c_scheme) and r.relkind = 'r';
  o := o || E'-- ── CONSTRANGERI ──────────────────────────────────────────\n' || p || E'\n\n';


  /*
   * ⚠ SINGURELE RANDURI DE DATE DIN TOT BASELINE-UL — SI NU SUNT DATE.
   *
   * `privat.campuri_secrete` spune CE COLOANE se cripteaza si pe ce cale din JSON.
   * E citita de `reconstruieste_store_settings()` si de perechea ei `_upd`, care
   * COMPUN vederea publica si declansatorul ei.
   *
   * Vederea din baseline are deja decriptarea coapta in definitie, deci o baza refacuta
   * din el decripteaza corect DE LA INCEPUT. Capcana e a doua zi: `campuri_secrete` ar fi
   * GOALA, iar prima chemare a lui `reconstruieste_store_settings()` — adica prima
   * migratie care adauga o integrare — ar reconstrui vederea FARA nicio decriptare.
   *
   * Si rezultatul n-ar fi o eroare, ci cel mai rau lucru cu putinta: aplicatia ar citi
   * `enc.v1.…` drept credentiala si l-ar trimite asa la toti furnizorii. Exact clasa de
   * defecte din 15.08.2026, cand 21 de citiri ramasesera neconvertite si GA, GMC, OLX,
   * SMSO, Notice, Trendyol si SMTP trimiteau sirul criptat pe post de cheie.
   *
   * Deci randurile astea nu sunt CONTINUT, sunt INTELESUL schemei — un fel de enumerare
   * tinuta intr-un tabel. Restul tabelelor raman in afara, si nu din ezitare: comenzile,
   * magazinele si jurnalele sunt date ale clientilor, iar `catalog_*_murdar` sunt cozi de
   * invalidare (business_id + marcat_la), adevarate doar in clipa in care au fost scrise.
   *
   * ⚠ Se emite DUPA constrangeri, ca sa existe cheia primara pe care se sprijina
   * `on conflict do nothing` — altfel o a doua aplicare ar cadea pe duplicat.
   */
  select coalesce(string_agg(
           format('insert into privat.campuri_secrete (coloana, cale) values (%L, %L) on conflict do nothing;', coloana, cale),
           E'\n' order by coloana, cale), '')
    into p from privat.campuri_secrete;
  o := o || E'-- ── CAMPURI CRIPTATE ──────────────────────────────────────\n'
         || E'-- Randuri, nu date: fara ele, prima reconstruire a vederii o lasa FARA decriptare.\n'
         || p || E'\n\n';

  select coalesce(string_agg(pg_get_indexdef(i.indexrelid) || ';', E'\n' order by n.nspname, ic.relname), '')
    into p from pg_index i join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid join pg_namespace n on n.oid = tc.relnamespace
   where n.nspname = any(c_scheme) and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid);
  o := o || E'-- ── INDEXURI ──────────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('create or replace view %I.%I%s as%s%s', schemaname, viewname,
           case when viewname = 'store_settings' then ' with (security_invoker = true)' else '' end, E'\n', definition), E'\n\n' order by schemaname, viewname), '')
    into p from pg_views where schemaname = any(c_scheme);
  o := o || E'-- ── VEDERI ────────────────────────────────────────────────\n-- ATENTIE: `security_invoker` pe store_settings NU e optional.\n' || p || E'\n\n';

  select coalesce(string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' order by n.nspname, c.relname, t.tgname), '')
    into p from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = any(c_scheme) and not t.tgisinternal;
  o := o || E'-- ── DECLANSATOARE ─────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('alter table %I.%I enable row level security;', n.nspname, c.relname), E'\n' order by n.nspname, c.relname), '')
    into p from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = any(c_scheme) and c.relkind = 'r' and c.relrowsecurity;
  o := o || E'-- ── RLS ───────────────────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('create policy %I on %I.%I as %s for %s to %s%s%s;',
           pol.policyname, pol.schemaname, pol.tablename, pol.permissive, pol.cmd, array_to_string(pol.roles, ', '),
           case when pol.qual is null then '' else ' using (' || pol.qual || ')' end,
           case when pol.with_check is null then '' else ' with check (' || pol.with_check || ')' end),
           E'\n' order by pol.schemaname, pol.tablename, pol.policyname), '')
    into p from pg_policies pol where pol.schemaname = any(c_scheme);
  o := o || p || E'\n\n';

  select coalesce(string_agg(format('grant usage on schema %I to %I;', nspname, r), E'\n' order by nspname, r), '')
    into p from pg_namespace n cross join lateral (select unnest(array['anon','authenticated','service_role']) as r) g
   where n.nspname = any(c_scheme) and has_schema_privilege(g.r, n.oid, 'USAGE');
  o := o || E'-- ── ACCES LA SCHEME ───────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('grant %s on table %I.%I to %I;', privilege_type, table_schema, table_name, grantee),
           E'\n' order by table_schema, table_name, grantee, privilege_type), '')
    into p from information_schema.role_table_grants
   where table_schema = any(c_scheme) and grantee in ('anon', 'authenticated', 'service_role');
  o := o || E'-- ── GRANTURI PE TABELE ────────────────────────────────────\n' || p || E'\n\n';

  select coalesce(string_agg(format('grant %s (%I) on table %I.%I to %I;', privilege_type, column_name, table_schema, table_name, grantee),
           E'\n' order by table_schema, table_name, column_name, grantee, privilege_type), '')
    into p from information_schema.column_privileges cp
   where cp.table_schema = any(c_scheme) and cp.grantee in ('anon', 'authenticated', 'service_role')
     and not exists (select 1 from information_schema.role_table_grants g
                      where g.table_schema = cp.table_schema and g.table_name = cp.table_name
                        and g.grantee = cp.grantee and g.privilege_type = cp.privilege_type);
  o := o || E'-- ── GRANTURI PE COLOANA (RLS verifica RANDURI, nu COLOANE) ─\n' || p || E'\n\n';

  select coalesce(string_agg(format('grant execute on function %I.%I(%s) to %I;',
           n.nspname, pr.proname, pg_get_function_identity_arguments(pr.oid), a.grantee), E'\n' order by n.nspname, pr.proname, a.grantee), '')
    into p from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    cross join lateral aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) x
    cross join lateral (select pg_get_userbyid(x.grantee) as grantee) a
   where n.nspname = any(c_scheme) and x.privilege_type = 'EXECUTE'
     and a.grantee in ('anon', 'authenticated', 'service_role');
  o := o || E'-- ── GRANTURI PE FUNCTII ───────────────────────────────────\n' || p || E'\n\n'
         || E'notify pgrst, ''reload schema'';\n';
  return o;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users_profile (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_support_message_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.support_tickets
  SET
    updated_at = now(),
    has_unread_reply = CASE WHEN NEW.sender_type = 'agent' THEN true ELSE has_unread_reply END,
    status = CASE
      WHEN NEW.sender_type = 'agent' AND status = 'open' THEN 'in_progress'
      WHEN NEW.sender_type = 'user' AND status = 'resolved' THEN 'open'
      ELSE status
    END
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inceput_fereastra_ro(p_zile integer, p_deplasare integer DEFAULT 0)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select ((((now() at time zone 'Europe/Bucharest')::date
            - (greatest(coalesce(p_zile, 30), 1) * (coalesce(p_deplasare, 0) + 1) - 1))::timestamp)
          at time zone 'Europe/Bucharest')
$function$
;

CREATE OR REPLACE FUNCTION public.incheie_operatie_externa(p_id uuid, p_business_id uuid, p_stare text, p_referinta_externa text DEFAULT NULL::text, p_detalii jsonb DEFAULT NULL::jsonb, p_eroare text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ex public.operatii_externe%rowtype;
begin
  if p_stare not in ('reusit', 'esuat', 'necunoscut') then
    return jsonb_build_object('gasit', false, 'motiv', 'stare nevalida');
  end if;

  update public.operatii_externe o
     set stare             = p_stare,
         referinta_externa = coalesce(p_referinta_externa, o.referinta_externa),
         detalii           = coalesce(p_detalii, o.detalii),
         ultima_eroare     = case when p_stare = 'reusit' then null
                                  else coalesce(p_eroare, o.ultima_eroare) end,
         actualizat_la     = now()
   where o.id = p_id
     and o.business_id is not distinct from p_business_id
     and o.stare in ('in_curs', 'necunoscut')
  returning o.* into v_ex;

  if found then
    return jsonb_build_object('gasit', true, 'stare', v_ex.stare,
                              'referinta_externa', v_ex.referinta_externa);
  end if;

  select * into v_ex from public.operatii_externe where id = p_id;
  if not found then
    return jsonb_build_object('gasit', false);
  end if;
  if v_ex.business_id is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;
  return jsonb_build_object('gasit', true, 'deja', true, 'stare', v_ex.stare,
                            'referinta_externa', v_ex.referinta_externa);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_discount_uses(p_discount_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.discounts
  SET uses_count = uses_count + 1, updated_at = now()
  WHERE id = p_discount_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_offer_stats(p_offer_id uuid, p_impressions integer DEFAULT 0, p_conversions integer DEFAULT 0, p_revenue numeric DEFAULT 0)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.offers
     set impressions   = impressions   + coalesce(p_impressions, 0),
         conversions   = conversions   + coalesce(p_conversions, 0),
         revenue_added = revenue_added + coalesce(p_revenue, 0)
   where id = p_offer_id;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_referral_balance(p_user_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.referral_balance (user_id, total_earned, available_balance)
  values (p_user_id, p_amount, p_amount)
  on conflict (user_id) do update set
    total_earned = referral_balance.total_earned + p_amount,
    available_balance = referral_balance.available_balance + p_amount,
    updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_tool_views(tool_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tools SET views = COALESCE(views, 0) + 1 WHERE id = tool_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.jsonb_merge_config(p_business_id uuid, p_column text, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'privat', 'pg_temp'
AS $function$
begin
  -- Numele coloanei intra intr-un `format(%I)`, deci il marginim la coloanele de
  -- configurare. Fara asta, apelantul ar alege orice coloana din tabel.
  if p_column is null or p_column !~ '^[a-z][a-z0-9_]*_config$' then
    raise exception 'coloana de configurare invalida: %', p_column;
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'peticul trebuie sa fie un obiect jsonb';
  end if;

  execute format(
    'update public.store_settings set %I = coalesce(%I, ''{}''::jsonb) || $1, updated_at = now() where business_id = $2',
    p_column, p_column
  ) using p_patch, p_business_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marcheaza_operatie_anulata(p_business_id uuid, p_cheie text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ex public.operatii_externe%rowtype;
begin
  if coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('gasit', false, 'motiv', 'argumente lipsa');
  end if;

  update public.operatii_externe o
     set stare         = 'anulat',
         actualizat_la = now()
   where o.business_id is not distinct from p_business_id
     and o.cheie       = p_cheie
     and o.stare in ('reusit', 'necunoscut')
  returning o.* into v_ex;

  if not found then
    return jsonb_build_object('gasit', false);
  end if;

  return jsonb_build_object('gasit', true, 'referinta_externa', v_ex.referinta_externa);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_payout_complete(p_user_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.referral_balance
  set
    total_paid_out = total_paid_out + p_amount,
    updated_at = now()
  where user_id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.next_order_number(p_business_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
BEGIN
  UPDATE store_settings
  SET order_counter = order_counter + 1
  WHERE business_id = p_business_id
  RETURNING order_counter INTO v_next;

  -- If no store_settings row exists, return 1
  IF v_next IS NULL THEN
    v_next := 1;
  END IF;

  RETURN v_next;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_phone(raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select case when s2 like '0%' then substr(s2, 2) else s2 end
  from (
    select case
      when s like '0040%' then substr(s, 5)
      when s like '40%' and length(s) > 9 then substr(s, 3)
      else s
    end as s2
    from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as s) t1
  ) t2
$function$
;

CREATE OR REPLACE FUNCTION public.numar_produse_si_comenzi()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'produse', coalesce((
      select jsonb_object_agg(t.business_id::text, t.n)
        from (select p.business_id, count(*) as n from public.products p group by p.business_id) t
    ), '{}'::jsonb),
    'comenzi', coalesce((
      select jsonb_object_agg(t.business_id::text, t.n)
        from (select o.business_id, count(*) as n from public.orders o group by o.business_id) t
    ), '{}'::jsonb)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.order_customer_key(customer_phone text, customer_email text, order_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select coalesce(
    nullif(public.normalize_phone(customer_phone), ''),
    case when nullif(lower(trim(coalesce(customer_email, ''))), '') is not null
         then 'email:' || lower(trim(customer_email)) end,
    'order:' || order_id::text
  )
$function$
;

CREATE OR REPLACE FUNCTION public.orders_county_counts(bid uuid)
 RETURNS TABLE(county text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select nullif(trim(o.shipping_address->>'county'), '') as county,
         count(*)::bigint as cnt
  from public.orders o
  where o.business_id = bid
    and o.status not in ('cancelled', 'refunded')
    and nullif(trim(o.shipping_address->>'county'), '') is not null
  group by 1
$function$
;

CREATE OR REPLACE FUNCTION public.orders_daily_revenue(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(day date, revenue numeric, order_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select (o.created_at at time zone 'UTC')::date as day,
         round(coalesce(sum(o.total), 0), 2) as revenue,
         count(*)::bigint as order_count
  from public.orders o
  where o.business_id = bid
    and o.status not in ('cancelled', 'refunded')
    and o.created_at >= t_from
    and (t_to is null or o.created_at < t_to)
  group by 1
  order by 1
$function$
;

CREATE OR REPLACE FUNCTION public.orders_revenue_sum(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select round(coalesce(sum(o.total), 0), 2)
  from public.orders o
  where o.business_id = bid
    and o.status not in ('cancelled', 'refunded')
    and o.created_at >= t_from
    and (t_to is null or o.created_at < t_to)
$function$
;

CREATE OR REPLACE FUNCTION public.orders_status_counts(bid uuid)
 RETURNS TABLE(status text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select o.status, count(*)::bigint as cnt
  from public.orders o
  where o.business_id = bid
  group by o.status
$function$
;

CREATE OR REPLACE FUNCTION public.orders_venit_zilnic(bid uuid, p_zile integer, p_deplasare integer DEFAULT 0)
 RETURNS TABLE(day date, revenue numeric, order_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from public.orders_daily_revenue(
    bid,
    public.inceput_fereastra_ro(p_zile, coalesce(p_deplasare, 0)),
    case when coalesce(p_deplasare, 0) = 0 then null
         else public.inceput_fereastra_ro(p_zile, coalesce(p_deplasare, 0) - 1) end
  )
$function$
;

CREATE OR REPLACE FUNCTION public.posta_aloca_cod(p_business_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_numar bigint;
  v_prefix text;
  v_cifre smallint;
begin
  update public.posta_plaja
     set urmator = urmator + 1,
         updated_at = now()
   where business_id = p_business_id
     and urmator <= pana_la
  returning urmator - 1, prefix, cifre
    into v_numar, v_prefix, v_cifre;

  if v_numar is null then
    return null;
  end if;

  return v_prefix || lpad(v_numar::text, v_cifre, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.proba_stoc()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
declare
  v_biz uuid; v_pid uuid; v_oid uuid;
  v_r jsonb; v_v int; v_prod int;
  v_pasi jsonb := '[]'::jsonb;
  v_ok boolean := true;
begin
  /*
   * PROBA CICLULUI DE STOC, pe date SINTETICE, intr-o tranzactie care se ANULEAZA.
   *
   * Tot ce se scrie mai jos — produs, comanda, scaderi — dispare la iesire:
   * blocul `exception` din plpgsql e o subtranzactie, iar `raise` la final o
   * intoarce. Verdictul supravietuieste fiindca il purtam in mesajul exceptiei.
   *
   * De ce sintetic si nu pe marfa adevarata: proba scade si pune inapoi stoc. Pe
   * un produs real, o rulare intrerupta la mijloc ar lasa stocul gresit — adica
   * santinela ar deveni ea cauza defectului pe care il cauta.
   *
   * ⚠ DOUA marimi, nu una, si asta e tot rostul.
   *
   * Prima forma a probei avea o singura marime, si a picat imediat: cu o singura
   * combinatie, `products.stock_quantity` (care e SUMA) ajunge la zero odata cu
   * ea, deci refuza verificarea de PRODUS si nu se mai ajunge la cea de varianta.
   * Adica proba trecea printr-un drum pe care defectul N-A EXISTAT NICIODATA.
   *
   * Cu doua marimi — una de 1 bucata, alta de 5 — produsul are „stoc" 6 si trece
   * senin, iar singurul lucru care mai poate refuza a doua bucata de PROBA e
   * verificarea pe combinatie. Exact cursa din 18.08.
   */
  begin
    select id into v_biz from businesses where is_published order by created_at limit 1;
    if v_biz is null then
      return jsonb_build_object('ok', false, 'motiv', 'niciun magazin publicat');
    end if;

    insert into products (business_id, name, slug, price, is_active, track_inventory,
                          stock_quantity, page_sections)
    values (v_biz, 'ZZ proba santinela', 'zz-proba-santinela-' || gen_random_uuid()::text,
            10, false, true, 6,
            jsonb_build_object('variants', jsonb_build_object(
              'enabled', true, 'combinations', jsonb_build_array(
                jsonb_build_object('title', 'PROBA',  'enabled', true, 'stock_quantity', 1),
                jsonb_build_object('title', 'PROBA2', 'enabled', true, 'stock_quantity', 5)))))
    returning id into v_pid;

    select stock_quantity into v_prod from products where id = v_pid;
    if v_prod <> 6 then
      v_ok := false;
      v_pasi := v_pasi || jsonb_build_object('pas', 'stocul produsului = suma marimilor', 'ok', false,
                  'detaliu', format('produsul are %s in loc de 6 — declansatorul de insumare nu si-a facut treaba', v_prod));
    else
      v_pasi := v_pasi || jsonb_build_object('pas', 'stocul produsului = suma marimilor', 'ok', true);
    end if;

    -- ── 1. singura bucata din PROBA se poate lua ──────────────────────────────
    v_r := public.revendica_stoc_complet(
             jsonb_build_array(jsonb_build_object('product_id', v_pid, 'quantity', 1)),
             jsonb_build_array(jsonb_build_object('product_id', v_pid, 'variant_title', 'PROBA', 'quantity', 1)));
    select floor((c->>'stock_quantity')::numeric)::int into v_v
      from products p, lateral jsonb_array_elements(p.page_sections->'variants'->'combinations') c
     where p.id = v_pid and c->>'title' = 'PROBA' limit 1;
    if (v_r->>'ok')::boolean is not true or v_v <> 0 then
      v_ok := false;
      v_pasi := v_pasi || jsonb_build_object('pas', 'revendicare', 'ok', false,
                  'detaliu', format('raspuns %s, marimea a ramas %s in loc de 0', v_r::text, v_v));
    else
      v_pasi := v_pasi || jsonb_build_object('pas', 'revendicare', 'ok', true);
    end if;

    -- ── 2. A DOUA bucata TREBUIE refuzata, si PE MARIME ───────────────────────
    -- Produsul mai are 5 (din PROBA2), deci verificarea de produs trece. Daca aici
    -- vine `ok:true`, cursa de supravanzare e din nou deschisa.
    v_r := public.revendica_stoc_complet(
             jsonb_build_array(jsonb_build_object('product_id', v_pid, 'quantity', 1)),
             jsonb_build_array(jsonb_build_object('product_id', v_pid, 'variant_title', 'PROBA', 'quantity', 1)));
    if (v_r->>'ok')::boolean is not false then
      v_ok := false;
      v_pasi := v_pasi || jsonb_build_object('pas', 'a doua bucata din marimea epuizata e REFUZATA', 'ok', false,
                  'detaliu', format('SUPRAVANZARE: a trecut, raspuns %s', v_r::text));
    elsif v_r->>'varianta' is distinct from 'PROBA' then
      v_ok := false;
      v_pasi := v_pasi || jsonb_build_object('pas', 'a doua bucata din marimea epuizata e REFUZATA', 'ok', false,
                  'detaliu', format('refuzat, dar fara numele marimii: %s', v_r::text));
    else
      v_pasi := v_pasi || jsonb_build_object('pas', 'a doua bucata din marimea epuizata e REFUZATA', 'ok', true);
    end if;

    -- ── 3. anularea comenzii pune marfa inapoi ────────────────────────────────
    insert into orders (business_id, customer_name, customer_phone, order_number, items,
                        shipping_address, subtotal, total, status, stoc_rezervat)
    values (v_biz, 'Proba Santinela', '0700000000', 'ZZ-' || substr(gen_random_uuid()::text, 1, 8),
            '[]'::jsonb, '{}'::jsonb, 10, 10, 'pending',
            jsonb_build_object(
              'produse',  jsonb_build_array(jsonb_build_object('product_id', v_pid, 'quantity', 1)),
              'variante', jsonb_build_array(jsonb_build_object('product_id', v_pid, 'variant_title', 'PROBA', 'quantity', 1))))
    returning id into v_oid;

    v_r := public.aplica_tranzitia_comenzii(v_oid, 'cancelled', null, v_biz);
    select floor((c->>'stock_quantity')::numeric)::int into v_v
      from products p, lateral jsonb_array_elements(p.page_sections->'variants'->'combinations') c
     where p.id = v_pid and c->>'title' = 'PROBA' limit 1;
    if v_r->>'stoc' <> 'eliberat' or v_v <> 1 then
      v_ok := false;
      v_pasi := v_pasi || jsonb_build_object('pas', 'anularea pune MARIMEA inapoi', 'ok', false,
                  'detaliu', format('stoc=%s, marimea a ramas %s in loc de 1', v_r->>'stoc', v_v));
    else
      v_pasi := v_pasi || jsonb_build_object('pas', 'anularea pune MARIMEA inapoi', 'ok', true);
    end if;

    -- ── 4. reactivarea o ia inapoi ────────────────────────────────────────────
    v_r := public.aplica_tranzitia_comenzii(v_oid, 'confirmed', null, v_biz);
    select floor((c->>'stock_quantity')::numeric)::int into v_v
      from products p, lateral jsonb_array_elements(p.page_sections->'variants'->'combinations') c
     where p.id = v_pid and c->>'title' = 'PROBA' limit 1;
    if v_v <> 0 then
      v_ok := false;
      v_pasi := v_pasi || jsonb_build_object('pas', 'reactivarea scade la loc', 'ok', false,
                  'detaliu', format('marimea a ramas %s in loc de 0', v_v));
    else
      v_pasi := v_pasi || jsonb_build_object('pas', 'reactivarea scade la loc', 'ok', true);
    end if;

    raise exception 'PROBA_GATA:%', jsonb_build_object('ok', v_ok, 'pasi', v_pasi)::text;

  exception when others then
    if sqlerrm like 'PROBA_GATA:%' then
      return substr(sqlerrm, 12)::jsonb;
    end if;
    return jsonb_build_object('ok', false, 'motiv', format('[%s] %s', sqlstate, sqlerrm), 'pasi', v_pasi);
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reclaim_order_discount(p_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_discount_id uuid;
  v_randuri     integer;
begin
  select discount_id into v_discount_id
  from public.orders
  where id = p_order_id
    and discount_id is not null
    and discount_released_at is not null
  for update;

  if v_discount_id is null then
    return 'nimic';
  end if;

  update public.discounts
  set uses_count = uses_count + 1, updated_at = now()
  where id = v_discount_id
    and (max_uses is null or uses_count < max_uses);

  get diagnostics v_randuri = row_count;
  if v_randuri = 0 then
    return 'plin';
  end if;

  update public.orders
  set discount_released_at = null
  where id = p_order_id;

  return 'reluat';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.release_discount_use(p_discount_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.discounts
  SET uses_count = GREATEST(uses_count - 1, 0), updated_at = now()
  WHERE id = p_discount_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_order_discount(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_discount_id uuid;
begin
  update public.orders
  set discount_released_at = now()
  where id = p_order_id
    and discount_id is not null
    and discount_released_at is null
  returning discount_id into v_discount_id;

  if v_discount_id is null then
    return false;
  end if;

  update public.discounts
  set uses_count = greatest(uses_count - 1, 0), updated_at = now()
  where id = v_discount_id;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repretuieste_pachetele_cu(p_component_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_suma    numeric;
  v_lipsa   integer;
  v_pret    numeric;
  v_procent numeric;
  v_valoare numeric;
begin
  for r in
    select b.id, b.business_id,
           b.page_sections->'bundle' as cfg,
           b.page_sections->'bundle'->>'pricing_mode' as mod
    from public.products b
    where b.is_bundle
      and b.page_sections->'bundle'->'items' @> jsonb_build_array(jsonb_build_object('product_id', p_component_id::text))
  loop
    if coalesce(r.mod, 'fixed') = 'fixed' then
      continue;
    end if;

    v_procent := coalesce((r.cfg->>'discount_percent')::numeric, 0);
    v_valoare := coalesce((r.cfg->>'discount_amount')::numeric, 0);

    select coalesce(sum(round(c.price, 2) * greatest(coalesce((it->>'quantity')::numeric, 1), 1)), 0),
           count(*) filter (where c.id is null)
      into v_suma, v_lipsa
      from jsonb_array_elements(r.cfg->'items') it
      left join public.products c on c.id = (it->>'product_id')::uuid;

    if v_lipsa > 0 or v_suma <= 0 then
      continue;
    end if;

    if r.mod = 'discount_percent' then
      v_pret := round(v_suma * (1 - least(greatest(v_procent, 0), 100) / 100), 2);
    else
      v_pret := round(greatest(v_suma - greatest(v_valoare, 0), 0), 2);
    end if;

    update public.products
    set price = v_pret, compare_at_price = round(v_suma, 2), updated_at = now()
    where id = r.id
      and (price is distinct from v_pret or compare_at_price is distinct from round(v_suma, 2));

    -- Pretul schimbat in baza trebuie sa ajunga si in feeduri, altfel Google
    -- ramane pe cel vechi: exact divergenta pagina-vs-feed pe care o inchide
    -- constatarea 19. Cronul citeste strict din coada, deci pachetul se pune aici.
    -- `where found` — doar cand chiar s-a scris ceva.
    if found then
      insert into public.gmc_sync_queue (business_id, product_id, offer_id, op)
      values (r.business_id, r.id, r.id, 'upsert')
      on conflict (business_id, offer_id, op) do nothing;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_payout_balance(p_user_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.referral_balance
  set
    available_balance = available_balance - p_amount,
    updated_at = now()
  where user_id = p_user_id
    and available_balance >= p_amount;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reseteaza_limita(p_cheie text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from public.rate_limits where cheie = p_cheie;
$function$
;

CREATE OR REPLACE FUNCTION public.restaureaza_variante_batch(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r      record;
  v_idx  int;
  v_stoc int;
  v_tip  text;
begin
  for r in
    select (i->>'product_id')::uuid as pid,
           i->>'variant_title'      as titlu,
           greatest(0, coalesce((i->>'quantity')::int, 0)) as cerut
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
     where i->>'product_id' is not null
       and i->>'variant_title' is not null
     order by 1, 2
  loop
    if r.cerut <= 0 then continue; end if;
    perform 1 from products where id = r.pid for update;
    v_idx := null;
    select t.idx,
           floor((t.c->>'stock_quantity')::numeric)::int,
           jsonb_typeof(t.c->'stock_quantity')
      into v_idx, v_stoc, v_tip
    from products p,
         lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                 with ordinality as t(c, idx)
    where p.id = r.pid
      and t.c->>'title' = r.titlu
      and (t.c->>'enabled')::boolean is true
      and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
    order by t.idx
    limit 1;
    if v_idx is null then continue; end if;
    update products p
    set page_sections = jsonb_set(
          p.page_sections,
          array['variants', 'combinations', (v_idx - 1)::text, 'stock_quantity'],
          case when v_tip = 'string' then to_jsonb((v_stoc + r.cerut)::text)
               else to_jsonb(v_stoc + r.cerut) end
        )
    where p.id = r.pid;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revendica_din_coada(p_coada text, p_limita integer DEFAULT 50, p_lease interval DEFAULT '00:05:00'::interval)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_permise constant text[] := array[
    'gmc_sync_queue', 'olx_sync_queue', 'trendyol_sync_queue', 'aboutyou_sync_queue',
    'emag_sync_queue'];
begin
  /*
   * Ia randuri din coada SI LE INCUIE, ca doua rulari sa nu apuce aceleasi.
   *
   * `for update skip locked` face ca al doilea lucrator sa treaca peste ce e
   * incuiat, in loc sa astepte. `revendicat_pana` e a doua plasa: daca un
   * lucrator moare la mijloc, lacatul dispare odata cu tranzactia, dar marcajul
   * tine randul deoparte cinci minute.
   *
   * Numele tabelei se compune dinamic, deci trece printr-o lista PERMISA.
   *
   * ATENTIE: `as materialized` nu e decor. Cu subinterogarea inline in
   * `where id in (...)`, planificatorul o poate re-evalua in semi-join si LIMIT
   * isi pierde intelesul — masurat candva la 6 randuri cu limit 3, revendica
   * toate sase. Pe PostgreSQL 17.6 nu s-a mai reprodus (probat la 6 si la 500 de
   * randuri), dar forma materializata nu depinde de alegerea planificatorului,
   * deci ea ramane.
   */
  if not (p_coada = any(v_permise)) then
    raise exception 'coada necunoscuta: %', p_coada;
  end if;

  return query execute format($f$
    with alese as materialized (
      select c.id from public.%I c
       where c.revendicat_pana is null or c.revendicat_pana < now()
       order by c.created_at
       limit $2
       for update skip locked)
    update public.%I q
       set revendicat_pana = now() + $1
      from alese a
     where q.id = a.id
    returning to_jsonb(q.*)
  $f$, p_coada, p_coada) using p_lease, p_limita;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revendica_stoc_batch(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cerute jsonb;
  r        record;
  v_track  boolean;
  v_stoc   int;
  v_nume   text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'qty', qty) order by pid), '[]'::jsonb)
    into v_cerute
  from (
    select (i->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
    from jsonb_array_elements(p_items) i
    where i->>'product_id' is not null
    group by 1
  ) t
  where qty > 0;

  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
           from jsonb_array_elements(v_cerute) e
  loop
    select p.track_inventory, p.stock_quantity, p.name
      into v_track, v_stoc, v_nume
    from products p
    where p.id = r.pid
    for update;

    if not found or v_track is not true or v_stoc is null then
      continue;
    end if;

    if v_stoc < r.qty then
      return jsonb_build_object(
        'ok', false, 'produs', r.pid, 'nume', v_nume, 'disponibil', greatest(0, v_stoc)
      );
    end if;
  end loop;

  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
           from jsonb_array_elements(v_cerute) e
  loop
    update products
    set stock_quantity = stock_quantity - r.qty
    where id = r.pid
      and track_inventory = true
      and stock_quantity is not null;
  end loop;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revendica_stoc_comanda(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rez jsonb; r record; v_negative jsonb := '[]'::jsonb; v_nou int; v_v jsonb;
begin
  update public.orders set stoc_eliberat_la = null
   where id = p_order_id and stoc_eliberat_la is not null and stoc_rezervat is not null
  returning stoc_rezervat into v_rez;
  if v_rez is null then return jsonb_build_object('fel','nimic'); end if;

  for r in
    select (e->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int,0)))::int as qty
      from jsonb_array_elements(coalesce(v_rez->'produse','[]'::jsonb)) e
     where e->>'product_id' is not null group by 1
    having sum(greatest(0, coalesce((e->>'quantity')::int,0))) > 0 order by 1
  loop
    update products set stock_quantity = stock_quantity - r.qty
     where id = r.pid and track_inventory = true and stock_quantity is not null
    returning stock_quantity into v_nou;
    if v_nou is not null and v_nou < 0 then
      v_negative := v_negative || jsonb_build_object('product_id', r.pid, 'stoc', v_nou);
    end if;
  end loop;

  v_v := public.scade_variante_raportat(coalesce(v_rez->'variante','[]'::jsonb));
  if jsonb_array_length(coalesce(v_v->'lipsa','[]'::jsonb)) > 0 then
    v_negative := v_negative || (v_v->'lipsa');
  end if;
  return jsonb_build_object('fel','revendicat','negative', v_negative);
end; $function$
;

CREATE OR REPLACE FUNCTION public.revendica_stoc_complet(p_produse jsonb, p_variante jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prod  jsonb;
  v_var   jsonb;
  r       record;
  v_track boolean;
  v_stoc  int;
  v_nume  text;
  v_idx   int;
  v_tip   text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'qty', qty) order by pid), '[]'::jsonb)
    into v_prod
  from (
    select (i->>'product_id')::uuid as pid,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse, '[]'::jsonb)) i
     where i->>'product_id' is not null
     group by 1
  ) t
  where qty > 0;

  select coalesce(jsonb_agg(jsonb_build_object('pid', pid, 'titlu', titlu, 'qty', qty)
                            order by pid, titlu), '[]'::jsonb)
    into v_var
  from (
    select (i->>'product_id')::uuid as pid,
           i->>'variant_title'      as titlu,
           sum(greatest(0, coalesce((i->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_variante, '[]'::jsonb)) i
     where i->>'product_id' is not null
       and i->>'variant_title' is not null
     group by 1, 2
  ) t
  where qty > 0;

  for r in
    select pid from (
      select (e->>'pid')::uuid as pid from jsonb_array_elements(v_prod) e
      union
      select (e->>'pid')::uuid as pid from jsonb_array_elements(v_var) e
    ) t order by pid
  loop
    perform 1 from products where id = r.pid for update;
  end loop;

  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
             from jsonb_array_elements(v_prod) e
  loop
    select p.track_inventory, p.stock_quantity, p.name
      into v_track, v_stoc, v_nume
      from products p where p.id = r.pid;

    if not found or v_track is not true or v_stoc is null then continue; end if;

    if v_stoc < r.qty then
      return jsonb_build_object(
        'ok', false, 'produs', r.pid, 'nume', v_nume, 'disponibil', greatest(0, v_stoc));
    end if;
  end loop;

  for r in select (e->>'pid')::uuid as pid, e->>'titlu' as titlu, (e->>'qty')::int as qty
             from jsonb_array_elements(v_var) e
  loop
    v_idx := null;
    select t.idx, floor((t.c->>'stock_quantity')::numeric)::int, p.name
      into v_idx, v_stoc, v_nume
      from products p,
           lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                   with ordinality as t(c, idx)
     where p.id = r.pid
       and t.c->>'title' = r.titlu
       and (t.c->>'enabled')::boolean is true
       and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
     order by t.idx
     limit 1;

    if v_idx is null then continue; end if;

    if v_stoc < r.qty then
      return jsonb_build_object(
        'ok', false, 'produs', r.pid, 'nume', v_nume,
        'varianta', r.titlu, 'disponibil', greatest(0, v_stoc));
    end if;
  end loop;

  for r in select (e->>'pid')::uuid as pid, (e->>'qty')::int as qty
             from jsonb_array_elements(v_prod) e
  loop
    update products
       set stock_quantity = stock_quantity - r.qty
     where id = r.pid and track_inventory = true and stock_quantity is not null;
  end loop;

  for r in select (e->>'pid')::uuid as pid, e->>'titlu' as titlu, (e->>'qty')::int as qty
             from jsonb_array_elements(v_var) e
  loop
    v_idx := null;
    select t.idx,
           floor((t.c->>'stock_quantity')::numeric)::int,
           jsonb_typeof(t.c->'stock_quantity')
      into v_idx, v_stoc, v_tip
      from products p,
           lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                   with ordinality as t(c, idx)
     where p.id = r.pid
       and t.c->>'title' = r.titlu
       and (t.c->>'enabled')::boolean is true
       and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
     order by t.idx
     limit 1;
    if v_idx is null then continue; end if;

    update products p
       set page_sections = jsonb_set(
             p.page_sections,
             array['variants', 'combinations', (v_idx - 1)::text, 'stock_quantity'],
             case when v_tip = 'string' then to_jsonb((v_stoc - r.qty)::text)
                  else to_jsonb(v_stoc - r.qty) end)
     where p.id = r.pid;
  end loop;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rezerva_operatie_externa(p_business_id uuid, p_order_id uuid, p_fel text, p_furnizor text, p_cheie text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_biz    uuid;
  v_numar  text;
  v_id     uuid;
  v_ex     public.operatii_externe%rowtype;
  v_nul constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if coalesce(btrim(p_cheie), '') = '' then
    return jsonb_build_object('rezervat', false, 'motiv', 'fara cheie');
  end if;

  if p_business_id is null and p_order_id is not null then
    return jsonb_build_object('rezervat', false, 'motiv', 'comanda fara magazin');
  end if;

  if p_order_id is not null then
    select o.business_id, o.order_number into v_biz, v_numar
      from public.orders o
     where o.id = p_order_id;

    if not found then
      return jsonb_build_object('rezervat', false, 'motiv', 'comanda negasita');
    end if;
    if v_biz is distinct from p_business_id then
      return jsonb_build_object('rezervat', false, 'motiv', 'alt magazin');
    end if;
  end if;

  insert into public.operatii_externe
    (business_id, order_id, order_number, fel, furnizor, cheie, incercari)
  values
    (p_business_id, p_order_id, v_numar, p_fel, p_furnizor, p_cheie, 1)
  on conflict (coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), cheie)
    where stare in ('in_curs', 'reusit', 'necunoscut')
  do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('rezervat', true, 'id', v_id);
  end if;

  update public.operatii_externe o
     set incercari     = o.incercari + 1,
         actualizat_la = now()
   where coalesce(o.business_id, v_nul) = coalesce(p_business_id, v_nul)
     and o.cheie = p_cheie
     and o.stare in ('in_curs', 'reusit', 'necunoscut')
  returning o.* into v_ex;

  if not found then
    return jsonb_build_object('rezervat', false, 'motiv', 'cursa');
  end if;

  return jsonb_build_object(
    'rezervat',          false,
    'motiv',             v_ex.stare,
    'id',                v_ex.id,
    'referinta_externa', v_ex.referinta_externa,
    'detalii',           v_ex.detalii,
    'incercari',         v_ex.incercari,
    'ultima_eroare',     v_ex.ultima_eroare,
    'creat_la',          v_ex.creat_la
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.scade_din_rezervat(p_rez jsonb, p_produse_minus jsonb, p_variante_minus jsonb, p_produse_necesar jsonb DEFAULT '[]'::jsonb, p_variante_necesar jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with rez_p as (
    select e->>'product_id' as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_rez->'produse', '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
  ),
  min_p as (
    select e->>'product_id' as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse_minus, '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
  ),
  nec_p as (
    select e->>'product_id' as pid,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_produse_necesar, '[]'::jsonb)) e
     where e->>'product_id' is not null
     group by 1
  ),
  calc_p as (
    -- Se poate elibera cel mult ce prisoseste peste ce mai datoreaza comanda.
    select r.pid,
           least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0)))         as eliberat,
           r.qty - least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0))) as ramas
      from rez_p r
      left join min_p m on m.pid = r.pid
      left join nec_p n on n.pid = r.pid
  ),
  rez_v as (
    select e->>'product_id' as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_rez->'variante', '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null
     group by 1, 2
  ),
  min_v as (
    select e->>'product_id' as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_variante_minus, '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null
     group by 1, 2
  ),
  nec_v as (
    select e->>'product_id' as pid, e->>'variant_title' as titlu,
           sum(greatest(0, coalesce((e->>'quantity')::int, 0)))::int as qty
      from jsonb_array_elements(coalesce(p_variante_necesar, '[]'::jsonb)) e
     where e->>'product_id' is not null and e->>'variant_title' is not null
     group by 1, 2
  ),
  calc_v as (
    select r.pid, r.titlu,
           least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0)))         as eliberat,
           r.qty - least(coalesce(m.qty, 0), greatest(0, r.qty - coalesce(n.qty, 0))) as ramas
      from rez_v r
      left join min_v m on m.pid = r.pid and m.titlu = r.titlu
      left join nec_v n on n.pid = r.pid and n.titlu = r.titlu
  )
  select jsonb_build_object(
    'rezervat', jsonb_build_object(
      'produse', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', ramas) order by pid)
                             from calc_p where ramas > 0), '[]'::jsonb),
      'variante', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', ramas) order by pid, titlu)
                             from calc_v where ramas > 0), '[]'::jsonb)),
    'produse', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', eliberat) order by pid)
                           from calc_p where eliberat > 0), '[]'::jsonb),
    'variante', coalesce((select jsonb_agg(jsonb_build_object('product_id', pid, 'variant_title', titlu, 'quantity', eliberat) order by pid, titlu)
                           from calc_v where eliberat > 0), '[]'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION public.scade_variante_raportat(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record; v_idx int; v_stoc int; v_tip text; v_luat int;
  v_lipsa jsonb := '[]'::jsonb; v_consumat jsonb := '[]'::jsonb;
begin
  for r in
    select (i->>'product_id')::uuid as pid, i->>'variant_title' as titlu,
           greatest(0, coalesce((i->>'quantity')::int, 0)) as cerut
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
     where i->>'product_id' is not null and i->>'variant_title' is not null
     order by 1, 2
  loop
    if r.cerut <= 0 then continue; end if;
    perform 1 from products where id = r.pid for update;
    v_idx := null;
    select t.idx, floor((t.c->>'stock_quantity')::numeric)::int, jsonb_typeof(t.c->'stock_quantity')
      into v_idx, v_stoc, v_tip
      from products p, lateral jsonb_array_elements(p.page_sections->'variants'->'combinations')
                              with ordinality as t(c, idx)
     where p.id = r.pid and t.c->>'title' = r.titlu
       and (t.c->>'enabled')::boolean is true
       and (t.c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
     order by t.idx limit 1;
    if v_idx is null then continue; end if;

    -- Cat s-a luat CU ADEVARAT: la plafonare, mai putin decat s-a cerut.
    v_luat := least(r.cerut, greatest(0, v_stoc));
    if v_stoc < r.cerut then
      v_lipsa := v_lipsa || jsonb_build_object(
        'product_id', r.pid, 'variant_title', r.titlu, 'cerut', r.cerut, 'disponibil', v_stoc);
    end if;
    if v_luat > 0 then
      v_consumat := v_consumat || jsonb_build_object(
        'product_id', r.pid, 'variant_title', r.titlu, 'quantity', v_luat);
    end if;

    update products p
       set page_sections = jsonb_set(p.page_sections,
             array['variants','combinations',(v_idx - 1)::text,'stock_quantity'],
             case when v_tip = 'string' then to_jsonb(greatest(0, v_stoc - r.cerut)::text)
                  else to_jsonb(greatest(0, v_stoc - r.cerut)) end)
     where p.id = r.pid;
  end loop;
  return jsonb_build_object('lipsa', v_lipsa, 'consumat', v_consumat);
end; $function$
;

CREATE OR REPLACE FUNCTION public.scrie_variante_daca_neschimbat(p_business uuid, p_product uuid, p_asteptat jsonb, p_nou jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_curent jsonb;
begin
  select page_sections into v_curent
    from products
   where id = p_product and business_id = p_business
     for update;

  if not found then return 'lipsa'; end if;
  if v_curent is distinct from p_asteptat then return 'schimbat'; end if;

  update products set page_sections = p_nou
   where id = p_product and business_id = p_business;

  return 'scris';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.semnatura_cuvant(w text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select string_agg(c, '' order by c) from regexp_split_to_table(w, '') c
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.site_analytics_breakdown(bid uuid, t_from timestamp with time zone)
 RETURNS TABLE(event_type text, device text, source text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select a.event_type, a.device, a.source, count(*)::bigint as cnt
  from public.site_analytics a
  where a.business_id = bid
    and a.created_at >= t_from
  group by 1, 2, 3
$function$
;

CREATE OR REPLACE FUNCTION public.site_analytics_breakdown_zile(bid uuid, p_zile integer)
 RETURNS TABLE(event_type text, device text, source text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with fereastra as (
    select ((now() at time zone 'Europe/Bucharest')::date
            - (greatest(coalesce(p_zile, 30), 1) - 1)) as de_la,
           (now() at time zone 'Europe/Bucharest')::date as azi
  ),
  toate as (
    select s.event_type, s.device, s.source, s.nr::bigint as cnt
      from public.business_daily_stats s, fereastra f
     where s.business_id = bid and s.zi >= f.de_la and s.zi < f.azi
    union all
    select a.event_type, coalesce(a.device, ''), coalesce(a.source, ''), 1::bigint
      from public.site_analytics a, fereastra f
     where a.business_id = bid
       and (a.created_at at time zone 'Europe/Bucharest')::date = f.azi
  )
  select t.event_type, t.device, t.source, sum(t.cnt)::bigint
    from toate t
   group by 1, 2, 3
$function$
;

CREATE OR REPLACE FUNCTION public.sterge_comanda(p_order_id uuid, p_business_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_cupon text; v_biz uuid; v_stoc text := 'nimic'; v_bool boolean;
begin
  select discount_code, business_id into v_cupon, v_biz
    from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('gasit', false); end if;
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  if v_cupon is not null then v_bool := public.release_order_discount(p_order_id); end if;
  v_stoc := coalesce(public.elibereaza_stoc_comanda(p_order_id), 'nimic');
  delete from public.orders where id = p_order_id;
  return jsonb_build_object('gasit', true, 'stoc', v_stoc);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_product_stock_from_variants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_active   int;
  v_cu_numar int;
  v_suma     int;
begin
  if tg_op = 'UPDATE'
     and new.page_sections->'variants' is not distinct from old.page_sections->'variants' then
    return new;
  end if;

  if coalesce((new.page_sections->'variants'->>'enabled')::boolean, false) is not true
     or jsonb_typeof(new.page_sections->'variants'->'combinations') <> 'array' then
    return new;
  end if;

  select count(*) filter (where (c->>'enabled')::boolean is true),
         count(*) filter (where (c->>'enabled')::boolean is true
                            and (c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'),
         coalesce(sum(case when (c->>'enabled')::boolean is true
                            and (c->>'stock_quantity') ~ '^\s*\d+(\.\d+)?\s*$'
                           then floor((c->>'stock_quantity')::numeric)::int end), 0)
    into v_active, v_cu_numar, v_suma
  from jsonb_array_elements(new.page_sections->'variants'->'combinations') as c;

  if v_active = 0 or v_cu_numar <> v_active then
    return new;
  end if;

  new.stock_quantity := v_suma;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_customers()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_stock_feed_sources()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_catalog_cuvinte_murdar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'UPDATE' and new.cauta_norm is not distinct from old.cauta_norm then
    return new;
  end if;
  insert into public.catalog_cuvinte_murdar (business_id, marcat_la)
  values (coalesce(new.business_id, old.business_id), now())
  on conflict (business_id) do update set marcat_la = now();
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_catalog_proiectie()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_doar_stoc boolean := false;
begin
  v_id := coalesce(new.id, old.id);

  if (tg_op = 'DELETE') or not coalesce(new.is_active, false) then
    delete from public.catalog_produs where product_id = v_id;
    delete from public.catalog_murdar where product_id = v_id;
    update public.catalog_produs cp
       set fara_stoc = public.catalog_fara_stoc(cp.product_id)
     where cp.is_bundle
       and exists (
         select 1 from public.products b
          where b.id = cp.product_id
            and b.page_sections->'bundle'->'items'
                @> jsonb_build_array(jsonb_build_object('product_id', v_id::text)));
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    v_doar_stoc :=
      new.name             is not distinct from old.name
      and new.description  is not distinct from old.description
      and new.category     is not distinct from old.category
      and new.tags         is not distinct from old.tags
      and new.price        is not distinct from old.price
      and new.page_sections is not distinct from old.page_sections
      and new.images       is not distinct from old.images
      and new.slug         is not distinct from old.slug;
  end if;

  insert into public.catalog_produs as cp (
    product_id, business_id, name, slug, category, prima_imagine,
    price, compare_at_price, is_featured, is_bundle, track_inventory, stock_quantity,
    sort_order, creat, are_imagine, fara_stoc, price_min, price_max, proiectat_la)
  values (
    new.id, new.business_id, new.name, new.slug, new.category,
    nullif(new.images->>0, ''),
    new.price, new.compare_at_price,
    coalesce(new.is_featured, false), coalesce(new.is_bundle, false),
    coalesce(new.track_inventory, false), new.stock_quantity,
    coalesce(new.sort_order, 0), new.created_at,
    coalesce(jsonb_array_length(coalesce(new.images, '[]'::jsonb)), 0) > 0,
    public.catalog_fara_stoc(new.id),
    new.price, new.price, null)
  on conflict (product_id) do update set
    business_id      = excluded.business_id,
    name             = excluded.name,
    slug             = excluded.slug,
    category         = excluded.category,
    prima_imagine    = excluded.prima_imagine,
    price            = excluded.price,
    compare_at_price = excluded.compare_at_price,
    is_featured      = excluded.is_featured,
    is_bundle        = excluded.is_bundle,
    track_inventory  = excluded.track_inventory,
    stock_quantity   = excluded.stock_quantity,
    sort_order       = excluded.sort_order,
    creat            = excluded.creat,
    are_imagine      = excluded.are_imagine,
    fara_stoc        = excluded.fara_stoc,
    proiectat_la     = cp.proiectat_la;

  if tg_op <> 'INSERT' and not coalesce(new.is_bundle, false) then
    update public.catalog_produs cp
       set fara_stoc = public.catalog_fara_stoc(cp.product_id)
     where cp.business_id = new.business_id
       and cp.is_bundle
       and exists (
         select 1 from public.products b
          where b.id = cp.product_id
            and b.page_sections->'bundle'->'items'
                @> jsonb_build_array(jsonb_build_object('product_id', new.id::text)));
  end if;

  if tg_op = 'INSERT' or not v_doar_stoc then
    insert into public.catalog_murdar (product_id, business_id)
    values (new.id, new.business_id)
    on conflict (product_id) do update set marcat_la = now();
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_catalog_rezumat_murdar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.catalog_rezumat_murdar (business_id, marcat_la)
  values (coalesce(new.business_id, old.business_id), now())
  on conflict (business_id) do update set marcat_la = now();
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_categorii_rezumat_murdar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.catalog_rezumat_murdar (business_id, marcat_la)
  values (coalesce(new.business_id, old.business_id), now())
  on conflict (business_id) do update set marcat_la = now();
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_repretuieste_pachetele()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.repretuieste_pachetele_cu(new.id);
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.update_domain_orders_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_support_ticket_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tool_avg_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE tools
  SET
    avg_rating = (SELECT COALESCE(AVG(rating), 0) FROM tool_ratings WHERE tool_id = COALESCE(NEW.tool_id, OLD.tool_id)),
    rating_count = (SELECT COUNT(*) FROM tool_ratings WHERE tool_id = COALESCE(NEW.tool_id, OLD.tool_id))
  WHERE id = COALESCE(NEW.tool_id, OLD.tool_id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

-- ── TABELE ────────────────────────────────────────────────
create table if not exists privat.campuri_secrete (
  coloana text not null,
  cale text not null);

create table if not exists privat.store_settings (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  currency text default 'RON'::text not null,
  shipping_enabled boolean default true not null,
  free_shipping_threshold numeric(10,2),
  default_shipping_cost numeric(10,2) default 20 not null,
  shipping_zones jsonb default '[]'::jsonb not null,
  payment_methods jsonb default '[{"type": "cash_on_delivery", "label": "Ramburs la curier", "enabled": true}]'::jsonb not null,
  min_order_amount numeric(10,2),
  store_policies jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  page_content jsonb default '{}'::jsonb not null,
  order_number_format text default 'sequential'::text not null,
  order_counter integer default 0 not null,
  vat_enabled boolean default false not null,
  vat_rate numeric(5,2) default 19 not null,
  prices_include_vat boolean default true not null,
  show_vat_breakdown boolean default true not null,
  notifications_config jsonb default '{}'::jsonb not null,
  smso_config jsonb,
  smartbill_config jsonb,
  stripe_config jsonb,
  netopia_config jsonb,
  woot_config jsonb,
  colete_config jsonb,
  oblio_config jsonb,
  fgo_config jsonb,
  cargus_config jsonb,
  dpd_config jsonb,
  fan_courier_config jsonb,
  sameday_config jsonb,
  marketing_config jsonb,
  ipay_config jsonb,
  abandoned_cart_enabled boolean default false not null,
  abandoned_cart_automation jsonb default '{}'::jsonb not null,
  google_merchant_config jsonb default '{}'::jsonb not null,
  card_discount_config jsonb default '{}'::jsonb not null,
  cookie_banner_config jsonb,
  notice_config jsonb,
  google_analytics_config jsonb default '{}'::jsonb not null,
  mailchimp_config jsonb,
  brevo_config jsonb,
  klaviyo_config jsonb,
  returns_config jsonb default '{}'::jsonb not null,
  klarna_config jsonb,
  revolut_config jsonb,
  olx_config jsonb default '{}'::jsonb not null,
  aboutyou_config jsonb default '{}'::jsonb not null,
  trendyol_config jsonb default '{}'::jsonb not null,
  email_config jsonb default '{}'::jsonb not null,
  cod_discount_config jsonb default '{}'::jsonb not null,
  shipping_classes jsonb default '[]'::jsonb not null,
  shipping_rules jsonb default '[]'::jsonb not null,
  storefront_design jsonb default '{}'::jsonb not null,
  storefront_design_draft jsonb,
  storefront_design_pub_at timestamp with time zone,
  cod_fee_config jsonb,
  show_vat_label boolean default true not null,
  gls_config jsonb,
  pallex_config jsonb,
  ecolet_config jsonb,
  facebook_feeds jsonb,
  posta_config jsonb,
  innoship_config jsonb,
  packeta_config jsonb,
  smartship_config jsonb,
  shipo_config jsonb,
  fedex_config jsonb,
  ups_config jsonb,
  dhl_config jsonb,
  emag_config jsonb default '{}'::jsonb not null);

create table if not exists privat.zz_repere_perf_20260804 (
  masurat_la timestamp with time zone default now(),
  eticheta text,
  apeluri bigint,
  ms_total bigint);

create table if not exists public.abandoned_carts (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  session_id text not null,
  source text default 'cart'::text not null,
  customer_name text,
  email text,
  phone text,
  items jsonb default '[]'::jsonb not null,
  item_count integer default 0 not null,
  subtotal numeric default 0 not null,
  status text default 'open'::text not null,
  order_id uuid,
  converted_at timestamp with time zone,
  recovery_email_sent_at timestamp with time zone,
  recovery_sms_sent_at timestamp with time zone,
  recovery_count integer default 0 not null,
  last_activity_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  automation_step integer default 0 not null,
  last_recovery_at timestamp with time zone);

create table if not exists public.aboutyou_batches (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  batch_request_id text not null,
  kind text not null,
  status text default 'pending'::text not null,
  attempts integer default 0 not null,
  related_ids jsonb default '[]'::jsonb not null,
  result_summary jsonb,
  submitted_at timestamp with time zone default now() not null,
  polled_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  poll_errors integer default 0 not null);

create table if not exists public.aboutyou_listings (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  style_key text not null,
  status text default 'draft'::text not null,
  ay_master_id text,
  brand_id integer,
  category_id integer,
  color_id integer,
  material_composition jsonb default '[]'::jsonb not null,
  country_of_origin text,
  hs_code text,
  size_option_name text,
  rejection_reasons jsonb default '[]'::jsonb not null,
  issues jsonb default '[]'::jsonb not null,
  error text,
  last_synced_at timestamp with time zone,
  last_status_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  attributes jsonb default '[]'::jsonb not null);

create table if not exists public.aboutyou_orders (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid,
  aboutyou_order_number text not null,
  shop_country text,
  fulfillment_type text,
  status text default 'open'::text not null,
  items jsonb default '[]'::jsonb not null,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.aboutyou_sync_queue (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  offer_id text not null,
  op text default 'upsert'::text not null,
  attempts integer default 0 not null,
  last_error text,
  created_at timestamp with time zone default now() not null,
  revendicat_pana timestamp with time zone);

create table if not exists public.aboutyou_variants (
  id uuid default gen_random_uuid() not null,
  listing_id uuid not null,
  business_id uuid not null,
  product_id uuid,
  sku text not null,
  ean text,
  size_id integer,
  second_size_id integer,
  color_id integer,
  quantity integer,
  retail_price_eur numeric(12,2),
  sale_price_eur numeric(12,2),
  ay_status text,
  enabled boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  variant_title text);

create table if not exists public.admin_audit_log (
  id uuid default gen_random_uuid() not null,
  admin_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now() not null);

create table if not exists public.announcements (
  id uuid default gen_random_uuid() not null,
  title text not null,
  excerpt text,
  blocks jsonb default '[]'::jsonb not null,
  cover_url text,
  is_published boolean default false not null,
  is_pinned boolean default false not null,
  published_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid);

create table if not exists public.brevo_suppressions (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  email text not null,
  reason text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.business_daily_stats (
  business_id uuid not null,
  zi date not null,
  event_type text not null,
  device text default ''::text not null,
  source text default ''::text not null,
  nr integer not null);

create table if not exists public.businesses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  type text default 'ministore'::text not null,
  slug text not null,
  niche_id text,
  business_name text not null,
  tagline text,
  description text,
  phone text,
  whatsapp text,
  email text,
  website text,
  address text,
  city text,
  county text,
  lat numeric(10,8),
  lng numeric(11,8),
  logo_url text,
  cover_url text,
  primary_color text default '#1AB554'::text not null,
  is_published boolean default false not null,
  custom_domain text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  social jsonb default '{}'::jsonb not null,
  gallery jsonb default '[]'::jsonb not null,
  features jsonb default '{}'::jsonb not null,
  suspended_until timestamp with time zone,
  cui text,
  store_name text,
  store_address text,
  store_city text,
  store_county text,
  reg_com text,
  custom_domain_healthy boolean,
  custom_domain_checked_at timestamp with time zone);

create table if not exists public.catalog_cuvant (
  business_id uuid not null,
  cuvant text not null,
  cate integer default 0 not null,
  semnatura text generated always as (semnatura_cuvant(cuvant)) stored);

create table if not exists public.catalog_cuvinte_murdar (
  business_id uuid not null,
  marcat_la timestamp with time zone default now() not null);

create table if not exists public.catalog_index_cuvant (
  business_id uuid not null,
  cuvant text not null,
  product_id uuid not null);

create table if not exists public.catalog_murdar (
  product_id uuid not null,
  business_id uuid not null,
  marcat_la timestamp with time zone default now() not null);

create table if not exists public.catalog_produs (
  product_id uuid not null,
  business_id uuid not null,
  name text not null,
  slug text,
  category text,
  prima_imagine text,
  price numeric not null,
  compare_at_price numeric,
  is_featured boolean default false not null,
  is_bundle boolean default false not null,
  track_inventory boolean default false not null,
  stock_quantity integer,
  sort_order integer default 0 not null,
  creat timestamp with time zone not null,
  are_imagine boolean default false not null,
  fara_stoc boolean default false not null,
  price_min numeric not null,
  price_max numeric not null,
  has_range boolean default false not null,
  fara_oferta boolean default false not null,
  optiuni jsonb,
  descriere_scurta text default ''::text not null,
  cauta_norm text default ''::text not null,
  fatete text[] default '{}'::text[] not null,
  proiectat_la timestamp with time zone);

create table if not exists public.catalog_rezumat (
  business_id uuid not null,
  fara_imagini boolean not null,
  fara_stoc_ascuns boolean not null,
  total integer not null,
  price_min numeric not null,
  price_max numeric not null,
  categorii text[] default '{}'::text[] not null,
  fatete jsonb default '{}'::jsonb not null,
  calculat_la timestamp with time zone default now() not null);

create table if not exists public.catalog_rezumat_murdar (
  business_id uuid not null,
  marcat_la timestamp with time zone default now() not null);

create table if not exists public.categories (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  parent_id uuid,
  name text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  image_url text,
  is_active boolean default true not null);

create table if not exists public.custom_pages (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  slug text not null,
  title text not null,
  blocks jsonb default '[]'::jsonb not null,
  page_css text,
  seo jsonb default '{}'::jsonb not null,
  is_published boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.customers (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  name text default ''::text not null,
  email text,
  phone text,
  address text,
  city text,
  county text,
  postcode text,
  source text default 'import'::text not null,
  external_id text,
  key text generated always as (COALESCE(NULLIF(normalize_phone(phone), ''::text),
CASE
    WHEN (NULLIF(lower(TRIM(BOTH FROM COALESCE(email, ''::text))), ''::text) IS NOT NULL) THEN ('email:'::text || lower(TRIM(BOTH FROM email)))
    ELSE NULL::text
END)) stored not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.dhl_etichete (
  order_id uuid not null,
  business_id uuid not null,
  awb_number text not null,
  format text not null,
  continut text not null,
  luna_ridicare text,
  factura text,
  document_transport text,
  creat_la timestamp with time zone default now() not null);

create table if not exists public.discounts (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  code text not null,
  type text not null,
  value numeric default 0 not null,
  min_order_amount numeric,
  max_uses integer,
  uses_count integer default 0 not null,
  is_active boolean default true not null,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.domain_orders (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  user_id uuid not null,
  domain text not null,
  tld text not null,
  period integer default 1 not null,
  price_per_year numeric(10,2) default 0 not null,
  total_price numeric(10,2) default 0 not null,
  status text default 'pending'::text not null,
  contact_info jsonb default '{}'::jsonb not null,
  admin_notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  stripe_session_id text);

create table if not exists public.domains (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  user_id uuid not null,
  domain text not null,
  status text default 'active'::text not null,
  expiry_date date,
  auto_renew boolean default true not null,
  source text default 'purchased'::text not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.emag_awb (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid,
  emag_id bigint,
  awb_number text,
  courier_account_id integer,
  cash_on_delivery numeric(12,2),
  status jsonb,
  created_at timestamp with time zone default now() not null);

create table if not exists public.emag_offers (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  emag_id bigint generated by default as identity not null,
  variant_title text,
  family_id bigint,
  family_type_id integer,
  part_number text,
  part_number_key text,
  ean text,
  category_id integer,
  brand text,
  status text default 'draft'::text not null,
  validation_status integer,
  offer_validation_status integer,
  translation_validation_status integer,
  doc_errors jsonb default '[]'::jsonb not null,
  issues jsonb default '[]'::jsonb not null,
  error text,
  ownership integer,
  number_of_offers integer,
  buy_button_rank integer,
  best_offer_sale_price numeric(12,4),
  auto_sync boolean default true not null,
  creat_de_edinio boolean default false not null,
  last_synced_at timestamp with time zone,
  last_status_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.emag_orders (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid,
  emag_order_id bigint not null,
  order_status integer,
  order_type integer,
  payment_mode_id integer,
  is_complete integer,
  acknowledged_at timestamp with time zone,
  lines jsonb default '[]'::jsonb not null,
  vouchers jsonb default '[]'::jsonb not null,
  raw jsonb,
  last_modified timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  invoice_uploaded_at timestamp with time zone,
  invoice_number text);

create table if not exists public.emag_rma (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid,
  emag_rma_id bigint not null,
  emag_order_id bigint,
  request_status integer,
  return_type integer,
  return_reason integer,
  products jsonb default '[]'::jsonb not null,
  awbs jsonb default '[]'::jsonb not null,
  raw jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.emag_sync_queue (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  offer_id text not null,
  op text default 'oferta'::text not null,
  attempts integer default 0 not null,
  last_error text,
  created_at timestamp with time zone default now() not null,
  revendicat_pana timestamp with time zone);

create table if not exists public.email_automations (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  email_key text not null,
  sent_at timestamp with time zone default now() not null);

create table if not exists public.error_logs (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  action text not null,
  message text not null,
  details jsonb default '{}'::jsonb,
  user_id uuid,
  user_email text,
  business_id uuid,
  severity text default 'error'::text not null);

create table if not exists public.fedex_etichete (
  order_id uuid not null,
  business_id uuid not null,
  awb_number text not null,
  format text not null,
  stoc text,
  continut text not null,
  creat_la timestamp with time zone default now() not null);

create table if not exists public.forms (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  name text not null,
  fields jsonb default '[]'::jsonb not null,
  submit_label text default 'Trimite'::text not null,
  success_message text default 'Multumim! Mesajul a fost trimis.'::text not null,
  email_enabled boolean default false not null,
  email_to text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  mailchimp_enabled boolean default false not null,
  brevo_enabled boolean,
  klaviyo_enabled boolean);

create table if not exists public.gmc_products (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid not null,
  offer_id text not null,
  status text default 'pending'::text not null,
  destinations jsonb default '[]'::jsonb not null,
  issues jsonb default '[]'::jsonb not null,
  last_synced_at timestamp with time zone,
  last_status_at timestamp with time zone,
  error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.gmc_sync_queue (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  offer_id text not null,
  op text default 'upsert'::text not null,
  attempts integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  revendicat_pana timestamp with time zone);

create table if not exists public.invoices (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  plan text not null,
  amount numeric(10,2) not null,
  currency text default 'RON'::text not null,
  smartbill_series text,
  smartbill_number text,
  stripe_invoice_id text,
  status text default 'issued'::text not null,
  created_at timestamp with time zone default now() not null,
  smartbill_error text);

create table if not exists public.mailchimp_suppressions (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  email text not null,
  reason text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.media_library (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  user_id uuid not null,
  url text not null,
  r2_key text not null,
  type text default 'image'::text not null,
  mime_type text,
  file_name text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  folder text,
  alt_text text,
  title text,
  caption text,
  description text,
  tags text[] default '{}'::text[] not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.notice_inbox (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  channel text default 'sms'::text not null,
  from_number text,
  body text,
  order_id uuid,
  raw jsonb,
  received_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.notice_sms_log (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid,
  trigger_key text not null,
  phone text,
  template_id text,
  message text,
  success boolean default false not null,
  error text,
  created_at timestamp with time zone default now() not null,
  channel text default 'sms'::text not null,
  provider_id text,
  delivery_status text,
  delivered_at timestamp with time zone);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  title text not null,
  message text not null,
  type text default 'broadcast'::text not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.offers (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  type text not null,
  name text not null,
  is_active boolean default true not null,
  priority integer default 0 not null,
  trigger jsonb default '{}'::jsonb not null,
  config jsonb default '{}'::jsonb not null,
  display jsonb default '{}'::jsonb not null,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  impressions bigint default 0 not null,
  conversions bigint default 0 not null,
  revenue_added numeric default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.olx_adverts (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  offer_id text not null,
  olx_advert_id bigint,
  status text default 'new'::text not null,
  olx_url text,
  valid_to timestamp with time zone,
  issues jsonb default '[]'::jsonb not null,
  error text,
  last_synced_at timestamp with time zone,
  last_status_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.olx_sync_queue (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  offer_id text not null,
  op text default 'upsert'::text not null,
  attempts integer default 0 not null,
  last_error text,
  created_at timestamp with time zone default now() not null,
  revendicat_pana timestamp with time zone);

create table if not exists public.operatii_externe (
  id uuid default gen_random_uuid() not null,
  business_id uuid,
  order_id uuid,
  order_number text,
  fel text not null,
  furnizor text not null,
  cheie text not null,
  stare text default 'in_curs'::text not null,
  referinta_externa text,
  detalii jsonb,
  incercari integer default 0 not null,
  ultima_eroare text,
  creat_la timestamp with time zone default now() not null,
  actualizat_la timestamp with time zone default now() not null);

create table if not exists public.orders (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_number text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  shipping_address jsonb not null,
  items jsonb not null,
  subtotal numeric(10,2) not null,
  shipping_cost numeric(10,2) default 0 not null,
  total numeric(10,2) not null,
  status text default 'pending'::text not null,
  payment_method text default 'cod'::text not null,
  payment_status text default 'unpaid'::text not null,
  notes text,
  internal_notes text,
  tracking_number text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  discount_code text,
  discount_amount numeric default 0 not null,
  vat_amount numeric(10,2) default 0 not null,
  vat_rate numeric(5,2) default 0 not null,
  smartbill_invoice_number text,
  smartbill_invoice_series text,
  smartbill_estimate_number text,
  smartbill_estimate_series text,
  smartbill_storno_number text,
  smartbill_storno_series text,
  stripe_session_id text,
  woot_order_id text,
  woot_awb_number text,
  woot_service_name text,
  colete_unique_id text,
  colete_awb_number text,
  colete_service_name text,
  colete_order_id text,
  oblio_invoice_number text,
  oblio_invoice_series text,
  oblio_proforma_number text,
  oblio_proforma_series text,
  oblio_storno_number text,
  oblio_storno_series text,
  fgo_invoice_number text,
  fgo_invoice_series text,
  fgo_invoice_link text,
  fgo_storno_number text,
  fgo_storno_series text,
  cargus_awb_number text,
  cargus_service_name text,
  dpd_shipment_id bigint,
  dpd_awb_number text,
  fan_courier_awb_number text,
  sameday_awb_number text,
  ipay_order_id text,
  card_discount_amount numeric default 0 not null,
  smartbill_invoice_url text,
  smartbill_estimate_url text,
  oblio_invoice_link text,
  oblio_proforma_link text,
  oblio_storno_link text,
  offer_discount_amount numeric default 0 not null,
  klarna_order_id text,
  revolut_order_id text,
  order_source jsonb,
  cod_discount_amount numeric default 0 not null,
  billing_company jsonb,
  cod_fee_amount numeric default 0 not null,
  discount_id uuid,
  discount_released_at timestamp with time zone,
  klarna_session_id text,
  stoc_rezervat jsonb,
  stoc_eliberat_la timestamp with time zone,
  stoc_marketplace_la timestamp with time zone,
  ipay_order_number text,
  netopia_ntp_id text,
  gls_awb_number text,
  gls_status_code text,
  gls_status_checked_at timestamp with time zone,
  gls_awb_at timestamp with time zone,
  pallex_awb_number text,
  pallex_consignment_id bigint,
  pallex_bordereau_id bigint,
  pallex_awb_at timestamp with time zone,
  pallex_status_id text,
  pallex_status_checked_at timestamp with time zone,
  ecolet_order_to_send_id bigint,
  ecolet_order_id bigint,
  ecolet_awb_number text,
  ecolet_send_state text,
  ecolet_send_error text,
  ecolet_service_slug text,
  ecolet_service_name text,
  ecolet_awb_at timestamp with time zone,
  ecolet_status_code text,
  ecolet_status_checked_at timestamp with time zone,
  gls_evenimente_semnalate jsonb,
  posta_awb_number text,
  posta_awb_at timestamp with time zone,
  posta_borderou_id bigint,
  posta_oficiu_id text,
  posta_status_code text,
  posta_status_checked_at timestamp with time zone,
  innoship_awb_number text,
  innoship_order_id bigint,
  innoship_courier_id integer,
  innoship_courier_name text,
  innoship_service_id integer,
  innoship_option_id text,
  innoship_service_name text,
  innoship_awb_at timestamp with time zone,
  innoship_status_code text,
  innoship_cod_status_code text,
  innoship_status_checked_at timestamp with time zone,
  innoship_track_url text,
  packeta_packet_id text,
  packeta_barcode text,
  packeta_address_id text,
  packeta_pickup_point text,
  packeta_courier_number text,
  packeta_external_tracking text,
  packeta_awb_at timestamp with time zone,
  packeta_status_code integer,
  packeta_status_checked_at timestamp with time zone,
  smartship_awb_number text,
  smartship_courier_id integer,
  smartship_courier_name text,
  smartship_own_contract boolean,
  smartship_cost numeric(10,2),
  smartship_tracking_url text,
  smartship_awb_at timestamp with time zone,
  smartship_status_code integer,
  smartship_status_checked_at timestamp with time zone,
  smartship_pickup_code text,
  smartship_offer_ref text,
  smartship_offer_status text,
  shipo_awb_number text,
  shipo_expedition_id integer,
  shipo_rate_id integer,
  shipo_courier_slug text,
  shipo_courier_name text,
  shipo_cost numeric(10,2),
  shipo_tracking_url text,
  shipo_awb_at timestamp with time zone,
  shipo_status_code text,
  shipo_status_checked_at timestamp with time zone,
  shipo_point_id integer,
  shipo_point_name text,
  fedex_awb_number text,
  fedex_status_code text,
  fedex_status_checked_at timestamp with time zone,
  fedex_awb_at timestamp with time zone,
  fedex_service_type text,
  fedex_service_name text,
  fedex_cost numeric(10,2),
  fedex_currency text,
  fedex_tracking_url text,
  fedex_reference text,
  ups_awb_number text,
  ups_status_type text,
  ups_status_code text,
  ups_status_checked_at timestamp with time zone,
  ups_awb_at timestamp with time zone,
  ups_service_code text,
  ups_service_name text,
  ups_cost numeric(10,2),
  ups_currency text,
  ups_tracking_url text,
  ups_reference text,
  dhl_awb_number text,
  dhl_status_code text,
  dhl_status_checked_at timestamp with time zone,
  dhl_awb_at timestamp with time zone,
  dhl_product_code text,
  dhl_local_product_code text,
  dhl_product_name text,
  dhl_cost numeric(10,2),
  dhl_currency text,
  dhl_tracking_url text,
  dhl_reference text,
  dhl_dispatch_confirmation text);

create table if not exists public.page_form_submissions (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  page_id uuid,
  block_id text,
  data jsonb default '{}'::jsonb not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null,
  form_id uuid);

create table if not exists public.platform_settings (
  key text not null,
  value jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid);

create table if not exists public.posta_plaja (
  business_id uuid not null,
  prefix text default ''::text not null,
  de_la bigint not null,
  pana_la bigint not null,
  urmator bigint not null,
  cifre smallint default 11 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.product_import_rows (
  id uuid default gen_random_uuid() not null,
  import_id uuid not null,
  business_id uuid not null,
  row_index integer not null,
  parsed jsonb,
  external_id text,
  status text default 'pending'::text not null,
  images_done boolean default false not null,
  product_id uuid,
  error text);

create table if not exists public.product_imports (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  user_id uuid not null,
  source text not null,
  status text default 'uploaded'::text not null,
  file_url text,
  file_name text,
  mapping jsonb default '{}'::jsonb not null,
  options jsonb default '{}'::jsonb not null,
  totals jsonb default '{}'::jsonb not null,
  error text,
  error_report_url text,
  created_at timestamp with time zone default now() not null,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.products (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  name text not null,
  description text,
  price numeric(10,2) not null,
  compare_at_price numeric(10,2),
  sku text,
  stock_quantity integer,
  track_inventory boolean default false not null,
  images jsonb default '[]'::jsonb not null,
  category text,
  tags jsonb default '[]'::jsonb not null,
  is_active boolean default true not null,
  is_featured boolean default false not null,
  weight_grams integer,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  page_sections jsonb default '{}'::jsonb not null,
  slug text,
  source text,
  external_id text,
  is_bundle boolean default false not null,
  shipping_class text);

create table if not exists public.rate_limits (
  cheie text not null,
  fereastra_start timestamp with time zone default now() not null,
  lovituri integer default 0 not null,
  blocat_pana timestamp with time zone,
  actualizat_la timestamp with time zone default now() not null);

create table if not exists public.recovery_optout (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  email text not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.return_requests (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid,
  order_number text not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb default '[]'::jsonb not null,
  reason text,
  refund_method text,
  refund_iban text,
  status text default 'nou'::text not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.site_analytics (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  event_type text not null,
  device text,
  source text,
  referrer text,
  country text default 'RO'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.sms_campaigns (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  message text not null,
  recipient_count integer default 0 not null,
  sent_count integer default 0 not null,
  failed_count integer default 0 not null,
  status text default 'sent'::text not null,
  filters jsonb,
  created_at timestamp with time zone default now() not null);

create table if not exists public.sms_templates (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  name text not null,
  message text not null,
  created_at timestamp with time zone default now() not null);

create table if not exists public.stock_feed_sources (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  user_id uuid not null,
  name text default ''::text not null,
  url text not null,
  mapping jsonb default '{}'::jsonb not null,
  options jsonb default '{}'::jsonb not null,
  enabled boolean default true not null,
  frequency text default 'daily'::text not null,
  run_hour smallint default 4 not null,
  last_run_at timestamp with time zone,
  last_status text,
  last_error text,
  last_totals jsonb,
  last_import_id uuid,
  consecutive_failures integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null);

create table if not exists public.stripe_events (
  event_id text not null,
  type text,
  created_at timestamp with time zone default now() not null);

create table if not exists public.support_messages (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  ticket_id uuid not null,
  sender_type text not null,
  content text not null,
  attachments jsonb default '[]'::jsonb not null);

create table if not exists public.support_tickets (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  user_id uuid not null,
  business_id uuid,
  subject text not null,
  category text default 'other'::text not null,
  priority text default 'normal'::text not null,
  status text default 'open'::text not null,
  has_unread_reply boolean default false not null);

create table if not exists public.trendyol_batches (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  batch_request_id text not null,
  kind text not null,
  status text default 'pending'::text not null,
  attempts integer default 0 not null,
  related_ids jsonb default '[]'::jsonb not null,
  result_summary jsonb,
  submitted_at timestamp with time zone default now() not null,
  polled_at timestamp with time zone,
  created_at timestamp with time zone default now() not null);

create table if not exists public.trendyol_listings (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  product_main_id text not null,
  status text default 'draft'::text not null,
  brand_id integer,
  category_id integer,
  attributes jsonb default '[]'::jsonb not null,
  dimensional_weight numeric(10,2),
  cargo_company_id integer,
  rejection_reasons jsonb default '[]'::jsonb not null,
  issues jsonb default '[]'::jsonb not null,
  error text,
  last_synced_at timestamp with time zone,
  last_status_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  inventory_retries integer default 0 not null,
  auto_inventory boolean default true not null,
  ty_content_id bigint,
  creat_de_edinio boolean default false not null,
  sgr_units integer);

create table if not exists public.trendyol_orders (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  order_id uuid,
  shipment_package_id text not null,
  order_number text,
  status text default 'Created'::text not null,
  currency text,
  cargo_tracking_number text,
  lines jsonb default '[]'::jsonb not null,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  last_modified_date bigint);

create table if not exists public.trendyol_sync_queue (
  id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  product_id uuid,
  offer_id text not null,
  op text default 'upsert'::text not null,
  attempts integer default 0 not null,
  last_error text,
  created_at timestamp with time zone default now() not null,
  revendicat_pana timestamp with time zone);

create table if not exists public.trendyol_variants (
  id uuid default gen_random_uuid() not null,
  listing_id uuid not null,
  business_id uuid not null,
  product_id uuid,
  barcode text not null,
  stock_code text,
  attributes jsonb default '[]'::jsonb not null,
  quantity integer,
  list_price numeric(12,2),
  sale_price numeric(12,2),
  vat_rate numeric(5,2),
  ty_status text,
  enabled boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  variant_title text,
  exista_la_ei boolean default false not null);

create table if not exists public.ups_etichete (
  order_id uuid not null,
  business_id uuid not null,
  awb_number text not null,
  format text not null,
  continut text not null,
  semnatura text,
  document_ramburs text,
  creat_la timestamp with time zone default now() not null);

create table if not exists public.users_profile (
  id uuid not null,
  full_name text default ''::text not null,
  avatar_url text,
  plan text default 'free'::text not null,
  plan_expires_at timestamp with time zone,
  onboarding_completed boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  stripe_customer_id text,
  mfa_email_enabled boolean default false not null,
  mfa_otp text,
  mfa_otp_expires_at timestamp with time zone,
  role text default 'user'::text not null,
  suspended_until timestamp with time zone,
  admin_notes text,
  onboarding_step text default 'registered'::text not null,
  announcements_seen_at timestamp with time zone,
  orders_seen_at timestamp with time zone,
  plan_interval text,
  payment_failed_at timestamp with time zone,
  mfa_confirmat_la timestamp with time zone,
  mfa_sesiuni_confirmate jsonb default '[]'::jsonb not null);

create table if not exists public.zz_backup_categorii_okxi_20260812 (
  id uuid,
  category text,
  is_active boolean,
  salvat_la timestamp with time zone);

create table if not exists public.zz_backup_facebook_feeds_20260814 (
  business_id uuid,
  facebook_feeds jsonb,
  salvat_la timestamp with time zone);

create table if not exists public.zz_backup_preturi_bricosmart_20260804 (
  id uuid,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  page_sections jsonb,
  luat_la timestamp with time zone);

create table if not exists public.zz_backup_preturi_parfumuri_insula_20260812 (
  id uuid,
  name text,
  category text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  page_sections jsonb,
  salvat_la timestamp with time zone);

create table if not exists public.zz_backup_preturi_vetdepo_20260819 (
  id uuid,
  sku text,
  name text,
  category text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  updated_at timestamp with time zone,
  luat_la timestamp with time zone);

create table if not exists public.zz_backup_preturi_vetdepo_categorii_20260903 (
  id uuid,
  name text,
  category text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  updated_at timestamp with time zone,
  factor numeric,
  pct integer);

create table if not exists public.zz_backup_preturi_vetdepo_hrana_caini_20260903 (
  id uuid,
  name text,
  category text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  updated_at timestamp with time zone);

-- ── CONSTRANGERI ──────────────────────────────────────────
alter table privat.campuri_secrete add constraint campuri_secrete_pkey PRIMARY KEY (coloana, cale);
alter table privat.store_settings add constraint store_settings_pkey PRIMARY KEY (id);
alter table public.abandoned_carts add constraint abandoned_carts_pkey PRIMARY KEY (id);
alter table public.aboutyou_batches add constraint aboutyou_batches_pkey PRIMARY KEY (id);
alter table public.aboutyou_listings add constraint aboutyou_listings_pkey PRIMARY KEY (id);
alter table public.aboutyou_orders add constraint aboutyou_orders_pkey PRIMARY KEY (id);
alter table public.aboutyou_sync_queue add constraint aboutyou_sync_queue_pkey PRIMARY KEY (id);
alter table public.aboutyou_variants add constraint aboutyou_variants_pkey PRIMARY KEY (id);
alter table public.admin_audit_log add constraint admin_audit_log_pkey PRIMARY KEY (id);
alter table public.announcements add constraint announcements_pkey PRIMARY KEY (id);
alter table public.brevo_suppressions add constraint brevo_suppressions_pkey PRIMARY KEY (id);
alter table public.business_daily_stats add constraint business_daily_stats_pkey PRIMARY KEY (business_id, zi, event_type, device, source);
alter table public.businesses add constraint businesses_pkey PRIMARY KEY (id);
alter table public.catalog_cuvant add constraint catalog_cuvant_pkey PRIMARY KEY (business_id, cuvant);
alter table public.catalog_cuvinte_murdar add constraint catalog_cuvinte_murdar_pkey PRIMARY KEY (business_id);
alter table public.catalog_index_cuvant add constraint catalog_index_cuvant_pkey PRIMARY KEY (business_id, cuvant, product_id);
alter table public.catalog_murdar add constraint catalog_murdar_pkey PRIMARY KEY (product_id);
alter table public.catalog_produs add constraint catalog_produs_pkey PRIMARY KEY (product_id);
alter table public.catalog_rezumat add constraint catalog_rezumat_pkey PRIMARY KEY (business_id, fara_imagini, fara_stoc_ascuns);
alter table public.catalog_rezumat_murdar add constraint catalog_rezumat_murdar_pkey PRIMARY KEY (business_id);
alter table public.categories add constraint categories_pkey PRIMARY KEY (id);
alter table public.custom_pages add constraint custom_pages_pkey PRIMARY KEY (id);
alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
alter table public.dhl_etichete add constraint dhl_etichete_pkey PRIMARY KEY (order_id);
alter table public.discounts add constraint discounts_pkey PRIMARY KEY (id);
alter table public.domain_orders add constraint domain_orders_pkey PRIMARY KEY (id);
alter table public.domains add constraint domains_pkey PRIMARY KEY (id);
alter table public.emag_awb add constraint emag_awb_pkey PRIMARY KEY (id);
alter table public.emag_offers add constraint emag_offers_pkey PRIMARY KEY (id);
alter table public.emag_orders add constraint emag_orders_pkey PRIMARY KEY (id);
alter table public.emag_rma add constraint emag_rma_pkey PRIMARY KEY (id);
alter table public.emag_sync_queue add constraint emag_sync_queue_pkey PRIMARY KEY (id);
alter table public.email_automations add constraint email_automations_pkey PRIMARY KEY (id);
alter table public.error_logs add constraint error_logs_pkey PRIMARY KEY (id);
alter table public.fedex_etichete add constraint fedex_etichete_pkey PRIMARY KEY (order_id);
alter table public.forms add constraint forms_pkey PRIMARY KEY (id);
alter table public.gmc_products add constraint gmc_products_pkey PRIMARY KEY (id);
alter table public.gmc_sync_queue add constraint gmc_sync_queue_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table public.mailchimp_suppressions add constraint mailchimp_suppressions_pkey PRIMARY KEY (id);
alter table public.media_library add constraint media_library_pkey PRIMARY KEY (id);
alter table public.notice_inbox add constraint notice_inbox_pkey PRIMARY KEY (id);
alter table public.notice_sms_log add constraint notice_sms_log_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.offers add constraint offers_pkey PRIMARY KEY (id);
alter table public.olx_adverts add constraint olx_adverts_pkey PRIMARY KEY (id);
alter table public.olx_sync_queue add constraint olx_sync_queue_pkey PRIMARY KEY (id);
alter table public.operatii_externe add constraint operatii_externe_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.page_form_submissions add constraint page_form_submissions_pkey PRIMARY KEY (id);
alter table public.platform_settings add constraint platform_settings_pkey PRIMARY KEY (key);
alter table public.posta_plaja add constraint posta_plaja_pkey PRIMARY KEY (business_id);
alter table public.product_import_rows add constraint product_import_rows_pkey PRIMARY KEY (id);
alter table public.product_imports add constraint product_imports_pkey PRIMARY KEY (id);
alter table public.products add constraint products_pkey PRIMARY KEY (id);
alter table public.rate_limits add constraint rate_limits_pkey PRIMARY KEY (cheie);
alter table public.recovery_optout add constraint recovery_optout_pkey PRIMARY KEY (id);
alter table public.return_requests add constraint return_requests_pkey PRIMARY KEY (id);
alter table public.site_analytics add constraint site_analytics_pkey PRIMARY KEY (id);
alter table public.sms_campaigns add constraint sms_campaigns_pkey PRIMARY KEY (id);
alter table public.sms_templates add constraint sms_templates_pkey PRIMARY KEY (id);
alter table public.stock_feed_sources add constraint stock_feed_sources_pkey PRIMARY KEY (id);
alter table public.stripe_events add constraint stripe_events_pkey PRIMARY KEY (event_id);
alter table public.support_messages add constraint support_messages_pkey PRIMARY KEY (id);
alter table public.support_tickets add constraint support_tickets_pkey PRIMARY KEY (id);
alter table public.trendyol_batches add constraint trendyol_batches_pkey PRIMARY KEY (id);
alter table public.trendyol_listings add constraint trendyol_listings_pkey PRIMARY KEY (id);
alter table public.trendyol_orders add constraint trendyol_orders_pkey PRIMARY KEY (id);
alter table public.trendyol_sync_queue add constraint trendyol_sync_queue_pkey PRIMARY KEY (id);
alter table public.trendyol_variants add constraint trendyol_variants_pkey PRIMARY KEY (id);
alter table public.ups_etichete add constraint ups_etichete_pkey PRIMARY KEY (order_id);
alter table public.users_profile add constraint users_profile_pkey PRIMARY KEY (id);
alter table privat.store_settings add constraint store_settings_business_id_key UNIQUE (business_id);
alter table public.aboutyou_batches add constraint aboutyou_batches_business_id_batch_request_id_key UNIQUE (business_id, batch_request_id);
alter table public.aboutyou_listings add constraint aboutyou_listings_business_id_style_key_key UNIQUE (business_id, style_key);
alter table public.aboutyou_orders add constraint aboutyou_orders_business_id_aboutyou_order_number_key UNIQUE (business_id, aboutyou_order_number);
alter table public.aboutyou_sync_queue add constraint aboutyou_sync_queue_business_id_offer_id_op_key UNIQUE (business_id, offer_id, op);
alter table public.aboutyou_variants add constraint aboutyou_variants_business_id_sku_key UNIQUE (business_id, sku);
alter table public.brevo_suppressions add constraint brevo_suppressions_business_id_email_key UNIQUE (business_id, email);
alter table public.businesses add constraint businesses_custom_domain_key UNIQUE (custom_domain);
alter table public.businesses add constraint businesses_slug_key UNIQUE (slug);
alter table public.categories add constraint categories_business_id_parent_id_name_key UNIQUE (business_id, parent_id, name);
alter table public.custom_pages add constraint custom_pages_business_id_slug_key UNIQUE (business_id, slug);
alter table public.customers add constraint customers_business_key_unique UNIQUE (business_id, key);
alter table public.discounts add constraint discounts_business_id_code_key UNIQUE (business_id, code);
alter table public.emag_offers add constraint emag_offers_business_emag_key UNIQUE (business_id, emag_id);
alter table public.emag_orders add constraint emag_orders_business_order_key UNIQUE (business_id, emag_order_id);
alter table public.emag_rma add constraint emag_rma_business_rma_key UNIQUE (business_id, emag_rma_id);
alter table public.emag_sync_queue add constraint emag_sync_queue_business_offer_op_key UNIQUE (business_id, offer_id, op);
alter table public.email_automations add constraint email_automations_user_id_email_key_key UNIQUE (user_id, email_key);
alter table public.invoices add constraint invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
alter table public.mailchimp_suppressions add constraint mailchimp_suppressions_business_id_email_key UNIQUE (business_id, email);
alter table public.olx_adverts add constraint olx_adverts_business_id_offer_id_key UNIQUE (business_id, offer_id);
alter table public.olx_sync_queue add constraint olx_sync_queue_business_id_offer_id_op_key UNIQUE (business_id, offer_id, op);
alter table public.orders add constraint orders_order_number_business_unique UNIQUE (business_id, order_number);
alter table public.trendyol_batches add constraint trendyol_batches_business_id_batch_request_id_key UNIQUE (business_id, batch_request_id);
alter table public.trendyol_listings add constraint trendyol_listings_business_id_product_main_id_key UNIQUE (business_id, product_main_id);
alter table public.trendyol_orders add constraint trendyol_orders_business_id_shipment_package_id_key UNIQUE (business_id, shipment_package_id);
alter table public.trendyol_sync_queue add constraint trendyol_sync_queue_business_id_offer_id_op_key UNIQUE (business_id, offer_id, op);
alter table public.trendyol_variants add constraint trendyol_variants_business_id_barcode_key UNIQUE (business_id, barcode);
alter table public.aboutyou_batches add constraint aboutyou_batches_kind_check CHECK ((kind = ANY (ARRAY['product'::text, 'stock'::text, 'stock_removal'::text, 'price'::text, 'status'::text, 'removal'::text, 'ship'::text, 'cancel'::text, 'return'::text])));
alter table public.aboutyou_sync_queue add constraint aboutyou_sync_queue_op_check CHECK ((op = ANY (ARRAY['upsert'::text, 'delete'::text, 'publish'::text, 'stock'::text, 'price'::text, 'ship'::text])));
alter table public.businesses add constraint businesses_slug_format CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'::text));
alter table public.businesses add constraint businesses_type_check CHECK ((type = ANY (ARRAY['minisite'::text, 'ministore'::text])));
alter table public.discounts add constraint discounts_type_check CHECK ((type = ANY (ARRAY['percent'::text, 'fixed'::text, 'free_shipping'::text])));
alter table public.domain_orders add constraint domain_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'cancelled'::text, 'refunded'::text])));
alter table public.emag_sync_queue add constraint emag_sync_queue_op_check CHECK ((op = ANY (ARRAY['oferta'::text, 'pret'::text, 'stoc'::text, 'retragere'::text, 'masuratori'::text])));
alter table public.error_logs add constraint error_logs_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text, 'critical'::text])));
alter table public.olx_sync_queue add constraint olx_sync_queue_op_check CHECK ((op = ANY (ARRAY['upsert'::text, 'delete'::text, 'deactivate'::text, 'activate'::text])));
alter table public.operatii_externe add constraint operatii_externe_fel_check CHECK ((fel = ANY (ARRAY['awb'::text, 'anulare_awb'::text, 'ridicare'::text, 'factura'::text, 'proforma'::text, 'storno'::text, 'anulare_document'::text, 'plata'::text, 'incasare'::text, 'rambursare'::text, 'publicare'::text, 'retragere'::text, 'expediere'::text, 'proba'::text])));
alter table public.operatii_externe add constraint operatii_externe_furnizor_check CHECK ((furnizor = ANY (ARRAY['cargus'::text, 'sameday'::text, 'fancourier'::text, 'dpd'::text, 'woot'::text, 'colete'::text, 'gls'::text, 'pallex'::text, 'ecolet'::text, 'posta'::text, 'innoship'::text, 'packeta'::text, 'smartship'::text, 'shipo'::text, 'fedex'::text, 'ups'::text, 'dhl'::text, 'smartbill'::text, 'oblio'::text, 'fgo'::text, 'stripe'::text, 'netopia'::text, 'ipay'::text, 'klarna'::text, 'revolut'::text, 'trendyol'::text, 'aboutyou'::text, 'olx'::text, 'gmc'::text, 'emag'::text, 'proba'::text])));
alter table public.operatii_externe add constraint operatii_externe_stare_check CHECK ((stare = ANY (ARRAY['in_curs'::text, 'reusit'::text, 'esuat'::text, 'necunoscut'::text, 'anulat'::text])));
alter table public.orders add constraint orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'refunded'::text])));
alter table public.orders add constraint orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'refunded'::text])));
alter table public.posta_plaja add constraint posta_plaja_cifre_check CHECK (((cifre >= 1) AND (cifre <= 28)));
alter table public.posta_plaja add constraint posta_plaja_interval_check CHECK ((de_la <= pana_la));
alter table public.posta_plaja add constraint posta_plaja_urmator_check CHECK ((urmator >= de_la));
alter table public.site_analytics add constraint site_analytics_device_check CHECK ((device = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text])));
alter table public.sms_campaigns add constraint sms_campaigns_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text])));
alter table public.stock_feed_sources add constraint stock_feed_sources_frequency_check CHECK ((frequency = ANY (ARRAY['hourly'::text, 'daily'::text])));
alter table public.stock_feed_sources add constraint stock_feed_sources_last_status_check CHECK ((last_status = ANY (ARRAY['ok'::text, 'error'::text])));
alter table public.stock_feed_sources add constraint stock_feed_sources_run_hour_check CHECK (((run_hour >= 0) AND (run_hour <= 23)));
alter table public.support_messages add constraint support_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['user'::text, 'agent'::text])));
alter table public.support_tickets add constraint support_tickets_category_check CHECK ((category = ANY (ARRAY['technical'::text, 'billing'::text, 'feature'::text, 'other'::text])));
alter table public.support_tickets add constraint support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
alter table public.support_tickets add constraint support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])));
alter table public.trendyol_batches add constraint trendyol_batches_kind_check CHECK ((kind = ANY (ARRAY['product'::text, 'inventory'::text, 'archive'::text, 'update'::text])));
alter table public.trendyol_sync_queue add constraint trendyol_sync_queue_op_check CHECK ((op = ANY (ARRAY['upsert'::text, 'delete'::text, 'inventory'::text])));
alter table public.users_profile add constraint users_profile_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'basic'::text, 'premium'::text, 'ultra'::text])));
alter table public.users_profile add constraint users_profile_plan_interval_check CHECK (((plan_interval IS NULL) OR (plan_interval = ANY (ARRAY['monthly'::text, 'annual'::text]))));
alter table public.users_profile add constraint users_profile_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'moderator'::text])));
alter table privat.store_settings add constraint store_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.abandoned_carts add constraint abandoned_carts_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.abandoned_carts add constraint abandoned_carts_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.aboutyou_batches add constraint aboutyou_batches_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.aboutyou_listings add constraint aboutyou_listings_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.aboutyou_listings add constraint aboutyou_listings_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.aboutyou_orders add constraint aboutyou_orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.aboutyou_orders add constraint aboutyou_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.aboutyou_sync_queue add constraint aboutyou_sync_queue_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.aboutyou_sync_queue add constraint aboutyou_sync_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.aboutyou_variants add constraint aboutyou_variants_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.aboutyou_variants add constraint aboutyou_variants_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES aboutyou_listings(id) ON DELETE CASCADE;
alter table public.aboutyou_variants add constraint aboutyou_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.admin_audit_log add constraint admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.announcements add constraint announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.brevo_suppressions add constraint brevo_suppressions_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.business_daily_stats add constraint business_daily_stats_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.businesses add constraint businesses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.catalog_cuvant add constraint catalog_cuvant_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.catalog_cuvinte_murdar add constraint catalog_cuvinte_murdar_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.catalog_index_cuvant add constraint catalog_index_cuvant_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.catalog_index_cuvant add constraint catalog_index_cuvant_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.catalog_murdar add constraint catalog_murdar_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.catalog_produs add constraint catalog_produs_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.catalog_produs add constraint catalog_produs_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.catalog_rezumat add constraint catalog_rezumat_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.catalog_rezumat_murdar add constraint catalog_rezumat_murdar_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.categories add constraint categories_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.categories add constraint categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE;
alter table public.custom_pages add constraint custom_pages_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.customers add constraint customers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.dhl_etichete add constraint dhl_etichete_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.dhl_etichete add constraint dhl_etichete_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.discounts add constraint discounts_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.domain_orders add constraint domain_orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.domain_orders add constraint domain_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.domains add constraint domains_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.domains add constraint domains_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.emag_awb add constraint emag_awb_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.emag_awb add constraint emag_awb_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.emag_offers add constraint emag_offers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.emag_offers add constraint emag_offers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.emag_orders add constraint emag_orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.emag_orders add constraint emag_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.emag_rma add constraint emag_rma_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.emag_rma add constraint emag_rma_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.emag_sync_queue add constraint emag_sync_queue_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.emag_sync_queue add constraint emag_sync_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.error_logs add constraint error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fedex_etichete add constraint fedex_etichete_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.fedex_etichete add constraint fedex_etichete_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.forms add constraint forms_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.gmc_products add constraint gmc_products_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.gmc_products add constraint gmc_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.gmc_sync_queue add constraint gmc_sync_queue_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.gmc_sync_queue add constraint gmc_sync_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.invoices add constraint invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.mailchimp_suppressions add constraint mailchimp_suppressions_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.media_library add constraint media_library_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.media_library add constraint media_library_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notice_inbox add constraint notice_inbox_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.notice_inbox add constraint notice_inbox_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.notice_sms_log add constraint notice_sms_log_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.notice_sms_log add constraint notice_sms_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.offers add constraint offers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.olx_adverts add constraint olx_adverts_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.olx_adverts add constraint olx_adverts_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.olx_sync_queue add constraint olx_sync_queue_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.olx_sync_queue add constraint olx_sync_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.operatii_externe add constraint operatii_externe_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.operatii_externe add constraint operatii_externe_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE SET NULL;
alter table public.page_form_submissions add constraint page_form_submissions_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.page_form_submissions add constraint page_form_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE SET NULL;
alter table public.page_form_submissions add constraint page_form_submissions_page_id_fkey FOREIGN KEY (page_id) REFERENCES custom_pages(id) ON DELETE SET NULL;
alter table public.platform_settings add constraint platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.posta_plaja add constraint posta_plaja_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.product_import_rows add constraint product_import_rows_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.product_import_rows add constraint product_import_rows_import_id_fkey FOREIGN KEY (import_id) REFERENCES product_imports(id) ON DELETE CASCADE;
alter table public.product_import_rows add constraint product_import_rows_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.product_imports add constraint product_imports_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.product_imports add constraint product_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.products add constraint products_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.recovery_optout add constraint recovery_optout_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.return_requests add constraint return_requests_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.return_requests add constraint return_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.site_analytics add constraint site_analytics_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.sms_campaigns add constraint sms_campaigns_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.sms_templates add constraint sms_templates_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.stock_feed_sources add constraint stock_feed_sources_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.stock_feed_sources add constraint stock_feed_sources_last_import_id_fkey FOREIGN KEY (last_import_id) REFERENCES product_imports(id) ON DELETE SET NULL;
alter table public.stock_feed_sources add constraint stock_feed_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.support_messages add constraint support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
alter table public.support_tickets add constraint support_tickets_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;
alter table public.support_tickets add constraint support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.trendyol_batches add constraint trendyol_batches_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.trendyol_listings add constraint trendyol_listings_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.trendyol_listings add constraint trendyol_listings_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.trendyol_orders add constraint trendyol_orders_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.trendyol_orders add constraint trendyol_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.trendyol_sync_queue add constraint trendyol_sync_queue_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.trendyol_sync_queue add constraint trendyol_sync_queue_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.trendyol_variants add constraint trendyol_variants_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.trendyol_variants add constraint trendyol_variants_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES trendyol_listings(id) ON DELETE CASCADE;
alter table public.trendyol_variants add constraint trendyol_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public.ups_etichete add constraint ups_etichete_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
alter table public.ups_etichete add constraint ups_etichete_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.users_profile add constraint users_profile_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── CAMPURI CRIPTATE ──────────────────────────────────────
-- Randuri, nu date: fara ele, prima reconstruire a vederii o lasa FARA decriptare.
insert into privat.campuri_secrete (coloana, cale) values ('aboutyou_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('aboutyou_config', 'webhook_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('brevo_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('brevo_config', 'webhook_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('cargus_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('cargus_config', 'subscription_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('colete_config', 'client_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('colete_config', 'token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('dhl_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('dpd_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('ecolet_config', 'api_token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('emag_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('email_config', 'smtp.pass') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('fan_courier_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('fedex_config', 'client_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('fgo_config', 'private_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('gls_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('google_analytics_config', 'api_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('google_analytics_config', 'refresh_token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('google_merchant_config', 'refresh_token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('innoship_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('innoship_config', 'webhook_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('ipay_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('klarna_config', 'authorization_token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('klarna_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('klaviyo_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('mailchimp_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('mailchimp_config', 'webhook_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('netopia_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('netopia_config', 'pos_signature') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('notice_config', 'api_token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('notice_config', 'webhook_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('oblio_config', 'client_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('olx_config', 'access_token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('olx_config', 'refresh_token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('packeta_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('packeta_config', 'api_password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('pallex_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('posta_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('revolut_config', 'secret_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('revolut_config', 'signing_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('revolut_config', 'token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('sameday_config', 'password') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('shipo_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('smartbill_config', 'token') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('smartship_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('smso_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('trendyol_config', 'api_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('trendyol_config', 'api_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('trendyol_config', 'webhook_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('ups_config', 'client_secret') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('woot_config', 'public_key') on conflict do nothing;
insert into privat.campuri_secrete (coloana, cale) values ('woot_config', 'secret_key') on conflict do nothing;

-- ── INDEXURI ──────────────────────────────────────────────
CREATE INDEX abandoned_carts_business_email_idx ON public.abandoned_carts USING btree (business_id, email);
CREATE INDEX abandoned_carts_business_phone_idx ON public.abandoned_carts USING btree (business_id, phone);
CREATE UNIQUE INDEX abandoned_carts_business_session_uidx ON public.abandoned_carts USING btree (business_id, session_id);
CREATE INDEX abandoned_carts_business_status_activity_idx ON public.abandoned_carts USING btree (business_id, status, last_activity_at DESC);
CREATE INDEX announcements_feed_idx ON public.announcements USING btree (is_published, is_pinned DESC, published_at DESC);
CREATE INDEX bds_biz_zi ON public.business_daily_stats USING btree (business_id, zi DESC);
CREATE INDEX brevo_suppressions_business_email_idx ON public.brevo_suppressions USING btree (business_id, email);
CREATE INDEX categories_business_id_idx ON public.categories USING btree (business_id);
CREATE INDEX categories_parent_id_idx ON public.categories USING btree (parent_id);
CREATE INDEX cm_biz ON public.catalog_murdar USING btree (business_id, marcat_la);
CREATE INDEX cp_cat ON public.catalog_produs USING btree (business_id, category);
CREATE INDEX cp_creat ON public.catalog_produs USING btree (business_id, creat DESC, product_id);
CREATE INDEX cp_fat ON public.catalog_produs USING gin (fatete);
CREATE INDEX cp_ord ON public.catalog_produs USING btree (business_id, is_featured DESC, sort_order, product_id);
CREATE INDEX cp_pret ON public.catalog_produs USING btree (business_id, price_min, product_id);
CREATE INDEX cp_trgm ON public.catalog_produs USING gin (cauta_norm extensions.gin_trgm_ops);
CREATE INDEX custom_pages_business_published_idx ON public.custom_pages USING btree (business_id, is_published);
CREATE INDEX cw_semn ON public.catalog_cuvant USING btree (business_id, semnatura);
CREATE INDEX cw_trgm ON public.catalog_cuvant USING gin (cuvant extensions.gin_trgm_ops);
CREATE INDEX dhl_etichete_business_idx ON public.dhl_etichete USING btree (business_id, creat_la DESC);
CREATE UNIQUE INDEX domain_orders_stripe_session_id_key ON public.domain_orders USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);
CREATE UNIQUE INDEX domains_business_domain_key ON public.domains USING btree (business_id, domain);
CREATE INDEX emag_awb_order_idx ON public.emag_awb USING btree (order_id);
CREATE INDEX emag_offers_business_status_idx ON public.emag_offers USING btree (business_id, status);
CREATE INDEX emag_offers_pnk_idx ON public.emag_offers USING btree (business_id, part_number_key) WHERE (part_number_key IS NOT NULL);
CREATE INDEX emag_offers_product_idx ON public.emag_offers USING btree (product_id);
CREATE UNIQUE INDEX emag_offers_produs_varianta_uidx ON public.emag_offers USING btree (business_id, product_id, COALESCE(variant_title, ''::text)) WHERE (product_id IS NOT NULL);
CREATE INDEX emag_offers_reconciliere_idx ON public.emag_offers USING btree (business_id, last_status_at NULLS FIRST);
CREATE INDEX emag_orders_business_status_idx ON public.emag_orders USING btree (business_id, order_status);
CREATE INDEX emag_orders_factura_de_urcat_idx ON public.emag_orders USING btree (business_id, created_at) WHERE (invoice_uploaded_at IS NULL);
CREATE INDEX emag_orders_order_idx ON public.emag_orders USING btree (order_id);
CREATE INDEX emag_rma_business_status_idx ON public.emag_rma USING btree (business_id, request_status);
CREATE INDEX emag_sync_queue_created_idx ON public.emag_sync_queue USING btree (created_at);
CREATE INDEX emag_sync_queue_product_idx ON public.emag_sync_queue USING btree (product_id);
CREATE INDEX emag_sync_queue_revendicat_idx ON public.emag_sync_queue USING btree (revendicat_pana, created_at);
CREATE INDEX fedex_etichete_business_idx ON public.fedex_etichete USING btree (business_id, creat_la DESC);
CREATE INDEX forms_business_idx ON public.forms USING btree (business_id);
CREATE UNIQUE INDEX gmc_products_business_offer_uidx ON public.gmc_products USING btree (business_id, offer_id);
CREATE INDEX gmc_products_business_product_idx ON public.gmc_products USING btree (business_id, product_id);
CREATE INDEX gmc_products_business_status_idx ON public.gmc_products USING btree (business_id, status);
CREATE INDEX gmc_sync_queue_created_idx ON public.gmc_sync_queue USING btree (created_at);
CREATE UNIQUE INDEX gmc_sync_queue_dedupe_uidx ON public.gmc_sync_queue USING btree (business_id, offer_id, op);
CREATE INDEX idx_aboutyou_batches_open ON public.aboutyou_batches USING btree (status, submitted_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text, 'retry'::text]));
CREATE INDEX idx_aboutyou_listings_business_status ON public.aboutyou_listings USING btree (business_id, status);
CREATE INDEX idx_aboutyou_listings_product ON public.aboutyou_listings USING btree (product_id);
CREATE INDEX idx_aboutyou_listings_stale_status ON public.aboutyou_listings USING btree (last_status_at NULLS FIRST);
CREATE INDEX idx_aboutyou_orders_business_status ON public.aboutyou_orders USING btree (business_id, status);
CREATE INDEX idx_aboutyou_orders_items_gin ON public.aboutyou_orders USING gin (items jsonb_path_ops);
CREATE INDEX idx_aboutyou_orders_order ON public.aboutyou_orders USING btree (order_id);
CREATE INDEX idx_aboutyou_queue_created ON public.aboutyou_sync_queue USING btree (created_at);
CREATE INDEX idx_aboutyou_queue_revendicat ON public.aboutyou_sync_queue USING btree (revendicat_pana, created_at);
CREATE INDEX idx_aboutyou_sync_queue_product ON public.aboutyou_sync_queue USING btree (product_id);
CREATE INDEX idx_aboutyou_variants_business_sku ON public.aboutyou_variants USING btree (business_id, sku);
CREATE INDEX idx_aboutyou_variants_listing ON public.aboutyou_variants USING btree (listing_id);
CREATE INDEX idx_aboutyou_variants_product ON public.aboutyou_variants USING btree (product_id);
CREATE INDEX idx_analytics_created_at ON public.site_analytics USING btree (created_at);
CREATE INDEX idx_audit_log_admin_id ON public.admin_audit_log USING btree (admin_id);
CREATE INDEX idx_audit_log_created_at ON public.admin_audit_log USING btree (created_at DESC);
CREATE INDEX idx_audit_log_target ON public.admin_audit_log USING btree (target_type, target_id);
CREATE INDEX idx_businesses_type ON public.businesses USING btree (type);
CREATE INDEX idx_businesses_user_id ON public.businesses USING btree (user_id);
CREATE INDEX idx_domain_orders_business_id ON public.domain_orders USING btree (business_id);
CREATE INDEX idx_domain_orders_status ON public.domain_orders USING btree (status);
CREATE INDEX idx_domain_orders_user_id ON public.domain_orders USING btree (user_id);
CREATE INDEX idx_domains_business_id ON public.domains USING btree (business_id);
CREATE INDEX idx_domains_user_id ON public.domains USING btree (user_id);
CREATE INDEX idx_email_automations_user ON public.email_automations USING btree (user_id);
CREATE INDEX idx_error_logs_action ON public.error_logs USING btree (action);
CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at DESC);
CREATE INDEX idx_error_logs_severity ON public.error_logs USING btree (severity);
CREATE INDEX idx_gmc_queue_revendicat ON public.gmc_sync_queue USING btree (revendicat_pana, created_at);
CREATE INDEX idx_invoices_user_id ON public.invoices USING btree (user_id);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_olx_adverts_business_status ON public.olx_adverts USING btree (business_id, status);
CREATE INDEX idx_olx_adverts_stale_status ON public.olx_adverts USING btree (last_status_at NULLS FIRST);
CREATE INDEX idx_olx_adverts_valid_to ON public.olx_adverts USING btree (valid_to);
CREATE INDEX idx_olx_queue_created ON public.olx_sync_queue USING btree (created_at);
CREATE INDEX idx_olx_queue_revendicat ON public.olx_sync_queue USING btree (revendicat_pana, created_at);
CREATE INDEX idx_orders_business_created ON public.orders USING btree (business_id, created_at DESC);
CREATE INDEX idx_orders_business_id ON public.orders USING btree (business_id);
CREATE INDEX idx_orders_business_normphone ON public.orders USING btree (business_id, normalize_phone(customer_phone));
CREATE INDEX idx_orders_business_status ON public.orders USING btree (business_id, status);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_trgm_company_name ON public.orders USING gin (((billing_company ->> 'company_name'::text)) extensions.gin_trgm_ops);
CREATE INDEX idx_orders_trgm_cui ON public.orders USING gin (((billing_company ->> 'cui'::text)) extensions.gin_trgm_ops);
CREATE INDEX idx_orders_trgm_customer_name ON public.orders USING gin (customer_name extensions.gin_trgm_ops);
CREATE INDEX idx_orders_trgm_customer_phone ON public.orders USING gin (customer_phone extensions.gin_trgm_ops);
CREATE INDEX idx_orders_trgm_order_number ON public.orders USING gin (order_number extensions.gin_trgm_ops);
CREATE INDEX idx_products_business_active ON public.products USING btree (business_id, is_active) INCLUDE (is_featured, sort_order);
CREATE INDEX idx_products_business_id ON public.products USING btree (business_id);
CREATE INDEX idx_products_trgm_category ON public.products USING gin (category extensions.gin_trgm_ops);
CREATE INDEX idx_products_trgm_name ON public.products USING gin (name extensions.gin_trgm_ops);
CREATE INDEX idx_products_trgm_sku ON public.products USING gin (sku extensions.gin_trgm_ops);
CREATE INDEX idx_site_analytics_business_created ON public.site_analytics USING btree (business_id, created_at DESC);
CREATE INDEX idx_sms_campaigns_business_id ON public.sms_campaigns USING btree (business_id);
CREATE INDEX idx_sms_templates_business_id ON public.sms_templates USING btree (business_id);
CREATE INDEX idx_support_tickets_user_unread ON public.support_tickets USING btree (user_id, has_unread_reply) WHERE (has_unread_reply = true);
CREATE INDEX idx_trendyol_batches_open ON public.trendyol_batches USING btree (status, submitted_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text, 'retry'::text]));
CREATE INDEX idx_trendyol_listings_business_status ON public.trendyol_listings USING btree (business_id, status);
CREATE INDEX idx_trendyol_listings_product ON public.trendyol_listings USING btree (product_id);
CREATE INDEX idx_trendyol_listings_stale_status ON public.trendyol_listings USING btree (last_status_at NULLS FIRST);
CREATE INDEX idx_trendyol_orders_business_status ON public.trendyol_orders USING btree (business_id, status);
CREATE INDEX idx_trendyol_orders_order ON public.trendyol_orders USING btree (order_id);
CREATE INDEX idx_trendyol_queue_created ON public.trendyol_sync_queue USING btree (created_at);
CREATE INDEX idx_trendyol_queue_product ON public.trendyol_sync_queue USING btree (product_id);
CREATE INDEX idx_trendyol_queue_revendicat ON public.trendyol_sync_queue USING btree (revendicat_pana, created_at);
CREATE INDEX idx_trendyol_variants_business_barcode ON public.trendyol_variants USING btree (business_id, barcode);
CREATE INDEX idx_trendyol_variants_listing ON public.trendyol_variants USING btree (listing_id);
CREATE INDEX idx_trendyol_variants_product ON public.trendyol_variants USING btree (product_id);
CREATE INDEX mailchimp_suppressions_business_email_idx ON public.mailchimp_suppressions USING btree (business_id, email);
CREATE INDEX media_library_business_created_idx ON public.media_library USING btree (business_id, created_at DESC);
CREATE UNIQUE INDEX media_library_business_key_uidx ON public.media_library USING btree (business_id, r2_key);
CREATE INDEX media_library_business_type_idx ON public.media_library USING btree (business_id, type);
CREATE INDEX notice_inbox_business_idx ON public.notice_inbox USING btree (business_id, received_at DESC);
CREATE INDEX notice_sms_log_business_created_idx ON public.notice_sms_log USING btree (business_id, created_at DESC);
CREATE INDEX notice_sms_log_provider_id_idx ON public.notice_sms_log USING btree (provider_id) WHERE (provider_id IS NOT NULL);
CREATE INDEX offers_business_active_idx ON public.offers USING btree (business_id, is_active);
CREATE INDEX offers_business_type_idx ON public.offers USING btree (business_id, type);
CREATE INDEX operatii_externe_atarnate_idx ON public.operatii_externe USING btree (creat_la) WHERE (stare = ANY (ARRAY['in_curs'::text, 'necunoscut'::text]));
CREATE UNIQUE INDEX operatii_externe_cheie_activa_idx ON public.operatii_externe USING btree (COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid), cheie) WHERE (stare = ANY (ARRAY['in_curs'::text, 'reusit'::text, 'necunoscut'::text]));
CREATE INDEX operatii_externe_order_idx ON public.operatii_externe USING btree (order_id, creat_la DESC);
CREATE INDEX orders_cupon_neplatit_idx ON public.orders USING btree (payment_status, status, created_at) WHERE (discount_code IS NOT NULL);
CREATE INDEX orders_dhl_urmarire_idx ON public.orders USING btree (dhl_status_checked_at NULLS FIRST) WHERE ((dhl_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_ecolet_emitere_idx ON public.orders USING btree (ecolet_status_checked_at NULLS FIRST) WHERE ((ecolet_order_to_send_id IS NOT NULL) AND (ecolet_awb_number IS NULL));
CREATE INDEX orders_ecolet_urmarire_idx ON public.orders USING btree (ecolet_status_checked_at NULLS FIRST) WHERE ((ecolet_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_fedex_urmarire_idx ON public.orders USING btree (fedex_status_checked_at NULLS FIRST) WHERE ((fedex_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_gls_urmarire_idx ON public.orders USING btree (gls_status_checked_at NULLS FIRST) WHERE ((gls_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_innoship_urmarire_idx ON public.orders USING btree (innoship_status_checked_at NULLS FIRST) WHERE ((innoship_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_packeta_urmarire_idx ON public.orders USING btree (packeta_status_checked_at NULLS FIRST) WHERE ((packeta_packet_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_pallex_urmarire_idx ON public.orders USING btree (pallex_status_checked_at NULLS FIRST) WHERE ((pallex_consignment_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_posta_urmarire_idx ON public.orders USING btree (posta_status_checked_at NULLS FIRST) WHERE ((posta_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_shipo_urmarire_idx ON public.orders USING btree (shipo_status_checked_at NULLS FIRST) WHERE ((shipo_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_smartship_urmarire_idx ON public.orders USING btree (smartship_status_checked_at NULLS FIRST) WHERE ((smartship_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX orders_ups_urmarire_idx ON public.orders USING btree (ups_status_checked_at NULLS FIRST) WHERE ((ups_awb_number IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text])));
CREATE INDEX page_form_submissions_business_idx ON public.page_form_submissions USING btree (business_id, created_at DESC);
CREATE INDEX product_import_rows_cursor_idx ON public.product_import_rows USING btree (import_id, status, row_index);
CREATE INDEX product_import_rows_images_idx ON public.product_import_rows USING btree (import_id, row_index) WHERE (images_done = false);
CREATE INDEX product_imports_active_idx ON public.product_imports USING btree (status) WHERE (status = ANY (ARRAY['importing'::text, 'rehosting_images'::text]));
CREATE INDEX product_imports_business_idx ON public.product_imports USING btree (business_id, created_at DESC);
CREATE INDEX products_business_is_bundle_idx ON public.products USING btree (business_id) WHERE is_bundle;
CREATE UNIQUE INDEX products_business_slug_unique ON public.products USING btree (business_id, slug) WHERE (slug IS NOT NULL);
CREATE UNIQUE INDEX products_source_external_uidx ON public.products USING btree (business_id, source, external_id) WHERE ((source IS NOT NULL) AND (external_id IS NOT NULL));
CREATE INDEX rate_limits_curatare_idx ON public.rate_limits USING btree (actualizat_la);
CREATE UNIQUE INDEX recovery_optout_business_email_uidx ON public.recovery_optout USING btree (business_id, lower(email));
CREATE INDEX return_requests_business_created_idx ON public.return_requests USING btree (business_id, created_at DESC);
CREATE INDEX return_requests_business_unread_idx ON public.return_requests USING btree (business_id, is_read);
CREATE INDEX return_requests_order_idx ON public.return_requests USING btree (order_id);
CREATE INDEX stock_feed_sources_business_idx ON public.stock_feed_sources USING btree (business_id);
CREATE INDEX stock_feed_sources_due_idx ON public.stock_feed_sources USING btree (enabled, last_run_at NULLS FIRST);
CREATE INDEX stripe_events_created_at_idx ON public.stripe_events USING btree (created_at);
CREATE INDEX support_messages_ticket_id_idx ON public.support_messages USING btree (ticket_id);
CREATE INDEX support_tickets_business_id_idx ON public.support_tickets USING btree (business_id);
CREATE INDEX support_tickets_status_idx ON public.support_tickets USING btree (status);
CREATE INDEX support_tickets_user_id_idx ON public.support_tickets USING btree (user_id);
CREATE INDEX ups_etichete_business_idx ON public.ups_etichete USING btree (business_id, creat_la DESC);
CREATE INDEX users_profile_role_idx ON public.users_profile USING btree (role);

-- ── VEDERI ────────────────────────────────────────────────
-- ATENTIE: `security_invoker` pe store_settings NU e optional.
create or replace view public.store_settings with (security_invoker = true) as
 SELECT id,
    business_id,
    currency,
    shipping_enabled,
    free_shipping_threshold,
    default_shipping_cost,
    shipping_zones,
    payment_methods,
    min_order_amount,
    store_policies,
    created_at,
    updated_at,
    page_content,
    order_number_format,
    order_counter,
    vat_enabled,
    vat_rate,
    prices_include_vat,
    show_vat_breakdown,
    notifications_config,
    privat.decripteaza_config(smso_config, '{api_key}'::text[]) AS smso_config,
    privat.decripteaza_config(smartbill_config, '{token}'::text[]) AS smartbill_config,
    stripe_config,
    privat.decripteaza_config(netopia_config, '{api_key,pos_signature}'::text[]) AS netopia_config,
    privat.decripteaza_config(woot_config, '{public_key,secret_key}'::text[]) AS woot_config,
    privat.decripteaza_config(colete_config, '{client_secret,token}'::text[]) AS colete_config,
    privat.decripteaza_config(oblio_config, '{client_secret}'::text[]) AS oblio_config,
    privat.decripteaza_config(fgo_config, '{private_key}'::text[]) AS fgo_config,
    privat.decripteaza_config(cargus_config, '{password,subscription_key}'::text[]) AS cargus_config,
    privat.decripteaza_config(dpd_config, '{password}'::text[]) AS dpd_config,
    privat.decripteaza_config(fan_courier_config, '{password}'::text[]) AS fan_courier_config,
    privat.decripteaza_config(sameday_config, '{password}'::text[]) AS sameday_config,
    marketing_config,
    privat.decripteaza_config(ipay_config, '{password}'::text[]) AS ipay_config,
    abandoned_cart_enabled,
    abandoned_cart_automation,
    privat.decripteaza_config(google_merchant_config, '{refresh_token}'::text[]) AS google_merchant_config,
    card_discount_config,
    cookie_banner_config,
    privat.decripteaza_config(notice_config, '{api_token,webhook_secret}'::text[]) AS notice_config,
    privat.decripteaza_config(google_analytics_config, '{refresh_token,api_secret}'::text[]) AS google_analytics_config,
    privat.decripteaza_config(mailchimp_config, '{api_key,webhook_secret}'::text[]) AS mailchimp_config,
    privat.decripteaza_config(brevo_config, '{api_key,webhook_secret}'::text[]) AS brevo_config,
    privat.decripteaza_config(klaviyo_config, '{api_key}'::text[]) AS klaviyo_config,
    returns_config,
    privat.decripteaza_config(klarna_config, '{password,authorization_token}'::text[]) AS klarna_config,
    privat.decripteaza_config(revolut_config, '{secret_key,signing_secret,token}'::text[]) AS revolut_config,
    privat.decripteaza_config(olx_config, '{access_token,refresh_token}'::text[]) AS olx_config,
    privat.decripteaza_config(aboutyou_config, '{api_key,webhook_secret}'::text[]) AS aboutyou_config,
    privat.decripteaza_config(trendyol_config, '{api_key,api_secret,webhook_secret}'::text[]) AS trendyol_config,
    privat.decripteaza_config(email_config, '{smtp.pass}'::text[]) AS email_config,
    cod_discount_config,
    shipping_classes,
    shipping_rules,
    storefront_design,
    storefront_design_draft,
    storefront_design_pub_at,
    cod_fee_config,
    show_vat_label,
    privat.decripteaza_config(gls_config, '{password}'::text[]) AS gls_config,
    privat.decripteaza_config(pallex_config, '{password}'::text[]) AS pallex_config,
    privat.decripteaza_config(ecolet_config, '{api_token}'::text[]) AS ecolet_config,
    facebook_feeds,
    privat.decripteaza_config(posta_config, '{password}'::text[]) AS posta_config,
    privat.decripteaza_config(innoship_config, '{api_key,webhook_secret}'::text[]) AS innoship_config,
    privat.decripteaza_config(packeta_config, '{api_password,api_key}'::text[]) AS packeta_config,
    privat.decripteaza_config(smartship_config, '{api_key}'::text[]) AS smartship_config,
    privat.decripteaza_config(shipo_config, '{api_key}'::text[]) AS shipo_config,
    privat.decripteaza_config(fedex_config, '{client_secret}'::text[]) AS fedex_config,
    privat.decripteaza_config(ups_config, '{client_secret}'::text[]) AS ups_config,
    privat.decripteaza_config(dhl_config, '{password}'::text[]) AS dhl_config,
    privat.decripteaza_config(emag_config, '{password}'::text[]) AS emag_config
   FROM privat.store_settings;

-- ── DECLANSATOARE ─────────────────────────────────────────
CREATE TRIGGER set_store_settings_updated_at BEFORE UPDATE ON privat.store_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER businesses_blocheaza_domeniu_platforma BEFORE INSERT OR UPDATE OF custom_domain ON public.businesses FOR EACH ROW EXECUTE FUNCTION blocheaza_domeniu_platforma();
CREATE TRIGGER set_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER catalog_produs_cuvinte AFTER INSERT OR DELETE OR UPDATE ON public.catalog_produs FOR EACH ROW EXECUTE FUNCTION trg_catalog_cuvinte_murdar();
CREATE TRIGGER catalog_produs_rezumat AFTER INSERT OR DELETE OR UPDATE ON public.catalog_produs FOR EACH ROW EXECUTE FUNCTION trg_catalog_rezumat_murdar();
CREATE TRIGGER categorii_rezumat_murdar AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION trg_categorii_rezumat_murdar();
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION touch_customers();
CREATE TRIGGER set_domain_orders_updated_at BEFORE UPDATE ON public.domain_orders FOR EACH ROW EXECUTE FUNCTION update_domain_orders_updated_at();
CREATE TRIGGER set_emag_offers_updated_at BEFORE UPDATE ON public.emag_offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_emag_orders_updated_at BEFORE UPDATE ON public.emag_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_emag_rma_updated_at BEFORE UPDATE ON public.emag_rma FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_catalog_proiectie AFTER INSERT OR DELETE OR UPDATE OF name, slug, description, price, compare_at_price, images, category, tags, is_featured, is_active, is_bundle, track_inventory, stock_quantity, sort_order, page_sections ON public.products FOR EACH ROW EXECUTE FUNCTION trg_catalog_proiectie();
CREATE TRIGGER products_repretuieste_pachetele AFTER UPDATE OF price ON public.products FOR EACH ROW WHEN (((NOT COALESCE(new.is_bundle, false)) AND (new.price IS DISTINCT FROM old.price))) EXECUTE FUNCTION trg_repretuieste_pachetele();
CREATE TRIGGER products_sync_variant_stock BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION sync_product_stock_from_variants();
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER stock_feed_sources_touch BEFORE UPDATE ON public.stock_feed_sources FOR EACH ROW EXECUTE FUNCTION touch_stock_feed_sources();
CREATE TRIGGER store_settings_del INSTEAD OF DELETE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION privat.store_settings_del();
CREATE TRIGGER store_settings_ins INSTEAD OF INSERT ON public.store_settings FOR EACH ROW EXECUTE FUNCTION privat.store_settings_ins();
CREATE TRIGGER store_settings_upd INSTEAD OF UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION privat.store_settings_upd();
CREATE TRIGGER support_messages_after_insert AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION handle_support_message_insert();
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_support_ticket_updated_at();
CREATE TRIGGER set_users_profile_updated_at BEFORE UPDATE ON public.users_profile FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_profile_blocheaza_escaladare BEFORE UPDATE ON public.users_profile FOR EACH ROW EXECUTE FUNCTION blocheaza_escaladare_users_profile();

-- ── RLS ───────────────────────────────────────────────────
alter table privat.store_settings enable row level security;
alter table public.abandoned_carts enable row level security;
alter table public.aboutyou_batches enable row level security;
alter table public.aboutyou_listings enable row level security;
alter table public.aboutyou_orders enable row level security;
alter table public.aboutyou_sync_queue enable row level security;
alter table public.aboutyou_variants enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.announcements enable row level security;
alter table public.brevo_suppressions enable row level security;
alter table public.business_daily_stats enable row level security;
alter table public.businesses enable row level security;
alter table public.catalog_cuvant enable row level security;
alter table public.catalog_cuvinte_murdar enable row level security;
alter table public.catalog_index_cuvant enable row level security;
alter table public.catalog_murdar enable row level security;
alter table public.catalog_produs enable row level security;
alter table public.catalog_rezumat enable row level security;
alter table public.catalog_rezumat_murdar enable row level security;
alter table public.categories enable row level security;
alter table public.custom_pages enable row level security;
alter table public.customers enable row level security;
alter table public.dhl_etichete enable row level security;
alter table public.discounts enable row level security;
alter table public.domain_orders enable row level security;
alter table public.domains enable row level security;
alter table public.emag_awb enable row level security;
alter table public.emag_offers enable row level security;
alter table public.emag_orders enable row level security;
alter table public.emag_rma enable row level security;
alter table public.emag_sync_queue enable row level security;
alter table public.email_automations enable row level security;
alter table public.error_logs enable row level security;
alter table public.fedex_etichete enable row level security;
alter table public.forms enable row level security;
alter table public.gmc_products enable row level security;
alter table public.gmc_sync_queue enable row level security;
alter table public.invoices enable row level security;
alter table public.mailchimp_suppressions enable row level security;
alter table public.media_library enable row level security;
alter table public.notice_inbox enable row level security;
alter table public.notice_sms_log enable row level security;
alter table public.notifications enable row level security;
alter table public.offers enable row level security;
alter table public.olx_adverts enable row level security;
alter table public.olx_sync_queue enable row level security;
alter table public.operatii_externe enable row level security;
alter table public.orders enable row level security;
alter table public.page_form_submissions enable row level security;
alter table public.platform_settings enable row level security;
alter table public.posta_plaja enable row level security;
alter table public.product_import_rows enable row level security;
alter table public.product_imports enable row level security;
alter table public.products enable row level security;
alter table public.rate_limits enable row level security;
alter table public.recovery_optout enable row level security;
alter table public.return_requests enable row level security;
alter table public.site_analytics enable row level security;
alter table public.sms_campaigns enable row level security;
alter table public.sms_templates enable row level security;
alter table public.stock_feed_sources enable row level security;
alter table public.stripe_events enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_tickets enable row level security;
alter table public.trendyol_batches enable row level security;
alter table public.trendyol_listings enable row level security;
alter table public.trendyol_orders enable row level security;
alter table public.trendyol_sync_queue enable row level security;
alter table public.trendyol_variants enable row level security;
alter table public.ups_etichete enable row level security;
alter table public.users_profile enable row level security;
alter table public.zz_backup_categorii_okxi_20260812 enable row level security;
alter table public.zz_backup_facebook_feeds_20260814 enable row level security;
alter table public.zz_backup_preturi_bricosmart_20260804 enable row level security;
alter table public.zz_backup_preturi_parfumuri_insula_20260812 enable row level security;
alter table public.zz_backup_preturi_vetdepo_categorii_20260903 enable row level security;
alter table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 enable row level security;

create policy "Owners can manage store settings" on privat.store_settings as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = store_settings.business_id) AND (b.user_id = auth.uid())))));
create policy owner_delete_abandoned_carts on public.abandoned_carts as PERMISSIVE for DELETE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_select_abandoned_carts on public.abandoned_carts as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_update_abandoned_carts on public.abandoned_carts as PERMISSIVE for UPDATE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_select_aboutyou_batches on public.aboutyou_batches as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_aboutyou_listings on public.aboutyou_listings as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_aboutyou_orders on public.aboutyou_orders as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_aboutyou_sync_queue on public.aboutyou_sync_queue as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_aboutyou_variants on public.aboutyou_variants as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy "Admins manage announcements" on public.announcements as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "Read published announcements" on public.announcements as PERMISSIVE for SELECT to authenticated using (((is_published = true) OR is_admin()));
create policy "Owners read own brevo suppressions" on public.brevo_suppressions as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = brevo_suppressions.business_id) AND (b.user_id = auth.uid())))));
create policy "Owners can manage own businesses" on public.businesses as PERMISSIVE for ALL to public using ((auth.uid() = user_id));
create policy "Public can view published businesses" on public.businesses as PERMISSIVE for SELECT to public using ((is_published = true));
create policy "Public read categories of published businesses" on public.categories as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = categories.business_id) AND (b.is_published = true)))));
create policy "Users manage own categories" on public.categories as PERMISSIVE for ALL to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Admins can manage all pages" on public.custom_pages as PERMISSIVE for ALL to public using (is_admin()) with check (is_admin());
create policy "Owners can manage own pages" on public.custom_pages as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = custom_pages.business_id) AND (b.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = custom_pages.business_id) AND (b.user_id = auth.uid())))));
create policy "Public can view published pages of published businesses" on public.custom_pages as PERMISSIVE for SELECT to public using (((is_published = true) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = custom_pages.business_id) AND (b.is_published = true))))));
create policy customers_delete_own on public.customers as PERMISSIVE for DELETE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy customers_insert_own on public.customers as PERMISSIVE for INSERT to public with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy customers_select_own on public.customers as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy customers_update_own on public.customers as PERMISSIVE for UPDATE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy discounts_owner_all on public.discounts as PERMISSIVE for ALL to authenticated using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid())))) with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Users can view own domain orders" on public.domain_orders as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "Users manage own domains" on public.domains as PERMISSIVE for ALL to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy owner_select_emag_awb on public.emag_awb as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_emag_offers on public.emag_offers as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_emag_orders on public.emag_orders as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_emag_rma on public.emag_rma as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_emag_sync_queue on public.emag_sync_queue as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy "Admins can read error logs" on public.error_logs as PERMISSIVE for SELECT to public using (is_admin());
create policy "Admins manage all forms" on public.forms as PERMISSIVE for ALL to public using (is_admin()) with check (is_admin());
create policy "Owners manage own forms" on public.forms as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = forms.business_id) AND (b.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = forms.business_id) AND (b.user_id = auth.uid())))));
create policy owner_select_gmc_products on public.gmc_products as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_select_gmc_sync_queue on public.gmc_sync_queue as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Users can view own invoices" on public.invoices as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Owners read own mailchimp suppressions" on public.mailchimp_suppressions as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = mailchimp_suppressions.business_id) AND (b.user_id = auth.uid())))));
create policy owner_all_media_library on public.media_library as PERMISSIVE for ALL to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid())))) with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Owner manages notice_inbox" on public.notice_inbox as PERMISSIVE for ALL to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Owner manages notice_sms_log" on public.notice_sms_log as PERMISSIVE for ALL to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid())))) with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Users can read own notifications" on public.notifications as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "Users can update own notifications" on public.notifications as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy owner_delete_offers on public.offers as PERMISSIVE for DELETE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_insert_offers on public.offers as PERMISSIVE for INSERT to public with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_select_offers on public.offers as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_update_offers on public.offers as PERMISSIVE for UPDATE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_select_olx_adverts on public.olx_adverts as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_select_olx_sync_queue on public.olx_sync_queue as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Owners can view and update orders" on public.orders as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = orders.business_id) AND (b.user_id = auth.uid())))));
create policy "Admins manage all submissions" on public.page_form_submissions as PERMISSIVE for ALL to public using (is_admin()) with check (is_admin());
create policy "Owners can read own submissions" on public.page_form_submissions as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = page_form_submissions.business_id) AND (b.user_id = auth.uid())))));
create policy "Owners can update own submissions" on public.page_form_submissions as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = page_form_submissions.business_id) AND (b.user_id = auth.uid())))));
create policy "Owners read own import rows" on public.product_import_rows as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Owners read own imports" on public.product_imports as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Owners can manage products" on public.products as PERMISSIVE for ALL to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = products.business_id) AND (b.user_id = auth.uid())))));
create policy "Public can view active products of published businesses" on public.products as PERMISSIVE for SELECT to public using (((is_active = true) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = products.business_id) AND (b.is_published = true))))));
create policy owner_select_recovery_optout on public.recovery_optout as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_delete_return_requests on public.return_requests as PERMISSIVE for DELETE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_select_return_requests on public.return_requests as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy owner_update_return_requests on public.return_requests as PERMISSIVE for UPDATE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Owners can view own analytics" on public.site_analytics as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = site_analytics.business_id) AND (b.user_id = auth.uid())))));
create policy "Owner manages sms_campaigns" on public.sms_campaigns as PERMISSIVE for ALL to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid())))) with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy "Owners manage sms_templates" on public.sms_templates as PERMISSIVE for ALL to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid())))) with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy stock_feed_sources_delete_own on public.stock_feed_sources as PERMISSIVE for DELETE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy stock_feed_sources_insert_own on public.stock_feed_sources as PERMISSIVE for INSERT to public with check ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy stock_feed_sources_select_own on public.stock_feed_sources as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy stock_feed_sources_update_own on public.stock_feed_sources as PERMISSIVE for UPDATE to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = auth.uid()))));
create policy admins_delete_messages on public.support_messages as PERMISSIVE for DELETE to public using (is_admin());
create policy users_insert_ticket_messages on public.support_messages as PERMISSIVE for INSERT to public with check (((sender_type = 'user'::text) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (t.user_id = auth.uid()) AND (t.status <> 'closed'::text))))));
create policy users_select_ticket_messages on public.support_messages as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (t.user_id = auth.uid())))));
create policy admins_delete_tickets on public.support_tickets as PERMISSIVE for DELETE to public using (is_admin());
create policy users_insert_tickets on public.support_tickets as PERMISSIVE for INSERT to public with check ((auth.uid() = user_id));
create policy users_select_own_tickets on public.support_tickets as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy users_update_own_tickets on public.support_tickets as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id));
create policy owner_select_trendyol_batches on public.trendyol_batches as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_trendyol_listings on public.trendyol_listings as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_trendyol_orders on public.trendyol_orders as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_trendyol_sync_queue on public.trendyol_sync_queue as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy owner_select_trendyol_variants on public.trendyol_variants as PERMISSIVE for SELECT to public using ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.user_id = ( SELECT auth.uid() AS uid)))));
create policy "Users can update own profile" on public.users_profile as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = id)) with check ((auth.uid() = id));
create policy "Users can view own profile" on public.users_profile as PERMISSIVE for SELECT to public using ((auth.uid() = id));
create policy admins_read_all_profiles on public.users_profile as PERMISSIVE for SELECT to public using ((is_admin() OR (auth.uid() = id)));

-- ── ACCES LA SCHEME ───────────────────────────────────────
grant usage on schema privat to anon;
grant usage on schema privat to authenticated;
grant usage on schema privat to service_role;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- ── GRANTURI PE TABELE ────────────────────────────────────
grant DELETE on table privat.store_settings to anon;
grant INSERT on table privat.store_settings to anon;
grant REFERENCES on table privat.store_settings to anon;
grant SELECT on table privat.store_settings to anon;
grant TRIGGER on table privat.store_settings to anon;
grant TRUNCATE on table privat.store_settings to anon;
grant UPDATE on table privat.store_settings to anon;
grant DELETE on table privat.store_settings to authenticated;
grant INSERT on table privat.store_settings to authenticated;
grant REFERENCES on table privat.store_settings to authenticated;
grant SELECT on table privat.store_settings to authenticated;
grant TRIGGER on table privat.store_settings to authenticated;
grant TRUNCATE on table privat.store_settings to authenticated;
grant UPDATE on table privat.store_settings to authenticated;
grant DELETE on table privat.store_settings to service_role;
grant INSERT on table privat.store_settings to service_role;
grant REFERENCES on table privat.store_settings to service_role;
grant SELECT on table privat.store_settings to service_role;
grant TRIGGER on table privat.store_settings to service_role;
grant TRUNCATE on table privat.store_settings to service_role;
grant UPDATE on table privat.store_settings to service_role;
grant DELETE on table public.abandoned_carts to anon;
grant INSERT on table public.abandoned_carts to anon;
grant REFERENCES on table public.abandoned_carts to anon;
grant TRIGGER on table public.abandoned_carts to anon;
grant TRUNCATE on table public.abandoned_carts to anon;
grant UPDATE on table public.abandoned_carts to anon;
grant DELETE on table public.abandoned_carts to authenticated;
grant INSERT on table public.abandoned_carts to authenticated;
grant REFERENCES on table public.abandoned_carts to authenticated;
grant SELECT on table public.abandoned_carts to authenticated;
grant TRIGGER on table public.abandoned_carts to authenticated;
grant TRUNCATE on table public.abandoned_carts to authenticated;
grant UPDATE on table public.abandoned_carts to authenticated;
grant DELETE on table public.abandoned_carts to service_role;
grant INSERT on table public.abandoned_carts to service_role;
grant REFERENCES on table public.abandoned_carts to service_role;
grant SELECT on table public.abandoned_carts to service_role;
grant TRIGGER on table public.abandoned_carts to service_role;
grant TRUNCATE on table public.abandoned_carts to service_role;
grant UPDATE on table public.abandoned_carts to service_role;
grant DELETE on table public.aboutyou_batches to anon;
grant INSERT on table public.aboutyou_batches to anon;
grant REFERENCES on table public.aboutyou_batches to anon;
grant SELECT on table public.aboutyou_batches to anon;
grant TRIGGER on table public.aboutyou_batches to anon;
grant TRUNCATE on table public.aboutyou_batches to anon;
grant UPDATE on table public.aboutyou_batches to anon;
grant DELETE on table public.aboutyou_batches to authenticated;
grant INSERT on table public.aboutyou_batches to authenticated;
grant REFERENCES on table public.aboutyou_batches to authenticated;
grant SELECT on table public.aboutyou_batches to authenticated;
grant TRIGGER on table public.aboutyou_batches to authenticated;
grant TRUNCATE on table public.aboutyou_batches to authenticated;
grant UPDATE on table public.aboutyou_batches to authenticated;
grant DELETE on table public.aboutyou_batches to service_role;
grant INSERT on table public.aboutyou_batches to service_role;
grant REFERENCES on table public.aboutyou_batches to service_role;
grant SELECT on table public.aboutyou_batches to service_role;
grant TRIGGER on table public.aboutyou_batches to service_role;
grant TRUNCATE on table public.aboutyou_batches to service_role;
grant UPDATE on table public.aboutyou_batches to service_role;
grant DELETE on table public.aboutyou_listings to anon;
grant INSERT on table public.aboutyou_listings to anon;
grant REFERENCES on table public.aboutyou_listings to anon;
grant SELECT on table public.aboutyou_listings to anon;
grant TRIGGER on table public.aboutyou_listings to anon;
grant TRUNCATE on table public.aboutyou_listings to anon;
grant UPDATE on table public.aboutyou_listings to anon;
grant DELETE on table public.aboutyou_listings to authenticated;
grant INSERT on table public.aboutyou_listings to authenticated;
grant REFERENCES on table public.aboutyou_listings to authenticated;
grant SELECT on table public.aboutyou_listings to authenticated;
grant TRIGGER on table public.aboutyou_listings to authenticated;
grant TRUNCATE on table public.aboutyou_listings to authenticated;
grant UPDATE on table public.aboutyou_listings to authenticated;
grant DELETE on table public.aboutyou_listings to service_role;
grant INSERT on table public.aboutyou_listings to service_role;
grant REFERENCES on table public.aboutyou_listings to service_role;
grant SELECT on table public.aboutyou_listings to service_role;
grant TRIGGER on table public.aboutyou_listings to service_role;
grant TRUNCATE on table public.aboutyou_listings to service_role;
grant UPDATE on table public.aboutyou_listings to service_role;
grant DELETE on table public.aboutyou_orders to anon;
grant INSERT on table public.aboutyou_orders to anon;
grant REFERENCES on table public.aboutyou_orders to anon;
grant SELECT on table public.aboutyou_orders to anon;
grant TRIGGER on table public.aboutyou_orders to anon;
grant TRUNCATE on table public.aboutyou_orders to anon;
grant UPDATE on table public.aboutyou_orders to anon;
grant DELETE on table public.aboutyou_orders to authenticated;
grant INSERT on table public.aboutyou_orders to authenticated;
grant REFERENCES on table public.aboutyou_orders to authenticated;
grant SELECT on table public.aboutyou_orders to authenticated;
grant TRIGGER on table public.aboutyou_orders to authenticated;
grant TRUNCATE on table public.aboutyou_orders to authenticated;
grant UPDATE on table public.aboutyou_orders to authenticated;
grant DELETE on table public.aboutyou_orders to service_role;
grant INSERT on table public.aboutyou_orders to service_role;
grant REFERENCES on table public.aboutyou_orders to service_role;
grant SELECT on table public.aboutyou_orders to service_role;
grant TRIGGER on table public.aboutyou_orders to service_role;
grant TRUNCATE on table public.aboutyou_orders to service_role;
grant UPDATE on table public.aboutyou_orders to service_role;
grant DELETE on table public.aboutyou_sync_queue to anon;
grant INSERT on table public.aboutyou_sync_queue to anon;
grant REFERENCES on table public.aboutyou_sync_queue to anon;
grant SELECT on table public.aboutyou_sync_queue to anon;
grant TRIGGER on table public.aboutyou_sync_queue to anon;
grant TRUNCATE on table public.aboutyou_sync_queue to anon;
grant UPDATE on table public.aboutyou_sync_queue to anon;
grant DELETE on table public.aboutyou_sync_queue to authenticated;
grant INSERT on table public.aboutyou_sync_queue to authenticated;
grant REFERENCES on table public.aboutyou_sync_queue to authenticated;
grant SELECT on table public.aboutyou_sync_queue to authenticated;
grant TRIGGER on table public.aboutyou_sync_queue to authenticated;
grant TRUNCATE on table public.aboutyou_sync_queue to authenticated;
grant UPDATE on table public.aboutyou_sync_queue to authenticated;
grant DELETE on table public.aboutyou_sync_queue to service_role;
grant INSERT on table public.aboutyou_sync_queue to service_role;
grant REFERENCES on table public.aboutyou_sync_queue to service_role;
grant SELECT on table public.aboutyou_sync_queue to service_role;
grant TRIGGER on table public.aboutyou_sync_queue to service_role;
grant TRUNCATE on table public.aboutyou_sync_queue to service_role;
grant UPDATE on table public.aboutyou_sync_queue to service_role;
grant DELETE on table public.aboutyou_variants to anon;
grant INSERT on table public.aboutyou_variants to anon;
grant REFERENCES on table public.aboutyou_variants to anon;
grant SELECT on table public.aboutyou_variants to anon;
grant TRIGGER on table public.aboutyou_variants to anon;
grant TRUNCATE on table public.aboutyou_variants to anon;
grant UPDATE on table public.aboutyou_variants to anon;
grant DELETE on table public.aboutyou_variants to authenticated;
grant INSERT on table public.aboutyou_variants to authenticated;
grant REFERENCES on table public.aboutyou_variants to authenticated;
grant SELECT on table public.aboutyou_variants to authenticated;
grant TRIGGER on table public.aboutyou_variants to authenticated;
grant TRUNCATE on table public.aboutyou_variants to authenticated;
grant UPDATE on table public.aboutyou_variants to authenticated;
grant DELETE on table public.aboutyou_variants to service_role;
grant INSERT on table public.aboutyou_variants to service_role;
grant REFERENCES on table public.aboutyou_variants to service_role;
grant SELECT on table public.aboutyou_variants to service_role;
grant TRIGGER on table public.aboutyou_variants to service_role;
grant TRUNCATE on table public.aboutyou_variants to service_role;
grant UPDATE on table public.aboutyou_variants to service_role;
grant DELETE on table public.admin_audit_log to anon;
grant INSERT on table public.admin_audit_log to anon;
grant REFERENCES on table public.admin_audit_log to anon;
grant TRIGGER on table public.admin_audit_log to anon;
grant TRUNCATE on table public.admin_audit_log to anon;
grant UPDATE on table public.admin_audit_log to anon;
grant DELETE on table public.admin_audit_log to authenticated;
grant INSERT on table public.admin_audit_log to authenticated;
grant REFERENCES on table public.admin_audit_log to authenticated;
grant SELECT on table public.admin_audit_log to authenticated;
grant TRIGGER on table public.admin_audit_log to authenticated;
grant TRUNCATE on table public.admin_audit_log to authenticated;
grant UPDATE on table public.admin_audit_log to authenticated;
grant DELETE on table public.admin_audit_log to service_role;
grant INSERT on table public.admin_audit_log to service_role;
grant REFERENCES on table public.admin_audit_log to service_role;
grant SELECT on table public.admin_audit_log to service_role;
grant TRIGGER on table public.admin_audit_log to service_role;
grant TRUNCATE on table public.admin_audit_log to service_role;
grant UPDATE on table public.admin_audit_log to service_role;
grant DELETE on table public.announcements to anon;
grant INSERT on table public.announcements to anon;
grant REFERENCES on table public.announcements to anon;
grant SELECT on table public.announcements to anon;
grant TRIGGER on table public.announcements to anon;
grant TRUNCATE on table public.announcements to anon;
grant UPDATE on table public.announcements to anon;
grant DELETE on table public.announcements to authenticated;
grant INSERT on table public.announcements to authenticated;
grant REFERENCES on table public.announcements to authenticated;
grant SELECT on table public.announcements to authenticated;
grant TRIGGER on table public.announcements to authenticated;
grant TRUNCATE on table public.announcements to authenticated;
grant UPDATE on table public.announcements to authenticated;
grant DELETE on table public.announcements to service_role;
grant INSERT on table public.announcements to service_role;
grant REFERENCES on table public.announcements to service_role;
grant SELECT on table public.announcements to service_role;
grant TRIGGER on table public.announcements to service_role;
grant TRUNCATE on table public.announcements to service_role;
grant UPDATE on table public.announcements to service_role;
grant DELETE on table public.brevo_suppressions to anon;
grant INSERT on table public.brevo_suppressions to anon;
grant REFERENCES on table public.brevo_suppressions to anon;
grant SELECT on table public.brevo_suppressions to anon;
grant TRIGGER on table public.brevo_suppressions to anon;
grant TRUNCATE on table public.brevo_suppressions to anon;
grant UPDATE on table public.brevo_suppressions to anon;
grant DELETE on table public.brevo_suppressions to authenticated;
grant INSERT on table public.brevo_suppressions to authenticated;
grant REFERENCES on table public.brevo_suppressions to authenticated;
grant SELECT on table public.brevo_suppressions to authenticated;
grant TRIGGER on table public.brevo_suppressions to authenticated;
grant TRUNCATE on table public.brevo_suppressions to authenticated;
grant UPDATE on table public.brevo_suppressions to authenticated;
grant DELETE on table public.brevo_suppressions to service_role;
grant INSERT on table public.brevo_suppressions to service_role;
grant REFERENCES on table public.brevo_suppressions to service_role;
grant SELECT on table public.brevo_suppressions to service_role;
grant TRIGGER on table public.brevo_suppressions to service_role;
grant TRUNCATE on table public.brevo_suppressions to service_role;
grant UPDATE on table public.brevo_suppressions to service_role;
grant DELETE on table public.business_daily_stats to anon;
grant INSERT on table public.business_daily_stats to anon;
grant REFERENCES on table public.business_daily_stats to anon;
grant SELECT on table public.business_daily_stats to anon;
grant TRIGGER on table public.business_daily_stats to anon;
grant TRUNCATE on table public.business_daily_stats to anon;
grant UPDATE on table public.business_daily_stats to anon;
grant DELETE on table public.business_daily_stats to authenticated;
grant INSERT on table public.business_daily_stats to authenticated;
grant REFERENCES on table public.business_daily_stats to authenticated;
grant SELECT on table public.business_daily_stats to authenticated;
grant TRIGGER on table public.business_daily_stats to authenticated;
grant TRUNCATE on table public.business_daily_stats to authenticated;
grant UPDATE on table public.business_daily_stats to authenticated;
grant DELETE on table public.business_daily_stats to service_role;
grant INSERT on table public.business_daily_stats to service_role;
grant REFERENCES on table public.business_daily_stats to service_role;
grant SELECT on table public.business_daily_stats to service_role;
grant TRIGGER on table public.business_daily_stats to service_role;
grant TRUNCATE on table public.business_daily_stats to service_role;
grant UPDATE on table public.business_daily_stats to service_role;
grant DELETE on table public.businesses to anon;
grant INSERT on table public.businesses to anon;
grant REFERENCES on table public.businesses to anon;
grant TRIGGER on table public.businesses to anon;
grant TRUNCATE on table public.businesses to anon;
grant DELETE on table public.businesses to authenticated;
grant INSERT on table public.businesses to authenticated;
grant REFERENCES on table public.businesses to authenticated;
grant SELECT on table public.businesses to authenticated;
grant TRIGGER on table public.businesses to authenticated;
grant TRUNCATE on table public.businesses to authenticated;
grant DELETE on table public.businesses to service_role;
grant INSERT on table public.businesses to service_role;
grant REFERENCES on table public.businesses to service_role;
grant SELECT on table public.businesses to service_role;
grant TRIGGER on table public.businesses to service_role;
grant TRUNCATE on table public.businesses to service_role;
grant UPDATE on table public.businesses to service_role;
grant DELETE on table public.catalog_cuvant to anon;
grant INSERT on table public.catalog_cuvant to anon;
grant REFERENCES on table public.catalog_cuvant to anon;
grant SELECT on table public.catalog_cuvant to anon;
grant TRIGGER on table public.catalog_cuvant to anon;
grant TRUNCATE on table public.catalog_cuvant to anon;
grant UPDATE on table public.catalog_cuvant to anon;
grant DELETE on table public.catalog_cuvant to authenticated;
grant INSERT on table public.catalog_cuvant to authenticated;
grant REFERENCES on table public.catalog_cuvant to authenticated;
grant SELECT on table public.catalog_cuvant to authenticated;
grant TRIGGER on table public.catalog_cuvant to authenticated;
grant TRUNCATE on table public.catalog_cuvant to authenticated;
grant UPDATE on table public.catalog_cuvant to authenticated;
grant DELETE on table public.catalog_cuvant to service_role;
grant INSERT on table public.catalog_cuvant to service_role;
grant REFERENCES on table public.catalog_cuvant to service_role;
grant SELECT on table public.catalog_cuvant to service_role;
grant TRIGGER on table public.catalog_cuvant to service_role;
grant TRUNCATE on table public.catalog_cuvant to service_role;
grant UPDATE on table public.catalog_cuvant to service_role;
grant DELETE on table public.catalog_cuvinte_murdar to anon;
grant INSERT on table public.catalog_cuvinte_murdar to anon;
grant REFERENCES on table public.catalog_cuvinte_murdar to anon;
grant SELECT on table public.catalog_cuvinte_murdar to anon;
grant TRIGGER on table public.catalog_cuvinte_murdar to anon;
grant TRUNCATE on table public.catalog_cuvinte_murdar to anon;
grant UPDATE on table public.catalog_cuvinte_murdar to anon;
grant DELETE on table public.catalog_cuvinte_murdar to authenticated;
grant INSERT on table public.catalog_cuvinte_murdar to authenticated;
grant REFERENCES on table public.catalog_cuvinte_murdar to authenticated;
grant SELECT on table public.catalog_cuvinte_murdar to authenticated;
grant TRIGGER on table public.catalog_cuvinte_murdar to authenticated;
grant TRUNCATE on table public.catalog_cuvinte_murdar to authenticated;
grant UPDATE on table public.catalog_cuvinte_murdar to authenticated;
grant DELETE on table public.catalog_cuvinte_murdar to service_role;
grant INSERT on table public.catalog_cuvinte_murdar to service_role;
grant REFERENCES on table public.catalog_cuvinte_murdar to service_role;
grant SELECT on table public.catalog_cuvinte_murdar to service_role;
grant TRIGGER on table public.catalog_cuvinte_murdar to service_role;
grant TRUNCATE on table public.catalog_cuvinte_murdar to service_role;
grant UPDATE on table public.catalog_cuvinte_murdar to service_role;
grant DELETE on table public.catalog_index_cuvant to anon;
grant INSERT on table public.catalog_index_cuvant to anon;
grant REFERENCES on table public.catalog_index_cuvant to anon;
grant SELECT on table public.catalog_index_cuvant to anon;
grant TRIGGER on table public.catalog_index_cuvant to anon;
grant TRUNCATE on table public.catalog_index_cuvant to anon;
grant UPDATE on table public.catalog_index_cuvant to anon;
grant DELETE on table public.catalog_index_cuvant to authenticated;
grant INSERT on table public.catalog_index_cuvant to authenticated;
grant REFERENCES on table public.catalog_index_cuvant to authenticated;
grant SELECT on table public.catalog_index_cuvant to authenticated;
grant TRIGGER on table public.catalog_index_cuvant to authenticated;
grant TRUNCATE on table public.catalog_index_cuvant to authenticated;
grant UPDATE on table public.catalog_index_cuvant to authenticated;
grant DELETE on table public.catalog_index_cuvant to service_role;
grant INSERT on table public.catalog_index_cuvant to service_role;
grant REFERENCES on table public.catalog_index_cuvant to service_role;
grant SELECT on table public.catalog_index_cuvant to service_role;
grant TRIGGER on table public.catalog_index_cuvant to service_role;
grant TRUNCATE on table public.catalog_index_cuvant to service_role;
grant UPDATE on table public.catalog_index_cuvant to service_role;
grant DELETE on table public.catalog_murdar to anon;
grant INSERT on table public.catalog_murdar to anon;
grant REFERENCES on table public.catalog_murdar to anon;
grant SELECT on table public.catalog_murdar to anon;
grant TRIGGER on table public.catalog_murdar to anon;
grant TRUNCATE on table public.catalog_murdar to anon;
grant UPDATE on table public.catalog_murdar to anon;
grant DELETE on table public.catalog_murdar to authenticated;
grant INSERT on table public.catalog_murdar to authenticated;
grant REFERENCES on table public.catalog_murdar to authenticated;
grant SELECT on table public.catalog_murdar to authenticated;
grant TRIGGER on table public.catalog_murdar to authenticated;
grant TRUNCATE on table public.catalog_murdar to authenticated;
grant UPDATE on table public.catalog_murdar to authenticated;
grant DELETE on table public.catalog_murdar to service_role;
grant INSERT on table public.catalog_murdar to service_role;
grant REFERENCES on table public.catalog_murdar to service_role;
grant SELECT on table public.catalog_murdar to service_role;
grant TRIGGER on table public.catalog_murdar to service_role;
grant TRUNCATE on table public.catalog_murdar to service_role;
grant UPDATE on table public.catalog_murdar to service_role;
grant DELETE on table public.catalog_produs to anon;
grant INSERT on table public.catalog_produs to anon;
grant REFERENCES on table public.catalog_produs to anon;
grant SELECT on table public.catalog_produs to anon;
grant TRIGGER on table public.catalog_produs to anon;
grant TRUNCATE on table public.catalog_produs to anon;
grant UPDATE on table public.catalog_produs to anon;
grant DELETE on table public.catalog_produs to authenticated;
grant INSERT on table public.catalog_produs to authenticated;
grant REFERENCES on table public.catalog_produs to authenticated;
grant SELECT on table public.catalog_produs to authenticated;
grant TRIGGER on table public.catalog_produs to authenticated;
grant TRUNCATE on table public.catalog_produs to authenticated;
grant UPDATE on table public.catalog_produs to authenticated;
grant DELETE on table public.catalog_produs to service_role;
grant INSERT on table public.catalog_produs to service_role;
grant REFERENCES on table public.catalog_produs to service_role;
grant SELECT on table public.catalog_produs to service_role;
grant TRIGGER on table public.catalog_produs to service_role;
grant TRUNCATE on table public.catalog_produs to service_role;
grant UPDATE on table public.catalog_produs to service_role;
grant DELETE on table public.catalog_rezumat to anon;
grant INSERT on table public.catalog_rezumat to anon;
grant REFERENCES on table public.catalog_rezumat to anon;
grant SELECT on table public.catalog_rezumat to anon;
grant TRIGGER on table public.catalog_rezumat to anon;
grant TRUNCATE on table public.catalog_rezumat to anon;
grant UPDATE on table public.catalog_rezumat to anon;
grant DELETE on table public.catalog_rezumat to authenticated;
grant INSERT on table public.catalog_rezumat to authenticated;
grant REFERENCES on table public.catalog_rezumat to authenticated;
grant SELECT on table public.catalog_rezumat to authenticated;
grant TRIGGER on table public.catalog_rezumat to authenticated;
grant TRUNCATE on table public.catalog_rezumat to authenticated;
grant UPDATE on table public.catalog_rezumat to authenticated;
grant DELETE on table public.catalog_rezumat to service_role;
grant INSERT on table public.catalog_rezumat to service_role;
grant REFERENCES on table public.catalog_rezumat to service_role;
grant SELECT on table public.catalog_rezumat to service_role;
grant TRIGGER on table public.catalog_rezumat to service_role;
grant TRUNCATE on table public.catalog_rezumat to service_role;
grant UPDATE on table public.catalog_rezumat to service_role;
grant DELETE on table public.catalog_rezumat_murdar to anon;
grant INSERT on table public.catalog_rezumat_murdar to anon;
grant REFERENCES on table public.catalog_rezumat_murdar to anon;
grant SELECT on table public.catalog_rezumat_murdar to anon;
grant TRIGGER on table public.catalog_rezumat_murdar to anon;
grant TRUNCATE on table public.catalog_rezumat_murdar to anon;
grant UPDATE on table public.catalog_rezumat_murdar to anon;
grant DELETE on table public.catalog_rezumat_murdar to authenticated;
grant INSERT on table public.catalog_rezumat_murdar to authenticated;
grant REFERENCES on table public.catalog_rezumat_murdar to authenticated;
grant SELECT on table public.catalog_rezumat_murdar to authenticated;
grant TRIGGER on table public.catalog_rezumat_murdar to authenticated;
grant TRUNCATE on table public.catalog_rezumat_murdar to authenticated;
grant UPDATE on table public.catalog_rezumat_murdar to authenticated;
grant DELETE on table public.catalog_rezumat_murdar to service_role;
grant INSERT on table public.catalog_rezumat_murdar to service_role;
grant REFERENCES on table public.catalog_rezumat_murdar to service_role;
grant SELECT on table public.catalog_rezumat_murdar to service_role;
grant TRIGGER on table public.catalog_rezumat_murdar to service_role;
grant TRUNCATE on table public.catalog_rezumat_murdar to service_role;
grant UPDATE on table public.catalog_rezumat_murdar to service_role;
grant DELETE on table public.categories to anon;
grant INSERT on table public.categories to anon;
grant REFERENCES on table public.categories to anon;
grant SELECT on table public.categories to anon;
grant TRIGGER on table public.categories to anon;
grant TRUNCATE on table public.categories to anon;
grant UPDATE on table public.categories to anon;
grant DELETE on table public.categories to authenticated;
grant INSERT on table public.categories to authenticated;
grant REFERENCES on table public.categories to authenticated;
grant SELECT on table public.categories to authenticated;
grant TRIGGER on table public.categories to authenticated;
grant TRUNCATE on table public.categories to authenticated;
grant UPDATE on table public.categories to authenticated;
grant DELETE on table public.categories to service_role;
grant INSERT on table public.categories to service_role;
grant REFERENCES on table public.categories to service_role;
grant SELECT on table public.categories to service_role;
grant TRIGGER on table public.categories to service_role;
grant TRUNCATE on table public.categories to service_role;
grant UPDATE on table public.categories to service_role;
grant DELETE on table public.custom_pages to anon;
grant INSERT on table public.custom_pages to anon;
grant REFERENCES on table public.custom_pages to anon;
grant SELECT on table public.custom_pages to anon;
grant TRIGGER on table public.custom_pages to anon;
grant TRUNCATE on table public.custom_pages to anon;
grant UPDATE on table public.custom_pages to anon;
grant DELETE on table public.custom_pages to authenticated;
grant INSERT on table public.custom_pages to authenticated;
grant REFERENCES on table public.custom_pages to authenticated;
grant SELECT on table public.custom_pages to authenticated;
grant TRIGGER on table public.custom_pages to authenticated;
grant TRUNCATE on table public.custom_pages to authenticated;
grant UPDATE on table public.custom_pages to authenticated;
grant DELETE on table public.custom_pages to service_role;
grant INSERT on table public.custom_pages to service_role;
grant REFERENCES on table public.custom_pages to service_role;
grant SELECT on table public.custom_pages to service_role;
grant TRIGGER on table public.custom_pages to service_role;
grant TRUNCATE on table public.custom_pages to service_role;
grant UPDATE on table public.custom_pages to service_role;
grant DELETE on table public.customers to anon;
grant INSERT on table public.customers to anon;
grant REFERENCES on table public.customers to anon;
grant SELECT on table public.customers to anon;
grant TRIGGER on table public.customers to anon;
grant TRUNCATE on table public.customers to anon;
grant UPDATE on table public.customers to anon;
grant DELETE on table public.customers to authenticated;
grant INSERT on table public.customers to authenticated;
grant REFERENCES on table public.customers to authenticated;
grant SELECT on table public.customers to authenticated;
grant TRIGGER on table public.customers to authenticated;
grant TRUNCATE on table public.customers to authenticated;
grant UPDATE on table public.customers to authenticated;
grant DELETE on table public.customers to service_role;
grant INSERT on table public.customers to service_role;
grant REFERENCES on table public.customers to service_role;
grant SELECT on table public.customers to service_role;
grant TRIGGER on table public.customers to service_role;
grant TRUNCATE on table public.customers to service_role;
grant UPDATE on table public.customers to service_role;
grant DELETE on table public.dhl_etichete to service_role;
grant INSERT on table public.dhl_etichete to service_role;
grant REFERENCES on table public.dhl_etichete to service_role;
grant SELECT on table public.dhl_etichete to service_role;
grant TRIGGER on table public.dhl_etichete to service_role;
grant TRUNCATE on table public.dhl_etichete to service_role;
grant UPDATE on table public.dhl_etichete to service_role;
grant DELETE on table public.discounts to anon;
grant INSERT on table public.discounts to anon;
grant REFERENCES on table public.discounts to anon;
grant SELECT on table public.discounts to anon;
grant TRIGGER on table public.discounts to anon;
grant TRUNCATE on table public.discounts to anon;
grant UPDATE on table public.discounts to anon;
grant DELETE on table public.discounts to authenticated;
grant INSERT on table public.discounts to authenticated;
grant REFERENCES on table public.discounts to authenticated;
grant SELECT on table public.discounts to authenticated;
grant TRIGGER on table public.discounts to authenticated;
grant TRUNCATE on table public.discounts to authenticated;
grant UPDATE on table public.discounts to authenticated;
grant DELETE on table public.discounts to service_role;
grant INSERT on table public.discounts to service_role;
grant REFERENCES on table public.discounts to service_role;
grant SELECT on table public.discounts to service_role;
grant TRIGGER on table public.discounts to service_role;
grant TRUNCATE on table public.discounts to service_role;
grant UPDATE on table public.discounts to service_role;
grant DELETE on table public.domain_orders to anon;
grant REFERENCES on table public.domain_orders to anon;
grant TRIGGER on table public.domain_orders to anon;
grant TRUNCATE on table public.domain_orders to anon;
grant UPDATE on table public.domain_orders to anon;
grant DELETE on table public.domain_orders to authenticated;
grant REFERENCES on table public.domain_orders to authenticated;
grant SELECT on table public.domain_orders to authenticated;
grant TRIGGER on table public.domain_orders to authenticated;
grant TRUNCATE on table public.domain_orders to authenticated;
grant UPDATE on table public.domain_orders to authenticated;
grant DELETE on table public.domain_orders to service_role;
grant INSERT on table public.domain_orders to service_role;
grant REFERENCES on table public.domain_orders to service_role;
grant SELECT on table public.domain_orders to service_role;
grant TRIGGER on table public.domain_orders to service_role;
grant TRUNCATE on table public.domain_orders to service_role;
grant UPDATE on table public.domain_orders to service_role;
grant DELETE on table public.domains to anon;
grant INSERT on table public.domains to anon;
grant REFERENCES on table public.domains to anon;
grant TRIGGER on table public.domains to anon;
grant TRUNCATE on table public.domains to anon;
grant UPDATE on table public.domains to anon;
grant DELETE on table public.domains to authenticated;
grant INSERT on table public.domains to authenticated;
grant REFERENCES on table public.domains to authenticated;
grant SELECT on table public.domains to authenticated;
grant TRIGGER on table public.domains to authenticated;
grant TRUNCATE on table public.domains to authenticated;
grant UPDATE on table public.domains to authenticated;
grant DELETE on table public.domains to service_role;
grant INSERT on table public.domains to service_role;
grant REFERENCES on table public.domains to service_role;
grant SELECT on table public.domains to service_role;
grant TRIGGER on table public.domains to service_role;
grant TRUNCATE on table public.domains to service_role;
grant UPDATE on table public.domains to service_role;
grant DELETE on table public.emag_awb to anon;
grant INSERT on table public.emag_awb to anon;
grant REFERENCES on table public.emag_awb to anon;
grant SELECT on table public.emag_awb to anon;
grant TRIGGER on table public.emag_awb to anon;
grant TRUNCATE on table public.emag_awb to anon;
grant UPDATE on table public.emag_awb to anon;
grant DELETE on table public.emag_awb to authenticated;
grant INSERT on table public.emag_awb to authenticated;
grant REFERENCES on table public.emag_awb to authenticated;
grant SELECT on table public.emag_awb to authenticated;
grant TRIGGER on table public.emag_awb to authenticated;
grant TRUNCATE on table public.emag_awb to authenticated;
grant UPDATE on table public.emag_awb to authenticated;
grant DELETE on table public.emag_awb to service_role;
grant INSERT on table public.emag_awb to service_role;
grant REFERENCES on table public.emag_awb to service_role;
grant SELECT on table public.emag_awb to service_role;
grant TRIGGER on table public.emag_awb to service_role;
grant TRUNCATE on table public.emag_awb to service_role;
grant UPDATE on table public.emag_awb to service_role;
grant DELETE on table public.emag_offers to anon;
grant INSERT on table public.emag_offers to anon;
grant REFERENCES on table public.emag_offers to anon;
grant SELECT on table public.emag_offers to anon;
grant TRIGGER on table public.emag_offers to anon;
grant TRUNCATE on table public.emag_offers to anon;
grant UPDATE on table public.emag_offers to anon;
grant DELETE on table public.emag_offers to authenticated;
grant INSERT on table public.emag_offers to authenticated;
grant REFERENCES on table public.emag_offers to authenticated;
grant SELECT on table public.emag_offers to authenticated;
grant TRIGGER on table public.emag_offers to authenticated;
grant TRUNCATE on table public.emag_offers to authenticated;
grant UPDATE on table public.emag_offers to authenticated;
grant DELETE on table public.emag_offers to service_role;
grant INSERT on table public.emag_offers to service_role;
grant REFERENCES on table public.emag_offers to service_role;
grant SELECT on table public.emag_offers to service_role;
grant TRIGGER on table public.emag_offers to service_role;
grant TRUNCATE on table public.emag_offers to service_role;
grant UPDATE on table public.emag_offers to service_role;
grant DELETE on table public.emag_orders to anon;
grant INSERT on table public.emag_orders to anon;
grant REFERENCES on table public.emag_orders to anon;
grant SELECT on table public.emag_orders to anon;
grant TRIGGER on table public.emag_orders to anon;
grant TRUNCATE on table public.emag_orders to anon;
grant UPDATE on table public.emag_orders to anon;
grant DELETE on table public.emag_orders to authenticated;
grant INSERT on table public.emag_orders to authenticated;
grant REFERENCES on table public.emag_orders to authenticated;
grant SELECT on table public.emag_orders to authenticated;
grant TRIGGER on table public.emag_orders to authenticated;
grant TRUNCATE on table public.emag_orders to authenticated;
grant UPDATE on table public.emag_orders to authenticated;
grant DELETE on table public.emag_orders to service_role;
grant INSERT on table public.emag_orders to service_role;
grant REFERENCES on table public.emag_orders to service_role;
grant SELECT on table public.emag_orders to service_role;
grant TRIGGER on table public.emag_orders to service_role;
grant TRUNCATE on table public.emag_orders to service_role;
grant UPDATE on table public.emag_orders to service_role;
grant DELETE on table public.emag_rma to anon;
grant INSERT on table public.emag_rma to anon;
grant REFERENCES on table public.emag_rma to anon;
grant SELECT on table public.emag_rma to anon;
grant TRIGGER on table public.emag_rma to anon;
grant TRUNCATE on table public.emag_rma to anon;
grant UPDATE on table public.emag_rma to anon;
grant DELETE on table public.emag_rma to authenticated;
grant INSERT on table public.emag_rma to authenticated;
grant REFERENCES on table public.emag_rma to authenticated;
grant SELECT on table public.emag_rma to authenticated;
grant TRIGGER on table public.emag_rma to authenticated;
grant TRUNCATE on table public.emag_rma to authenticated;
grant UPDATE on table public.emag_rma to authenticated;
grant DELETE on table public.emag_rma to service_role;
grant INSERT on table public.emag_rma to service_role;
grant REFERENCES on table public.emag_rma to service_role;
grant SELECT on table public.emag_rma to service_role;
grant TRIGGER on table public.emag_rma to service_role;
grant TRUNCATE on table public.emag_rma to service_role;
grant UPDATE on table public.emag_rma to service_role;
grant DELETE on table public.emag_sync_queue to anon;
grant INSERT on table public.emag_sync_queue to anon;
grant REFERENCES on table public.emag_sync_queue to anon;
grant SELECT on table public.emag_sync_queue to anon;
grant TRIGGER on table public.emag_sync_queue to anon;
grant TRUNCATE on table public.emag_sync_queue to anon;
grant UPDATE on table public.emag_sync_queue to anon;
grant DELETE on table public.emag_sync_queue to authenticated;
grant INSERT on table public.emag_sync_queue to authenticated;
grant REFERENCES on table public.emag_sync_queue to authenticated;
grant SELECT on table public.emag_sync_queue to authenticated;
grant TRIGGER on table public.emag_sync_queue to authenticated;
grant TRUNCATE on table public.emag_sync_queue to authenticated;
grant UPDATE on table public.emag_sync_queue to authenticated;
grant DELETE on table public.emag_sync_queue to service_role;
grant INSERT on table public.emag_sync_queue to service_role;
grant REFERENCES on table public.emag_sync_queue to service_role;
grant SELECT on table public.emag_sync_queue to service_role;
grant TRIGGER on table public.emag_sync_queue to service_role;
grant TRUNCATE on table public.emag_sync_queue to service_role;
grant UPDATE on table public.emag_sync_queue to service_role;
grant DELETE on table public.email_automations to anon;
grant INSERT on table public.email_automations to anon;
grant REFERENCES on table public.email_automations to anon;
grant TRIGGER on table public.email_automations to anon;
grant TRUNCATE on table public.email_automations to anon;
grant UPDATE on table public.email_automations to anon;
grant DELETE on table public.email_automations to authenticated;
grant INSERT on table public.email_automations to authenticated;
grant REFERENCES on table public.email_automations to authenticated;
grant SELECT on table public.email_automations to authenticated;
grant TRIGGER on table public.email_automations to authenticated;
grant TRUNCATE on table public.email_automations to authenticated;
grant UPDATE on table public.email_automations to authenticated;
grant DELETE on table public.email_automations to service_role;
grant INSERT on table public.email_automations to service_role;
grant REFERENCES on table public.email_automations to service_role;
grant SELECT on table public.email_automations to service_role;
grant TRIGGER on table public.email_automations to service_role;
grant TRUNCATE on table public.email_automations to service_role;
grant UPDATE on table public.email_automations to service_role;
grant DELETE on table public.error_logs to anon;
grant REFERENCES on table public.error_logs to anon;
grant SELECT on table public.error_logs to anon;
grant TRIGGER on table public.error_logs to anon;
grant TRUNCATE on table public.error_logs to anon;
grant UPDATE on table public.error_logs to anon;
grant DELETE on table public.error_logs to authenticated;
grant REFERENCES on table public.error_logs to authenticated;
grant SELECT on table public.error_logs to authenticated;
grant TRIGGER on table public.error_logs to authenticated;
grant TRUNCATE on table public.error_logs to authenticated;
grant UPDATE on table public.error_logs to authenticated;
grant DELETE on table public.error_logs to service_role;
grant INSERT on table public.error_logs to service_role;
grant REFERENCES on table public.error_logs to service_role;
grant SELECT on table public.error_logs to service_role;
grant TRIGGER on table public.error_logs to service_role;
grant TRUNCATE on table public.error_logs to service_role;
grant UPDATE on table public.error_logs to service_role;
grant DELETE on table public.fedex_etichete to service_role;
grant INSERT on table public.fedex_etichete to service_role;
grant REFERENCES on table public.fedex_etichete to service_role;
grant SELECT on table public.fedex_etichete to service_role;
grant TRIGGER on table public.fedex_etichete to service_role;
grant TRUNCATE on table public.fedex_etichete to service_role;
grant UPDATE on table public.fedex_etichete to service_role;
grant DELETE on table public.forms to anon;
grant INSERT on table public.forms to anon;
grant REFERENCES on table public.forms to anon;
grant SELECT on table public.forms to anon;
grant TRIGGER on table public.forms to anon;
grant TRUNCATE on table public.forms to anon;
grant UPDATE on table public.forms to anon;
grant DELETE on table public.forms to authenticated;
grant INSERT on table public.forms to authenticated;
grant REFERENCES on table public.forms to authenticated;
grant SELECT on table public.forms to authenticated;
grant TRIGGER on table public.forms to authenticated;
grant TRUNCATE on table public.forms to authenticated;
grant UPDATE on table public.forms to authenticated;
grant DELETE on table public.forms to service_role;
grant INSERT on table public.forms to service_role;
grant REFERENCES on table public.forms to service_role;
grant SELECT on table public.forms to service_role;
grant TRIGGER on table public.forms to service_role;
grant TRUNCATE on table public.forms to service_role;
grant UPDATE on table public.forms to service_role;
grant DELETE on table public.gmc_products to anon;
grant INSERT on table public.gmc_products to anon;
grant REFERENCES on table public.gmc_products to anon;
grant TRIGGER on table public.gmc_products to anon;
grant TRUNCATE on table public.gmc_products to anon;
grant UPDATE on table public.gmc_products to anon;
grant DELETE on table public.gmc_products to authenticated;
grant INSERT on table public.gmc_products to authenticated;
grant REFERENCES on table public.gmc_products to authenticated;
grant SELECT on table public.gmc_products to authenticated;
grant TRIGGER on table public.gmc_products to authenticated;
grant TRUNCATE on table public.gmc_products to authenticated;
grant UPDATE on table public.gmc_products to authenticated;
grant DELETE on table public.gmc_products to service_role;
grant INSERT on table public.gmc_products to service_role;
grant REFERENCES on table public.gmc_products to service_role;
grant SELECT on table public.gmc_products to service_role;
grant TRIGGER on table public.gmc_products to service_role;
grant TRUNCATE on table public.gmc_products to service_role;
grant UPDATE on table public.gmc_products to service_role;
grant DELETE on table public.gmc_sync_queue to anon;
grant INSERT on table public.gmc_sync_queue to anon;
grant REFERENCES on table public.gmc_sync_queue to anon;
grant TRIGGER on table public.gmc_sync_queue to anon;
grant TRUNCATE on table public.gmc_sync_queue to anon;
grant UPDATE on table public.gmc_sync_queue to anon;
grant DELETE on table public.gmc_sync_queue to authenticated;
grant INSERT on table public.gmc_sync_queue to authenticated;
grant REFERENCES on table public.gmc_sync_queue to authenticated;
grant SELECT on table public.gmc_sync_queue to authenticated;
grant TRIGGER on table public.gmc_sync_queue to authenticated;
grant TRUNCATE on table public.gmc_sync_queue to authenticated;
grant UPDATE on table public.gmc_sync_queue to authenticated;
grant DELETE on table public.gmc_sync_queue to service_role;
grant INSERT on table public.gmc_sync_queue to service_role;
grant REFERENCES on table public.gmc_sync_queue to service_role;
grant SELECT on table public.gmc_sync_queue to service_role;
grant TRIGGER on table public.gmc_sync_queue to service_role;
grant TRUNCATE on table public.gmc_sync_queue to service_role;
grant UPDATE on table public.gmc_sync_queue to service_role;
grant DELETE on table public.invoices to anon;
grant INSERT on table public.invoices to anon;
grant REFERENCES on table public.invoices to anon;
grant TRIGGER on table public.invoices to anon;
grant TRUNCATE on table public.invoices to anon;
grant UPDATE on table public.invoices to anon;
grant DELETE on table public.invoices to authenticated;
grant INSERT on table public.invoices to authenticated;
grant REFERENCES on table public.invoices to authenticated;
grant SELECT on table public.invoices to authenticated;
grant TRIGGER on table public.invoices to authenticated;
grant TRUNCATE on table public.invoices to authenticated;
grant UPDATE on table public.invoices to authenticated;
grant DELETE on table public.invoices to service_role;
grant INSERT on table public.invoices to service_role;
grant REFERENCES on table public.invoices to service_role;
grant SELECT on table public.invoices to service_role;
grant TRIGGER on table public.invoices to service_role;
grant TRUNCATE on table public.invoices to service_role;
grant UPDATE on table public.invoices to service_role;
grant DELETE on table public.mailchimp_suppressions to anon;
grant INSERT on table public.mailchimp_suppressions to anon;
grant REFERENCES on table public.mailchimp_suppressions to anon;
grant SELECT on table public.mailchimp_suppressions to anon;
grant TRIGGER on table public.mailchimp_suppressions to anon;
grant TRUNCATE on table public.mailchimp_suppressions to anon;
grant UPDATE on table public.mailchimp_suppressions to anon;
grant DELETE on table public.mailchimp_suppressions to authenticated;
grant INSERT on table public.mailchimp_suppressions to authenticated;
grant REFERENCES on table public.mailchimp_suppressions to authenticated;
grant SELECT on table public.mailchimp_suppressions to authenticated;
grant TRIGGER on table public.mailchimp_suppressions to authenticated;
grant TRUNCATE on table public.mailchimp_suppressions to authenticated;
grant UPDATE on table public.mailchimp_suppressions to authenticated;
grant DELETE on table public.mailchimp_suppressions to service_role;
grant INSERT on table public.mailchimp_suppressions to service_role;
grant REFERENCES on table public.mailchimp_suppressions to service_role;
grant SELECT on table public.mailchimp_suppressions to service_role;
grant TRIGGER on table public.mailchimp_suppressions to service_role;
grant TRUNCATE on table public.mailchimp_suppressions to service_role;
grant UPDATE on table public.mailchimp_suppressions to service_role;
grant DELETE on table public.media_library to anon;
grant INSERT on table public.media_library to anon;
grant REFERENCES on table public.media_library to anon;
grant TRIGGER on table public.media_library to anon;
grant TRUNCATE on table public.media_library to anon;
grant UPDATE on table public.media_library to anon;
grant DELETE on table public.media_library to authenticated;
grant INSERT on table public.media_library to authenticated;
grant REFERENCES on table public.media_library to authenticated;
grant SELECT on table public.media_library to authenticated;
grant TRIGGER on table public.media_library to authenticated;
grant TRUNCATE on table public.media_library to authenticated;
grant UPDATE on table public.media_library to authenticated;
grant DELETE on table public.media_library to service_role;
grant INSERT on table public.media_library to service_role;
grant REFERENCES on table public.media_library to service_role;
grant SELECT on table public.media_library to service_role;
grant TRIGGER on table public.media_library to service_role;
grant TRUNCATE on table public.media_library to service_role;
grant UPDATE on table public.media_library to service_role;
grant DELETE on table public.notice_inbox to anon;
grant INSERT on table public.notice_inbox to anon;
grant REFERENCES on table public.notice_inbox to anon;
grant SELECT on table public.notice_inbox to anon;
grant TRIGGER on table public.notice_inbox to anon;
grant TRUNCATE on table public.notice_inbox to anon;
grant UPDATE on table public.notice_inbox to anon;
grant DELETE on table public.notice_inbox to authenticated;
grant INSERT on table public.notice_inbox to authenticated;
grant REFERENCES on table public.notice_inbox to authenticated;
grant SELECT on table public.notice_inbox to authenticated;
grant TRIGGER on table public.notice_inbox to authenticated;
grant TRUNCATE on table public.notice_inbox to authenticated;
grant UPDATE on table public.notice_inbox to authenticated;
grant DELETE on table public.notice_inbox to service_role;
grant INSERT on table public.notice_inbox to service_role;
grant REFERENCES on table public.notice_inbox to service_role;
grant SELECT on table public.notice_inbox to service_role;
grant TRIGGER on table public.notice_inbox to service_role;
grant TRUNCATE on table public.notice_inbox to service_role;
grant UPDATE on table public.notice_inbox to service_role;
grant DELETE on table public.notice_sms_log to anon;
grant INSERT on table public.notice_sms_log to anon;
grant REFERENCES on table public.notice_sms_log to anon;
grant SELECT on table public.notice_sms_log to anon;
grant TRIGGER on table public.notice_sms_log to anon;
grant TRUNCATE on table public.notice_sms_log to anon;
grant UPDATE on table public.notice_sms_log to anon;
grant DELETE on table public.notice_sms_log to authenticated;
grant INSERT on table public.notice_sms_log to authenticated;
grant REFERENCES on table public.notice_sms_log to authenticated;
grant SELECT on table public.notice_sms_log to authenticated;
grant TRIGGER on table public.notice_sms_log to authenticated;
grant TRUNCATE on table public.notice_sms_log to authenticated;
grant UPDATE on table public.notice_sms_log to authenticated;
grant DELETE on table public.notice_sms_log to service_role;
grant INSERT on table public.notice_sms_log to service_role;
grant REFERENCES on table public.notice_sms_log to service_role;
grant SELECT on table public.notice_sms_log to service_role;
grant TRIGGER on table public.notice_sms_log to service_role;
grant TRUNCATE on table public.notice_sms_log to service_role;
grant UPDATE on table public.notice_sms_log to service_role;
grant DELETE on table public.notifications to anon;
grant INSERT on table public.notifications to anon;
grant REFERENCES on table public.notifications to anon;
grant TRIGGER on table public.notifications to anon;
grant TRUNCATE on table public.notifications to anon;
grant UPDATE on table public.notifications to anon;
grant DELETE on table public.notifications to authenticated;
grant INSERT on table public.notifications to authenticated;
grant REFERENCES on table public.notifications to authenticated;
grant SELECT on table public.notifications to authenticated;
grant TRIGGER on table public.notifications to authenticated;
grant TRUNCATE on table public.notifications to authenticated;
grant UPDATE on table public.notifications to authenticated;
grant DELETE on table public.notifications to service_role;
grant INSERT on table public.notifications to service_role;
grant REFERENCES on table public.notifications to service_role;
grant SELECT on table public.notifications to service_role;
grant TRIGGER on table public.notifications to service_role;
grant TRUNCATE on table public.notifications to service_role;
grant UPDATE on table public.notifications to service_role;
grant DELETE on table public.offers to anon;
grant INSERT on table public.offers to anon;
grant REFERENCES on table public.offers to anon;
grant TRIGGER on table public.offers to anon;
grant TRUNCATE on table public.offers to anon;
grant UPDATE on table public.offers to anon;
grant DELETE on table public.offers to authenticated;
grant INSERT on table public.offers to authenticated;
grant REFERENCES on table public.offers to authenticated;
grant SELECT on table public.offers to authenticated;
grant TRIGGER on table public.offers to authenticated;
grant TRUNCATE on table public.offers to authenticated;
grant UPDATE on table public.offers to authenticated;
grant DELETE on table public.offers to service_role;
grant INSERT on table public.offers to service_role;
grant REFERENCES on table public.offers to service_role;
grant SELECT on table public.offers to service_role;
grant TRIGGER on table public.offers to service_role;
grant TRUNCATE on table public.offers to service_role;
grant UPDATE on table public.offers to service_role;
grant DELETE on table public.olx_adverts to anon;
grant INSERT on table public.olx_adverts to anon;
grant REFERENCES on table public.olx_adverts to anon;
grant SELECT on table public.olx_adverts to anon;
grant TRIGGER on table public.olx_adverts to anon;
grant TRUNCATE on table public.olx_adverts to anon;
grant UPDATE on table public.olx_adverts to anon;
grant DELETE on table public.olx_adverts to authenticated;
grant INSERT on table public.olx_adverts to authenticated;
grant REFERENCES on table public.olx_adverts to authenticated;
grant SELECT on table public.olx_adverts to authenticated;
grant TRIGGER on table public.olx_adverts to authenticated;
grant TRUNCATE on table public.olx_adverts to authenticated;
grant UPDATE on table public.olx_adverts to authenticated;
grant DELETE on table public.olx_adverts to service_role;
grant INSERT on table public.olx_adverts to service_role;
grant REFERENCES on table public.olx_adverts to service_role;
grant SELECT on table public.olx_adverts to service_role;
grant TRIGGER on table public.olx_adverts to service_role;
grant TRUNCATE on table public.olx_adverts to service_role;
grant UPDATE on table public.olx_adverts to service_role;
grant DELETE on table public.olx_sync_queue to anon;
grant INSERT on table public.olx_sync_queue to anon;
grant REFERENCES on table public.olx_sync_queue to anon;
grant SELECT on table public.olx_sync_queue to anon;
grant TRIGGER on table public.olx_sync_queue to anon;
grant TRUNCATE on table public.olx_sync_queue to anon;
grant UPDATE on table public.olx_sync_queue to anon;
grant DELETE on table public.olx_sync_queue to authenticated;
grant INSERT on table public.olx_sync_queue to authenticated;
grant REFERENCES on table public.olx_sync_queue to authenticated;
grant SELECT on table public.olx_sync_queue to authenticated;
grant TRIGGER on table public.olx_sync_queue to authenticated;
grant TRUNCATE on table public.olx_sync_queue to authenticated;
grant UPDATE on table public.olx_sync_queue to authenticated;
grant DELETE on table public.olx_sync_queue to service_role;
grant INSERT on table public.olx_sync_queue to service_role;
grant REFERENCES on table public.olx_sync_queue to service_role;
grant SELECT on table public.olx_sync_queue to service_role;
grant TRIGGER on table public.olx_sync_queue to service_role;
grant TRUNCATE on table public.olx_sync_queue to service_role;
grant UPDATE on table public.olx_sync_queue to service_role;
grant DELETE on table public.operatii_externe to service_role;
grant INSERT on table public.operatii_externe to service_role;
grant REFERENCES on table public.operatii_externe to service_role;
grant SELECT on table public.operatii_externe to service_role;
grant TRIGGER on table public.operatii_externe to service_role;
grant TRUNCATE on table public.operatii_externe to service_role;
grant UPDATE on table public.operatii_externe to service_role;
grant DELETE on table public.orders to anon;
grant INSERT on table public.orders to anon;
grant REFERENCES on table public.orders to anon;
grant TRIGGER on table public.orders to anon;
grant TRUNCATE on table public.orders to anon;
grant UPDATE on table public.orders to anon;
grant DELETE on table public.orders to authenticated;
grant INSERT on table public.orders to authenticated;
grant REFERENCES on table public.orders to authenticated;
grant SELECT on table public.orders to authenticated;
grant TRIGGER on table public.orders to authenticated;
grant TRUNCATE on table public.orders to authenticated;
grant UPDATE on table public.orders to authenticated;
grant DELETE on table public.orders to service_role;
grant INSERT on table public.orders to service_role;
grant REFERENCES on table public.orders to service_role;
grant SELECT on table public.orders to service_role;
grant TRIGGER on table public.orders to service_role;
grant TRUNCATE on table public.orders to service_role;
grant UPDATE on table public.orders to service_role;
grant DELETE on table public.page_form_submissions to anon;
grant INSERT on table public.page_form_submissions to anon;
grant REFERENCES on table public.page_form_submissions to anon;
grant TRIGGER on table public.page_form_submissions to anon;
grant TRUNCATE on table public.page_form_submissions to anon;
grant UPDATE on table public.page_form_submissions to anon;
grant DELETE on table public.page_form_submissions to authenticated;
grant INSERT on table public.page_form_submissions to authenticated;
grant REFERENCES on table public.page_form_submissions to authenticated;
grant SELECT on table public.page_form_submissions to authenticated;
grant TRIGGER on table public.page_form_submissions to authenticated;
grant TRUNCATE on table public.page_form_submissions to authenticated;
grant UPDATE on table public.page_form_submissions to authenticated;
grant DELETE on table public.page_form_submissions to service_role;
grant INSERT on table public.page_form_submissions to service_role;
grant REFERENCES on table public.page_form_submissions to service_role;
grant SELECT on table public.page_form_submissions to service_role;
grant TRIGGER on table public.page_form_submissions to service_role;
grant TRUNCATE on table public.page_form_submissions to service_role;
grant UPDATE on table public.page_form_submissions to service_role;
grant DELETE on table public.platform_settings to anon;
grant INSERT on table public.platform_settings to anon;
grant REFERENCES on table public.platform_settings to anon;
grant TRIGGER on table public.platform_settings to anon;
grant TRUNCATE on table public.platform_settings to anon;
grant UPDATE on table public.platform_settings to anon;
grant DELETE on table public.platform_settings to authenticated;
grant INSERT on table public.platform_settings to authenticated;
grant REFERENCES on table public.platform_settings to authenticated;
grant SELECT on table public.platform_settings to authenticated;
grant TRIGGER on table public.platform_settings to authenticated;
grant TRUNCATE on table public.platform_settings to authenticated;
grant UPDATE on table public.platform_settings to authenticated;
grant DELETE on table public.platform_settings to service_role;
grant INSERT on table public.platform_settings to service_role;
grant REFERENCES on table public.platform_settings to service_role;
grant SELECT on table public.platform_settings to service_role;
grant TRIGGER on table public.platform_settings to service_role;
grant TRUNCATE on table public.platform_settings to service_role;
grant UPDATE on table public.platform_settings to service_role;
grant DELETE on table public.posta_plaja to anon;
grant INSERT on table public.posta_plaja to anon;
grant REFERENCES on table public.posta_plaja to anon;
grant SELECT on table public.posta_plaja to anon;
grant TRIGGER on table public.posta_plaja to anon;
grant TRUNCATE on table public.posta_plaja to anon;
grant UPDATE on table public.posta_plaja to anon;
grant DELETE on table public.posta_plaja to authenticated;
grant INSERT on table public.posta_plaja to authenticated;
grant REFERENCES on table public.posta_plaja to authenticated;
grant SELECT on table public.posta_plaja to authenticated;
grant TRIGGER on table public.posta_plaja to authenticated;
grant TRUNCATE on table public.posta_plaja to authenticated;
grant UPDATE on table public.posta_plaja to authenticated;
grant DELETE on table public.posta_plaja to service_role;
grant INSERT on table public.posta_plaja to service_role;
grant REFERENCES on table public.posta_plaja to service_role;
grant SELECT on table public.posta_plaja to service_role;
grant TRIGGER on table public.posta_plaja to service_role;
grant TRUNCATE on table public.posta_plaja to service_role;
grant UPDATE on table public.posta_plaja to service_role;
grant DELETE on table public.product_import_rows to anon;
grant INSERT on table public.product_import_rows to anon;
grant REFERENCES on table public.product_import_rows to anon;
grant TRIGGER on table public.product_import_rows to anon;
grant TRUNCATE on table public.product_import_rows to anon;
grant UPDATE on table public.product_import_rows to anon;
grant DELETE on table public.product_import_rows to authenticated;
grant INSERT on table public.product_import_rows to authenticated;
grant REFERENCES on table public.product_import_rows to authenticated;
grant SELECT on table public.product_import_rows to authenticated;
grant TRIGGER on table public.product_import_rows to authenticated;
grant TRUNCATE on table public.product_import_rows to authenticated;
grant UPDATE on table public.product_import_rows to authenticated;
grant DELETE on table public.product_import_rows to service_role;
grant INSERT on table public.product_import_rows to service_role;
grant REFERENCES on table public.product_import_rows to service_role;
grant SELECT on table public.product_import_rows to service_role;
grant TRIGGER on table public.product_import_rows to service_role;
grant TRUNCATE on table public.product_import_rows to service_role;
grant UPDATE on table public.product_import_rows to service_role;
grant DELETE on table public.product_imports to anon;
grant INSERT on table public.product_imports to anon;
grant REFERENCES on table public.product_imports to anon;
grant TRIGGER on table public.product_imports to anon;
grant TRUNCATE on table public.product_imports to anon;
grant UPDATE on table public.product_imports to anon;
grant DELETE on table public.product_imports to authenticated;
grant INSERT on table public.product_imports to authenticated;
grant REFERENCES on table public.product_imports to authenticated;
grant SELECT on table public.product_imports to authenticated;
grant TRIGGER on table public.product_imports to authenticated;
grant TRUNCATE on table public.product_imports to authenticated;
grant UPDATE on table public.product_imports to authenticated;
grant DELETE on table public.product_imports to service_role;
grant INSERT on table public.product_imports to service_role;
grant REFERENCES on table public.product_imports to service_role;
grant SELECT on table public.product_imports to service_role;
grant TRIGGER on table public.product_imports to service_role;
grant TRUNCATE on table public.product_imports to service_role;
grant UPDATE on table public.product_imports to service_role;
grant DELETE on table public.products to anon;
grant INSERT on table public.products to anon;
grant REFERENCES on table public.products to anon;
grant SELECT on table public.products to anon;
grant TRIGGER on table public.products to anon;
grant TRUNCATE on table public.products to anon;
grant UPDATE on table public.products to anon;
grant DELETE on table public.products to authenticated;
grant INSERT on table public.products to authenticated;
grant REFERENCES on table public.products to authenticated;
grant SELECT on table public.products to authenticated;
grant TRIGGER on table public.products to authenticated;
grant TRUNCATE on table public.products to authenticated;
grant UPDATE on table public.products to authenticated;
grant DELETE on table public.products to service_role;
grant INSERT on table public.products to service_role;
grant REFERENCES on table public.products to service_role;
grant SELECT on table public.products to service_role;
grant TRIGGER on table public.products to service_role;
grant TRUNCATE on table public.products to service_role;
grant UPDATE on table public.products to service_role;
grant DELETE on table public.rate_limits to service_role;
grant INSERT on table public.rate_limits to service_role;
grant REFERENCES on table public.rate_limits to service_role;
grant SELECT on table public.rate_limits to service_role;
grant TRIGGER on table public.rate_limits to service_role;
grant TRUNCATE on table public.rate_limits to service_role;
grant UPDATE on table public.rate_limits to service_role;
grant DELETE on table public.recovery_optout to anon;
grant INSERT on table public.recovery_optout to anon;
grant REFERENCES on table public.recovery_optout to anon;
grant TRIGGER on table public.recovery_optout to anon;
grant TRUNCATE on table public.recovery_optout to anon;
grant UPDATE on table public.recovery_optout to anon;
grant DELETE on table public.recovery_optout to authenticated;
grant INSERT on table public.recovery_optout to authenticated;
grant REFERENCES on table public.recovery_optout to authenticated;
grant SELECT on table public.recovery_optout to authenticated;
grant TRIGGER on table public.recovery_optout to authenticated;
grant TRUNCATE on table public.recovery_optout to authenticated;
grant UPDATE on table public.recovery_optout to authenticated;
grant DELETE on table public.recovery_optout to service_role;
grant INSERT on table public.recovery_optout to service_role;
grant REFERENCES on table public.recovery_optout to service_role;
grant SELECT on table public.recovery_optout to service_role;
grant TRIGGER on table public.recovery_optout to service_role;
grant TRUNCATE on table public.recovery_optout to service_role;
grant UPDATE on table public.recovery_optout to service_role;
grant DELETE on table public.return_requests to anon;
grant INSERT on table public.return_requests to anon;
grant REFERENCES on table public.return_requests to anon;
grant SELECT on table public.return_requests to anon;
grant TRIGGER on table public.return_requests to anon;
grant TRUNCATE on table public.return_requests to anon;
grant UPDATE on table public.return_requests to anon;
grant DELETE on table public.return_requests to authenticated;
grant INSERT on table public.return_requests to authenticated;
grant REFERENCES on table public.return_requests to authenticated;
grant SELECT on table public.return_requests to authenticated;
grant TRIGGER on table public.return_requests to authenticated;
grant TRUNCATE on table public.return_requests to authenticated;
grant UPDATE on table public.return_requests to authenticated;
grant DELETE on table public.return_requests to service_role;
grant INSERT on table public.return_requests to service_role;
grant REFERENCES on table public.return_requests to service_role;
grant SELECT on table public.return_requests to service_role;
grant TRIGGER on table public.return_requests to service_role;
grant TRUNCATE on table public.return_requests to service_role;
grant UPDATE on table public.return_requests to service_role;
grant DELETE on table public.site_analytics to anon;
grant REFERENCES on table public.site_analytics to anon;
grant SELECT on table public.site_analytics to anon;
grant TRIGGER on table public.site_analytics to anon;
grant TRUNCATE on table public.site_analytics to anon;
grant UPDATE on table public.site_analytics to anon;
grant DELETE on table public.site_analytics to authenticated;
grant REFERENCES on table public.site_analytics to authenticated;
grant SELECT on table public.site_analytics to authenticated;
grant TRIGGER on table public.site_analytics to authenticated;
grant TRUNCATE on table public.site_analytics to authenticated;
grant UPDATE on table public.site_analytics to authenticated;
grant DELETE on table public.site_analytics to service_role;
grant INSERT on table public.site_analytics to service_role;
grant REFERENCES on table public.site_analytics to service_role;
grant SELECT on table public.site_analytics to service_role;
grant TRIGGER on table public.site_analytics to service_role;
grant TRUNCATE on table public.site_analytics to service_role;
grant UPDATE on table public.site_analytics to service_role;
grant DELETE on table public.sms_campaigns to anon;
grant INSERT on table public.sms_campaigns to anon;
grant REFERENCES on table public.sms_campaigns to anon;
grant TRIGGER on table public.sms_campaigns to anon;
grant TRUNCATE on table public.sms_campaigns to anon;
grant UPDATE on table public.sms_campaigns to anon;
grant DELETE on table public.sms_campaigns to authenticated;
grant INSERT on table public.sms_campaigns to authenticated;
grant REFERENCES on table public.sms_campaigns to authenticated;
grant SELECT on table public.sms_campaigns to authenticated;
grant TRIGGER on table public.sms_campaigns to authenticated;
grant TRUNCATE on table public.sms_campaigns to authenticated;
grant UPDATE on table public.sms_campaigns to authenticated;
grant DELETE on table public.sms_campaigns to service_role;
grant INSERT on table public.sms_campaigns to service_role;
grant REFERENCES on table public.sms_campaigns to service_role;
grant SELECT on table public.sms_campaigns to service_role;
grant TRIGGER on table public.sms_campaigns to service_role;
grant TRUNCATE on table public.sms_campaigns to service_role;
grant UPDATE on table public.sms_campaigns to service_role;
grant DELETE on table public.sms_templates to anon;
grant INSERT on table public.sms_templates to anon;
grant REFERENCES on table public.sms_templates to anon;
grant TRIGGER on table public.sms_templates to anon;
grant TRUNCATE on table public.sms_templates to anon;
grant UPDATE on table public.sms_templates to anon;
grant DELETE on table public.sms_templates to authenticated;
grant INSERT on table public.sms_templates to authenticated;
grant REFERENCES on table public.sms_templates to authenticated;
grant SELECT on table public.sms_templates to authenticated;
grant TRIGGER on table public.sms_templates to authenticated;
grant TRUNCATE on table public.sms_templates to authenticated;
grant UPDATE on table public.sms_templates to authenticated;
grant DELETE on table public.sms_templates to service_role;
grant INSERT on table public.sms_templates to service_role;
grant REFERENCES on table public.sms_templates to service_role;
grant SELECT on table public.sms_templates to service_role;
grant TRIGGER on table public.sms_templates to service_role;
grant TRUNCATE on table public.sms_templates to service_role;
grant UPDATE on table public.sms_templates to service_role;
grant DELETE on table public.stock_feed_sources to anon;
grant INSERT on table public.stock_feed_sources to anon;
grant REFERENCES on table public.stock_feed_sources to anon;
grant TRIGGER on table public.stock_feed_sources to anon;
grant TRUNCATE on table public.stock_feed_sources to anon;
grant UPDATE on table public.stock_feed_sources to anon;
grant DELETE on table public.stock_feed_sources to authenticated;
grant INSERT on table public.stock_feed_sources to authenticated;
grant REFERENCES on table public.stock_feed_sources to authenticated;
grant SELECT on table public.stock_feed_sources to authenticated;
grant TRIGGER on table public.stock_feed_sources to authenticated;
grant TRUNCATE on table public.stock_feed_sources to authenticated;
grant UPDATE on table public.stock_feed_sources to authenticated;
grant DELETE on table public.stock_feed_sources to service_role;
grant INSERT on table public.stock_feed_sources to service_role;
grant REFERENCES on table public.stock_feed_sources to service_role;
grant SELECT on table public.stock_feed_sources to service_role;
grant TRIGGER on table public.stock_feed_sources to service_role;
grant TRUNCATE on table public.stock_feed_sources to service_role;
grant UPDATE on table public.stock_feed_sources to service_role;
grant DELETE on table public.store_settings to anon;
grant INSERT on table public.store_settings to anon;
grant REFERENCES on table public.store_settings to anon;
grant SELECT on table public.store_settings to anon;
grant TRIGGER on table public.store_settings to anon;
grant TRUNCATE on table public.store_settings to anon;
grant UPDATE on table public.store_settings to anon;
grant DELETE on table public.store_settings to authenticated;
grant INSERT on table public.store_settings to authenticated;
grant REFERENCES on table public.store_settings to authenticated;
grant SELECT on table public.store_settings to authenticated;
grant TRIGGER on table public.store_settings to authenticated;
grant TRUNCATE on table public.store_settings to authenticated;
grant UPDATE on table public.store_settings to authenticated;
grant DELETE on table public.store_settings to service_role;
grant INSERT on table public.store_settings to service_role;
grant REFERENCES on table public.store_settings to service_role;
grant SELECT on table public.store_settings to service_role;
grant TRIGGER on table public.store_settings to service_role;
grant TRUNCATE on table public.store_settings to service_role;
grant UPDATE on table public.store_settings to service_role;
grant DELETE on table public.stripe_events to anon;
grant INSERT on table public.stripe_events to anon;
grant REFERENCES on table public.stripe_events to anon;
grant SELECT on table public.stripe_events to anon;
grant TRIGGER on table public.stripe_events to anon;
grant TRUNCATE on table public.stripe_events to anon;
grant UPDATE on table public.stripe_events to anon;
grant DELETE on table public.stripe_events to authenticated;
grant INSERT on table public.stripe_events to authenticated;
grant REFERENCES on table public.stripe_events to authenticated;
grant SELECT on table public.stripe_events to authenticated;
grant TRIGGER on table public.stripe_events to authenticated;
grant TRUNCATE on table public.stripe_events to authenticated;
grant UPDATE on table public.stripe_events to authenticated;
grant DELETE on table public.stripe_events to service_role;
grant INSERT on table public.stripe_events to service_role;
grant REFERENCES on table public.stripe_events to service_role;
grant SELECT on table public.stripe_events to service_role;
grant TRIGGER on table public.stripe_events to service_role;
grant TRUNCATE on table public.stripe_events to service_role;
grant UPDATE on table public.stripe_events to service_role;
grant DELETE on table public.support_messages to anon;
grant INSERT on table public.support_messages to anon;
grant REFERENCES on table public.support_messages to anon;
grant TRIGGER on table public.support_messages to anon;
grant TRUNCATE on table public.support_messages to anon;
grant UPDATE on table public.support_messages to anon;
grant DELETE on table public.support_messages to authenticated;
grant INSERT on table public.support_messages to authenticated;
grant REFERENCES on table public.support_messages to authenticated;
grant SELECT on table public.support_messages to authenticated;
grant TRIGGER on table public.support_messages to authenticated;
grant TRUNCATE on table public.support_messages to authenticated;
grant UPDATE on table public.support_messages to authenticated;
grant DELETE on table public.support_messages to service_role;
grant INSERT on table public.support_messages to service_role;
grant REFERENCES on table public.support_messages to service_role;
grant SELECT on table public.support_messages to service_role;
grant TRIGGER on table public.support_messages to service_role;
grant TRUNCATE on table public.support_messages to service_role;
grant UPDATE on table public.support_messages to service_role;
grant DELETE on table public.support_tickets to anon;
grant INSERT on table public.support_tickets to anon;
grant REFERENCES on table public.support_tickets to anon;
grant TRIGGER on table public.support_tickets to anon;
grant TRUNCATE on table public.support_tickets to anon;
grant UPDATE on table public.support_tickets to anon;
grant DELETE on table public.support_tickets to authenticated;
grant INSERT on table public.support_tickets to authenticated;
grant REFERENCES on table public.support_tickets to authenticated;
grant SELECT on table public.support_tickets to authenticated;
grant TRIGGER on table public.support_tickets to authenticated;
grant TRUNCATE on table public.support_tickets to authenticated;
grant UPDATE on table public.support_tickets to authenticated;
grant DELETE on table public.support_tickets to service_role;
grant INSERT on table public.support_tickets to service_role;
grant REFERENCES on table public.support_tickets to service_role;
grant SELECT on table public.support_tickets to service_role;
grant TRIGGER on table public.support_tickets to service_role;
grant TRUNCATE on table public.support_tickets to service_role;
grant UPDATE on table public.support_tickets to service_role;
grant DELETE on table public.trendyol_batches to anon;
grant INSERT on table public.trendyol_batches to anon;
grant REFERENCES on table public.trendyol_batches to anon;
grant SELECT on table public.trendyol_batches to anon;
grant TRIGGER on table public.trendyol_batches to anon;
grant TRUNCATE on table public.trendyol_batches to anon;
grant UPDATE on table public.trendyol_batches to anon;
grant DELETE on table public.trendyol_batches to authenticated;
grant INSERT on table public.trendyol_batches to authenticated;
grant REFERENCES on table public.trendyol_batches to authenticated;
grant SELECT on table public.trendyol_batches to authenticated;
grant TRIGGER on table public.trendyol_batches to authenticated;
grant TRUNCATE on table public.trendyol_batches to authenticated;
grant UPDATE on table public.trendyol_batches to authenticated;
grant DELETE on table public.trendyol_batches to service_role;
grant INSERT on table public.trendyol_batches to service_role;
grant REFERENCES on table public.trendyol_batches to service_role;
grant SELECT on table public.trendyol_batches to service_role;
grant TRIGGER on table public.trendyol_batches to service_role;
grant TRUNCATE on table public.trendyol_batches to service_role;
grant UPDATE on table public.trendyol_batches to service_role;
grant DELETE on table public.trendyol_listings to anon;
grant INSERT on table public.trendyol_listings to anon;
grant REFERENCES on table public.trendyol_listings to anon;
grant SELECT on table public.trendyol_listings to anon;
grant TRIGGER on table public.trendyol_listings to anon;
grant TRUNCATE on table public.trendyol_listings to anon;
grant UPDATE on table public.trendyol_listings to anon;
grant DELETE on table public.trendyol_listings to authenticated;
grant INSERT on table public.trendyol_listings to authenticated;
grant REFERENCES on table public.trendyol_listings to authenticated;
grant SELECT on table public.trendyol_listings to authenticated;
grant TRIGGER on table public.trendyol_listings to authenticated;
grant TRUNCATE on table public.trendyol_listings to authenticated;
grant UPDATE on table public.trendyol_listings to authenticated;
grant DELETE on table public.trendyol_listings to service_role;
grant INSERT on table public.trendyol_listings to service_role;
grant REFERENCES on table public.trendyol_listings to service_role;
grant SELECT on table public.trendyol_listings to service_role;
grant TRIGGER on table public.trendyol_listings to service_role;
grant TRUNCATE on table public.trendyol_listings to service_role;
grant UPDATE on table public.trendyol_listings to service_role;
grant DELETE on table public.trendyol_orders to anon;
grant INSERT on table public.trendyol_orders to anon;
grant REFERENCES on table public.trendyol_orders to anon;
grant SELECT on table public.trendyol_orders to anon;
grant TRIGGER on table public.trendyol_orders to anon;
grant TRUNCATE on table public.trendyol_orders to anon;
grant UPDATE on table public.trendyol_orders to anon;
grant DELETE on table public.trendyol_orders to authenticated;
grant INSERT on table public.trendyol_orders to authenticated;
grant REFERENCES on table public.trendyol_orders to authenticated;
grant SELECT on table public.trendyol_orders to authenticated;
grant TRIGGER on table public.trendyol_orders to authenticated;
grant TRUNCATE on table public.trendyol_orders to authenticated;
grant UPDATE on table public.trendyol_orders to authenticated;
grant DELETE on table public.trendyol_orders to service_role;
grant INSERT on table public.trendyol_orders to service_role;
grant REFERENCES on table public.trendyol_orders to service_role;
grant SELECT on table public.trendyol_orders to service_role;
grant TRIGGER on table public.trendyol_orders to service_role;
grant TRUNCATE on table public.trendyol_orders to service_role;
grant UPDATE on table public.trendyol_orders to service_role;
grant DELETE on table public.trendyol_sync_queue to anon;
grant INSERT on table public.trendyol_sync_queue to anon;
grant REFERENCES on table public.trendyol_sync_queue to anon;
grant SELECT on table public.trendyol_sync_queue to anon;
grant TRIGGER on table public.trendyol_sync_queue to anon;
grant TRUNCATE on table public.trendyol_sync_queue to anon;
grant UPDATE on table public.trendyol_sync_queue to anon;
grant DELETE on table public.trendyol_sync_queue to authenticated;
grant INSERT on table public.trendyol_sync_queue to authenticated;
grant REFERENCES on table public.trendyol_sync_queue to authenticated;
grant SELECT on table public.trendyol_sync_queue to authenticated;
grant TRIGGER on table public.trendyol_sync_queue to authenticated;
grant TRUNCATE on table public.trendyol_sync_queue to authenticated;
grant UPDATE on table public.trendyol_sync_queue to authenticated;
grant DELETE on table public.trendyol_sync_queue to service_role;
grant INSERT on table public.trendyol_sync_queue to service_role;
grant REFERENCES on table public.trendyol_sync_queue to service_role;
grant SELECT on table public.trendyol_sync_queue to service_role;
grant TRIGGER on table public.trendyol_sync_queue to service_role;
grant TRUNCATE on table public.trendyol_sync_queue to service_role;
grant UPDATE on table public.trendyol_sync_queue to service_role;
grant DELETE on table public.trendyol_variants to anon;
grant INSERT on table public.trendyol_variants to anon;
grant REFERENCES on table public.trendyol_variants to anon;
grant SELECT on table public.trendyol_variants to anon;
grant TRIGGER on table public.trendyol_variants to anon;
grant TRUNCATE on table public.trendyol_variants to anon;
grant UPDATE on table public.trendyol_variants to anon;
grant DELETE on table public.trendyol_variants to authenticated;
grant INSERT on table public.trendyol_variants to authenticated;
grant REFERENCES on table public.trendyol_variants to authenticated;
grant SELECT on table public.trendyol_variants to authenticated;
grant TRIGGER on table public.trendyol_variants to authenticated;
grant TRUNCATE on table public.trendyol_variants to authenticated;
grant UPDATE on table public.trendyol_variants to authenticated;
grant DELETE on table public.trendyol_variants to service_role;
grant INSERT on table public.trendyol_variants to service_role;
grant REFERENCES on table public.trendyol_variants to service_role;
grant SELECT on table public.trendyol_variants to service_role;
grant TRIGGER on table public.trendyol_variants to service_role;
grant TRUNCATE on table public.trendyol_variants to service_role;
grant UPDATE on table public.trendyol_variants to service_role;
grant DELETE on table public.ups_etichete to service_role;
grant INSERT on table public.ups_etichete to service_role;
grant REFERENCES on table public.ups_etichete to service_role;
grant SELECT on table public.ups_etichete to service_role;
grant TRIGGER on table public.ups_etichete to service_role;
grant TRUNCATE on table public.ups_etichete to service_role;
grant UPDATE on table public.ups_etichete to service_role;
grant DELETE on table public.users_profile to anon;
grant REFERENCES on table public.users_profile to anon;
grant TRIGGER on table public.users_profile to anon;
grant TRUNCATE on table public.users_profile to anon;
grant DELETE on table public.users_profile to authenticated;
grant INSERT on table public.users_profile to authenticated;
grant REFERENCES on table public.users_profile to authenticated;
grant TRIGGER on table public.users_profile to authenticated;
grant TRUNCATE on table public.users_profile to authenticated;
grant DELETE on table public.users_profile to service_role;
grant INSERT on table public.users_profile to service_role;
grant REFERENCES on table public.users_profile to service_role;
grant SELECT on table public.users_profile to service_role;
grant TRIGGER on table public.users_profile to service_role;
grant TRUNCATE on table public.users_profile to service_role;
grant UPDATE on table public.users_profile to service_role;
grant DELETE on table public.zz_backup_categorii_okxi_20260812 to anon;
grant INSERT on table public.zz_backup_categorii_okxi_20260812 to anon;
grant REFERENCES on table public.zz_backup_categorii_okxi_20260812 to anon;
grant SELECT on table public.zz_backup_categorii_okxi_20260812 to anon;
grant TRIGGER on table public.zz_backup_categorii_okxi_20260812 to anon;
grant TRUNCATE on table public.zz_backup_categorii_okxi_20260812 to anon;
grant UPDATE on table public.zz_backup_categorii_okxi_20260812 to anon;
grant DELETE on table public.zz_backup_categorii_okxi_20260812 to authenticated;
grant INSERT on table public.zz_backup_categorii_okxi_20260812 to authenticated;
grant REFERENCES on table public.zz_backup_categorii_okxi_20260812 to authenticated;
grant SELECT on table public.zz_backup_categorii_okxi_20260812 to authenticated;
grant TRIGGER on table public.zz_backup_categorii_okxi_20260812 to authenticated;
grant TRUNCATE on table public.zz_backup_categorii_okxi_20260812 to authenticated;
grant UPDATE on table public.zz_backup_categorii_okxi_20260812 to authenticated;
grant DELETE on table public.zz_backup_categorii_okxi_20260812 to service_role;
grant INSERT on table public.zz_backup_categorii_okxi_20260812 to service_role;
grant REFERENCES on table public.zz_backup_categorii_okxi_20260812 to service_role;
grant SELECT on table public.zz_backup_categorii_okxi_20260812 to service_role;
grant TRIGGER on table public.zz_backup_categorii_okxi_20260812 to service_role;
grant TRUNCATE on table public.zz_backup_categorii_okxi_20260812 to service_role;
grant UPDATE on table public.zz_backup_categorii_okxi_20260812 to service_role;
grant DELETE on table public.zz_backup_facebook_feeds_20260814 to anon;
grant INSERT on table public.zz_backup_facebook_feeds_20260814 to anon;
grant REFERENCES on table public.zz_backup_facebook_feeds_20260814 to anon;
grant SELECT on table public.zz_backup_facebook_feeds_20260814 to anon;
grant TRIGGER on table public.zz_backup_facebook_feeds_20260814 to anon;
grant TRUNCATE on table public.zz_backup_facebook_feeds_20260814 to anon;
grant UPDATE on table public.zz_backup_facebook_feeds_20260814 to anon;
grant DELETE on table public.zz_backup_facebook_feeds_20260814 to authenticated;
grant INSERT on table public.zz_backup_facebook_feeds_20260814 to authenticated;
grant REFERENCES on table public.zz_backup_facebook_feeds_20260814 to authenticated;
grant SELECT on table public.zz_backup_facebook_feeds_20260814 to authenticated;
grant TRIGGER on table public.zz_backup_facebook_feeds_20260814 to authenticated;
grant TRUNCATE on table public.zz_backup_facebook_feeds_20260814 to authenticated;
grant UPDATE on table public.zz_backup_facebook_feeds_20260814 to authenticated;
grant DELETE on table public.zz_backup_facebook_feeds_20260814 to service_role;
grant INSERT on table public.zz_backup_facebook_feeds_20260814 to service_role;
grant REFERENCES on table public.zz_backup_facebook_feeds_20260814 to service_role;
grant SELECT on table public.zz_backup_facebook_feeds_20260814 to service_role;
grant TRIGGER on table public.zz_backup_facebook_feeds_20260814 to service_role;
grant TRUNCATE on table public.zz_backup_facebook_feeds_20260814 to service_role;
grant UPDATE on table public.zz_backup_facebook_feeds_20260814 to service_role;
grant DELETE on table public.zz_backup_preturi_bricosmart_20260804 to anon;
grant INSERT on table public.zz_backup_preturi_bricosmart_20260804 to anon;
grant REFERENCES on table public.zz_backup_preturi_bricosmart_20260804 to anon;
grant SELECT on table public.zz_backup_preturi_bricosmart_20260804 to anon;
grant TRIGGER on table public.zz_backup_preturi_bricosmart_20260804 to anon;
grant TRUNCATE on table public.zz_backup_preturi_bricosmart_20260804 to anon;
grant UPDATE on table public.zz_backup_preturi_bricosmart_20260804 to anon;
grant DELETE on table public.zz_backup_preturi_bricosmart_20260804 to authenticated;
grant INSERT on table public.zz_backup_preturi_bricosmart_20260804 to authenticated;
grant REFERENCES on table public.zz_backup_preturi_bricosmart_20260804 to authenticated;
grant SELECT on table public.zz_backup_preturi_bricosmart_20260804 to authenticated;
grant TRIGGER on table public.zz_backup_preturi_bricosmart_20260804 to authenticated;
grant TRUNCATE on table public.zz_backup_preturi_bricosmart_20260804 to authenticated;
grant UPDATE on table public.zz_backup_preturi_bricosmart_20260804 to authenticated;
grant DELETE on table public.zz_backup_preturi_bricosmart_20260804 to service_role;
grant INSERT on table public.zz_backup_preturi_bricosmart_20260804 to service_role;
grant REFERENCES on table public.zz_backup_preturi_bricosmart_20260804 to service_role;
grant SELECT on table public.zz_backup_preturi_bricosmart_20260804 to service_role;
grant TRIGGER on table public.zz_backup_preturi_bricosmart_20260804 to service_role;
grant TRUNCATE on table public.zz_backup_preturi_bricosmart_20260804 to service_role;
grant UPDATE on table public.zz_backup_preturi_bricosmart_20260804 to service_role;
grant DELETE on table public.zz_backup_preturi_parfumuri_insula_20260812 to anon;
grant INSERT on table public.zz_backup_preturi_parfumuri_insula_20260812 to anon;
grant REFERENCES on table public.zz_backup_preturi_parfumuri_insula_20260812 to anon;
grant SELECT on table public.zz_backup_preturi_parfumuri_insula_20260812 to anon;
grant TRIGGER on table public.zz_backup_preturi_parfumuri_insula_20260812 to anon;
grant TRUNCATE on table public.zz_backup_preturi_parfumuri_insula_20260812 to anon;
grant UPDATE on table public.zz_backup_preturi_parfumuri_insula_20260812 to anon;
grant DELETE on table public.zz_backup_preturi_parfumuri_insula_20260812 to authenticated;
grant INSERT on table public.zz_backup_preturi_parfumuri_insula_20260812 to authenticated;
grant REFERENCES on table public.zz_backup_preturi_parfumuri_insula_20260812 to authenticated;
grant SELECT on table public.zz_backup_preturi_parfumuri_insula_20260812 to authenticated;
grant TRIGGER on table public.zz_backup_preturi_parfumuri_insula_20260812 to authenticated;
grant TRUNCATE on table public.zz_backup_preturi_parfumuri_insula_20260812 to authenticated;
grant UPDATE on table public.zz_backup_preturi_parfumuri_insula_20260812 to authenticated;
grant DELETE on table public.zz_backup_preturi_parfumuri_insula_20260812 to service_role;
grant INSERT on table public.zz_backup_preturi_parfumuri_insula_20260812 to service_role;
grant REFERENCES on table public.zz_backup_preturi_parfumuri_insula_20260812 to service_role;
grant SELECT on table public.zz_backup_preturi_parfumuri_insula_20260812 to service_role;
grant TRIGGER on table public.zz_backup_preturi_parfumuri_insula_20260812 to service_role;
grant TRUNCATE on table public.zz_backup_preturi_parfumuri_insula_20260812 to service_role;
grant UPDATE on table public.zz_backup_preturi_parfumuri_insula_20260812 to service_role;
grant DELETE on table public.zz_backup_preturi_vetdepo_20260819 to anon;
grant INSERT on table public.zz_backup_preturi_vetdepo_20260819 to anon;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_20260819 to anon;
grant SELECT on table public.zz_backup_preturi_vetdepo_20260819 to anon;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_20260819 to anon;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_20260819 to anon;
grant UPDATE on table public.zz_backup_preturi_vetdepo_20260819 to anon;
grant DELETE on table public.zz_backup_preturi_vetdepo_20260819 to authenticated;
grant INSERT on table public.zz_backup_preturi_vetdepo_20260819 to authenticated;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_20260819 to authenticated;
grant SELECT on table public.zz_backup_preturi_vetdepo_20260819 to authenticated;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_20260819 to authenticated;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_20260819 to authenticated;
grant UPDATE on table public.zz_backup_preturi_vetdepo_20260819 to authenticated;
grant DELETE on table public.zz_backup_preturi_vetdepo_20260819 to service_role;
grant INSERT on table public.zz_backup_preturi_vetdepo_20260819 to service_role;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_20260819 to service_role;
grant SELECT on table public.zz_backup_preturi_vetdepo_20260819 to service_role;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_20260819 to service_role;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_20260819 to service_role;
grant UPDATE on table public.zz_backup_preturi_vetdepo_20260819 to service_role;
grant DELETE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to anon;
grant INSERT on table public.zz_backup_preturi_vetdepo_categorii_20260903 to anon;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_categorii_20260903 to anon;
grant SELECT on table public.zz_backup_preturi_vetdepo_categorii_20260903 to anon;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_categorii_20260903 to anon;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to anon;
grant UPDATE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to anon;
grant DELETE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to authenticated;
grant INSERT on table public.zz_backup_preturi_vetdepo_categorii_20260903 to authenticated;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_categorii_20260903 to authenticated;
grant SELECT on table public.zz_backup_preturi_vetdepo_categorii_20260903 to authenticated;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_categorii_20260903 to authenticated;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to authenticated;
grant UPDATE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to authenticated;
grant DELETE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to service_role;
grant INSERT on table public.zz_backup_preturi_vetdepo_categorii_20260903 to service_role;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_categorii_20260903 to service_role;
grant SELECT on table public.zz_backup_preturi_vetdepo_categorii_20260903 to service_role;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_categorii_20260903 to service_role;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to service_role;
grant UPDATE on table public.zz_backup_preturi_vetdepo_categorii_20260903 to service_role;
grant DELETE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to anon;
grant INSERT on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to anon;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to anon;
grant SELECT on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to anon;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to anon;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to anon;
grant UPDATE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to anon;
grant DELETE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to authenticated;
grant INSERT on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to authenticated;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to authenticated;
grant SELECT on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to authenticated;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to authenticated;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to authenticated;
grant UPDATE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to authenticated;
grant DELETE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to service_role;
grant INSERT on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to service_role;
grant REFERENCES on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to service_role;
grant SELECT on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to service_role;
grant TRIGGER on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to service_role;
grant TRUNCATE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to service_role;
grant UPDATE on table public.zz_backup_preturi_vetdepo_hrana_caini_20260903 to service_role;

-- ── GRANTURI PE COLOANA (RLS verifica RANDURI, nu COLOANE) ─
grant SELECT (address) on table public.businesses to anon;
grant UPDATE (address) on table public.businesses to authenticated;
grant SELECT (business_name) on table public.businesses to anon;
grant UPDATE (business_name) on table public.businesses to authenticated;
grant SELECT (city) on table public.businesses to anon;
grant UPDATE (city) on table public.businesses to authenticated;
grant SELECT (county) on table public.businesses to anon;
grant UPDATE (county) on table public.businesses to authenticated;
grant SELECT (cover_url) on table public.businesses to anon;
grant UPDATE (cover_url) on table public.businesses to authenticated;
grant SELECT (cui) on table public.businesses to anon;
grant UPDATE (cui) on table public.businesses to authenticated;
grant SELECT (custom_domain) on table public.businesses to anon;
grant SELECT (custom_domain_checked_at) on table public.businesses to anon;
grant SELECT (custom_domain_healthy) on table public.businesses to anon;
grant SELECT (description) on table public.businesses to anon;
grant UPDATE (description) on table public.businesses to authenticated;
grant SELECT (email) on table public.businesses to anon;
grant UPDATE (email) on table public.businesses to authenticated;
grant SELECT (features) on table public.businesses to anon;
grant UPDATE (features) on table public.businesses to authenticated;
grant SELECT (gallery) on table public.businesses to anon;
grant UPDATE (gallery) on table public.businesses to authenticated;
grant SELECT (id) on table public.businesses to anon;
grant SELECT (is_published) on table public.businesses to anon;
grant UPDATE (is_published) on table public.businesses to authenticated;
grant UPDATE (lat) on table public.businesses to authenticated;
grant UPDATE (lng) on table public.businesses to authenticated;
grant SELECT (logo_url) on table public.businesses to anon;
grant UPDATE (logo_url) on table public.businesses to authenticated;
grant UPDATE (niche_id) on table public.businesses to authenticated;
grant SELECT (phone) on table public.businesses to anon;
grant UPDATE (phone) on table public.businesses to authenticated;
grant SELECT (primary_color) on table public.businesses to anon;
grant UPDATE (primary_color) on table public.businesses to authenticated;
grant SELECT (reg_com) on table public.businesses to anon;
grant UPDATE (reg_com) on table public.businesses to authenticated;
grant SELECT (slug) on table public.businesses to anon;
grant SELECT (social) on table public.businesses to anon;
grant UPDATE (social) on table public.businesses to authenticated;
grant SELECT (store_address) on table public.businesses to anon;
grant UPDATE (store_address) on table public.businesses to authenticated;
grant SELECT (store_city) on table public.businesses to anon;
grant UPDATE (store_city) on table public.businesses to authenticated;
grant SELECT (store_county) on table public.businesses to anon;
grant UPDATE (store_county) on table public.businesses to authenticated;
grant SELECT (store_name) on table public.businesses to anon;
grant UPDATE (store_name) on table public.businesses to authenticated;
grant SELECT (suspended_until) on table public.businesses to anon;
grant SELECT (tagline) on table public.businesses to anon;
grant UPDATE (tagline) on table public.businesses to authenticated;
grant SELECT (type) on table public.businesses to anon;
grant SELECT (updated_at) on table public.businesses to anon;
grant UPDATE (updated_at) on table public.businesses to authenticated;
grant SELECT (user_id) on table public.businesses to anon;
grant SELECT (website) on table public.businesses to anon;
grant UPDATE (website) on table public.businesses to authenticated;
grant SELECT (whatsapp) on table public.businesses to anon;
grant UPDATE (whatsapp) on table public.businesses to authenticated;
grant SELECT (announcements_seen_at) on table public.users_profile to authenticated;
grant UPDATE (announcements_seen_at) on table public.users_profile to authenticated;
grant SELECT (avatar_url) on table public.users_profile to authenticated;
grant UPDATE (avatar_url) on table public.users_profile to authenticated;
grant SELECT (created_at) on table public.users_profile to authenticated;
grant SELECT (full_name) on table public.users_profile to authenticated;
grant UPDATE (full_name) on table public.users_profile to authenticated;
grant SELECT (id) on table public.users_profile to authenticated;
grant SELECT (mfa_email_enabled) on table public.users_profile to authenticated;
grant SELECT (onboarding_completed) on table public.users_profile to authenticated;
grant SELECT (onboarding_step) on table public.users_profile to authenticated;
grant UPDATE (onboarding_step) on table public.users_profile to authenticated;
grant SELECT (orders_seen_at) on table public.users_profile to authenticated;
grant UPDATE (orders_seen_at) on table public.users_profile to authenticated;
grant SELECT (payment_failed_at) on table public.users_profile to authenticated;
grant SELECT (plan) on table public.users_profile to authenticated;
grant SELECT (plan_expires_at) on table public.users_profile to authenticated;
grant SELECT (plan_interval) on table public.users_profile to authenticated;
grant SELECT (role) on table public.users_profile to authenticated;
grant SELECT (stripe_customer_id) on table public.users_profile to authenticated;
grant SELECT (suspended_until) on table public.users_profile to authenticated;
grant SELECT (updated_at) on table public.users_profile to authenticated;
grant UPDATE (updated_at) on table public.users_profile to authenticated;

-- ── GRANTURI PE FUNCTII ───────────────────────────────────
grant execute on function privat.cheie_integrari() to service_role;
grant execute on function privat.cripteaza(p_val text) to service_role;
grant execute on function privat.cripteaza_config(p_cfg jsonb, p_cai text[]) to anon;
grant execute on function privat.cripteaza_config(p_cfg jsonb, p_cai text[]) to authenticated;
grant execute on function privat.cripteaza_config(p_cfg jsonb, p_cai text[]) to service_role;
grant execute on function privat.cripteaza_rand(p_rand jsonb) to anon;
grant execute on function privat.cripteaza_rand(p_rand jsonb) to authenticated;
grant execute on function privat.cripteaza_rand(p_rand jsonb) to service_role;
grant execute on function privat.decripteaza(p_val text) to service_role;
grant execute on function privat.decripteaza_config(p_cfg jsonb, p_cai text[]) to anon;
grant execute on function privat.decripteaza_config(p_cfg jsonb, p_cai text[]) to authenticated;
grant execute on function privat.decripteaza_config(p_cfg jsonb, p_cai text[]) to service_role;
grant execute on function public.adauga_stoc_rezervat(p_order_id uuid, p_produse jsonb, p_variante jsonb) to service_role;
grant execute on function public.agregeaza_analitice(p_zile integer) to service_role;
grant execute on function public.aplica_tranzitia_comenzii(p_order_id uuid, p_status text, p_payment_status text, p_business_id uuid) to service_role;
grant execute on function public.blocheaza_domeniu_platforma() to anon;
grant execute on function public.blocheaza_domeniu_platforma() to authenticated;
grant execute on function public.blocheaza_domeniu_platforma() to service_role;
grant execute on function public.blocheaza_escaladare_users_profile() to anon;
grant execute on function public.blocheaza_escaladare_users_profile() to authenticated;
grant execute on function public.blocheaza_escaladare_users_profile() to service_role;
grant execute on function public.catalog_aplica_proiectii(p_randuri jsonb) to service_role;
grant execute on function public.catalog_candidati(p_business uuid, p_cuvinte text[], p_filtre jsonb) to service_role;
grant execute on function public.catalog_cauta(p_business uuid, p_cuvinte text[], p_filtre jsonb, p_plafon integer) to anon;
grant execute on function public.catalog_cauta(p_business uuid, p_cuvinte text[], p_filtre jsonb, p_plafon integer) to authenticated;
grant execute on function public.catalog_cauta(p_business uuid, p_cuvinte text[], p_filtre jsonb, p_plafon integer) to service_role;
grant execute on function public.catalog_fara_stoc(p_id uuid) to service_role;
grant execute on function public.catalog_pagina(p_business uuid, p_filtre jsonb, p_limit integer, p_offset integer) to anon;
grant execute on function public.catalog_pagina(p_business uuid, p_filtre jsonb, p_limit integer, p_offset integer) to authenticated;
grant execute on function public.catalog_pagina(p_business uuid, p_filtre jsonb, p_limit integer, p_offset integer) to service_role;
grant execute on function public.catalog_randuri(p_business uuid, p_spec jsonb) to anon;
grant execute on function public.catalog_randuri(p_business uuid, p_spec jsonb) to authenticated;
grant execute on function public.catalog_randuri(p_business uuid, p_spec jsonb) to service_role;
grant execute on function public.catalog_reface_cuvinte(p_business uuid) to service_role;
grant execute on function public.catalog_scrie_rezumat(p_randuri jsonb) to service_role;
grant execute on function public.catalog_verifica(p_esantion integer) to service_role;
grant execute on function public.categorii_ascunse(p_business uuid) to service_role;
grant execute on function public.claim_discount_use(p_discount_id uuid) to service_role;
grant execute on function public.consuma_limita(p_cheie text, p_limita integer, p_fereastra_sec integer, p_blocare_sec integer) to service_role;
grant execute on function public.consuma_stoc_comanda_marketplace(p_order_id uuid, p_business_id uuid, p_produse jsonb, p_variante jsonb) to service_role;
grant execute on function public.consuma_stoc_marketplace(p_produse jsonb, p_variante jsonb) to service_role;
grant execute on function public.curata_analitice_brute(p_pastreaza_zile integer, p_max integer) to service_role;
grant execute on function public.curata_limite() to service_role;
grant execute on function public.customer_orders(bid uuid, cust_key text, page_limit integer, page_offset integer) to anon;
grant execute on function public.customer_orders(bid uuid, cust_key text, page_limit integer, page_offset integer) to authenticated;
grant execute on function public.customer_orders(bid uuid, cust_key text, page_limit integer, page_offset integer) to service_role;
grant execute on function public.customers_aggregate(bid uuid, search text, sort_key text, page_limit integer, page_offset integer) to anon;
grant execute on function public.customers_aggregate(bid uuid, search text, sort_key text, page_limit integer, page_offset integer) to authenticated;
grant execute on function public.customers_aggregate(bid uuid, search text, sort_key text, page_limit integer, page_offset integer) to service_role;
grant execute on function public.customers_summary(bid uuid) to anon;
grant execute on function public.customers_summary(bid uuid) to authenticated;
grant execute on function public.customers_summary(bid uuid) to service_role;
grant execute on function public.decrement_stock(p_product_id uuid, p_quantity integer) to service_role;
grant execute on function public.decrement_stock_batch(p_items jsonb) to service_role;
grant execute on function public.decrement_variant_stock_batch(p_items jsonb) to service_role;
grant execute on function public.editeaza_comanda_atomic(p_order_id uuid, p_business_id uuid, p_patch jsonb, p_produse jsonb, p_variante jsonb, p_status_asteptat text, p_produse_minus jsonb, p_variante_minus jsonb, p_produse_necesar jsonb, p_variante_necesar jsonb) to service_role;
grant execute on function public.elibereaza_stoc_batch(p_items jsonb) to service_role;
grant execute on function public.elibereaza_stoc_comanda(p_order_id uuid) to service_role;
grant execute on function public.elibereaza_stoc_complet(p_produse jsonb, p_variante jsonb) to service_role;
grant execute on function public.emag_familie_noua() to service_role;
grant execute on function public.emag_ridica_sirurile(p_oferta bigint, p_familie bigint) to service_role;
grant execute on function public.genereaza_schema_baseline() to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.handle_support_message_insert() to service_role;
grant execute on function public.handle_updated_at() to anon;
grant execute on function public.handle_updated_at() to authenticated;
grant execute on function public.handle_updated_at() to service_role;
grant execute on function public.inceput_fereastra_ro(p_zile integer, p_deplasare integer) to anon;
grant execute on function public.inceput_fereastra_ro(p_zile integer, p_deplasare integer) to authenticated;
grant execute on function public.inceput_fereastra_ro(p_zile integer, p_deplasare integer) to service_role;
grant execute on function public.incheie_operatie_externa(p_id uuid, p_business_id uuid, p_stare text, p_referinta_externa text, p_detalii jsonb, p_eroare text) to service_role;
grant execute on function public.increment_discount_uses(p_discount_id uuid) to service_role;
grant execute on function public.increment_offer_stats(p_offer_id uuid, p_impressions integer, p_conversions integer, p_revenue numeric) to service_role;
grant execute on function public.increment_referral_balance(p_user_id uuid, p_amount integer) to service_role;
grant execute on function public.increment_tool_views(tool_id uuid) to service_role;
grant execute on function public.is_admin() to anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;
grant execute on function public.jsonb_merge_config(p_business_id uuid, p_column text, p_patch jsonb) to service_role;
grant execute on function public.marcheaza_operatie_anulata(p_business_id uuid, p_cheie text) to service_role;
grant execute on function public.mark_payout_complete(p_user_id uuid, p_amount integer) to service_role;
grant execute on function public.next_order_number(p_business_id uuid) to service_role;
grant execute on function public.normalize_phone(raw text) to anon;
grant execute on function public.normalize_phone(raw text) to authenticated;
grant execute on function public.normalize_phone(raw text) to service_role;
grant execute on function public.numar_produse_si_comenzi() to service_role;
grant execute on function public.order_customer_key(customer_phone text, customer_email text, order_id uuid) to anon;
grant execute on function public.order_customer_key(customer_phone text, customer_email text, order_id uuid) to authenticated;
grant execute on function public.order_customer_key(customer_phone text, customer_email text, order_id uuid) to service_role;
grant execute on function public.orders_county_counts(bid uuid) to anon;
grant execute on function public.orders_county_counts(bid uuid) to authenticated;
grant execute on function public.orders_county_counts(bid uuid) to service_role;
grant execute on function public.orders_daily_revenue(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone) to anon;
grant execute on function public.orders_daily_revenue(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone) to authenticated;
grant execute on function public.orders_daily_revenue(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone) to service_role;
grant execute on function public.orders_revenue_sum(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone) to anon;
grant execute on function public.orders_revenue_sum(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone) to authenticated;
grant execute on function public.orders_revenue_sum(bid uuid, t_from timestamp with time zone, t_to timestamp with time zone) to service_role;
grant execute on function public.orders_status_counts(bid uuid) to anon;
grant execute on function public.orders_status_counts(bid uuid) to authenticated;
grant execute on function public.orders_status_counts(bid uuid) to service_role;
grant execute on function public.orders_venit_zilnic(bid uuid, p_zile integer, p_deplasare integer) to anon;
grant execute on function public.orders_venit_zilnic(bid uuid, p_zile integer, p_deplasare integer) to authenticated;
grant execute on function public.orders_venit_zilnic(bid uuid, p_zile integer, p_deplasare integer) to service_role;
grant execute on function public.posta_aloca_cod(p_business_id uuid) to service_role;
grant execute on function public.proba_stoc() to service_role;
grant execute on function public.reclaim_order_discount(p_order_id uuid) to service_role;
grant execute on function public.release_discount_use(p_discount_id uuid) to service_role;
grant execute on function public.release_order_discount(p_order_id uuid) to service_role;
grant execute on function public.repretuieste_pachetele_cu(p_component_id uuid) to service_role;
grant execute on function public.reserve_payout_balance(p_user_id uuid, p_amount integer) to service_role;
grant execute on function public.reseteaza_limita(p_cheie text) to service_role;
grant execute on function public.restaureaza_variante_batch(p_items jsonb) to service_role;
grant execute on function public.revendica_din_coada(p_coada text, p_limita integer, p_lease interval) to service_role;
grant execute on function public.revendica_stoc_batch(p_items jsonb) to service_role;
grant execute on function public.revendica_stoc_comanda(p_order_id uuid) to service_role;
grant execute on function public.revendica_stoc_complet(p_produse jsonb, p_variante jsonb) to service_role;
grant execute on function public.rezerva_operatie_externa(p_business_id uuid, p_order_id uuid, p_fel text, p_furnizor text, p_cheie text) to service_role;
grant execute on function public.scade_din_rezervat(p_rez jsonb, p_produse_minus jsonb, p_variante_minus jsonb, p_produse_necesar jsonb, p_variante_necesar jsonb) to service_role;
grant execute on function public.scade_variante_raportat(p_items jsonb) to service_role;
grant execute on function public.scrie_variante_daca_neschimbat(p_business uuid, p_product uuid, p_asteptat jsonb, p_nou jsonb) to service_role;
grant execute on function public.semnatura_cuvant(w text) to anon;
grant execute on function public.semnatura_cuvant(w text) to authenticated;
grant execute on function public.semnatura_cuvant(w text) to service_role;
grant execute on function public.set_updated_at() to anon;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.set_updated_at() to service_role;
grant execute on function public.site_analytics_breakdown(bid uuid, t_from timestamp with time zone) to anon;
grant execute on function public.site_analytics_breakdown(bid uuid, t_from timestamp with time zone) to authenticated;
grant execute on function public.site_analytics_breakdown(bid uuid, t_from timestamp with time zone) to service_role;
grant execute on function public.site_analytics_breakdown_zile(bid uuid, p_zile integer) to anon;
grant execute on function public.site_analytics_breakdown_zile(bid uuid, p_zile integer) to authenticated;
grant execute on function public.site_analytics_breakdown_zile(bid uuid, p_zile integer) to service_role;
grant execute on function public.sterge_comanda(p_order_id uuid, p_business_id uuid) to service_role;
grant execute on function public.sync_product_stock_from_variants() to anon;
grant execute on function public.sync_product_stock_from_variants() to authenticated;
grant execute on function public.sync_product_stock_from_variants() to service_role;
grant execute on function public.touch_customers() to anon;
grant execute on function public.touch_customers() to authenticated;
grant execute on function public.touch_customers() to service_role;
grant execute on function public.touch_stock_feed_sources() to anon;
grant execute on function public.touch_stock_feed_sources() to authenticated;
grant execute on function public.touch_stock_feed_sources() to service_role;
grant execute on function public.trg_catalog_cuvinte_murdar() to anon;
grant execute on function public.trg_catalog_cuvinte_murdar() to authenticated;
grant execute on function public.trg_catalog_cuvinte_murdar() to service_role;
grant execute on function public.trg_catalog_proiectie() to anon;
grant execute on function public.trg_catalog_proiectie() to authenticated;
grant execute on function public.trg_catalog_proiectie() to service_role;
grant execute on function public.trg_catalog_rezumat_murdar() to anon;
grant execute on function public.trg_catalog_rezumat_murdar() to authenticated;
grant execute on function public.trg_catalog_rezumat_murdar() to service_role;
grant execute on function public.trg_categorii_rezumat_murdar() to anon;
grant execute on function public.trg_categorii_rezumat_murdar() to authenticated;
grant execute on function public.trg_categorii_rezumat_murdar() to service_role;
grant execute on function public.trg_repretuieste_pachetele() to anon;
grant execute on function public.trg_repretuieste_pachetele() to authenticated;
grant execute on function public.trg_repretuieste_pachetele() to service_role;
grant execute on function public.update_domain_orders_updated_at() to anon;
grant execute on function public.update_domain_orders_updated_at() to authenticated;
grant execute on function public.update_domain_orders_updated_at() to service_role;
grant execute on function public.update_support_ticket_updated_at() to service_role;
grant execute on function public.update_tool_avg_rating() to anon;
grant execute on function public.update_tool_avg_rating() to authenticated;
grant execute on function public.update_tool_avg_rating() to service_role;
grant execute on function public.update_updated_at_column() to anon;
grant execute on function public.update_updated_at_column() to authenticated;
grant execute on function public.update_updated_at_column() to service_role;

notify pgrst, 'reload schema';
