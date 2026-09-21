-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENTI: ce a iesit la auditul sectiunii                     (21.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trei lucruri, gasite masurand, nu citind.

-- ── 1. Numarul de oameni dintr-o lista, socotit in baza ────────────────────
--
-- ⚠⚠ DEFECT ADEVARAT, SCRIS DE MINE AZI. Fila „Segmente" numara membrii asa:
--
--     supabase.from("customer_segment_members").select("segment_id").limit(10000)
--
-- adica aducea RANDURILE si le numara in JavaScript. Doua lucruri rele:
--
--   a) Plafoanele ingaduie 50 de segmente x 500 de oameni = 25.000 de randuri,
--      iar interogarea taia la 10.000. TACUT. Comerciantul ar fi vazut
--      „312 clienți" la un segment care are 500, si n-ar fi avut de unde sa
--      banuiasca: cifra arata a cifra.
--   b) Peste asta, PostgREST are plafonul LUI (proiectul l-a lovit deja o data,
--      la 1.000 de randuri), care se aplica peste `limit`. Deci taierea putea
--      veni si mai devreme, si tot fara nicio eroare.
--
-- ⚠ Socotita in baza, nu exista niciun plafon de trecut: se intorc cate un rand
-- pe segment, nu cate unul pe om.
--
-- ⚠ `security invoker`, deci RLS margineste la segmentele magazinului: politica
-- de pe `customer_segment_members` trece prin segment si apoi prin `businesses`.
-- Probat: un comerciant care cere segmentele altui magazin primeste zero.

create or replace function public.customer_segment_sizes(bid uuid)
returns table (segment_id uuid, cati bigint)
language sql
stable
security invoker
set search_path to ''
as $$
  select m.segment_id, count(*)
  from public.customer_segment_members m
  join public.customer_segments s on s.id = m.segment_id
  where s.business_id = bid
  group by m.segment_id
$$;

revoke all on function public.customer_segment_sizes(uuid) from public;
revoke all on function public.customer_segment_sizes(uuid) from anon;
grant execute on function public.customer_segment_sizes(uuid) to authenticated;

-- ── 2. `comanda_incasata` intra in rand cu celelalte ───────────────────────
--
-- ⚠ Singura functie scrisa azi FARA `security invoker` si FARA `search_path`
-- fixat. Urmarea de acum e mica — e `invoker` oricum, prin implicitul
-- Postgres-ului, si o cheama numai functii care au ele `search_path` gol, deci
-- il mosteneste. Dar:
--
--   - o functie fara `search_path` fixat isi rezolva numele dupa cine o cheama.
--     Ziua in care cineva o cheama dintr-un loc cu alt `search_path`, se leaga
--     de alte obiecte decat crede;
--   - si e regula pe care o tin toate celelalte zece functii ale sectiunii.
--     O exceptie nescrisa e o exceptie care se inmulteste.
--
-- ⚠ `immutable` RAMANE: judeca numai trei texte, fara `now()` si fara citiri.
-- Asta o face folosibila in indexuri si o lasa sa fie socotita o data.

create or replace function public.comanda_incasata(
  p_status text, p_payment_status text, p_payment_method text
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path to ''
as $$
  select case
    when p_status in ('cancelled', 'refunded') then false
    when p_payment_status = 'refunded' then false
    when p_payment_status = 'paid' then true
    when p_payment_method in ('cash_on_delivery', 'cod', 'ramburs')
      then p_status = 'delivered'
    else false
  end
$$;

/*
  ⚠⚠ CORPUL E NESCHIMBAT, LITERA CU LITERA, si asta e dinadins.

  Prima scriere a migratiei astea „curata" pe drum si comparatia metodei de
  plata, punand `lower(coalesce(...))`. Ar fi facut ca „COD" si „Ramburs" scrise
  cu majuscule sa fie deodata socotite incasate — adica ar fi MUTAT BANII dintr-o
  migratie care spune despre ea ca doar fixeaza `search_path`.

  Daca majusculele chiar sunt o problema, se masoara si se repara separat, cu
  cifrele de dinainte si de dupa la vedere. Nu pe furis, intr-o intarire.

  ⚠ Si `parallel safe` ramane: scos, planificatorul n-ar mai putea imparti pe mai
  multe fire nicio interogare care o cheama — adica `customers_merged`, care e
  usa prin care trece toata pagina.
*/

-- ── 3. A doua incuietoare pe tabelele noi ──────────────────────────────────
--
-- ⚠ Supabase da implicit lui `anon` TOATE drepturile pe o tabela noua din
-- `public`. La cele trei tabele de azi s-a revocat `select` la creare, dar nu si
-- scrierile. RLS le opreste oricum (probat: un comerciant strain primeste zero
-- randuri si nu poate scrie nimic), deci asta e a DOUA incuietoare, nu prima.
--
-- Si a doua incuietoare conteaza tocmai fiindca RLS de pe platforma asta s-a mai
-- slabit o data: vezi lectia `recovery_sends`, de azi-dimineata.

/*
  ⚠⚠ `revoke all`, NU o lista de drepturi. Prima scriere revoca
  `select, insert, update, delete` — si a lasat in urma REFERENCES, TRIGGER si,
  mai ales, **TRUNCATE**.

  TRUNCATE e singurul drept pe care RLS NU-l filtreaza: nu se uita la randuri, ci
  goleste tabela. Toata paza sectiunii se sprijina pe „RLS e granita"; la TRUNCATE
  granita aceea nu exista. Un `anon` cu TRUNCATE ar fi putut sterge segmentele
  TUTUROR comerciantilor deodata.

  ⚠ Azi nu e ajuns de nicaieri (PostgREST n-are verb de TRUNCATE), deci nu era o
  gaura deschisa — era o incuietoare lasata descuiata. Gasita masurand drepturile
  ramase dupa revocare, nu citind.

  ⚠ Acelasi lucru e adevarat pentru TOATE tabelele mai vechi ale platformei
  (`customers` are si azi TRUNCATE pentru `anon`). Aici s-au inchis cele trei
  tabele noi; restul cer o trecere a lor.
*/
revoke all on public.customer_segments from anon;
revoke all on public.customer_segment_members from anon;
revoke all on public.customer_imports from anon;

notify pgrst, 'reload schema';
