-- ⚠ PAZA CARE NU LASA O INTEGRARE SA-SI PIARDA ACREDITARILE
--
-- ═══ CE S-A INTAMPLAT ═══
--
-- 24.08.2026: un magazin cu Trendyol legat si 1272 de listari active si-a pierdut
-- acreditarile. `trendyol_config` a ramas `{"reconcile_page": 20}` — un cursor, si
-- nimic altceva. Nici `api_key`, nici `api_secret`, nici `seller_id`, nici
-- `connected`. Un al doilea magazin avea aceeasi forma de pagba.
--
-- Comerciantul n-a atins nimic. Integrarea pur si simplu „nu mai era conectata".
--
-- ═══ ⚠ CUM SE INTAMPLA, SI DE CE SE POATE INTAMPLA ORICAREI INTEGRARI ═══
--
-- Fiecare integrare tine configurarea intr-o coloana `jsonb` din `store_settings`, si
-- fiecare are aceeasi pereche de functii:
--
--   loadConfig()  -> citeste configurarea
--   saveConfig()  -> scrie INTREGUL obiect inapoi
--
-- Daca citirea intoarce gol — un `.single()` care da eroare, o citire facuta cu alt
-- client decat cel care poate decripta, o cadere de retea — atunci scrierea de dupa
-- pune un obiect din care lipseste tot ce nu s-a recitit. Acreditarile dispar.
--
-- Nimic nu da eroare. Scrierea reuseste. Comerciantul afla peste zile, cand observa
-- ca nu mai vinde.
--
-- ⚠ E un tipar, nu un accident: se repeta la fiecare integrare, fiindca fiecare are
-- acelasi „citeste, schimba un camp, scrie tot". Reparat intr-un singur loc din cod,
-- ar fi revenit la a treizeci si cincea integrare. Sunt 34 de coloane de configurare
-- si 53 de cai secrete inregistrate azi.
--
-- ═══ APARAREA ═══
--
-- Se pune in BAZA, fiindca aia e singura poarta prin care trec toti scriitorii —
-- actiuni, cronuri, scripturi, si orice se va scrie de acum inainte.
--
-- Invariantul: O SCRIERE NU POATE PIERDE UN SECRET CARE EXISTA.
--
-- Cand o scriere ar sterge un secret inregistrat in `privat.campuri_secrete`, secretul
-- vechi e DUS MAI DEPARTE — adica scrierea distructiva devine exact imbinarea care
-- trebuia sa fie de la inceput. Si se scrie un rand in `error_logs`, ca sa se afle
-- CINE a scris prost, nu doar ca s-a evitat paguba.
--
-- ⚠ DECONECTAREA RAMANE CU PUTINTA. Cand noua configurare e goala (`{}` sau `null`),
-- stergerea e limpede intentionata si se lasa sa treaca. Paza opreste doar pierderea
-- pe jumatate: aia in care raman cursoarele si dispar cheile.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Paza propriu-zisa
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function privat.pazeste_secretele(vechi jsonb, nou jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'privat', 'public', 'pg_temp'
as $$
declare
  r          record;
  parti      text[];
  v_vechi    text;
  v_nou      text;
  conf_nou   jsonb;
  rezultat   jsonb := nou;
  salvate    text[] := '{}';
begin
  if vechi is null or nou is null then
    return nou;
  end if;

  for r in select coloana, cale from privat.campuri_secrete loop
    conf_nou := rezultat -> r.coloana;

    -- ⚠ Deconectarea e ingaduita: configurare golita = stergere intentionata.
    -- Paza opreste doar pierderea pe jumatate, aia in care raman cursoarele.
    if conf_nou is null or conf_nou = '{}'::jsonb then
      continue;
    end if;

    -- `cale` poate fi imbricata (`smtp.pass`), deci se sparge in bucati.
    parti := string_to_array(r.cale, '.');

    v_vechi := vechi -> r.coloana #>> parti;
    v_nou   := conf_nou #>> parti;

    -- Secretul exista si ar disparea: se duce mai departe.
    if v_vechi is not null and v_vechi <> ''
       and (v_nou is null or v_nou = '')
    then
      rezultat := jsonb_set(
        rezultat,
        array[r.coloana] || parti,
        to_jsonb(v_vechi),
        true
      );
      salvate := salvate || (r.coloana || '.' || r.cale);
    end if;
  end loop;

  -- ⚠ SE SCRIE CINE A GRESIT, nu doar ca s-a evitat paguba. Fara randul asta, paza
  -- ar fi tinut integrarile in viata si ar fi ascuns la nesfarsit scriitorul defect.
  if array_length(salvate, 1) > 0 then
    raise warning 'paza secretelor: am pastrat % la o scriere care le-ar fi sters', salvate;
    begin
      insert into public.error_logs (action, message, details, business_id, severity)
      values (
        'store_settings/paza-secrete',
        'O scriere ar fi sters acreditari. Au fost pastrate; scriitorul trebuie reparat.',
        jsonb_build_object('campuri', to_jsonb(salvate)),
        (nou ->> 'business_id')::uuid,
        'critical'
      );
    exception when others then
      -- Jurnalul nu are voie sa opreasca salvarea. Ramane `raise warning`.
      null;
    end;
  end if;

  return rezultat;
end
$$;

comment on function privat.pazeste_secretele(jsonb, jsonb) is
  'Duce mai departe secretele pe care o scriere le-ar sterge. Deconectarea (config gol) trece.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Se leaga de drumul de scriere
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Paza intra INAINTE de criptare: `cripteaza_rand` transforma valorile, iar comparata
-- dupa aceea n-ar mai fi putut deosebi „lipseste" de „s-a criptat altfel".

create or replace function privat.store_settings_upd()
returns trigger
language plpgsql
set search_path to 'privat', 'public', 'pg_temp'
as $function$
    declare j jsonb;
    begin
      j := privat.cripteaza_rand(
             privat.pazeste_secretele(to_jsonb(old), to_jsonb(new))
           );
      update privat.store_settings s
         set (id, business_id, currency, shipping_enabled, free_shipping_threshold, default_shipping_cost, shipping_zones, payment_methods, min_order_amount, store_policies, created_at, updated_at, page_content, order_number_format, order_counter, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown, notifications_config, smso_config, smartbill_config, stripe_config, netopia_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config, fan_courier_config, sameday_config, marketing_config, ipay_config, abandoned_cart_enabled, abandoned_cart_automation, google_merchant_config, card_discount_config, cookie_banner_config, notice_config, google_analytics_config, mailchimp_config, brevo_config, klaviyo_config, returns_config, klarna_config, revolut_config, olx_config, aboutyou_config, trendyol_config, email_config, cod_discount_config, shipping_classes, shipping_rules, storefront_design, storefront_design_draft, storefront_design_pub_at, cod_fee_config, show_vat_label, gls_config, pallex_config, ecolet_config, facebook_feeds, posta_config, innoship_config, packeta_config, smartship_config, shipo_config, fedex_config, ups_config, dhl_config, emag_config) = (select r.* from jsonb_populate_record(null::privat.store_settings, j) r)
       where s.id = old.id;
      return new;
    end $function$;

notify pgrst, 'reload schema';
