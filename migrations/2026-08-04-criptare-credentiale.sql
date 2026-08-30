-- ============================================================================
-- Criptarea credentialelor de integrari, TRANSPARENTA pentru aplicatie
--
-- CE REZOLVA. Cele 24 de coloane `*_config` din store_settings tin parolele de
-- curier, tokenurile de facturare, cheile de plati si parola SMTP a fiecarui
-- comerciant, in text clar. Oricine ajunge la o copie a bazei, la un
-- instantaneu sau la o citire directa a tabelului le are pe toate.
--
-- DE CE ASA SI NU IN APLICATIE. Nu exista niciun punct de trecere in cod:
-- 106 fisiere citesc store_settings, 6 cu `select("*")`, 72 isi construiesc
-- singure clientul service-role, iar configuratiile vin si prin relatie
-- (`businesses -> store_settings(...)`). Orice solutie in aplicatie ar fi cerut
-- atinse zeci de fisiere, cu riscul ca UNUL uitat sa rupa o integrare in
-- productie. Aici tabelul devine o VEDERE care decripteaza, deci nu se schimba
-- nicio linie de cod si nu exista cuplaj intre migratie si deploy.
--
-- CE PROTEJEAZA: copiile de siguranta si instantaneele (cheia sta in Vault,
-- criptata cu cheia radacina a Supabase, care NU e in copie), plus orice citire
-- care nu trece prin vedere.
-- CE NU PROTEJEAZA: scurgerea cheii service_role. Cine o are ajunge oricum la
-- comenzi, clienti si date personale, deci castigul ar fi fost marginal.
--
-- VERIFICAT INAINTE DE SCRIERE, pe tabele de proba (schema stearsa dupa):
--   1. PostgREST deduce in continuare legatura `businesses -> store_settings`
--      printr-o vedere, si pentru coloane numite, si pentru `(*)`.
--   2. `security_invoker = true` e OBLIGATORIU. Fara el, vederea ruleaza cu
--      drepturile proprietarului si OCOLESTE complet RLS: cu politica pusa pe
--      `using (false)`, vederea implicita a intors TOATE randurile catre anon,
--      iar cea cu security_invoker a intors zero. Ar fi insemnat ca fiecare
--      comerciant vede setarile tuturor.
--   3. Postgres retează coloanele necerute: `select id` din vedere nu executa
--      nicio decriptare (0,4 ms), fata de 717 ms cand se cer cele criptate.
--      Deci citirile de `id`/`slug` raman gratuite.
--   4. Dus-intors corect, criptare idempotenta, text in clar lasat neatins.
--
-- COSTUL: ~0,13 ms per camp decriptat. O citire obisnuita (o configuratie, un
-- rand) e sub o milisecunda.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema privata
--
-- NU e ascunsa fata de anon/authenticated: `security_invoker` inseamna ca
-- vederea se executa cu drepturile APELANTULUI, deci acesta are nevoie de
-- `usage` pe schema si de drepturi pe tabelul de baza. Izolarea vine din
-- altceva: PostgREST expune doar `public`, deci `privat` nu e accesibila prin
-- API. Am ales asa dinadins — alternativa (vedere security definer cu
-- verificarea proprietarului scrisa de mana in vedere si in declansatoare) ar fi
-- insemnat sa reimplementez RLS-ul pe langa politica deja auditata.
-- ---------------------------------------------------------------------------
create schema if not exists privat;
grant usage on schema privat to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Cheia
--
-- Se creeaza o singura data. Daca exista deja, nu se atinge — altfel tot ce e
-- criptat pana acum ar deveni imposibil de citit.
-- ---------------------------------------------------------------------------
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'base64'),
  'integrari_enc_key',
  'Cheia AES-256 pentru campurile secrete din store_settings.*_config'
)
where not exists (select 1 from vault.secrets where name = 'integrari_enc_key');

create or replace function privat.cheie_integrari() returns text
language sql security definer stable set search_path = vault, pg_temp as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'integrari_enc_key' limit 1;
$$;
-- Nimeni nu cere cheia direct; o folosesc doar functiile de mai jos.
revoke execute on function privat.cheie_integrari() from public;

-- ---------------------------------------------------------------------------
-- 3. Primitivele
--
-- Marcajul `enc.v1.` face totul IDEMPOTENT si compatibil in ambele sensuri:
-- ce nu e marcat e text in clar si trece neatins. Deci o valoare necriptata
-- continua sa functioneze, iar recriptarea aceleiasi valori nu o strica —
-- proprietate de care depind si declansatoarele, si umplerea initiala.
--
-- `s2k-mode=0` sare peste derivarea lenta de cheie din parola. E corect aici:
-- „parola" noastra e deja 32 de octeti aleatori, nu ceva ales de om.
-- ---------------------------------------------------------------------------
create or replace function privat.cripteaza(p_val text) returns text
language plpgsql security definer stable set search_path = extensions, public, pg_temp as $$
begin
  if p_val is null or p_val = '' or p_val like 'enc.v1.%' then return p_val; end if;
  return 'enc.v1.' || encode(
    pgp_sym_encrypt(p_val, privat.cheie_integrari(),
                    'compress-algo=0, s2k-mode=0, cipher-algo=aes256'), 'base64');
