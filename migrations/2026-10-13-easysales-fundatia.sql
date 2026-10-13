-- easySales, FUNDATIA (E1) - 13.10.2026.
--
-- easySales e un hub de marketplace-uri: comerciantul are deja cont la ei, iar fiecare magazin
-- Edinio devine, in contul lui, un website de tip „API V2". Planul intreg si sursele fiecarei
-- afirmatii: `docs/marketplace/EASYSALES-PLAN.md`.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. Codul citeste `easysales_config` din `store_settings`, iar
-- cronul revendica din `easysales_sync_queue`. Fara migratie, cronul ar primi „coada
-- necunoscuta" la fiecare trecere, iar pagina integrarii ar cadea pe coloana lipsa.
--
-- Ce atinge:
--   1. `privat.store_settings.easysales_config`, cu secretele criptate si vederile refacute;
--   2. `easysales_id_seq`, secventa GLOBALA a identificatorilor trimisi la ei;
--   3. `easysales_produse`, legatura dintre un articol Edinio si identitatea lui la ei;
--   4. `easysales_request_log`, jurnalul cererilor (fara corpuri si fara date personale);
--   5. `easysales_webhook_inbox`, livrarile lor, scrise INAINTE de orice prelucrare;
--   6. `easysales_sync_queue`, coada cu generatie, si punerea in coada comasata;
--   7. `revendica_din_coada` cunoaste coada noua;
--   8. zavorul emiterii tokenului: `easysales_ia_emiterea`, `easysales_scrie_tokenul`,
--      `easysales_elibereaza_emiterea`.
--
-- Nu se atinge `public.orders`: nicio coloana noua acolo (riscul 42703 al selecturilor comune,
-- vezi `migrations/2026-10-07-epacket-curier.sql`).

-- ---------------------------------------------------------------------------
-- 1. Configurarea, pe TABELUL privat (vederea se regenereaza din el)
-- ---------------------------------------------------------------------------
-- ⚠ `not null default '{}'`, ca la `trendyol_config`, `emag_config`, `olx_config`,
-- `aboutyou_config` si `pepita_config` (integrarile de comenzi si stoc), NU ca la curieri.
-- `connected` e obligatoriu in obiect: garda „un cont, un magazin" si rotatia cronului citesc
-- numai configurarile cu `->>connected = 'true'`.

alter table privat.store_settings
  add column if not exists easysales_config jsonb not null default '{}'::jsonb;

comment on column privat.store_settings.easysales_config is
  'easySales: {connected, needs_reconnect, pauza, client_id, client_secret*, website_token*, '
  'website_token_amprenta, website_nume, access_token*, refresh_token*, token_versiune, '
  'token_emis_la, token_expira_la, emitere_pana, emitere_id, scopuri_cerute, scopuri, jwt_sub, '
  'pat*, cont{}, webhook_jeton_hash, webhook_secret*, abonari{slug:id}, semnatura_mod, '
  'comenzi_active, catalog_activ, stoc_activ, canale[], marcaje}. * = criptat (privat.campuri_secrete). '
  'Se scrie NUMAI prin jsonb_merge_config sau prin RPC-urile easysales_*; niciodata prin update pe vedere.';

-- ⚠ Randurile intra INAINTEA reconstruirii: `reconstruieste_store_settings()` decripteaza numai
-- caile pe care le gaseste aici. `pat` intra dinainte (Personal Access Token, numai daca citirea
-- comenzilor altor canale o cere; hotararea D3): o cale secreta fara valoare nu costa nimic, iar
-- adaugata mai tarziu ar cere inca o regenerare a vederilor.
insert into privat.campuri_secrete (coloana, cale) values
  ('easysales_config', 'client_secret'),
  ('easysales_config', 'website_token'),
  ('easysales_config', 'access_token'),
  ('easysales_config', 'refresh_token'),
  ('easysales_config', 'webhook_secret'),
  ('easysales_config', 'pat')
on conflict do nothing;

