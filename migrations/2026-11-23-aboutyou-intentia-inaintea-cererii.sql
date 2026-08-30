-- ═══════════════════════════════════════════════════════════════════════════
-- ABOUT YOU A PRIMIT CEREREA, NOI AM UITAT `batchRequestId`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ FEREASTRA (27.08.2026)
--
--     POST catre About You  →  ei ACCEPTA  →  ne dau `batchRequestId`  →  INSERT ❌
--
-- De-acolo nu mai stim nimic despre soarta operatiei. `recordBatch` scrie de mult un
-- `critical` cu tot ce trebuie pentru o reluare de mana — dar sapte din opt chematori nici nu-i
-- citeau raspunsul, deci operatia raporta REUSITA. O expediere, o anulare sau un retur
-- „reusite" despre care nu se mai afla niciodata daca s-au intamplat.
--
-- ⚠ DE CE NU E DE AJUNS SA CITIM RASPUNSUL. Chiar citit, tot ramane o fereastra: intre clipa
-- in care ei accepta si clipa in care noi scriem. O reluare oarba de-acolo poate anula de doua
-- ori sau expedia de doua ori — deci nu se poate relua, dar nici nu se poate uita.
--
-- ⚠ CE SE SCHIMBA: intentia se scrie INAINTE de cerere.
--
--     INSERT `intentie` (fara id-ul lor)  →  POST  →  UPDATE cu id-ul lor
--
-- Cele trei feluri de a se opri sunt acum toate vizibile:
--   insertul pica    → cererea externa NU se mai face. Nimic nu s-a intamplat.
--   ei refuza        → randul se sterge. Nimic nu s-a intamplat.
--   updateul pica    → randul RAMANE pe `intentie`, cu `trimis_la` pus. Adica „am trimis si nu
--                      stiu ce a iesit" — starea care lipsea, si singura care cere un om.
--
-- ⚠ `batch_request_id` DEVINE NULABIL, si de aceea. Indexul unic ramane: in Postgres valorile
-- NULL sunt socotite distincte, deci oricate intentii deschise pot sta una langa alta.

alter table public.aboutyou_batches
  alter column batch_request_id drop not null;

alter table public.aboutyou_batches
  add column if not exists intent_id uuid,
  -- Clipa in care cererea externa chiar a plecat. `submitted_at` se pune la insert, deci pe
  -- randul de intentie inseamna „am hotarat sa trimit", nu „am trimis".
  add column if not exists trimis_la timestamp with time zone;

create unique index if not exists aboutyou_batches_intent_uidx
  on public.aboutyou_batches (business_id, intent_id)
  where intent_id is not null;

-- Cautarea intentiilor ramase deschise, pentru alarma. Partial: sunt putine si trecatoare.
--
-- ⚠ MASURAT LA APLICARE: pe cele 5 randuri de azi (o pagina), planificatorul alege `Seq Scan`,
-- si are dreptate. Indexul e pentru cand tabela creste; nu scrie nimeni ca „se foloseste acum".
-- Verificat pe productie cu `explain (costs off)`.
create index if not exists aboutyou_batches_intentii_idx
  on public.aboutyou_batches (business_id, submitted_at)
  where status = 'intentie';

comment on column public.aboutyou_batches.intent_id is
  'Cheia intentiei scrise INAINTE de cererea catre About You. Randul cu status ''intentie'' si trimis_la ne-nul inseamna „am trimis si nu stim ce a iesit".';

notify pgrst, 'reload schema';
