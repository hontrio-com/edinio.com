-- ═══════════════════════════════════════════════════════════════════════════
-- ORACOLUL DE DECRIPTARE, INCHIS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `privat.decripteaza(text)` e SECURITY DEFINER si putea fi chemata de `anon`.
-- Adica: dai un text cifrat, primesti textul in clar. Dovedit pe productie,
-- inainte de reparatie:
--
--     set local role anon;
--     select privat.decripteaza(<cifrat>);   -->  SECRET-DE-PROBA-123
--
-- Singurul lucru care statea intre asta si internet era ca schema `privat` nu e in
-- „Exposed schemas" din panoul Supabase — adica un comutator, nu o aparare.
--
-- ⚠ CAPCANA CARE M-A PACALIT PRIMA DATA: `revoke ... from anon` NU FACE NIMIC.
--
-- Functiile fara ACL explicit au `EXECUTE` acordat lui **PUBLIC** din oficiu.
-- `aclexplode(acldefault(...))` le arata ca acordate lui `anon` si
-- `authenticated`, deci pare ca ai revocat de la cine trebuie — dar grantul catre
-- PUBLIC ramane si functia se cheama in continuare. Verificat:
--
--     dupa `revoke ... from anon`          -> has_function_privilege('anon',...) = t
--     dupa `revoke ... from public`        -> f
--
-- Deci se revoca de la PUBLIC, si abia apoi se acorda inapoi cui trebuie.
revoke execute on function privat.decripteaza(text) from public, anon, authenticated;
revoke execute on function privat.cripteaza(text)   from public, anon, authenticated;
revoke execute on function privat.cheie_integrari() from public, anon, authenticated;

grant execute on function privat.decripteaza(text) to service_role;
grant execute on function privat.cripteaza(text)   to service_role;
grant execute on function privat.cheie_integrari() to service_role;

-- ── Ce NU se atinge, si de ce ────────────────────────────────────────────────
--
-- `privat.cripteaza_rand` si `privat.decripteaza_config` raman accesibile: vederea
-- `public.store_settings` are `security_invoker = true`, deci declansatoarele ei de
-- scriere si expresiile de citire ruleaza CU DREPTURILE UTILIZATORULUI. Fara ele,
-- pagina de setari s-ar rupe.
--
-- Nu slabesc nimic: `decripteaza_config` e INVOKER, deci nu poate face mai mult
-- decat apelantul — iar de acum apelantul nu mai poate decripta. `cripteaza_rand`
-- e oracol de CRIPTARE, care nu scurge nimic.
--
-- Verificat pe productie, in tranzactie anulata, DUPA revocarea adevarata:
--   citire prin vedere  -> enc.v1.wwQECQAC0m0  (neschimbat: nu decripta nici inainte)
--   scriere prin vedere -> a mers, si valoarea e criptata in tabelul real
--   anon -> privat.decripteaza -> permission denied for function decripteaza
