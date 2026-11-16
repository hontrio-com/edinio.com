-- ═══════════════════════════════════════════════════════════════════════════
-- tbi bank: trecerea pe API-ul Fusion Pay, 16.11.2026
--
-- tbi i-a trimis lui VetDepo date pentru API-ul lor NOU (Fusion Pay: reseller_code, reseller_key si o
-- cheie de criptare AES), nu pentru cel vechi, „eCommerce" (store_id, utilizator, parola si chei RSA),
-- pe care fusese facuta integrarea in 15.11.2026. Integrarea s-a mutat cu totul pe Fusion Pay.
-- Fisa: `docs/plati/TBI.md`.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. Codul nou citeste si scrie coloanele de mai jos din `tbi_cereri`
-- (`select *`, `tbi_order_id`, `tbi_token`, filtrul pe `jetoane_rambursare`); PostgREST respinge
-- intreaga interogare cand o coloana lipseste.
--
-- Aditiva pentru tabel (coloane nullable sau cu implicit). Configurarile in forma VECHE nu mai pot
-- merge cu codul nou (alte campuri, alta criptare), deci se sterg: la 16.11.2026 niciun magazin nu
-- avea `tbi_config`. Se numara inainte de aplicare.
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. Secretele configurarii: reseller_key si cheie_criptare, in locul parolei si cheii RSA
-- ---------------------------------------------------------------------------

delete from privat.campuri_secrete
 where coloana = 'tbi_config' and cale in ('password', 'cheie_privata');

insert into privat.campuri_secrete (coloana, cale) values
  ('tbi_config', 'reseller_key'),
  ('tbi_config', 'cheie_criptare')
on conflict do nothing;

/* Configurarile API-ului vechi: fara `reseller_code` nu mai inseamna nimic pentru cod. */
update privat.store_settings
   set tbi_config = null
 where tbi_config is not null
   and not (tbi_config ? 'reseller_code');

comment on column privat.store_settings.tbi_config is
  'tbi bank (Fusion Pay): {enabled, sandbox, reseller_code, reseller_key (secret), cheie_criptare (secret), '
  'suma_minima, suma_maxima, categorie, banner_produs}. cheie_criptare = „encryption key” din emailul tbi '
  '(AES-256-CTR cu cheia trecuta prin SHA-256). Vezi src/lib/tbi/config.ts.';

/* Vederea si declansatorul ei se refac din `privat.campuri_secrete`. */
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

-- ---------------------------------------------------------------------------
-- 2. Cererile: ce intoarce tbi la inregistrare, si ce trebuie pentru rambursari si interogari
-- ---------------------------------------------------------------------------

alter table public.tbi_cereri
  add column if not exists tbi_order_id bigint,
  add column if not exists tbi_token text,
  add column if not exists contract text,
  add column if not exists jetoane_rambursare text[] not null default '{}'::text[],
  add column if not exists interogata_la timestamptz;

comment on column public.tbi_cereri.tbi_order_id is
  'order_id intors de RegisterApplication (id-ul cererii LA TBI, nu al nostru). Cu tbi_token, pentru '
  'GetApplicationStatus, loanCancellation si loanRefund.';
comment on column public.tbi_cereri.tbi_token is
  'token intors de RegisterApplication. Nu se citeste din browser (privilegiu pe coloana mai jos).';
comment on column public.tbi_cereri.contract is
  'Numarul contractului de credit la tbi (ContractNumber din veste), cand il trimit.';
comment on column public.tbi_cereri.jetoane_rambursare is
  'Amprentele SHA-256 ale jetoanelor din refundLink, cate una pe rambursare ceruta. Vestile despre '
  'credit vin mai departe pe jeton_hash.';
comment on column public.tbi_cereri.interogata_la is
  'Ultima intrebare a starii la tbi (cronul tbi-reconciliere), cu sau fara schimbare.';
comment on column public.tbi_cereri.adresa_cerere is
  'Pagina tbi pe care completeaza clientul cererea (url din RegisterApplication).';
comment on table public.tbi_cereri is
  'Cererile de finantare tbi bank (Fusion Pay), cate una pe incercare. id = orderid trimis la tbi. '
  'jeton_hash = SHA-256 al jetonului din statusURL. istoric = vestile si operatiile (stare, motiv, clipa), '
  'fara date personale. Vezi src/lib/tbi/ si docs/plati/TBI.md.';

create index if not exists tbi_cereri_jetoane_rambursare_idx
  on public.tbi_cereri using gin (jetoane_rambursare);

/*
 * ⚠ JETOANELE NU SE CITESC DIN BROWSER. Panoul citeste cererile pe server (clientul de sistem);
 * proprietarul isi vede randurile prin politica de mai jos, dar fara `tbi_token` si fara amprente.
 * Un privilegiu pe tabel ar acoperi orice privilegiu pe coloana, deci se ia intreg si se da inapoi
 * pe coloane.
 */
revoke select on table public.tbi_cereri from anon, authenticated;
grant select (
  id, business_id, order_id, order_number, mediu, suma, stare, motiv, adresa_cerere,
  ultima_veste_la, anulare_ceruta_la, istoric, created_at, updated_at,
  tbi_order_id, contract, interogata_la
) on table public.tbi_cereri to authenticated;

notify pgrst, 'reload schema';
