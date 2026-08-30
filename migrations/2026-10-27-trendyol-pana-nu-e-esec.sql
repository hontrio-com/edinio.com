-- ══════════════════════════════════════════════════════════════════════════
-- O PANA A LOR NU E UN LOT ESUAT (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `pollOpenBatches` intreaba Trendyol ce s-a intamplat cu un lot trimis. Pana azi, ORICE
-- raspuns nereusit crestea acelasi contor:
--
--   if (isTrendyolError(res)) {
--     attempts + 1, status: attempts + 1 >= 6 ? "failed" : "retry"
--   }
--
-- Dar `isTrendyolError` prinde deopotriva:
--
--   429 / 500 / timeout / retea     -> NU stim nimic despre lot
--   4xx cu raspuns limpede          -> chiar ne spun ceva despre el
--
-- Deci sase indisponibilitati la rand inchideau lotul ca ESUAT, desi Trendyol putea sa-l fi
-- procesat cu succes. Comerciantul vedea produsele pe „eroare" fara sa fie nimic in neregula
-- cu ele, iar reconcilierea trebuia sa descopere singura adevarul, mai tarziu.
--
-- ⚠ SE DESPART CELE DOUA NUMARATORI. `attempts` ramane despre LOT — de cate ori ne-au dat un
-- raspuns care nu inseamna „gata". `poll_errors` e despre LEGATURA cu ei, si nu inchide
-- niciodata un lot: doar il aseaza mai rar la coada.
--
-- ⚠ Un lot acceptat de ei se inchide „failed" numai dupa un raspuns VALID care spune asta.

alter table public.trendyol_batches add column if not exists poll_errors int not null default 0;
alter table public.trendyol_batches add column if not exists next_poll_at timestamptz;

comment on column public.trendyol_batches.poll_errors is
  'Cate INTERBARI la rand au picat din vina legaturii (429, 5xx, retea). Nu inchide niciodata lotul.';
comment on column public.trendyol_batches.next_poll_at is
  'Nu se mai intreaba pana atunci. Se pune dupa o pana, ca sa nu batem la o usa inchisa.';

-- ⚠ Index partial pe loturile inca deschise: cele inchise sunt toate celelalte, si cresc
-- pentru totdeauna.
create index if not exists trendyol_batches_de_intrebat_idx
  on public.trendyol_batches (business_id, submitted_at)
  where status in ('pending', 'processing', 'retry');

notify pgrst, 'reload schema';