-- ⚠ AMANDOUA, dupa ORICE coloana noua in `privat.store_settings`: fara prima, vederea nu are
-- coloana; fara a doua, declansatorul INSTEAD OF rescrie randul cu lista VECHE de coloane si
-- valoarea coloanei noi se pierde tacut la salvarea altei setari.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 2. Secventa identificatorilor trimisi la ei
-- ---------------------------------------------------------------------------
-- `order_id` al comenzilor si `product_website_id` al articolelor vin din ACEEASI secventa,
-- globala pe platforma: un id e unic intre magazine prin constructie, deci o reconectare pe alt
-- website sau doua magazine pe acelasi cont nu pot ciocni doua identitati. Porneste de la un
-- miliard: incape in int32 (documentatia ii zice „Numeric", fara interval) si nu se confunda cu
-- numerele mici de comanda ale magazinelor.

create sequence if not exists public.easysales_id_seq
  as bigint start with 1000000000 minvalue 1000000000 no cycle;

-- ---------------------------------------------------------------------------
-- 3. Legatura articolelor
-- ---------------------------------------------------------------------------
-- Un rand pe unitate vanduta (produs simplu sau combinatie) plus un rand `#parinte` pe fiecare
-- produs cu variante. `id` devine `product_website_id` (respectiv `parent_id`) la ei.
--
-- ⚠ `product_uuid` e COPIA lui `product_id`, ca randul sa ramana dupa stergerea produsului:
-- reconectarea si comenzile vechi trebuie sa regaseasca acelasi id, altfel ar naste dubluri.
-- ⚠ SKU-ul trimis se INGHEATA la prima alocare: la ei, un SKU schimbat creeaza un produs nou.

create table if not exists public.easysales_produse (
  id bigint primary key default nextval('public.easysales_id_seq'),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_uuid uuid not null,
  -- '' = produs simplu · '#parinte' = parintele variantelor · altfel identitatea combinatiei
  identitate text not null default '',
  parinte_id bigint references public.easysales_produse(id) on delete set null,
  sku_trimis text,
  sku_generat boolean not null default false,
  -- Id-ul lor intern, aflat din citirea de verificare. Text: tipul lor nu e constant.
  es_product_id text,
  stare text not null default 'nou',
  motiv text,
  trimis_la timestamptz,
  confirmat_la timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint easysales_produse_cheie unique (business_id, product_uuid, identitate),
  constraint easysales_produse_stare_check check (stare = any (array[
    'nou', 'de_trimis', 'trimis', 'confirmat', 'blocat', 'arhivat'
  ]::text[]))
);

comment on table public.easysales_produse is
  'Identitatea fiecarui articol Edinio la easySales. id = product_website_id. Randurile nu se sterg '
  'la deconectare: reconectarea refoloseste id-urile, altfel la ei ar aparea dubluri.';

create unique index if not exists easysales_produse_sku_idx
  on public.easysales_produse (business_id, lower(sku_trimis))
  where sku_trimis is not null;
create index if not exists easysales_produse_produs_idx
  on public.easysales_produse (product_id);
create index if not exists easysales_produse_parinte_idx
  on public.easysales_produse (parinte_id);

-- ---------------------------------------------------------------------------
-- 4. Jurnalul cererilor
-- ---------------------------------------------------------------------------
-- ⚠ NICIUN corp, niciun antet, nicio adresa intreaga: comenzile poarta numele, adresa si
-- telefonul cumparatorului, iar jetonul webhook-ului sta in query string. Se scriu ruta-sablon,
-- verdictul, codul, durata, cate cereri mai are contul in minut si un mesaj scurt.
-- Se scriu scrierile (au efecte) si orice esec; citirile reusite nu.

create table if not exists public.easysales_request_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  corelatie text,
  metoda text not null,
  cale text not null,
  -- 0 = n-am ajuns la ei (timp expirat, retea), NU un raspuns cu codul zero.
  status integer not null default 0,
  verdict text not null,
  durata_ms integer,
  rata_ramasa integer,
  cod text,
  mesaj text,
  created_at timestamptz not null default now()
);