end $$;

create or replace function privat.decripteaza(p_val text) returns text
language plpgsql security definer stable set search_path = extensions, public, pg_temp as $$
begin
  if p_val is null or p_val not like 'enc.v1.%' then return p_val; end if;
  return pgp_sym_decrypt(decode(substring(p_val from 8), 'base64'), privat.cheie_integrari());
exception when others then
  -- Nu inventam text in clar dintr-o valoare pe care nu o putem descifra.
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Harta campurilor
--
-- `cale` e scrisa cu punct pentru secretele imbricate: parola SMTP sta la
-- `email_config.smtp.pass`, nu la primul nivel.
--
-- Ce NU intra aici, desi numele suna a secret:
--   olx_config.access_token_expires_at, olx_config.token_updated_at  (momente)
--   trendyol_config.webhook_id                                       (identificator)
--   mailchimp_config.server_prefix                                   (derivat, public)
--   aboutyou_config.api_key_label / api_key_added_at                 (etichete)
--   stripe_config                    (Connect tine doar id-ul de cont; cheile
--                                     sunt ale platformei, in variabile de mediu)
-- Criptarea unui moment sau a unui identificator ar rupe tacit codul care il
-- parseaza.
-- ---------------------------------------------------------------------------
create table if not exists privat.campuri_secrete (
  coloana text not null,
  cale    text not null,
  primary key (coloana, cale)
);
comment on table privat.campuri_secrete is
  'Ce se cripteaza in store_settings. Dupa orice modificare: select privat.reconstruieste_store_settings();';

insert into privat.campuri_secrete (coloana, cale) values
  ('cargus_config','password'), ('cargus_config','subscription_key'),
  ('colete_config','client_secret'), ('colete_config','token'),
  ('dpd_config','password'),
  ('fan_courier_config','password'),
  ('fgo_config','private_key'),
  ('ipay_config','password'),
  ('klarna_config','password'), ('klarna_config','authorization_token'),
  ('netopia_config','api_key'), ('netopia_config','pos_signature'),
  ('notice_config','api_token'), ('notice_config','webhook_secret'),
  ('oblio_config','client_secret'),
  ('revolut_config','secret_key'), ('revolut_config','signing_secret'), ('revolut_config','token'),
  ('sameday_config','password'),
  ('smartbill_config','token'),
  ('smso_config','api_key'),
  ('woot_config','public_key'), ('woot_config','secret_key'),
  ('email_config','smtp.pass'),
  ('mailchimp_config','api_key'), ('mailchimp_config','webhook_secret'),
  ('brevo_config','api_key'), ('brevo_config','webhook_secret'),
  ('klaviyo_config','api_key'),
  ('aboutyou_config','api_key'), ('aboutyou_config','webhook_secret'),
  ('olx_config','access_token'), ('olx_config','refresh_token'),
  ('trendyol_config','api_key'), ('trendyol_config','api_secret'), ('trendyol_config','webhook_secret'),
  ('google_merchant_config','refresh_token'),
  ('google_analytics_config','refresh_token'), ('google_analytics_config','api_secret')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Nivelul jsonb
-- ---------------------------------------------------------------------------
create or replace function privat.cripteaza_config(p_cfg jsonb, p_cai text[]) returns jsonb
language plpgsql stable set search_path = extensions, public, pg_temp as $$
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
end $$;

