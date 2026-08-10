-- Sanatatea domeniului custom, ca sa nu mai redirectam clientii catre un domeniu mort.
--
-- DE CE.
-- `src/proxy.ts` redirectiona 307 de pe edinio.com/<slug> catre `custom_domain`
-- pe baza unei singure conditii: coloana e nenula si magazinul e publicat.
-- Nimic nu verifica daca domeniul chiar raspunde. Consecinta masurata pe
-- 10.08.2026: `okai.ro` era mort (ECONNREFUSED), iar magazinul `okxishop`,
-- PUBLICAT si platit, era complet inaccesibil — proxy-ul trimitea activ
-- vizitatorii spre domeniul mort, deci nici macar adresa de platforma nu mai
-- functiona ca rezerva. Acelasi mecanism a tinut eSafe offline pe TOATE
-- adresele cat timp esafe.ro nu avea zona DNS.
--
-- `null` inseamna „inca neverificat", NU „stricat": proxy-ul redirectioneaza in
-- continuare pe null, deci un domeniu nou conectat nu asteapta cronul. Doar un
-- `false` DOVEDIT opreste redirectul.

alter table public.businesses
  add column if not exists custom_domain_healthy boolean,
  add column if not exists custom_domain_checked_at timestamptz;

comment on column public.businesses.custom_domain_healthy is
  'Domeniul custom chiar serveste magazinul (verificat de cron/domains-reconcile). null = neverificat inca; false = dovedit mort, proxy nu mai redirectioneaza catre el.';
comment on column public.businesses.custom_domain_checked_at is
  'Cand a fost verificata ultima oara sanatatea domeniului custom.';

-- GRANTURI PE COLOANE, nu pe tabel.
--
-- `businesses` are deja granturi la nivel de coloana (anon: SELECT pe 30 din 34;
-- authenticated: UPDATE pe 27, deliberat FARA `custom_domain`). Un
-- `grant select on public.businesses` ar sterge exact distinctia aia: GRANT pe
-- tabel bate REVOKE pe coloana. Deci enumeram coloanele.
grant select (custom_domain_healthy, custom_domain_checked_at) on public.businesses to anon;
grant select (custom_domain_healthy, custom_domain_checked_at) on public.businesses to authenticated;

-- UPDATE: NIMENI in afara de service_role (care are deja drepturi depline).
-- Sanatatea o constata cronul din masuratori; un comerciant nu si-o poate
-- declara singur, altfel steagul ar deveni exact minciuna pe care o inlocuieste.

-- Fara asta, PostgREST serveste granturile din cache si coloanele noi apar ca
-- inexistente pana la urmatorul reload.
notify pgrst, 'reload schema';