create index if not exists easysales_request_log_biz_idx
  on public.easysales_request_log (business_id, created_at desc);
create index if not exists easysales_request_log_probleme_idx
  on public.easysales_request_log (business_id, created_at desc)
  where verdict <> 'reusit';
create index if not exists easysales_request_log_varsta_idx
  on public.easysales_request_log (created_at);

-- ---------------------------------------------------------------------------
-- 5. Inboxul webhook-urilor
-- ---------------------------------------------------------------------------
-- ⚠ SE SCRIE INTAI, SE PRELUCREAZA PE URMA. Ei socotesc esuata orice livrare mai lenta de trei
-- secunde, iar prelucrarea noastra e o recitire prin API. Deci ruta raspunde imediat, iar
-- randul ramane pentru `after` sau pentru cron.
-- ⚠ `corp` e CURATAT inainte de scriere, pe lista alba: fara client, adrese, nume, telefoane si
-- fara `website.token`. Payload-ul lor n-are id de eveniment: `amprenta` e doar diagnostic.

create table if not exists public.easysales_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slug text,
  amprenta text not null,
  corp jsonb,
  -- null = neevaluata; varianta: corp · payload · cheie_goala · lipsa · nepotrivita
  semnatura_ok boolean,
  semnatura_varianta text,
  motiv text,
  primit_la timestamptz not null default now(),
  prelucrat_la timestamptz,
  incercari integer not null default 0,
  urmatoarea_incercare timestamptz,
  eroare text
);

create index if not exists easysales_webhook_inbox_de_prelucrat_idx
  on public.easysales_webhook_inbox (primit_la)
  where prelucrat_la is null;
create index if not exists easysales_webhook_inbox_biz_idx
  on public.easysales_webhook_inbox (business_id, primit_la desc);

-- ---------------------------------------------------------------------------
-- 6. Coada
-- ---------------------------------------------------------------------------
-- Forma comuna a cozilor de marketplace: `revendicat_pana`, `next_retry_at`, `abandonat_la`,
-- `prioritate`, `generation` cu declansatorul `trg_generatie` (scrierile lucratorului se fac cu
-- compare-and-set pe generatie, `src/lib/marketplace/coada-cas.ts`).
--
-- ⚠ Unicitatea e INTREAGA, nu partiala: punerea in coada e un upsert, iar `on conflict` nu poate
-- folosi un index partial fara predicatul lui. O cerere noua peste un rand abandonat il REINVIE
-- (incercarile se golesc): o schimbare noua merita o incercare noua.
-- `incercari` numara refuzurile; `pauze` numara panele trecatoare, care NU abandoneaza.

create table if not exists public.easysales_sync_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  op text not null,
  cheie text not null,
  incercari integer not null default 0,
  pauze integer not null default 0,
  ultima_eroare text,
  created_at timestamptz not null default now(),
  revendicat_pana timestamptz,
  next_retry_at timestamptz,
  abandonat_la timestamptz,
  prioritate smallint not null default 5,
  generation bigint not null default 1,
  constraint easysales_sync_queue_cheie unique (business_id, op, cheie),
  constraint easysales_sync_queue_op_check check (op = any (array[
    'comanda_trimite', 'comanda_anuleaza', 'comanda_citeste', 'extern_citeste',
    'articol_continut', 'articol_pret', 'articol_stoc', 'articol_sterge',
    'categorie', 'caracteristica'
  ]::text[]))
);

create index if not exists easysales_sync_queue_ordine_idx
  on public.easysales_sync_queue (prioritate, created_at);
create index if not exists easysales_sync_queue_revendicat_idx
  on public.easysales_sync_queue (revendicat_pana, created_at);

create trigger trg_generatie
  before update on public.easysales_sync_queue
  for each row execute function public.trg_generatia_cozii();

