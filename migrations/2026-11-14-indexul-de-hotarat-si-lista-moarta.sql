-- ═══════════════════════════════════════════════════════════════════════════
-- Indexul „de hotarat" nu mai acoperea interogarea pentru care fusese facut
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ GASIT DE O MATURARE, DUPA CE INDREPTASEM CODUL DE TREI ORI (26.08.2026)
--
-- Indexul avea predicatul vechi:
--
--     where claim_status in ('Created', 'WaitingInAction', 'InAnalysis')
--
-- iar panoul intreaba de-acum:
--
--     where claim_status is null or claim_status = 'WaitingInAction'
--
-- ⚠ CELE DOUA NU SE MAI INTALNESC. Postgres poate folosi un index partial numai cand poate
-- DOVEDI ca interogarea implica predicatul. `= 'WaitingInAction'` implica lista veche, deci acea
-- jumatate ar fi mers — dar `claim_status is null` NU, si cum cele doua stau sub un `or`,
-- planificatorul nu mai poate folosi indexul DELOC. Ramasese un obiect care costa la fiecare
-- scriere si nu ajuta la nicio citire.
--
-- ⚠ SI NUMELE MINTEA. Cine face `\d trendyol_claims` peste sase luni citeste „de_hotarat" si
-- vede o lista care spune ca `Created` si `InAnalysis` asteapta o hotarare a comerciantului —
-- adica exact regula scoasa azi: pe `Created` marfa e inca la client, iar pe `InAnalysis` se
-- uita EI.
--
-- ⚠ Predicatul nou e chiar interogarea. Inclusiv `is null`, care nu e o scapare: o cerere a carei
-- stare n-am putut-o citi se ARATA anume, ca sa nu dispara din lista.

drop index if exists public.trendyol_claims_de_hotarat_idx;

create index if not exists trendyol_claims_de_hotarat_idx
  on public.trendyol_claims (business_id, claim_date desc)
  where claim_status is null or claim_status = 'WaitingInAction';

comment on index public.trendyol_claims_de_hotarat_idx is
  'Acopera lista „Așteaptă răspunsul tău" din panou: `claim_status is null or = WaitingInAction`, ordonata pe claim_date desc. Predicatul TREBUIE sa ramana identic cu filtrul din retururiTrendyol, altfel indexul nu mai poate fi folosit.';

notify pgrst, 'reload schema';
