-- ═══════════════════════════════════════════════════════════════════════════
-- DOUA ANUNTURI PENTRU ACELASI PRODUS: SE INTREABA OMUL, NU SE ALEGE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (01.09.2026)
--
-- `external_id` nu are constrangere de unicitate la OLX, iar Edinio chiar a avut o fereastra in
-- care un `POST` reusit urmat de o interogare anti-duplicat picata ducea la un al doilea `POST`.
-- Deci pentru comercianti vechi pot exista DOUA anunturi cu acelasi `external_id`.
--
-- Cand produsul e NEVANDABIL sau STERS, raspunsul e limpede si il stim deja: niciunul n-are voie
-- sa ramana la vanzare. Dar cand produsul e VANDABIL, intrebarea „care dintre ele e cel bun?" nu
-- are raspuns tehnic:
--
--     anunt 111 — activ, 1.240 de vizualizari, doua conversatii, promovare platita pana pe 7 sept.
--     anunt 222 — activ, 17 vizualizari, nimic
--
-- Adoptarea lua `candidati[0]`, adica pe cel intors primul de ei. Iar de-acolo incolo celalalt era
-- rescris la fiecare trecere cu datele produsului, sau ramanea sa se vanda in paralel.
--
-- ⚠ NU SE ALEGE SINGUR. Un cron n-are cum sa stie ca 111 poarta istoricul, mesajele si banii
-- cheltuiti pe promovare. Se scrie conflictul, se opreste publicarea pe produsul acela, si omul
-- vede in ecran ce are de ales — o data, si pentru totdeauna.
--
-- ⚠ Se pune pe `olx_adverts`, nu intr-o tabela noua: randul exista deja, are cheia unica pe
-- `(business_id, offer_id)`, si nu vrem inca o tabela de tinut in pas cu stergerile produsului.

alter table public.olx_adverts
  add column if not exists conflict_la    timestamptz,
  add column if not exists conflict_iduri jsonb;

comment on column public.olx_adverts.conflict_la is
  'Clipa in care s-au gasit doua anunturi vii cu acelasi external_id, pe un produs VANDABIL. '
  'Cat timp e scrisa, sincronizarea nu atinge anunturile: alege omul.';
comment on column public.olx_adverts.conflict_iduri is
  'Id-urile anunturilor gasite la ei, in ordinea in care le-au intors. Se arata omului ca sa aleaga.';

-- Randurile in conflict se cauta pe magazin, si sunt putine: un index partial e destul.
create index if not exists olx_adverts_conflict_idx
  on public.olx_adverts (business_id)
  where conflict_la is not null;

notify pgrst, 'reload schema';