-- Punerea in coada, comasata pe (magazin, operatie, cheie). Chemata din cod si din
-- declansatorii de pe `orders` (migratia comenzilor), deci SQL, nu TypeScript.
-- ⚠ Prioritatea ramane cea mai urgenta dintre cererea veche si cea noua.
create or replace function public.easysales_pune_in_coada(
  p_business uuid, p_op text, p_cheie text, p_prioritate integer default 5
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_business is null or p_op is null or coalesce(p_cheie, '') = '' then
    raise exception 'easysales_pune_in_coada: magazin, operatie si cheie sunt obligatorii';
  end if;
  insert into public.easysales_sync_queue as q (business_id, op, cheie, prioritate)
  values (p_business, p_op, p_cheie, greatest(1, least(coalesce(p_prioritate, 5), 9))::smallint)
  on conflict (business_id, op, cheie) do update
     set abandonat_la = null,
         incercari = 0,
         pauze = 0,
         next_retry_at = null,
         ultima_eroare = null,
         prioritate = least(q.prioritate, excluded.prioritate);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. `revendica_din_coada` cunoaste coada noua
-- ---------------------------------------------------------------------------
-- ⚠ Corpul e cel din PRODUCTIE (schema de referinta, 13.10.2026: `--check` = identica), cu un
-- singur nume nou in lista permisa. Semnatura si tipul intors raman, deci `create or replace`
-- ajunge. `as materialized` si parantezele primei conditii NU sunt decor (vezi comentariul).

create or replace function public.revendica_din_coada(p_coada text, p_limita integer default 50, p_lease interval default '00:05:00'::interval)
 returns setof jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_permise constant text[] := array[
    'gmc_sync_queue', 'olx_sync_queue', 'trendyol_sync_queue', 'aboutyou_sync_queue',
    'emag_sync_queue', 'easysales_sync_queue'];
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
   * isi pierde intelesul.
   *
   * === TREI CLAUZE NOI (2026-09-25), TOATE NEUTRE PENTRU CELELALTE PATRU COZI ===
   *
   * next_retry_at - asteptarea crescatoare dupa un refuz. Nullabil fara implicit,
   *   deci pentru gmc/olx/trendyol/aboutyou filtrul e mereu adevarat.
   * abandonat_la  - elementul s-a oprit definitiv, dar NU s-a sters. Idem.
   * prioritate    - not null default 5. Peste o coloana constanta,
   *   order by prioritate, created_at da EXACT aceeasi ordine ca inainte.
   *
   * ATENTIE: parantezele din jurul primei conditii sunt OBLIGATORII. Fara ele, and
   * leaga mai strans decat or, si orice rand nerevendicat ar fi trecut peste
   * asteptare si peste abandon.
   */
  if not (p_coada = any(v_permise)) then
    raise exception 'coada necunoscuta: %', p_coada;
  end if;

  return query execute format($f$
    with alese as materialized (
      select c.id from public.%I c
       where (c.revendicat_pana is null or c.revendicat_pana < now())
         and (c.next_retry_at is null or c.next_retry_at <= now())
         and c.abandonat_la is null
       order by c.prioritate, c.created_at
       limit $2
       for update skip locked)
    update public.%I q
       set revendicat_pana = now() + $1
      from alese a
     where q.id = a.id
    returning to_jsonb(q.*)
  $f$, p_coada, p_coada) using p_lease, p_limita;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Zavorul emiterii tokenului
-- ---------------------------------------------------------------------------
-- ⚠ LA EASYSALES ORICE EMITERE PE ACELASI CLIENT REVOCA TOKENUL IN UZ („Only one token per client
-- can be created, when the new access token is generated the old one is revoked automatically").
-- Un compare-and-set LA SCRIERE, ca la OLX, nu ajunge: doua fire care emit in paralel se revoca
-- reciproc chiar daca scrierea are un singur castigator. Zavorul se ia INAINTEA apelului.
--
--   easysales_ia_emiterea     reuseste numai daca `token_versiune` e cea vazuta de apelant si
--                             zavorul e liber sau expirat; intoarce un id de zavor.
--   easysales_scrie_tokenul   scrie tokenul NUMAI cu zavorul propriu, mareste versiunea si
--                             elibereaza zavorul. Un apelant al carui zavor a fost luat de altul
--                             e refuzat: tokenul lui e deja revocat de emiterea celuilalt.
--   easysales_elibereaza_emiterea  emiterea a picat: elibereaza numai zavorul propriu.
--
-- ⚠ Scriu direct `||` pe coloana numai chei NESECRETE; tokenul trece prin `jsonb_merge_config`,
-- care cripteaza caile secrete.

create or replace function public.easysales_ia_emiterea(
  p_business uuid, p_versiune_vazuta bigint, p_lease_sec integer default 30
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $$
declare
  v_id     uuid;
  v_cfg    jsonb;
  v_vers   bigint;
  v_pana   timestamptz;
  v_zavor  uuid;
begin
  select s.id, coalesce(s.easysales_config, '{}'::jsonb)
    into v_id, v_cfg
    from privat.store_settings s
   where s.business_id = p_business
   for update;
  if v_id is null then
    return null;
  end if;

  v_vers := case when coalesce(v_cfg ->> 'token_versiune', '') ~ '^\d{1,18}$'
                 then (v_cfg ->> 'token_versiune')::bigint else 0 end;
  if v_vers <> coalesce(p_versiune_vazuta, 0) then
    return null;
  end if;

  v_pana := case when coalesce(v_cfg ->> 'emitere_pana', '') ~ '^\d{4}-\d{2}-\d{2}'
                 then (v_cfg ->> 'emitere_pana')::timestamptz end;
  if v_pana is not null and v_pana > now() then
    return null;
  end if;

  v_zavor := gen_random_uuid();
  update privat.store_settings
     set easysales_config = coalesce(easysales_config, '{}'::jsonb) || jsonb_build_object(
           'emitere_pana', now() + make_interval(secs => greatest(5, least(coalesce(p_lease_sec, 30), 120))),
           'emitere_id', v_zavor,
           'emitere_incercata_la', now()),
         updated_at = now()
   where id = v_id;
  return v_zavor;
end;
$$;

create or replace function public.easysales_scrie_tokenul(
  p_business uuid, p_zavor uuid, p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $$
declare
  v_id   uuid;
  v_cfg  jsonb;
  v_vers bigint;
begin
  if p_zavor is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return false;
  end if;

  select s.id, coalesce(s.easysales_config, '{}'::jsonb)
    into v_id, v_cfg
    from privat.store_settings s
   where s.business_id = p_business
   for update;
  if v_id is null or coalesce(v_cfg ->> 'emitere_id', '') <> p_zavor::text then
    return false;
  end if;

  v_vers := case when coalesce(v_cfg ->> 'token_versiune', '') ~ '^\d{1,18}$'
                 then (v_cfg ->> 'token_versiune')::bigint else 0 end;

  -- ⚠ `jsonb_merge_config` ia si ea `for update` pe acelasi rand: in aceeasi tranzactie, lacatul
  -- e deja al nostru, deci nu asteapta.
  perform public.jsonb_merge_config(
    p_business, 'easysales_config',
    (p_patch - 'token_versiune' - 'emitere_pana' - 'emitere_id')
      || jsonb_build_object('token_versiune', v_vers + 1, 'emitere_pana', null, 'emitere_id', null)
  );
  return true;
end;
$$;

create or replace function public.easysales_elibereaza_emiterea(p_business uuid, p_zavor uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $$
begin
  if p_zavor is null then
    return;
  end if;
  update privat.store_settings
     set easysales_config = coalesce(easysales_config, '{}'::jsonb)
                              || jsonb_build_object('emitere_pana', null, 'emitere_id', null),
         updated_at = now()
   where business_id = p_business
     and coalesce(easysales_config ->> 'emitere_id', '') = p_zavor::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Drepturi
-- ---------------------------------------------------------------------------
-- RLS pornit; o singura politica, CITIRE pentru proprietar, `(select auth.uid())` invelit (se
-- socoteste o data pe interogare). Scrierile se fac numai cu service role.
-- ⚠ SE REVOCA, NU SE ACORDA: privilegiile implicite ale proiectului dau `anon` si
-- `authenticated` TOATE drepturile pe orice tabel nou din `public`. Un `grant select` singur n-ar
-- restrange nimic.

alter table public.easysales_produse       enable row level security;
alter table public.easysales_request_log   enable row level security;
alter table public.easysales_webhook_inbox enable row level security;
alter table public.easysales_sync_queue    enable row level security;

create policy owner_select_easysales_produse on public.easysales_produse for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));

create policy owner_select_easysales_request_log on public.easysales_request_log for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));

create policy owner_select_easysales_webhook_inbox on public.easysales_webhook_inbox for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));

