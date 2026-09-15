-- `privat.pazeste_secretele` nu mai e executabila de oricine - 15.09.2026
--
-- ═══ CE S-A GASIT, SI CUM ═══
--
-- Remasurand clasa periculoasa cu chiar interogarea scrisa pe 19.08.2026 (functii SECURITY DEFINER
-- pe care `anon` sau `authenticated` le pot executa), au iesit SASE. Cinci erau cunoscute si
-- hotarate atunci: `catalog_cauta`, `catalog_pagina`, `catalog_randuri` (RPC-urile publice ale
-- vitrinei), `is_admin` (n-are argumente si citeste `auth.uid()`, deci raspunde doar despre cel
-- care o cheama) si `privat.cripteaza_rand` (oracol de CRIPTARE, lasat dinadins, scris ca atare).
--
-- A SASEA nu e in nicio lista: `privat.pazeste_secretele`, cu **ACL IMPLICIT = PUBLIC**, adica
-- nerevocata niciodata. A aparut dupa audit, in `2026-09-28-paza-secretelor.sql`.
--
-- ═══ ⚠ CE PUTEA, SI CE NU ═══
--
-- NU e oracol de decriptare, si asta s-a citit in corpul ei, nu s-a presupus: amandoua argumentele
-- vin de la apelant, iar din baza citeste doar `privat.campuri_secrete`, adica LISTA de cai
-- secrete, nu valorile. Cine o cheama nu poate scoate din ea nimic ce n-a pus el.
--
-- Ce putea totusi, si de-aia se inchide:
--   * sa SCRIE in `public.error_logs`, cu drepturi de DEFINER, randuri `severity: critical` cu un
--     `business_id` la alegere. Jurnalul e al comerciantului; umplut de altcineva, el ascunde chiar
--     semnalele pentru care exista;
--   * sa afle, din `raise warning`, care cai de configurare sunt socotite secrete.
--
-- Singura aparare de pana acum era ca schema `privat` nu e in „Exposed schemas" la Supabase, adica
-- un COMUTATOR, nu o aparare. Exact ce scria si despre `decripteaza` in 19.08.
--
-- ═══ ⚠ DE CE E FARA NICIUN RISC ═══
--
-- Masurat inainte: NIMENI nu o mai cheama. Declansatorul `privat.store_settings_upd` o chema la
-- inceput, dar `2026-10-10-imbinare-atomica-config.sql` i-a rescris regula INAUNTRUL lui, si de
-- atunci functia e cod mort. Verificat in productie, peste toate functiile din `public` si `privat`:
-- zero definitii o mai pomenesc. Si zero referinte in `src/`.
--
-- ⚠ NU se sterge, se REVOCA. Stergerea ar fi si ea apararata de masuratoare, dar revocarea ajunge
-- pentru ce ne doare si se intoarce dintr-un rand daca ceva n-am vazut.
--
-- ═══ ⚠ DE CE SE REVOCA DE LA TOATE TREI ═══
--
-- Regula casei, platita pe 19.08 si inca o data pe 07.09: `revoke ... from anon` singur e o
-- operatie NULA pe o functie fara ACL explicit, fiindca `EXECUTE` e al lui `PUBLIC` din oficiu; iar
-- `revoke ... from public` singur nu atinge granturile EXPLICITE pe care `ALTER DEFAULT PRIVILEGES`
-- al lui Supabase le da lui `anon` si `authenticated` la fiecare functie noua. Doua cauze diferite,
-- aceeasi urmare, deci se revoca de la toate trei.

revoke execute on function privat.pazeste_secretele(jsonb, jsonb) from public, anon, authenticated;

-- ⚠ Rolul de serviciu il pastreaza: el e cel care ar chema-o daca vreodata se reia paza din afara
-- declansatorului, si el oricum ocoleste RLS, deci nu i se deschide nimic nou.
grant execute on function privat.pazeste_secretele(jsonb, jsonb) to service_role;

-- ⚠ Verificarea sta CHIAR IN MIGRATIE, nu in tinerea de minte a cuiva: `grant` si `revoke` nu
-- scartaie niciodata, iar pe 07.09 o migratie a „reusit" lasand in urma exact drepturile pe care
-- credea ca le scoate.
do $$
begin
  if has_function_privilege('anon', 'privat.pazeste_secretele(jsonb, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'privat.pazeste_secretele(jsonb, jsonb)', 'EXECUTE')
  then
    raise exception 'revocarea nu a prins: anon sau authenticated inca pot executa paza secretelor';
  end if;
  if not has_function_privilege('service_role', 'privat.pazeste_secretele(jsonb, jsonb)', 'EXECUTE')
  then
    raise exception 'rolul de serviciu a ramas fara drept de executie';
  end if;
end $$;
