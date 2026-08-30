-- ══════════════════════════════════════════════════════════════════════════
-- IMPORT: PRODUSUL POARTA RANDUL CARE L-A CREAT (25.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Scrierea unui produs importat are DOUA pasi care nu sunt in aceeasi tranzactie:
--
--   1. insert into products (...)
--   2. update product_import_rows set status='created', product_id=...
--
-- Daca al doilea pas pica — o pana de retea, o repornire a functiei, un timeout —
-- randul ramane `pending`. Trecerea urmatoare il ia de la capat si creeaza AL DOILEA
-- produs, identic. Comerciantul vede catalogul dublat si nu are de unde sa stie de ce.
--
-- ⚠ UNICITATEA CARE EXISTA DEJA NU AJUTA. `products_source_external_uidx` cere
-- `external_id`, iar importurile din fisier n-au asa ceva. Slugul se dedubleaza singur
-- inainte de scriere, deci al doilea produs primeste alt slug si trece nestingherit.
--
-- ⚠ SE REPARA CU O CHEIE DE IDEMPOTENTA, NU CU O TRANZACTIE DISTRIBUITA.
-- Alternativa era un RPC care sa faca ambii pasi in aceeasi tranzactie — corect in
-- teorie, dar ar fi mutat toata calea de import in SQL: mult risc pe un drum care merge,
-- pentru o pana care trebuie sa cada exact intre doua scrieri. Cheia costa o coloana.
--
-- Cu ea, reluarea nu mai POATE crea al doilea produs: se loveste de index, iar codul
-- recunoaste `23505` pe `products_import_row_uidx`, citeste produsul care exista deja
-- si marcheaza randul. Vezi `scrieProdusele` din `src/lib/import/committer.ts`.
--
-- ⚠ INDEX PARTIAL, dinadins: produsele care nu vin din import au `import_row_id` null,
-- iar `null` nu se ciocneste in unique — dar un index pe toata tabela ar fi purtat
-- degeaba zeci de mii de randuri goale.
--
-- Fara cheie straina catre `product_import_rows`: randurile de import se sterg dupa un
-- timp, iar produsul trebuie sa ramana. Coloana e o urma, nu o legatura.

alter table public.products add column if not exists import_row_id uuid;

create unique index if not exists products_import_row_uidx
  on public.products (import_row_id) where import_row_id is not null;

comment on column public.products.import_row_id is
  'Randul de import care a creat produsul. Cheie de idempotenta: impiedica al doilea produs cand marcarea randului pica intre cele doua scrieri.';

notify pgrst, 'reload schema';
