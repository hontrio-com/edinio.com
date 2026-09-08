-- ═══════════════════════════════════════════════════════════════════════════
-- CE AM TRIMIS LA PEPITA, TINUT MINTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (auditul din 08.09.2026)
--
-- `<Id>`-ul unui articol se deriva din `<uuid produs>--<amprenta titlului combinatiei>`.
-- Documentatia Pepita cere insa un identificator care „nem változik", nu se schimba cand se
-- schimba datele produsului. Iar titlul se poate schimba: comerciantul redenumeste „Roșu" in
-- „Roșu aprins", si amprenta e alta.
--
-- ⚠ SI IN EDINIO REDENUMIREA CHIAR DISTRUGE COMBINATIA, nu doar o reboteaza.
-- `generateCombinations` din formularul de produs cauta combinatia veche dupa TITLU
-- (`existing.find(e => e.title === title)`), deci una redenumita nu se mai gaseste: se naste
-- alta, cu pretul, stocul, SKU-ul si codul EAN goale. Deci faptul ca la Pepita apare un produs
-- nou nu e o minciuna a exportului, e adevarul despre ce s-a intamplat in magazin.
--
-- ⚠ CE ERA CU ADEVARAT STRICAT era DRUMUL INAPOI. O comanda care soseste dupa redenumire
-- poarta `<Id>`-ul VECHI, iar potrivirea recalcula amprentele titlurilor de ACUM: niciuna nu se
-- mai potrivea, si linia ajungea in carantina fara ca macar sa stim despre ce produs e vorba.
--
-- Tabela de aici tine minte ce am trimis. De la ea:
--   * potrivirea comenzii devine o CAUTARE EXACTA, nu o recalculare;
--   * o comanda intarziata se leaga de produsul ei chiar dupa redenumire;
--   * cand combinatia chiar nu mai exista, motivul e precis, nu „cod necunoscut";
--   * panoul poate spune care articole au ramas orfane la ei.
--
-- ⚠ SI REZOLVA SI PRESUPUNEREA de la potrivirea dupa `sku`: pana acum ne bizuiam pe faptul ca
-- `sku`-ul intors de ei e chiar `<Id>`-ul nostru. Cu tabela, potrivirea are un martor scris,
-- nu o presupunere recalculata.

create table if not exists public.pepita_articole (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  /*
   * ⚠ SIRUL GOL pentru produsul simplu, nu `null`.
   *
   * In Postgres, doua `null` sunt DISTINCTE intr-un index unic, deci cu `null` acelasi produs
   * simplu ar fi putut capata oricate randuri. Sirul gol se compara ca orice alt sir.
   */
  combinatie text not null default '',
  /* Chiar `<Id>`-ul trimis in feed. */
  articol_id text not null,
  creat_la timestamp with time zone default now() not null,
  unique (business_id, articol_id),
  unique (business_id, product_id, combinatie)
);

comment on table public.pepita_articole is
  'Ce `<Id>` a plecat la Pepita pentru fiecare produs si combinatie. Drumul inapoi de la comanda lor la produsul nostru.';

-- ⚠ Index pe cheia straina, cu `product_id` pe prima pozitie: fara el, fiecare produs sters ar
-- scana toata tabela. Vezi `chei-straine-indexate.test.ts`.
create index if not exists pepita_articole_produs_idx on public.pepita_articole (product_id);

alter table public.pepita_articole enable row level security;

drop policy if exists owner_select_pepita_articole on public.pepita_articole;
create policy owner_select_pepita_articole on public.pepita_articole
  for select using (
    business_id in (select businesses.id from public.businesses where businesses.user_id = (select auth.uid()))
  );

notify pgrst, 'reload schema';
