-- ═══════════════════════════════════════════════════════════════════════════
-- Copiile de siguranta nu mai sunt deschise catre cheia publica
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠⚠ GASIT PE 21.09.2026, IN PRODUCTIE, si nu cautand asta: a iesit la iveala
-- cand schema de referinta a fost regenerata si plasa `rls-tabele.test.ts` a
-- vazut tabele pe care inainte nu le avea in fisier.
--
-- Trei tabele de siguranta facute pe 20.09 aveau `row level security` OPRIT si
-- drepturi catre `anon`:
--
--     zz_backup_anunturi_stinse_20260920          6 randuri
--     zz_backup_esafe_page_sections_20260920   3.351 randuri
--     zz_backup_feed_vetdepo_20260920              1 rand
--
-- Adica oricine avea cheia publica a magazinului - cheia aia e in bundle-ul
-- fiecarei vitrine - le putea CITI si SCRIE prin Data API. Cea mijlocie e
-- continutul de pagina al unui comerciant, copiat inainte de o reparatie.
--
-- ⚠ NU ERA O GAURA DE COD, ci una de MANA: tabelele s-au nascut dintr-un
-- `create table ... as select` scris in consola, iar `create table as` NU
-- mosteneste nici RLS-ul, nici granturile tabelei din care copiaza. Cine
-- salveaza ceva „doar pentru cinci minute" nu se gandeste la Data API.
--
-- Se inchid TOATE, nu doar cele trei: celelalte noua aveau RLS pornit (deci
-- citirea intorcea gol), dar tot aveau granturi catre `anon` - o politica
-- adaugata din greseala peste ele le-ar fi deschis dintr-o data.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'zz_backup%'
  loop
    execute format('revoke all on table public.%I from anon, authenticated', t.relname);
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- ⚠ Fara nicio politica: la ele ajunge doar service role, adica o consola SQL.
-- O copie de siguranta n-are ce cauta prin Data API.

notify pgrst, 'reload schema';
