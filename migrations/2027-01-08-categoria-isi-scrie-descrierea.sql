-- Categoria isi scrie singura descrierea pentru Google - 10.09.2026
--
-- ═══ DE CE ═══
--
-- Din etapa 1 a descrierilor, fiecare pagina de categorie poarta in Google un text generat din
-- datele ei: numele, pretul de pornire, subcategoriile sau primele produse. Comerciantul care vrea
-- sa spuna altceva (ce vinde, pentru cine, de ce la el) n-avea unde. Coloana de aici e textul LUI,
-- scris in Produse > Categorii.
--
-- Castiga pe orice suprafata care descrie categoria: `/magazin/<categorie>`, `/magazin?cat=`,
-- `/?cat=` si nodul `CollectionPage`. O singura exceptie: paginile de reduceri (`?sale=1`) isi
-- pastreaza textul generat, fiindca au alt canonical si ar fi dublat pagina fara reduceri.
--
-- NULL inseamna textul automat. Fara DEFAULT si fara NOT NULL: o coloana nullabila se adauga doar
-- in catalogul bazei, fara rescrierea tabelei.
--
-- ═══ LIMITA: PLASA, NU REGULA ═══
--
-- Aplicatia respinge peste 300 de caractere la salvare si taie la 300 la citire. CHECK-ul de 1000
-- e plasa pentru scrierea directa prin PostgREST: `authenticated` poate face UPDATE pe propriile
-- randuri fara sa treaca prin actiune. Pragul e larg dinadins: un CHECK care respinge opreste TOT
-- update-ul, deci si o redenumire venita in acelasi payload.
--
-- ⚠ Fara `btrim(seo_description) <> ''`: btrim() nu e .trim() din JavaScript, deci regula ar fi
-- spus altceva decat aplicatia. Sirul gol il face NULL aplicatia, inainte de scriere.
--
-- ⚠ Coloana NU intra in selectul larg al categoriilor: lista pleaca in browser, pe fiecare pagina
-- a magazinului. Vitrina o citeste tintit, dupa id; panoul, separat de lista. Codul merge si
-- INAINTEA migratiei: citirea cade, iar descrierea ramane cea automata.
--
-- Nu cere GRANT: drepturile pe `categories` sunt pe tabel, nu pe coloane.

alter table public.categories
  add column if not exists seo_description text;

alter table public.categories drop constraint if exists categories_seo_description_lungime;
alter table public.categories add constraint categories_seo_description_lungime
  check (char_length(seo_description) <= 1000);

comment on column public.categories.seo_description is
  'Descrierea pentru Google a paginii de categorie, scrisa de comerciant. NULL = textul automat. Normalizata in aplicatie (fara etichete, fara caractere de control), max 300.';

notify pgrst, 'reload schema';
