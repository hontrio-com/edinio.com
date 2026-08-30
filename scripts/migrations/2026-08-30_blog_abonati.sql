-- ═══ ABONATII LA NOUTATILE BLOGULUI ═══
-- Aplicata pe 30.08.2026 ca `blog_abonati_confirmare`.
--
-- Tabela `blog_subscribers` exista din prima migrare, goala si nefolosita de
-- nimic. Aici primeste ce-i trebuie ca sa fie corecta.
--
-- ⚠ DUBLA CONFIRMARE NU E UN MOFT. Fara ea, oricine poate scrie adresa altcuiva
-- in caseta de pe site, iar acela incepe sa primeasca emailuri pe care nu le-a
-- cerut. In afara de a fi gresit, e si ilegal: consimtamantul trebuie sa fie al
-- persoanei, si trebuie sa se poata dovedi. `confirmed_at` E dovada, iar
-- `confirmed_ip` spune de unde s-a apasat.
--
-- Randurile fara `confirmed_at` NU sunt abonati. Nu li se trimite nimic, si nu
-- intra in fisierul descarcat din panou.

alter table public.blog_subscribers
  add column if not exists token text,
  add column if not exists confirmed_ip text,
  add column if not exists unsubscribed_at timestamptz;

-- ⚠ JETONUL SE STINGE LA CONFIRMARE (se pune pe null din actiune). Indicele e
-- partial tocmai de aceea: altfel al doilea rand confirmat s-ar fi ciocnit cu
-- primul pe valoarea `null`, iar confirmarile ar fi inceput sa cada.
create unique index if not exists blog_subscribers_token_idx
  on public.blog_subscribers (token) where token is not null;

create index if not exists blog_subscribers_confirmed_idx
  on public.blog_subscribers (confirmed_at) where confirmed_at is not null;

-- ⚠ NICIO REGULA PENTRU `anon`, NICI ACUM.
--
-- Inscrierea si confirmarea trec printr-o actiune de server cu cheia de
-- serviciu, care poate numara cererile pe IP. O regula de INSERT pentru anon ar
-- fi fost o adresa deschisa de umplut cu gunoi, iar una de SELECT ar fi ingaduit
-- incercarea jetoanelor de confirmare la nesfarsit.
--
-- Regula de admin (`blog_subscribers_admin_all`) exista din prima migrare.
