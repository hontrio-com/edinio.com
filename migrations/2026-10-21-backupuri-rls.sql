-- ═══════════════════════════════════════════════════════════════════════════
-- COPIILE DE SIGURANTA NU MAI SUNT DESCHISE CATRE ORICINE (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DEFECTUL A FOST AL MEU, IN ACEEASI ZI.
--
-- Inainte sa schimb preturile VetDepo am facut o copie de siguranta:
--
--   create table public.zz_backup_preturi_vetdepo_20260825 as select ...
--
-- Pare inofensiv. Nu e. `create table as select`:
--   1. NU porneste row level security;
--   2. iar in Supabase un tabel nou din `public` mosteneste granturile implicite catre
--      `anon` si `authenticated`.
--
-- Verificat in productie, amandoua copiile (cea de azi si cea din 19.08) aveau
-- SELECT, INSERT, UPDATE, DELETE si TRUNCATE pentru anon si authenticated, cu RLS stins.
-- Adica oricine cu cheia publica putea citi, modifica sau STERGE snapshoturile de pret prin
-- Data API.
--
-- Nu contin stoc si nu contin date personale, deci n-a fost o scurgere de date ale
-- clientilor — dar a fost o usa deschisa tacut, printr-o comanda care arata ca o copiere.
--
-- ⚠ CELELALTE SASE COPII MAI VECHI erau in regula: au granturi de client, dar au si RLS
-- pornit, iar cu RLS si fara nicio politica `anon` nu vede nimic. Deosebirea conteaza, si de
-- aia proba din `src/lib/rls-tabele.test.ts` cere RLS, nu „zero granturi".

revoke all on table public.zz_backup_preturi_vetdepo_20260819 from anon, authenticated;
revoke all on table public.zz_backup_preturi_vetdepo_20260825 from anon, authenticated;

alter table public.zz_backup_preturi_vetdepo_20260819 enable row level security;
alter table public.zz_backup_preturi_vetdepo_20260825 enable row level security;

comment on table public.zz_backup_preturi_vetdepo_20260819 is
  'Copie de siguranta a preturilor. Numai service_role. RLS pornit si granturi retrase: un tabel din `public` cu granturi catre anon si fara RLS e citibil prin Data API cu cheia publica.';
comment on table public.zz_backup_preturi_vetdepo_20260825 is
  'Copie de siguranta a preturilor. Numai service_role. RLS pornit si granturi retrase: un tabel din `public` cu granturi catre anon si fara RLS e citibil prin Data API cu cheia publica.';

notify pgrst, 'reload schema';
