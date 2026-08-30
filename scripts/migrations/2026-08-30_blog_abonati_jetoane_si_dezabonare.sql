-- Newsletterul blogului: jetoane cu amprenta si termen, si o iesire care exista.
--
-- Gasite pe 30.08.2026, la un audit din afara:
--   #16 textul promitea dezabonare in trei locuri, si nu exista nicio ruta;
--   #17 jetonul de confirmare statea in clar si nu expira niciodata;
--   #20 doua cereri simultane trimiteau doua emailuri, iar primul era deja mort.

-- ═══ 1. Jetonul de confirmare nu se mai tine in clar, si se stinge ═══
--
-- O scurgere a bazei dadea cuiva puterea sa CONFIRME consimtamantul altora —
-- adica sa fabrice exact dovada pe care legea o cere de la noi. Acum se
-- pastreaza doar amprenta; jetonul in clar exista numai in emailul care pleaca.

alter table public.blog_subscribers
  add column if not exists token_hash       text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists unsub_token      text;

alter table public.blog_subscribers drop column if exists token;

create unique index if not exists blog_subscribers_unsub_token
  on public.blog_subscribers (unsub_token) where unsub_token is not null;
create index if not exists blog_subscribers_token_hash
  on public.blog_subscribers (token_hash) where token_hash is not null;

-- ⚠ JETONUL DE DEZABONARE STA IN CLAR, SI E DINADINS.
--
-- Nu poate fi amprenta: trebuie sa intre in FIECARE email trimis de acum
-- inainte, deci trebuie sa poata fi CITIT, nu doar verificat. Iar riscul e de
-- alta marime: cu jetonul de confirmare furat fabrici un consimtamant, cu cel
-- de dezabonare scoti pe cineva de pe o lista pe care se poate reinscrie.
--
-- Nu l-am legat nici de un secret din mediu, desi ar fi fost mai curat
-- criptografic: un `BLOG_UNSUB_SECRET` uitat la desfasurare ar rupe TACUT tocmai
-- legatura care are voie sa nu se strice niciodata, si ne-ar lasa sa trimitem
-- emailuri din care nu se poate iesi.

-- ═══ 2. Cererea de confirmare, dintr-o singura miscare ═══
--
-- Inainte: `select` ca sa vedem daca exista, apoi `upsert`. Doua cereri
-- simultane treceau amandoua de `select`, emiteau doua jetoane, al doilea il
-- invalida pe primul — dar PLECAU DOUA EMAILURI, iar legatura din primul era
-- deja moarta. Omul apasa pe emailul de sus, nu merge, si crede ca e stricat la
-- noi.
--
-- Acum hotararea o ia baza si intoarce cine a emis-o. Emailul pleaca doar de la
-- cel care a castigat.
create or replace function public.blog_cere_confirmare(
  p_email text, p_token_hash text, p_expira_la timestamptz, p_sursa text
) returns boolean language sql security definer set search_path = public, pg_temp as $$
  insert into public.blog_subscribers (email, token_hash, token_expires_at, source)
  values (lower(p_email), p_token_hash, p_expira_la, p_sursa)
  on conflict (email) do update
    set token_hash       = excluded.token_hash,
        token_expires_at = excluded.token_expires_at,
        source           = excluded.source,
        -- Cine s-a dezabonat si se reinscrie trebuie sa confirme din nou.
        confirmed_at     = case when public.blog_subscribers.unsubscribed_at is not null
                                then null else public.blog_subscribers.confirmed_at end
    where
      -- Cine e deja abonat si activ nu primeste nimic.
      (public.blog_subscribers.confirmed_at is null
        or public.blog_subscribers.unsubscribed_at is not null)
      -- Si cat timp are un jeton viu, nu se emite al doilea.
      and (public.blog_subscribers.token_hash is null
        or public.blog_subscribers.token_expires_at is null
        or public.blog_subscribers.token_expires_at < now())
  returning true;
$$;

-- ═══ 3. Confirmarea ═══
create or replace function public.blog_confirma(p_token_hash text, p_ip text)
returns text language sql security definer set search_path = public, pg_temp as $$
  update public.blog_subscribers
     set confirmed_at     = now(),
         confirmed_ip     = p_ip,
         token_hash       = null,
         token_expires_at = null,
         unsubscribed_at  = null,
         unsub_token      = coalesce(unsub_token, encode(extensions.gen_random_bytes(24), 'hex'))
   where token_hash = p_token_hash
     and token_expires_at is not null
     and token_expires_at > now()
  returning email;
$$;

-- ═══ 4. Dezabonarea ═══
--
-- ⚠ IDEMPOTENTA. Cine apasa de doua ori trebuie sa vada tot „gata", nu o eroare.
-- O pagina de dezabonare care da eroare il face pe om sa creada ca n-a iesit, si
-- de acolo se ajunge la plangere de spam — adica exact la ce strica domeniul.
create or replace function public.blog_dezaboneaza(p_unsub_token text)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  update public.blog_subscribers
     set unsubscribed_at = coalesce(unsubscribed_at, now())
   where unsub_token = p_unsub_token
  returning true;
$$;

-- Toate trei trec numai prin cheia de serviciu. Cheia anonima e publica, deci un
-- grant pentru `anon` ar fi insemnat ca jetoanele se pot incerca direct, la
-- nesfarsit, ocolind orice plafon scris in actiunea de server.
revoke execute on function public.blog_cere_confirmare(text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.blog_confirma(text, text)                           from public, anon, authenticated;
revoke execute on function public.blog_dezaboneaza(text)                              from public, anon, authenticated;
grant  execute on function public.blog_cere_confirmare(text, text, timestamptz, text) to service_role;
grant  execute on function public.blog_confirma(text, text)                            to service_role;
grant  execute on function public.blog_dezaboneaza(text)                               to service_role;
