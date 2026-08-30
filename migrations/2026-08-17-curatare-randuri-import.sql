-- Randurile de stagiere ale importurilor incheiate.
--
-- `product_import_rows` stageaza FIECARE rand al fisierului importat si nu se
-- curata niciodata. Masurat inainte: 8.331 de randuri, 25 MB.
--
-- Istoricul nu e insa partea grava. Bomba e feedul de stocuri:
-- `stock-feed/runner.ts` stageaza un set COMPLET la fiecare rulare ORARA a
-- fiecarei surse. Azi zero surse configurate, dar cronul e deja programat — la
-- prima sursa reala, tabela ar fi crescut cu tot fisierul in fiecare ora, pentru
-- totdeauna. De aia curatarea intra in cod (`curataRandurileReusite`, chemata la
-- AMANDOUA punctele terminale ale importului), nu doar aici.
--
-- CE SE PASTREAZA: `failed` si `skipped`. Din ele se compune raportul de erori pe
-- care comerciantul il descarca din `/api/imports/[id]/error-report`; sterse, un
-- import cu 400 de randuri respinse ar fi ramas fara nicio explicatie.
--
-- CE SE STERGE: `created` si `updated` (produsul exista, id-ul lui e deja pe el,
-- randul nu mai are cititor) si `pending` din importuri INCHEIATE — alea sunt
-- orfane: `commitChunk` citeste `pending` numai cat timp jobul e `importing`, deci
-- randurile ramase de la un job anulat nu le mai atinge nimeni niciodata.
--
-- Rulat o data pe productie, 17.08.2026: 4.522 de randuri sterse, 3.809 ramase
-- (135 `failed` + 3.674 `skipped`). Spatiul de pe disc se reintoarce prin
-- autovacuum, la scrierile urmatoare; nu merita `vacuum full` si lock-ul lui.

delete from public.product_import_rows r
 using public.product_imports i
 where i.id = r.import_id
   and i.status in ('completed', 'completed_with_errors', 'failed', 'cancelled')
   and r.status in ('created', 'updated', 'pending');
