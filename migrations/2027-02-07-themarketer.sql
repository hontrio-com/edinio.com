-- theMarketer (email, SMS, push, fidelitate, recenzii) - 18.11.2026. Aplicata in productie pe 18.11.2026,
-- dupa verificarea amprentelor md5 ale celor sase functii atinse (identice cu schema de referinta).
--
-- Fisa completa: `docs/marketing/THEMARKETER.md`. Specul: developers.themarketer.com (llms.txt), nu
-- pagina publica themarketer.com/ro/resources/api, care e in urma lui (tipurile rapoartelor scrise cu
-- `_` in loc de `-`, datele dezabonatilor ca timestamp in loc de zi).
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `themarketer_config` intra in selectul antetului vitrinei
-- (`incarcaAntetMagazin`) si in triggerul cozii de email marketing; `discounts.generat_de` intra in lista
-- codurilor si in alegerea codului la cosul abandonat. PostgREST respinge INTREAGA interogare cand o
-- coloana lipseste: cu codul pusat inaintea migratiei, antetul ar cadea la fiecare vizita pe citirea de
-- rezerva (fara theMarketer si fara setarile conturilor), iar cronul cosului abandonat ar trimite
-- emailuri FARA cod.
--
-- Aditiva: o coloana de configurare, cate o coloana pe `discounts` si `forms`, trei tabele noi, doua
-- functii noi si patru rescrise cu o conditie sau o ramura in plus (triggerul cozii si cele trei ale
-- listei de coduri). Codul vechi nu le atinge.
--
-- Ce atinge:
--   1. `privat.store_settings.themarketer_config`, cu `rest_key` si `cheie_feed` criptate;
--   2. `public.themarketer_chei`: amprentele cheilor din adresele de feed, coduri si webhookuri;
--   3. `public.themarketer_stare`: cand a citit theMarketer fiecare feed, cursorii sincronizarilor;
--   4. `public.recenzii_produse`: recenziile aduse din modulul Feedback;
--   5. `public.discounts.generat_de` + `discounts_page`, `discount_state_counts`, `discount_totaluri`:
--      codurile unice generate nu umplu lista si nu umfla cifrele ei;
--   6. coada de email marketing: furnizorul `themarketer`;
--   7. `themarketer_dezaboneaza`: dezabonatii din theMarketer intra in `recovery_optout`;
--   8. `themarketer_emailurile_clientilor`: adresele de anonimizat si in theMarketer;
--   9. `public.forms.themarketer_enabled`: comutatorul de abonare pe formular.

-- ---------------------------------------------------------------------------
-- 1. Configurarea, pe TABELUL privat (vederea se regenereaza din el)
-- ---------------------------------------------------------------------------

alter table privat.store_settings
  add column if not exists themarketer_config jsonb;

comment on column privat.store_settings.themarketer_config is
  'theMarketer: {enabled, tracking_key, customer_id, rest_key (secret), cheie_feed (secret), urmarire, '
  'captura_email, comenzi, abonati{checkout,popup,forms}, coduri, export_comenzi, recenzii, fidelitate, '
  'push, dezabonari, anonimizare, testat_la}. tracking_key e PUBLICA (sta in pagina vizitatorului); '
  'customer_id nu e secret. Vezi src/lib/themarketer/config.ts.';

-- ⚠ Numele sunt IDENTICE in `CAMPURI_SECRETE` (src/lib/integrari/secrete.ts) si in `TheMarketerConfig`.
insert into privat.campuri_secrete (coloana, cale) values
  ('themarketer_config', 'rest_key'),
  ('themarketer_config', 'cheie_feed')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 2. Cheile din adrese (numai amprenta; valoarea in clar e criptata in configurare)
-- ---------------------------------------------------------------------------

create table if not exists public.themarketer_chei (
  amprenta text primary key check (amprenta ~ '^[0-9a-f]{64}$'),
  business_id uuid not null references public.businesses(id) on delete cascade,
  creat_la timestamptz not null default now(),
  revocat_la timestamptz
);

comment on table public.themarketer_chei is
  'Amprentele (SHA-256) cheilor din adresele date catre theMarketer: feedurile, generatorul de coduri si '
  'webhookurile. Valoarea in clar e criptata in themarketer_config.cheie_feed. Rotirea pune revocat_la, '
  'nu sterge. Vezi src/lib/themarketer/chei.ts.';

create index if not exists themarketer_chei_magazin_idx on public.themarketer_chei (business_id) where revocat_la is null;

