-- Suport clienti: chatul din magazin (Tidio, tawk.to, Intercom, Zendesk) - 22.11.2026.
--
-- Aplicata pe baza DEMO pe 22.11.2026 si in PRODUCTIE pe 24.11.2026 (17:27 RO, „suport_clienti”), inaintea
-- codului. Pana atunci a stat in `docs/suport-clienti/`, trecuta in `IN_ASTEPTARE` din
-- `scripts/verifica-tipuri-db.mjs`; schema de referinta a fost regenerata in acelasi commit.
--
-- Planul si fisa: `docs/suport-clienti/PLAN.md`.
--
-- ⚠ SE APLICA INAINTE DE DEPLOY. `suport_config` intra in selectul antetului vitrinei
-- (`incarcaAntetMagazin`, caile `sp_*`). PostgREST respinge INTREAGA interogare cand o coloana lipseste: cu
-- codul pusat inaintea migratiei, antetul ar cadea la fiecare vizita pe citirea de rezerva (fara chat,
-- fara theMarketer si fara setarile conturilor).
--
-- Aditiva: o coloana de configurare si trei campuri secrete. Codul vechi nu o atinge.

-- ---------------------------------------------------------------------------
-- Configurarea, pe TABELUL privat (vederea se regenereaza din el)
-- ---------------------------------------------------------------------------

alter table privat.store_settings
  add column if not exists suport_config jsonb;

comment on column privat.store_settings.suport_config is
  'Chatul de suport din magazin: {activ, furnizor (tidio|tawkto|intercom|zendesk), conturi{tidio{cheie}, '
  'tawkto{proprietate,widget}, intercom{app,regiune}, zendesk{cheie,kid}}, aspect{buton,pozitie,incarcare,'
  'pe_telefon,la_comanda,text}, date{identitate,pagina,comanda}, tawkto_cheie_api (secret), intercom_secret '
  '(secret), zendesk_secret (secret), verificat_la}. Identificatorii din `conturi` sunt PUBLICI (stau in pagina '
  'vizitatorului); secretele semneaza identitatea clientului cu cont. Vezi src/lib/suport/config.ts.';

-- ⚠ Numele sunt IDENTICE in `CAMPURI_SECRETE` (src/lib/integrari/secrete.ts) si in `SECRETE_SUPORT`
-- (src/lib/suport/config.ts). Stau la PRIMUL NIVEL al obiectului: criptarea lucreaza pe campuri de la primul nivel.
insert into privat.campuri_secrete (coloana, cale) values
  ('suport_config', 'tawkto_cheie_api'),
  ('suport_config', 'intercom_secret'),
  ('suport_config', 'zendesk_secret')
on conflict do nothing;

-- ⚠ OBLIGATORIU dupa orice modificare de coloane sau de campuri secrete.
select privat.reconstruieste_store_settings();
select privat.reconstruieste_store_settings_upd();

notify pgrst, 'reload schema';