create policy owner_select_easysales_sync_queue on public.easysales_sync_queue for select
  using (business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid())));

revoke insert, update, delete, truncate, references, trigger
  on table public.easysales_produse, public.easysales_request_log,
           public.easysales_webhook_inbox, public.easysales_sync_queue
  from anon, authenticated;
grant select on table public.easysales_produse, public.easysales_request_log,
                      public.easysales_webhook_inbox, public.easysales_sync_queue
  to anon, authenticated;

revoke all on sequence public.easysales_id_seq from public, anon, authenticated;
grant usage, select on sequence public.easysales_id_seq to service_role;

revoke all on function public.easysales_pune_in_coada(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.easysales_pune_in_coada(uuid, text, text, integer) to service_role;
revoke all on function public.revendica_din_coada(text, integer, interval) from public, anon, authenticated;
grant execute on function public.revendica_din_coada(text, integer, interval) to service_role;
revoke all on function public.easysales_ia_emiterea(uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.easysales_ia_emiterea(uuid, bigint, integer) to service_role;
revoke all on function public.easysales_scrie_tokenul(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.easysales_scrie_tokenul(uuid, uuid, jsonb) to service_role;
revoke all on function public.easysales_elibereaza_emiterea(uuid, uuid) from public, anon, authenticated;
grant execute on function public.easysales_elibereaza_emiterea(uuid, uuid) to service_role;

-- `updated_at` pe legatura articolelor (obiectele sunt noi: fara `drop ... if exists`, ca
-- aplicarea sa nu ceara confirmarea unei instructiuni distructive)
create trigger set_easysales_produse_updated_at
  before update on public.easysales_produse
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Verificarile stau IN migratie: daca una pica, nimic din fisier nu ramane aplicat.
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'store_settings' and column_name = 'easysales_config'
  ) then
    raise exception 'vederea public.store_settings nu are easysales_config';
  end if;

  if position('easysales_config' in pg_get_functiondef('privat.store_settings_upd()'::regprocedure)) = 0 then
    raise exception 'declansatorul store_settings_upd nu scrie easysales_config';
  end if;

  if (select count(*) from privat.campuri_secrete where coloana = 'easysales_config') <> 6 then
    raise exception 'secretele easysales_config nu sunt toate sase';
  end if;

  if position('easysales_sync_queue' in pg_get_functiondef('public.revendica_din_coada(text, integer, interval)'::regprocedure)) = 0 then
    raise exception 'revendica_din_coada nu cunoaste easysales_sync_queue';
  end if;

  foreach f in array array[
    'public.easysales_pune_in_coada(uuid, text, text, integer)',
    'public.revendica_din_coada(text, integer, interval)',
    'public.easysales_ia_emiterea(uuid, bigint, integer)',
    'public.easysales_scrie_tokenul(uuid, uuid, jsonb)',
    'public.easysales_elibereaza_emiterea(uuid, uuid)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'anon sau authenticated poate chema %', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role NU poate chema %', f;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.easysales_sync_queue', 'INSERT')
     or has_table_privilege('anon', 'public.easysales_produse', 'UPDATE')
     or has_table_privilege('authenticated', 'public.easysales_webhook_inbox', 'DELETE') then
    raise exception 'scrierile pe tabelele easysales sunt deschise lui anon/authenticated';
  end if;

  if has_sequence_privilege('authenticated', 'public.easysales_id_seq', 'USAGE') then
    raise exception 'secventa easysales_id_seq e deschisa lui authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
