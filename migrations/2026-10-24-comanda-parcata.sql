-- ══════════════════════════════════════════════════════════════════════════
-- O COMANDA RESPINSA DE BAZA SE PARCHEAZA, NU SE ARUNCA (25.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `ingereazaComanda` deosebeste „nu va intra niciodata asa" de „nu stim acum", si are
-- dreptate s-o faca: o comanda cu date imposibile tratata ca pana trecatoare ar ingheta
-- fereastra INTREGULUI magazin — marcajul nu mai avanseaza, si nicio comanda noua nu mai
-- intra. Deci refuzurile de date (`23502`, `23514`, `22001`, `22P02`) lasa marcajul sa
-- treaca mai departe.
--
-- ⚠ DAR ATUNCI COMANDA DISPARE. Cade in afara ferestrei de suprapunere in cateva minute si
-- nimeni n-o mai cere vreodata. Ramane o singura linie in jurnal, care se pierde in scroll.
--
-- ⚠ SI „PERMANENT" E O MINCIUNA POLITICOASA: constrangerea nu e incalcata de datele lor, ci
-- de codul NOSTRU care le potriveste. Pe 24.08 `statusEdinio(5)` intorcea „returned"; pe
-- 25.08 `platitLaEi(0)` intorcea „pending". Amandoua au fost reparate in cateva ore — dar
-- comenzile respinse intre timp erau deja pierdute. Adica fiecare defect al meu se
-- transforma in pierdere DEFINITIVA de comenzi ale comerciantului.
--
-- ═══ CE SE SCHIMBA ═══
--
-- Comanda respinsa se scrie in `emag_orders` cu `order_id` NULL si cu `raw` intreg — deci
-- exista, se vede, si se poate relua din ea cand codul se indreapta. Marcajul avanseaza mai
-- departe, deci magazinul nu se blocheaza. Nu se cheama `order/acknowledge`, deci eMAG
-- continua sa anunte comanda — a doua plasa, a lor.
--
-- ⚠ `ingest_error` nu e decor: fara motiv scris pe rand, reluarea n-ar sti ce s-a intamplat
-- si nimeni n-ar putea deosebi „asteapta o reparatie" de „a intrat si i s-a sters comanda".

alter table public.emag_orders add column if not exists ingest_error text;
alter table public.emag_orders add column if not exists ingest_failed_at timestamptz;

comment on column public.emag_orders.ingest_error is
  'De ce n-a putut fi scrisa comanda in `orders`. Ne-nul si `order_id` null inseamna comanda PARCATA, care asteapta o reluare.';

-- ⚠ Index partial: comenzile parcate sunt cateva, cele intrate sunt toate. Un index pe
-- toata tabela ar fi purtat degeaba fiecare comanda a fiecarui magazin.
create index if not exists emag_orders_parcate_idx
  on public.emag_orders (business_id, ingest_failed_at)
  where order_id is null;

notify pgrst, 'reload schema';
