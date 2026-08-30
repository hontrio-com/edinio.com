-- ═══════════════════════════════════════════════════════════════════════════
-- O pana la ei nu mai inchide loturile ca esuate
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ O SINGURA PANA DE SASE MINUTE OMORA TOATE LOTURILE TUTUROR MAGAZINELOR (26.08.2026)
--
-- Contorul `poll_errors` e per lot, si asta e corect. Dar CAUZA e comuna: cand About You da 5xx
-- sau 429, TOATE loturile deschise ale TUTUROR magazinelor esueaza la aceeasi interogare, in
-- aceeasi rulare a cronului. Cronul merge din minut in minut, pragul era 6 — deci sase minute de
-- indisponibilitate la ei inchideau ca `failed` tot ce era deschis in platforma.
--
-- Iar selectia de sondare exclude `failed`. Deci loturile alea nu mai erau interogate NICIODATA,
-- desi la About You puteau fi de mult `completed`.
--
-- ⚠ 429 / 5xx / retea NU SPUN NIMIC DESPRE LOT. Singurele care il pot inchide sunt un raspuns
-- explicit de esec de la ei, sau un 4xx permanent (lot necunoscut, cheie invalidata).
--
-- ⚠ CE PUNE LOCUL PRAGULUI: o AMANARE care creste. Lotul ramane deschis, dar nu mai e interogat
-- la fiecare minut — altfel ar lovi in continuu o limita de rata deja atinsa. Si dupa un ceas de
-- esecuri de transport se scrie o data, tare, ca omul sa afle ca ceva nu merge la ei.

alter table public.aboutyou_batches
  add column if not exists next_poll_at timestamp with time zone,
  add column if not exists tranzient_de_la timestamp with time zone,
  add column if not exists alarma_scrisa_la timestamp with time zone;

comment on column public.aboutyou_batches.next_poll_at is
  'Cand se mai poate interoga lotul. Amanare care creste dupa esecuri de TRANSPORT, ca sa nu lovim in continuu o limita de rata.';
comment on column public.aboutyou_batches.tranzient_de_la is
  'De cand dureaza sirul curent de esecuri de transport. Se sterge la primul raspuns bun.';
comment on column public.aboutyou_batches.alarma_scrisa_la is
  'Cand s-a scris ultima alarma pentru lotul asta. Fara ea, acelasi lot ar umple jurnalul la fiecare trecere.';

-- ⚠ Indexul urmeaza CHIAR interogarea de sondare: loturile deschise ale unui magazin, cele mai
-- vechi intai, sarind peste cele amanate. Fara `next_poll_at` in el, amanarea s-ar citi abia
-- dupa ce randurile sunt aduse.
drop index if exists public.aboutyou_batches_deschise_idx;
create index if not exists aboutyou_batches_deschise_idx
  on public.aboutyou_batches (business_id, submitted_at)
  where status in ('pending', 'processing', 'retry');

notify pgrst, 'reload schema';