create or replace function privat.decripteaza_config(p_cfg jsonb, p_cai text[]) returns jsonb
language plpgsql stable set search_path = extensions, public, pg_temp as $$
declare cale text; parti text[]; v text; d text; r jsonb := p_cfg;
begin
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then return p_cfg; end if;
  foreach cale in array p_cai loop
    parti := string_to_array(cale, '.');
    if jsonb_typeof(r #> parti) = 'string' then
      v := r #>> parti;
      if v like 'enc.v1.%' then
        d := privat.decripteaza(v);
        -- Cheie gresita sau valoare stricata: lasam SIRUL GOL, nu marcajul.
        -- Codul trateaza deja „gol" ca „lipseste credentiala", deci esecul e
        -- vizibil si inofensiv, in loc sa trimita gunoi catre furnizor.
        r := jsonb_set(r, parti, to_jsonb(coalesce(d, '')));
      end if;
    end if;
  end loop;
  return r;
end $$;

-- Randul intreg, pentru declansatoare si pentru umplerea initiala.
--
-- SECURITY DEFINER e necesar AICI si numai aici: functia citeste harta
-- `campuri_secrete`, care nu e vizibila rolurilor din API. Nu deschide nimic —
-- primeste un jsonb si intoarce alt jsonb, nu atinge date de utilizator.
-- Scrierea propriu-zisa ramane in declansatorul SECURITY INVOKER, deci RLS se
-- aplica mai departe. (Prins la testare: fara definer, orice salvare esua cu
-- „permission denied for table campuri_secrete".)
create or replace function privat.cripteaza_rand(p_rand jsonb) returns jsonb
language plpgsql stable security definer set search_path = privat, public, pg_temp as $$
declare m record; r jsonb := p_rand;
begin
  for m in select coloana, array_agg(cale) as cai from privat.campuri_secrete group by coloana loop
    if jsonb_typeof(r -> m.coloana) = 'object' then
      r := jsonb_set(r, array[m.coloana], privat.cripteaza_config(r -> m.coloana, m.cai));
    end if;
  end loop;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Mutarea tabelului
--
-- Politicile RLS, indecsii, constrangerile si declansatorul `set_updated_at`
-- merg odata cu tabelul. Cheia straina catre `businesses` ramane intacta, iar
-- pe ea se sprijina PostgREST cand deduce legatura prin vedere.
-- ---------------------------------------------------------------------------
-- Copie in clar, inainte de orice atingere. Daca ceva merge prost si nici
-- revenirea de la finalul fisierului nu ajunge, aici sunt datele exact cum erau.
-- De sters dupa cateva zile de functionare linistita: contine credentiale in clar.
create table if not exists privat.zz_backup_store_settings_20260804 as
  select * from public.store_settings;
revoke all on privat.zz_backup_store_settings_20260804 from anon, authenticated;

alter table if exists public.store_settings set schema privat;

-- ---------------------------------------------------------------------------
-- 7. Vederea, generata din harta
-- ---------------------------------------------------------------------------
create or replace function privat.reconstruieste_store_settings() returns void
language plpgsql set search_path = privat, public, pg_temp as $$
declare col record; lista text := ''; cai text; d text;
begin
  for col in
    select column_name, column_default
    from information_schema.columns
    where table_schema = 'privat' and table_name = 'store_settings'
    order by ordinal_position
  loop
    select array_agg(cale)::text into cai
      from privat.campuri_secrete where coloana = col.column_name;

    lista := lista || case when lista = '' then '' else ', ' end ||
      case when cai is null then quote_ident(col.column_name)
           else 'privat.decripteaza_config(' || quote_ident(col.column_name) || ', ' ||
                quote_literal(cai) || '::text[]) as ' || quote_ident(col.column_name)
      end;
  end loop;

  execute 'create or replace view public.store_settings with (security_invoker = true) as select '
          || lista || ' from privat.store_settings';

  -- Valorile implicite NU se mostenesc de la tabelul de baza. Fara pasul asta,
  -- un `insert` care nu numeste `currency` ar trimite NULL intr-o coloana
  -- NOT NULL si ar esua — adica exact crearea unui magazin nou.
  for col in
    select column_name, column_default
    from information_schema.columns
    where table_schema = 'privat' and table_name = 'store_settings'
      and column_default is not null
  loop
    execute format('alter view public.store_settings alter column %I set default %s',
                   col.column_name, col.column_default);
  end loop;
end $$;

select privat.reconstruieste_store_settings();

-- ---------------------------------------------------------------------------
-- 8. Scrierile
--
-- ATENTIE: declansatoarele sunt SECURITY INVOKER (implicit), nu DEFINER. Cu
-- DEFINER ar fi ocolit RLS-ul tabelului de baza si orice utilizator autentificat
-- ar fi putut scrie in setarile oricarui magazin.
--
-- Aplicatia nu foloseste `upsert` pe store_settings (verificat: 26 `insert`,
-- 66 `update`, zero `upsert`) — bine, fiindca `on conflict` nu merge pe o vedere
-- cu declansatoare INSTEAD OF.
-- ---------------------------------------------------------------------------
create or replace function privat.store_settings_ins() returns trigger
language plpgsql set search_path = privat, public, pg_temp as $$
declare j jsonb;
begin
  j := privat.cripteaza_rand(to_jsonb(new));
  insert into privat.store_settings
  select * from jsonb_populate_record(null::privat.store_settings, j);
  return new;  -- intoarce valorile in CLAR, ca `return=representation` sa fie corect
end $$;

-- Corpul functiei de UPDATE se GENEREAZA din schema, nu se scrie de mana:
-- Postgres cere lista explicita de coloane la `set (...) = (select ...)`, iar o
-- coloana uitata sau pusa in alta ordine ar strica date tacit, la fiecare
-- salvare. Generata, lista nu poate ramane in urma schemei.
create or replace function privat.reconstruieste_store_settings_upd() returns void
language plpgsql set search_path = privat, public, pg_temp as $$
declare lista text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into lista
  from information_schema.columns
  where table_schema = 'privat' and table_name = 'store_settings';

  execute format($f$
    create or replace function privat.store_settings_upd() returns trigger
    language plpgsql set search_path = privat, public, pg_temp as $c$
    declare j jsonb;
    begin
      -- `new` contine randul INTREG (si coloanele neatinse de cerere), deci
      -- rescrierea completa e echivalenta cu un update partial.
      j := privat.cripteaza_rand(to_jsonb(new));
      update privat.store_settings s
         set (%s) = (select r.* from jsonb_populate_record(null::privat.store_settings, j) r)
       where s.id = old.id;
      return new;
    end $c$;
  $f$, lista);
end $$;

select privat.reconstruieste_store_settings_upd();

create or replace function privat.store_settings_del() returns trigger
language plpgsql set search_path = privat, public, pg_temp as $$
begin
  delete from privat.store_settings where id = old.id;
  return old;
end $$;

drop trigger if exists store_settings_ins on public.store_settings;
drop trigger if exists store_settings_upd on public.store_settings;
drop trigger if exists store_settings_del on public.store_settings;
create trigger store_settings_ins instead of insert on public.store_settings
  for each row execute function privat.store_settings_ins();
create trigger store_settings_upd instead of update on public.store_settings
  for each row execute function privat.store_settings_upd();
create trigger store_settings_del instead of delete on public.store_settings
  for each row execute function privat.store_settings_del();

-- ---------------------------------------------------------------------------
-- 9. Drepturi — exact cele pe care le avea tabelul
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.store_settings to anon, authenticated, service_role;
grant select, insert, update, delete on privat.store_settings to anon, authenticated, service_role;
grant execute on function privat.cripteaza_config(jsonb, text[]) to anon, authenticated, service_role;
grant execute on function privat.decripteaza_config(jsonb, text[]) to anon, authenticated, service_role;
grant execute on function privat.cripteaza(text) to anon, authenticated, service_role;
grant execute on function privat.decripteaza(text) to anon, authenticated, service_role;
grant execute on function privat.cripteaza_rand(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Umplerea initiala
--
-- Se scrie DIRECT in tabelul de baza, ocolind vederea: altfel declansatorul ar
-- cripta din nou o valoare pe care tocmai am criptat-o. (Marcajul ar fi facut-o
-- oricum inofensiva, dar asa e si evident.)
-- ---------------------------------------------------------------------------
do $$
declare m record; n integer;
begin
  for m in select coloana, array_agg(cale) as cai from privat.campuri_secrete group by coloana loop
    execute format(
      'update privat.store_settings set %I = privat.cripteaza_config(%I, $1) where %I is not null',
      m.coloana, m.coloana, m.coloana) using m.cai;
    get diagnostics n = row_count;
    raise notice 'criptat %: % randuri', m.coloana, n;
  end loop;
end $$;

-- Umplerea a trecut prin `set_updated_at`, deci a marcat TOATE cele 127 de
-- magazine ca modificate azi. Punem coloana la loc din copie: altfel orice
-- sortare sau invalidare de cache dupa `updated_at` ar vedea o schimbare care
-- nu s-a intamplat.
alter table privat.store_settings disable trigger set_store_settings_updated_at;
update privat.store_settings s
   set updated_at = b.updated_at
  from privat.zz_backup_store_settings_20260804 b
 where b.id = s.id and s.updated_at is distinct from b.updated_at;
alter table privat.store_settings enable trigger set_store_settings_updated_at;

commit;

-- ----------------------------------------------------------------------------
-- OBLIGATORIU: PostgREST tine in cache schema si privilegiile. Fara asta,
-- vederea proaspata nu e vizibila si cererile catre store_settings esueaza.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- REVENIRE (daca ceva merge prost)
--
--   begin;
--   -- decripteaza inapoi in tabel, apoi pune tabelul la loc in `public`
--   do $$ declare m record; begin
--     for m in select coloana, array_agg(cale) as cai from privat.campuri_secrete group by coloana loop
--       execute format('update privat.store_settings set %I = privat.decripteaza_config(%I, $1) where %I is not null',
--                      m.coloana, m.coloana, m.coloana) using m.cai;
--     end loop;
--   end $$;
--   drop view public.store_settings;
--   alter table privat.store_settings set schema public;
--   commit;
--   NOTIFY pgrst, 'reload schema';
--
-- Decriptarea TREBUIE facuta inainte de a arunca vederea: altfel raman valori
-- marcate `enc.v1.` pe care nimic nu le mai descifreaza.
-- ============================================================================
