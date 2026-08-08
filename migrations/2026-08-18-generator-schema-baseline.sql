-- ═══════════════════════════════════════════════════════════════════════════
-- GENERATORUL DE BASELINE: schema productiei, scrisa ca SQL aplicabil
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `migrations/` erau petice incrementale peste o schema care n-a fost niciodata
-- scrisa in Git. Masurat la 18.08.2026: 49 din 58 de tabele din productie n-aveau
-- NICIUN `create table` in repo — intre ele `products`, `orders`, `businesses`,
-- `users_profile`. O baza goala plus tot repo-ul NU producea Edinio.
--
-- Se ruleaza cu `bash scripts/schema-baseline.sh`, care scrie
-- `migrations/000-schema-baseline.sql`. Vezi antetul scriptului pentru chei.
--
-- ⚠ ACOPERA AMANDOUA SCHEMELE APLICATIEI: `public` SI `privat`.
--
-- Prima forma acoperea doar `public` si iesise un baseline INAPLICABIL:
-- `public.store_settings` e o VEDERE care cheama `privat.decripteaza_config`, iar
-- tabelul adevarat, criptat, e `privat.store_settings`. Un baseline care nu se
-- poate aplica e mai rau decat niciunul: linisteste pe degeaba.
--
-- NU acopera: schemele Supabase (`auth`, `storage`, `vault`, `realtime`) — le pune
-- platforma la crearea proiectului; si SECRETUL din Vault cu care se decripteaza
-- cele 39 de campuri. Pe o baza noua vederea se creeaza, dar nu decripteaza pana
-- nu pui cheia.
create or replace function public.genereaza_schema_baseline()
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
-- PostgREST taie la 8s CHIAR SI pentru `service_role` (57014, masurat: 8,15s).
-- Setarea e locala functiei si dispare odata cu ea, deci nu slabeste nimic
-- altundeva. Partea inceata e `information_schema.column_privileges`, si nu se
-- poate ocoli: granturile pe coloana sunt chiar apararea pe care baseline-ul
-- trebuie s-o poarte mai departe.
set statement_timeout to '120s'
as $fn$
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

  select coalesce(string_agg(format('create extension if not exists %I with schema %I;',
           e.extname, n.nspname), E'\n' order by e.extname), '')
    into p from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname <> 'plpgsql';
  o := o || E'-- ---- EXTENSII ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('create type %I.%I as enum (%s);', n.nspname, t.typname, vals),
           E'\n' order by n.nspname, t.typname), '')
    into p
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
  cross join lateral (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as vals
                        from pg_enum e where e.enumtypid = t.oid) v
  where n.nspname = any(c_scheme) and t.typtype = 'e';
  o := o || E'-- ---- TIPURI ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('create sequence if not exists %I.%I;', schemaname, sequencename),
           E'\n' order by schemaname, sequencename), '')
    into p from pg_sequences where schemaname = any(c_scheme);
  o := o || E'-- ---- SECVENTE ----\n' || p || E'\n\n';

  -- Functiile INAINTEA tabelelor: pot aparea in `default`-uri si in declansatoare.
  -- `check_function_bodies = off` din antet face ca referintele lor la tabele inca
  -- inexistente sa nu opreasca aplicarea.
  select coalesce(string_agg(pg_get_functiondef(pr.oid) || ';', E'\n\n'
           order by n.nspname, pr.proname, pr.oid), '')
    into p from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
   where n.nspname = any(c_scheme) and pr.prokind in ('f', 'p');
  o := o || E'-- ---- FUNCTII ----\n' || p || E'\n\n';

  select coalesce(string_agg(ddl, E'\n\n' order by schema, tabela), '') into p
  from (
    select n.nspname as schema, c.relname as tabela,
           format('create table if not exists %I.%I (%s%s);', n.nspname, c.relname, E'\n  ', cols) as ddl
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join lateral (
        select string_agg(
                 format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                        case when a.attidentity <> '' then ' generated ' ||
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
  o := o || E'-- ---- TABELE ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('alter table %I.%I add constraint %I %s;',
           n.nspname, r.relname, c.conname, pg_get_constraintdef(c.oid)), E'\n'
           order by case c.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end,
                    n.nspname, r.relname, c.conname), '')
    into p from pg_constraint c
    join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace
   where n.nspname = any(c_scheme) and r.relkind = 'r';
  o := o || E'-- ---- CONSTRANGERI ----\n' || p || E'\n\n';

  select coalesce(string_agg(pg_get_indexdef(i.indexrelid) || ';', E'\n' order by n.nspname, ic.relname), '')
    into p from pg_index i join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid join pg_namespace n on n.oid = tc.relnamespace
   where n.nspname = any(c_scheme)
     and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid);
  o := o || E'-- ---- INDEXURI ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('create or replace view %I.%I%s as%s%s', schemaname, viewname,
           case when viewname = 'store_settings' then ' with (security_invoker = true)' else '' end,
           E'\n', definition), E'\n\n' order by schemaname, viewname), '')
    into p from pg_views where schemaname = any(c_scheme);
  o := o || E'-- ---- VEDERI (security_invoker pe store_settings NU e optional) ----\n' || p || E'\n\n';

  select coalesce(string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' order by n.nspname, c.relname, t.tgname), '')
    into p from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = any(c_scheme) and not t.tgisinternal;
  o := o || E'-- ---- DECLANSATOARE ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('alter table %I.%I enable row level security;', n.nspname, c.relname),
           E'\n' order by n.nspname, c.relname), '')
    into p from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = any(c_scheme) and c.relkind = 'r' and c.relrowsecurity;
  o := o || E'-- ---- RLS ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('create policy %I on %I.%I as %s for %s to %s%s%s;',
           pol.policyname, pol.schemaname, pol.tablename, pol.permissive, pol.cmd,
           array_to_string(pol.roles, ', '),
           case when pol.qual is null then '' else ' using (' || pol.qual || ')' end,
           case when pol.with_check is null then '' else ' with check (' || pol.with_check || ')' end),
           E'\n' order by pol.schemaname, pol.tablename, pol.policyname), '')
    into p from pg_policies pol where pol.schemaname = any(c_scheme);
  o := o || p || E'\n\n';

  select coalesce(string_agg(format('grant usage on schema %I to %I;', nspname, r),
           E'\n' order by nspname, r), '')
    into p from pg_namespace n
  cross join lateral (select unnest(array['anon','authenticated','service_role']) as r) g
   where n.nspname = any(c_scheme) and has_schema_privilege(g.r, n.oid, 'USAGE');
  o := o || E'-- ---- ACCES LA SCHEME ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('grant %s on table %I.%I to %I;',
           privilege_type, table_schema, table_name, grantee),
           E'\n' order by table_schema, table_name, grantee, privilege_type), '')
    into p from information_schema.role_table_grants
   where table_schema = any(c_scheme) and grantee in ('anon', 'authenticated', 'service_role');
  o := o || E'-- ---- GRANTURI PE TABELE ----\n' || p || E'\n\n';

  -- Granturile pe COLOANA sunt chiar apararea impotriva ridicarii de privilegii
  -- prin `role`: RLS verifica RANDURI, nu COLOANE, iar un GRANT pe tabel anuleaza
  -- un REVOKE pe coloana. Un baseline fara ele ar reface baza cu gaura prin care
  -- orice utilizator isi putea da `role: admin`.
  select coalesce(string_agg(format('grant %s (%I) on table %I.%I to %I;',
           privilege_type, column_name, table_schema, table_name, grantee),
           E'\n' order by table_schema, table_name, column_name, grantee, privilege_type), '')
    into p from information_schema.column_privileges cp
   where cp.table_schema = any(c_scheme) and cp.grantee in ('anon', 'authenticated', 'service_role')
     and not exists (select 1 from information_schema.role_table_grants g
                      where g.table_schema = cp.table_schema and g.table_name = cp.table_name
                        and g.grantee = cp.grantee and g.privilege_type = cp.privilege_type);
  o := o || E'-- ---- GRANTURI PE COLOANA (RLS verifica RANDURI, nu COLOANE) ----\n' || p || E'\n\n';

  select coalesce(string_agg(format('grant execute on function %I.%I(%s) to %I;',
           n.nspname, pr.proname, pg_get_function_identity_arguments(pr.oid), a.grantee),
           E'\n' order by n.nspname, pr.proname, a.grantee), '')
    into p from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    cross join lateral aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) x
    cross join lateral (select pg_get_userbyid(x.grantee) as grantee) a
   where n.nspname = any(c_scheme) and x.privilege_type = 'EXECUTE'
     and a.grantee in ('anon', 'authenticated', 'service_role');
  o := o || E'-- ---- GRANTURI PE FUNCTII ----\n' || p || E'\n\n'
         || E'notify pgrst, ''reload schema'';\n';

  return o;
end;
$fn$;

-- Doar `service_role`. Nu intoarce niciun rand de date, dar e harta completa a
-- apararii (politici, granturi pe coloana), si n-are ce cauta la `anon`.
revoke all on function public.genereaza_schema_baseline() from public, anon, authenticated;
grant execute on function public.genereaza_schema_baseline() to service_role;

notify pgrst, 'reload schema';