alter table public.themarketer_chei enable row level security;
revoke all on table public.themarketer_chei from anon, authenticated;
grant select, insert, update, delete on table public.themarketer_chei to service_role;

-- ---------------------------------------------------------------------------
-- 3. Starea integrarii: ce a citit theMarketer si unde au ajuns sincronizarile
-- ---------------------------------------------------------------------------
-- ⚠ NU in `themarketer_config`. Configurarea se scrie citind-o intreaga si scriind-o la loc; un feed
-- citit de theMarketer in aceeasi secunda in care omul salveaza setarile ar fi pierdut una dintre cele
-- doua scrieri. Aici fiecare scriitor isi atinge numai coloanele lui.

create table if not exists public.themarketer_stare (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  citit_produse_la timestamptz,
  citit_categorii_la timestamptz,
  citit_branduri_la timestamptz,
  citit_comenzi_la timestamptz,
  ultim_cod_la timestamptz,
  ultim_webhook_la timestamptz,
  recenzii_sincronizat_la timestamptz,
  -- Clipa (Unix) de la care se cer recenziile data viitoare (`t` la ei).
  recenzii_de_la bigint,
  dezabonari_sincronizat_la timestamptz,
  -- Ziua de la care se cer dezabonatii data viitoare (`date_from` la ei: o ZI, nu o clipa).
  dezabonari_de_la date,
  ultima_eroare text,
  ultima_eroare_la timestamptz
);

comment on table public.themarketer_stare is
  'theMarketer: cand a citit fiecare feed, cursorii recenziilor si ai dezabonarilor, ultima eroare. '
  'Separat de themarketer_config ca o citire de feed sa nu se intreaca cu salvarea setarilor.';

alter table public.themarketer_stare enable row level security;
revoke all on table public.themarketer_stare from anon, authenticated;
grant select, insert, update, delete on table public.themarketer_stare to service_role;

-- ---------------------------------------------------------------------------
-- 4. Recenziile de produs (modulul Feedback theMarketer)
-- ---------------------------------------------------------------------------
-- ⚠ `email` NU se arata niciodata in vitrina: sta aici numai ca anonimizarea unui client sa-i poata
-- sterge si recenziile. `autor` se arata prescurtat („Ion P.”).

create table if not exists public.recenzii_produse (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sursa text not null default 'themarketer' check (sursa in ('themarketer')),
  id_extern text not null check (length(id_extern) between 1 and 100),
  autor text not null default '',
  email text,
  nota smallint not null check (nota between 0 and 10),
  text text not null default '',
  media jsonb not null default '[]'::jsonb,
  data_recenzie timestamptz,
  ascunsa boolean not null default false,
  creat_la timestamptz not null default now(),
  unique (business_id, sursa, id_extern)
);

comment on table public.recenzii_produse is
  'Recenziile de produs aduse din theMarketer (Feedback). Nota e din 10, ca la ei. ascunsa = scoasa din '
  'vitrina de comerciant. email nu se arata: e pentru anonimizare. Vezi src/lib/themarketer/recenzii.ts.';

create index if not exists recenzii_produse_vizibile_idx
  on public.recenzii_produse (product_id, data_recenzie desc) where ascunsa = false;
create index if not exists recenzii_produse_magazin_idx
  on public.recenzii_produse (business_id, creat_la desc);

alter table public.recenzii_produse enable row level security;
revoke all on table public.recenzii_produse from anon, authenticated;
grant select, insert, update, delete on table public.recenzii_produse to service_role;

-- ---------------------------------------------------------------------------
-- 5. Codurile generate de theMarketer
-- ---------------------------------------------------------------------------
-- ⚠ O automatizare theMarketer poate cere MII de coduri unice (unul pe om). Fara marcaj, ar fi umplut
-- lista de coduri din panou si alegerea codului la cosul abandonat. Se ascund din lista cat timp nu se
-- cauta: cautat dupa cod, unul generat apare (omul care intreaba de el trebuie sa-l gaseasca).

alter table public.discounts
  add column if not exists generat_de text check (generat_de is null or generat_de in ('themarketer'));

comment on column public.discounts.generat_de is
  'Cine a generat codul: null = comerciantul, themarketer = generatorul chemat de theMarketer (cod unic, '
  'o singura folosire). Codurile generate nu apar in lista din panou decat la cautare.';

create index if not exists discounts_generate_idx
  on public.discounts (business_id, created_at desc) where generat_de is not null;

