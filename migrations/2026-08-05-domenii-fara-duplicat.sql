-- ============================================================================
-- SCAZUT — Un domeniu, un singur rand pe magazin (audit 05.08.2026, constatarea 24)
--
-- PROBLEMA:
--   PATCH /api/admin/domain-orders nu se uita la starea ANTERIOARA a comenzii
--   (o citea, dar nu o folosea), deci orice trecere prin status=completed mai
--   insera un rand in `domains`. Cum acelasi PATCH trimite si admin_notes,
--   salvarea unei simple note pe o comanda deja finalizata producea al doilea
--   rand, cu alt expiry_date calculat din now(): doua scadente contradictorii
--   pentru acelasi domeniu, afisate clientului in panoul lui.
--   In productie `domains` are doar PK pe id si doua FK-uri — niciun UNIQUE.
--
-- REPARATIA DE FOND e in cod (garda pe tranzitie + scriere idempotenta +
-- expiry_date numarat de la data platii, nu de la now()). Indexul de mai jos e a
-- doua plasa, ca o regresie viitoare sa nu poata scrie duplicatul in tacere.
--
-- NU E APLICATA. Codul NU depinde de ea: face intai select, apoi update sau
-- insert, tocmai ca sa mearga si fara constrangere (`.upsert({onConflict})` ar
-- fi cazut cu 42P10 cat timp indexul lipseste).
--
-- INAINTE de aplicare: indexul esueaza daca exista deja duplicate. Verifica si
-- curata:
--   select business_id, domain, count(*), array_agg(id order by created_at)
--     from public.domains group by 1,2 having count(*) > 1;
--   -- pastreaza randul cel mai vechi, sterge restul dupa ce confirmi
--   -- expiry_date-ul corect al domeniului.
-- ============================================================================

create unique index if not exists domains_business_domain_key
  on public.domains (business_id, domain);

-- APLICATA in productie pe 05.08.2026, dupa deploy, cu verificarea de mai sus rulata.
