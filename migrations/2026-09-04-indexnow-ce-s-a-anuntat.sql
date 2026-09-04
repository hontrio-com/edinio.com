-- ═══════════════════════════════════════════════════════════════════════════
-- IndexNow: ce adresa a fost anuntata, si cu ce data
-- 04.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ DE CE E NEVOIE DE O TABELA, si nu se poate altfel.
--
-- IndexNow se trimite „cand continutul e adaugat, modificat sau sters", iar
-- documentatia avertizeaza explicit impotriva retrimiterii prea dese (raspunsul
-- 429 inseamna „ne banuiesti de spam"). Deci cronul trebuie sa stie ce a trimis
-- deja. Fara memorie, ar retrimite intreg sitemapul la fiecare rulare — adica
-- exact purtarea pentru care esti oprit.
--
-- ⚠ CHEIA E ADRESA, nu un id propriu. O adresa e anuntata sau nu; nu exista
-- „de doua ori". `on conflict (url) do update` face rularea idempotenta, deci
-- doua cronuri pornite din greseala in acelasi minut nu strica nimic.
--
-- ⚠ `lastmod` E MOTIVUL PENTRU CARE TABELA NU E O SIMPLA LISTA. Un articol
-- modificat trebuie reanuntat, unul neatins nu. Comparam data din sitemap cu
-- data cu care am anuntat ultima oara: mai noua inseamna „s-a schimbat".
-- O adresa fara `lastmod` (paginile scrise in cod n-au data adevarata — vezi
-- nota din `sitemap.ts`) se anunta O SINGURA DATA si nu se mai atinge.
--
-- ⚠ CE NU FACE, DINADINS: nu tine minte STERGERILE. O adresa care iese din
-- sitemap ramane aici marcata ca anuntata si nu se mai trimite. Documentatia
-- IndexNow spune ca se pot anunta si adresele sterse, ca motoarele sa le scoata
-- mai repede — dar aceea e o purtare separata, cu propriile ei capcane (ce
-- inseamna „stearsa" pentru o adresa care lipseste temporar dintr-un sitemap
-- construit din baza?), si n-a fost ceruta. Motoarele o vor afla la urmatoarea
-- trecere, din 404 sau 410.

create table if not exists public.indexnow_trimise (
  -- Adresa absoluta, exact cum a fost trimisa.
  url text primary key,
  -- `lastModified` din sitemap la clipa trimiterii. NULL = adresa n-are data
  -- adevarata (pagina scrisa in cod), deci nu se reanunta niciodata.
  lastmod timestamp with time zone,
  trimis_la timestamp with time zone default now() not null,
  -- Codul HTTP al ultimei trimiteri. 200 si 202 inseamna primit; restul, nu.
  cod integer,
  ultima_eroare text
);

comment on table public.indexnow_trimise is
  'IndexNow: ce adresa a fost anuntata la Bing si cu ce lastmod. Cheia e adresa; '
  'o adresa cu lastmod mai nou decat cel de aici se reanunta. Scrisa doar de cron.';

-- Cautarea care conteaza: „ce e de trimis" compara `lastmod`, deci indexul pe
-- el ajuta cand tabela creste. Cheia primara acopera cautarea dupa adresa.
create index if not exists indexnow_trimise_lastmod_idx
  on public.indexnow_trimise (lastmod);

-- ⚠ RLS PORNIT SI NICIUN GRANT PENTRU `anon`/`authenticated`.
--
-- Tabela nu are ce cauta pe nicio cale publica: o citire ar spune oricui ce
-- adrese am anuntat si cand, iar o scriere ar lasa pe cineva sa ne faca sa
-- trimitem spam catre Bing in numele nostru. O citeste si o scrie DOAR cronul,
-- cu cheia de serviciu, care ocoleste RLS.
--
-- ⚠ `enable row level security` FARA NICIO POLITICA inseamna „nimeni nu vede
-- nimic" pentru rolurile obisnuite — asta e implicitul si e cel dorit aici.
alter table public.indexnow_trimise enable row level security;


grant DELETE on table public.indexnow_trimise to service_role;
grant INSERT on table public.indexnow_trimise to service_role;
grant REFERENCES on table public.indexnow_trimise to service_role;
grant SELECT on table public.indexnow_trimise to service_role;
grant TRIGGER on table public.indexnow_trimise to service_role;
grant TRUNCATE on table public.indexnow_trimise to service_role;
grant UPDATE on table public.indexnow_trimise to service_role;

-- ⚠ REVOCAREA NU E DE PRISOS, SI AM MASURAT-O. Supabase are drepturi IMPLICITE
-- pe schema `public`: orice tabela creata acolo primeste, PE NUME, drepturi
-- pentru `anon` si `authenticated` — fara ca cineva sa le fi acordat. Masurat
-- imediat dupa `create table`, inainte de randul asta:
--
--   cine_are_drepturi = anon, authenticated, postgres, service_role
--
-- RLS le opreste citirile si scrierile prin PostgREST, dar granturile raman o
-- suprafata pe care n-o vrea nimeni — si `truncate` NU trece prin RLS deloc.
-- Celelalte tabele de sistem ale proiectului (`edinio_conversion_outbox`,
-- `edinio_consimtamant_retras`) n-au drepturi pentru `anon`, deci asta e norma
-- casei, nu o precautie inventata aici.
--
-- ⚠ STA DUPA `grant`-uri, si nu fiindca ordinea ar conta acum: revocarea e
-- pentru `anon`/`authenticated`, granturile pentru `service_role`, deci nu se
-- ating. Sta la urma ca sa CASTIGE daca vreodata cineva adauga deasupra un
-- grant catre `anon` — un fisier citit de sus in jos trebuie sa se termine cu
-- starea adevarata. Vezi si nota din `migrations/CITESTE-INTAI.md` despre
-- restaurarea pe un proiect Supabase nou.
revoke all on table public.indexnow_trimise from anon, authenticated;

-- Fara asta, PostgREST tine minte schema veche pana la urmatoarea repornire.
NOTIFY pgrst, 'reload schema';