-- Corpul e cel din productie (schema de referinta, 18.11.2026), cu O conditie noua in `randuri`.
-- Tipul intors e acelasi, deci `create or replace` ajunge si drepturile se pastreaza.
CREATE OR REPLACE FUNCTION public.discounts_page(bid uuid, search text DEFAULT NULL::text, p_stare text DEFAULT 'toate'::text, sort_key text DEFAULT 'noi'::text, page_limit integer DEFAULT 25, page_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, code text, type text, value numeric, min_order_amount numeric, max_uses integer, uses_count integer, is_active boolean, starts_at timestamp with time zone, expires_at timestamp with time zone, per_customer_limit integer, doar_prima_comanda boolean, restrangere jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, stare text, comenzi_total bigint, comenzi_valide bigint, comenzi_cazute bigint, bani_dati numeric, vanzari numeric, comenzi_cu_transport_oferit bigint, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cautat as (
    -- ⚠ `%` si `_` sunt metacaractere in `like`: fara escapare, cine scrie `%`
    -- primeste toate codurile, iar cautarea minte tocmai cand pare ca merge.
    select replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') as q
  ),
  randuri as (
    select d.*,
      public.discount_state(d.is_active, d.starts_at, d.expires_at, d.max_uses, d.uses_count) as stare,
      coalesce(s.comenzi_total, 0) as st_total,
      coalesce(s.comenzi_valide, 0) as st_valide,
      coalesce(s.comenzi_cazute, 0) as st_cazute,
      coalesce(s.bani_dati, 0) as st_bani,
      coalesce(s.vanzari, 0) as st_vanzari,
      coalesce(s.comenzi_cu_transport_oferit, 0) as st_transport
    from public.discounts d
    left join public.discount_stats(bid) s on s.discount_id = d.id
    cross join cautat c
    where d.business_id = bid
      and (c.q = '' or d.code ilike '%' || c.q || '%' escape '\')
      -- ⚠ Codurile generate de theMarketer (mii, unul pe om) numai la cautare. Vezi `generat_de`.
      and (d.generat_de is null or c.q <> '')
  ),
  filtrate as (
    select r.* from randuri r
    where coalesce(p_stare, 'toate') = 'toate' or r.stare = p_stare
  )
  select f.id, f.code, f.type, f.value, f.min_order_amount, f.max_uses, f.uses_count,
    f.is_active, f.starts_at, f.expires_at,
    f.per_customer_limit, f.doar_prima_comanda, f.restrangere,
    f.created_at, f.updated_at, f.stare,
    f.st_total, f.st_valide, f.st_cazute, f.st_bani, f.st_vanzari, f.st_transport,
    count(*) over () as total_count
  from filtrate f
  order by
    -- ⚠ Asezarea ROMANEASCA a casei, cu numere: „VARA2" inaintea lui „VARA10".
    case when sort_key = 'alfabetic' then f.code collate public.ro_numeric end asc nulls last,
    case when sort_key = 'folosite' then f.st_valide end desc nulls last,
    case when sort_key = 'costisitoare' then f.st_bani end desc nulls last,
    f.created_at desc
  limit greatest(1, least(coalesce(page_limit, 25), 100))
  offset greatest(0, coalesce(page_offset, 0))
$function$
;

-- ⚠⚠ CIFRELE DE LANGA FILTRE numara ACEEASI multime ca lista, deci aceeasi conditie. Fara ea, „Toate (5003)”
-- deasupra unei liste de trei coduri. Corpul e cel din productie (amprenta verificata pe 18.11.2026).
CREATE OR REPLACE FUNCTION public.discount_state_counts(bid uuid, search text DEFAULT NULL::text)
 RETURNS TABLE(stare text, cate bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cautat as (
    select replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') as q
  )
  select public.discount_state(d.is_active, d.starts_at, d.expires_at, d.max_uses, d.uses_count) as stare,
         count(*) as cate
  from public.discounts d cross join cautat c
  where d.business_id = bid and (c.q = '' or d.code ilike '%' || c.q || '%' escape '\')
    and (d.generat_de is null or c.q <> '')
  group by 1
$function$
;

-- Cifrele din cap: CATE coduri (si cate merg acum) numara doar codurile comerciantului, ca lista; ce au
-- ADUS (comenzi, bani dati, vanzari) le cuprinde pe toate, fiindca banii s-au dat oricum. Pagina o spune.
-- Corpul e cel din productie (amprenta verificata pe 18.11.2026); tipul intors e acelasi.
CREATE OR REPLACE FUNCTION public.discount_totaluri(bid uuid)
 RETURNS TABLE(coduri bigint, coduri_folosibile bigint, comenzi bigint, bani_dati numeric, vanzari numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select count(*) filter (where d.generat_de is null),
    count(*) filter (where d.generat_de is null and public.discount_state(d.is_active, d.starts_at, d.expires_at, d.max_uses, d.uses_count) = 'activ'),
    coalesce(sum(coalesce(s.comenzi_valide, 0)), 0),
    round(coalesce(sum(coalesce(s.bani_dati, 0)), 0), 2),
    round(coalesce(sum(coalesce(s.vanzari, 0)), 0), 2)
  from public.discounts d
  left join public.discount_stats(bid) s on s.discount_id = d.id
  where d.business_id = bid
$function$
;

-- Formularele: comutatorul „Adauga abonatii in theMarketer”, ca la Mailchimp, Brevo si Klaviyo.
alter table public.forms
  add column if not exists themarketer_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- 6. Coada de email marketing: furnizorul `themarketer`
-- ---------------------------------------------------------------------------
-- ⚠ Lista e COPIATA din forma de productie (schema de referinta, 18.11.2026), cu 'themarketer' la coada.

alter table public.email_marketing_coada drop constraint if exists email_marketing_coada_furnizor_check;
alter table public.email_marketing_coada add constraint email_marketing_coada_furnizor_check
  check (furnizor in ('mailchimp', 'brevo', 'klaviyo', 'themarketer'));

-- Corpul e cel din productie (identic cu `2027-01-28-email-marketing-coada.sql`, verificat pe 18.11.2026),
-- cu O ramura noua: theMarketer, cand integrarea e pornita si modulul `comenzi` nu e oprit (lipsa lui
-- inseamna implicitul, adica pornit; vezi `MODULE_IMPLICITE`).
create or replace function public.email_marketing_pune_la_coada()
returns trigger
language plpgsql
security definer
set search_path = public, privat, pg_temp
as $$
declare
  v_feluri text[] := '{}';
  v_furnizori text[] := '{}';
  v_mc jsonb;
  v_br jsonb;
  v_kl jsonb;
  v_tm jsonb;
  v_mp text;
begin
  -- Cumparatorul unui marketplace nu e clientul comerciantului (aceeasi regula ca `clientDeMarketplace`:
  -- un sir nevid in `marketplace`).
  if jsonb_typeof(new.order_source -> 'marketplace') = 'string' then
    v_mp := regexp_replace(new.order_source ->> 'marketplace', '^\s+|\s+$', '', 'g');
    if v_mp <> '' then
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_feluri := array['creata'];
  else
    if new.payment_status is distinct from old.payment_status and new.payment_status = 'paid' then
      v_feluri := v_feluri || 'platita'::text;
    end if;
    if new.status is distinct from old.status then
      if new.status = 'shipped' then v_feluri := v_feluri || 'expediata'::text;
      elsif new.status = 'delivered' then v_feluri := v_feluri || 'livrata'::text;
      elsif new.status = 'cancelled' then v_feluri := v_feluri || 'anulata'::text;
      elsif new.status = 'refunded' then v_feluri := v_feluri || 'rambursata'::text;
      end if;
    end if;
    -- Rambursarea banilor fara schimbarea statusului (procesatorul a intors banii). Anularea castiga
    -- cand vin amandoua: e starea finala a comenzii.
    if new.payment_status is distinct from old.payment_status and new.payment_status = 'refunded'
       and not ('rambursata' = any (v_feluri)) and not ('anulata' = any (v_feluri)) then
      v_feluri := v_feluri || 'rambursata'::text;
    end if;
  end if;

  if cardinality(v_feluri) = 0 then
    return new;
  end if;

  select s.mailchimp_config, s.brevo_config, s.klaviyo_config, s.themarketer_config
    into v_mc, v_br, v_kl, v_tm
    from privat.store_settings s
   where s.business_id = new.business_id;
  if not found then
    return new;
  end if;

  if coalesce(v_mc ->> 'enabled', '') = 'true' and coalesce(v_mc ->> 'ecommerce_sync', '') = 'true' then
    v_furnizori := v_furnizori || 'mailchimp'::text;
  end if;
  if coalesce(v_br ->> 'enabled', '') = 'true' and coalesce(v_br ->> 'ecommerce_sync', '') = 'true' then
    v_furnizori := v_furnizori || 'brevo'::text;
  end if;
  if coalesce(v_kl ->> 'enabled', '') = 'true' and coalesce(v_kl ->> 'ecommerce_sync', '') = 'true' then
    v_furnizori := v_furnizori || 'klaviyo'::text;
  end if;
  if coalesce(v_tm ->> 'enabled', '') = 'true' and coalesce(v_tm ->> 'comenzi', 'true') = 'true' then
    v_furnizori := v_furnizori || 'themarketer'::text;
  end if;
  if cardinality(v_furnizori) = 0 then
    return new;
  end if;

  insert into public.email_marketing_coada (business_id, order_id, furnizor, fel)
  select new.business_id, new.id, f.furnizor, e.fel
    from unnest(v_furnizori) as f(furnizor)
   cross join unnest(v_feluri) as e(fel)
  on conflict (order_id, furnizor, fel) do nothing;

  return new;
exception when others then
  -- ⚠ O coada care cade nu are voie sa strice o comanda.
  raise warning 'email_marketing_pune_la_coada (comanda %): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.email_marketing_pune_la_coada() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Dezabonatii din theMarketer, in lista Edinio de „nu trimite”
-- ---------------------------------------------------------------------------
-- Cine s-a dezabonat de la newsletterul magazinului in theMarketer (sau i s-a respins adresa, sau a
-- marcat un email ca spam) nu mai primeste nici emailurile Edinio de cos abandonat. Mai prudent decat
-- invers: un om care a spus „nu” intr-un loc nu trebuie sa afle ca n-a fost auzit in celalalt.
--
-- ⚠ PRIN FUNCTIE, nu prin insert din cod: unicitatea e pe `lower(email)` (un index pe expresie), iar
-- PostgREST nu poate cere `on conflict` pe o expresie. Un rand deja existent ramane neatins (motivul lui
-- vechi, de pilda o dezabonare ceruta chiar de om, nu se suprascrie).
--
-- ⚠ Motivele sunt CELE EXISTENTE (`MotivSuprimare` in `src/lib/abandoned/suprimare.ts`), nu altele
-- noi: panoul si cosul abandonat stiu sa le scrie omului („Dezabonat”, „Email respins”, „Reclamatie
-- spam”). Un motiv nou ar fi aparut ca „Suprimat”, fara niciun inteles.

create or replace function public.themarketer_dezaboneaza(p_business uuid, p_emailuri text[], p_motiv text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scrise integer;
begin
  if p_motiv not in ('dezabonare', 'email_respins', 'reclamatie_spam') then
    raise exception 'motiv necunoscut: %', p_motiv;
  end if;
  if cardinality(coalesce(p_emailuri, '{}')) > 5000 then
    raise exception 'prea multe adrese intr-un apel: %', cardinality(p_emailuri);
  end if;

  insert into public.recovery_optout (business_id, email, motiv)
  select distinct on (lower(btrim(e))) p_business, lower(btrim(e)), p_motiv
    from unnest(p_emailuri) as u(e)
   where e is not null
     and btrim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     and length(btrim(e)) <= 254
  on conflict (business_id, lower(email)) do nothing;

  get diagnostics v_scrise = row_count;
  return v_scrise;
end;
$$;

revoke all on function public.themarketer_dezaboneaza(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.themarketer_dezaboneaza(uuid, text[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Adresele clientilor de anonimizat, ca anonimizarea sa ajunga si in theMarketer
-- ---------------------------------------------------------------------------
-- ⚠ SE CHEAMA INAINTE de `customer_anonymize`: dupa ea, comenzile nu mai poarta nicio adresa. Aceeasi
-- regula de potrivire ca acolo (cheia clientului pe comenzi si pe `customers`), FARA comenzile de
-- marketplace: cumparatorii lor n-au plecat niciodata spre theMarketer (vezi `clientDeMarketplace`).

create or replace function public.themarketer_emailurile_clientilor(bid uuid, p_keys text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.e), '{}')
    from (
      select lower(btrim(o.customer_email)) as e
        from public.orders o
       where o.business_id = bid
         and nullif(btrim(o.customer_email), '') is not null
         and coalesce(nullif(btrim(o.order_source ->> 'marketplace'), ''), '') = ''
         and public.order_customer_key(o.customer_phone, o.customer_email, o.id) = any(coalesce(p_keys, '{}'))
      union
      select lower(btrim(c.email))
        from public.customers c
       where c.business_id = bid
         and c.key = any(coalesce(p_keys, '{}'))
         and nullif(btrim(c.email), '') is not null
    ) x;
$$;

revoke all on function public.themarketer_emailurile_clientilor(uuid, text[]) from public, anon, authenticated;
grant execute on function public.themarketer_emailurile_clientilor(uuid, text[]) to service_role;

notify pgrst, 'reload schema';
