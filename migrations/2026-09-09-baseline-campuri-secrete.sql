-- Baseline-ul isi ia cu el si `privat.campuri_secrete`.
--
-- ═══ CE REPARA ═══
--
-- `scripts/schema-baseline.sh` spune, in antetul lui, „Niciun rand de date" — si asa
-- si trebuie, cu O SINGURA exceptie pe care n-o vedea nimeni.
--
-- `privat.campuri_secrete` (51 de randuri azi) nu tine date de client: tine ENUMERAREA
-- coloanelor care se cripteaza si a cailor din JSON pe care stau cheile. Din ea isi
-- compun `reconstruieste_store_settings()` si `reconstruieste_store_settings_upd()`
-- vederea publica `store_settings` si declansatorul ei INSTEAD OF UPDATE.
--
-- Vederea din baseline are decriptarea coapta in definitie, deci o baza refacuta din el
-- decripteaza corect de la inceput. Gaura se deschide A DOUA ZI: tabelul ar fi GOL, iar
-- prima migratie care adauga o integrare cheama `reconstruieste_store_settings()` — si
-- aceea ar reconstrui vederea FARA nicio decriptare.
--
-- ⚠ Iar asta nu produce nicio eroare. Aplicatia ar citi `enc.v1.…` drept credentiala si
-- l-ar trimite asa la toti furnizorii, tacut — chiar defectul din 15.08.2026, cand 21 de
-- citiri ramasesera neconvertite si GA, GMC, OLX, SMSO, Notice, Trendyol si SMTP
-- expediau sirul criptat pe post de cheie.
--
-- ═══ CE ATINGE ═══
--
-- Doar `public.genereaza_schema_baseline()`: o sectiune noua, emisa DUPA constrangeri
-- (ca sa existe cheia primara pe care se sprijina `on conflict do nothing`) si inainte
-- de indexuri. Randurile ies ordonate dupa (coloana, cale), deci fisierul ramane
-- determinist si `--check` continua sa insemne ceva.
--
-- ⚠ NU se adauga niciun alt tabel. Comenzile, magazinele si jurnalele sunt date ale
-- clientilor; `catalog_murdar`, `catalog_rezumat_murdar` si `catalog_cuvinte_murdar`
-- sunt cozi de invalidare (`business_id` + `marcat_la`), adevarate doar in clipa scrierii.
-- `campuri_secrete` e singurul tabel al carui CONTINUT e parte din intelesul schemei.
--
-- ⚠ E IDEMPOTENTA de doua ori: `create or replace` pe functie, iar randurile pe care le
-- emite ea poarta `on conflict do nothing`.
--
-- ⚠ Dupa aplicare se REGENEREAZA baseline-ul: fisierul se schimba in doua feluri deodata
-- — corpul functiei (care e si el dumpat) si sectiunea noua de randuri. Textul de mai jos
-- e DECUPAT din baseline dupa regenerare, deci e chiar ce ruleaza in productie.

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
$function$;
