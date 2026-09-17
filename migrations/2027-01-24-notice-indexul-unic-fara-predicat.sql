-- notice.ro: indexul unic din migratia de ieri facea cronul de raspunsuri sa NU scrie nimic, niciodata.
--
-- ⚠⚠ CE ERA GRESIT. `2027-01-23-notice-raspunsurile-se-citesc-o-singura-data.sql` a facut indexul
-- PARTIAL (`where provider_id is not null`). Scrierea din cod e un upsert PostgREST cu
-- `onConflict: "business_id,provider_id"`, iar PostgREST genereaza `ON CONFLICT (business_id, provider_id)`
-- FARA predicat. Postgres nu poate potrivi un index partial fara predicatul lui, deci raspunde:
--
--     ERROR 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- MASURAT pe productie pe 17.09.2026, cu `insert ... select ... where false on conflict (...) do nothing`
-- (nu scrie nimic, dar Postgres face potrivirea indexului). Fiecare raspuns citit de cron ar fi cazut
-- aici, iar probele treceau verde fiindca foloseau o baza falsa, care accepta orice upsert.
--
-- ⚠ Si motivul scris ieri pentru predicat era fals: „un index unic obisnuit le-ar fi ingaduit unul singur
-- pe magazin" randurilor fara id. Nu: intr-un index unic, NULL-urile sunt DISTINCTE (`indnullsnotdistinct`
-- = false, implicitul), deci oricate randuri fara `provider_id` incap langa acelasi magazin.
--
-- `notice_inbox` avea ZERO randuri, deci indexul nou nu poate intalni dubluri.

drop index if exists public.notice_inbox_furnizor_unic_idx;

create unique index if not exists notice_inbox_furnizor_unic_idx
  on public.notice_inbox (business_id, provider_id);

notify pgrst, 'reload schema';
