-- Cate produse si cate comenzi are fiecare magazin, intr-un singur apel.
--
-- Cronul orar de automatizari de email citea TOATE produsele si TOATE comenzile
-- platformei, cate o coloana (`business_id`), doar ca sa le NUMERE in JavaScript.
-- Masurat azi: 5.862 de randuri de produse in SASE dus-intorsuri secventiale
-- (fereastra PostgREST e de 1000), plus inca unul pentru comenzi. La fiecare ora,
-- pentru doua numere pe magazin.
--
-- `returns jsonb`, UN SINGUR RAND, nu `returns setof`. Nu e stil: `db-max-rows`
-- se aplica SI la proceduri, deci un `setof` cu un rand pe magazin ar fi fost
-- taiat tacut la 1000 — iar consecinta ar fi fost exact pe dos fata de ce vrea
-- cronul: magazinul numarul 1001 ar fi parut cu ZERO produse si ar fi primit
-- „nu ai niciun produs" pe email. Un rand nu poate fi taiat.
-- Vezi [[postgrest-1000-row-cap]].
--
-- NU se construieste o tabela `business_stats`. Doua agregari pe indexuri care
-- exista deja nu au nevoie de o a doua sursa de adevar care sa poata ramane in
-- urma; iar cronul ruleaza o data pe ora, nu la fiecare cerere.

create or replace function public.numar_produse_si_comenzi()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    /*
     * Se numara TOATE randurile, ca si pana acum — fara filtru pe `is_active` si
     * fara filtru pe starea comenzii.
     *
     * Nu fiindca ar fi cea mai buna definitie, ci fiindca asta e definitia pe
     * care o folosea codul de dinainte: automatia „nu ai niciun produs" trebuie
     * sa se declanseze pentru exact aceiasi comercianti ca ieri. O schimbare de
     * prag ascunsa intr-o optimizare de viteza e chiar felul de lucru care se
     * descopera dintr-un email trimis gresit.
     */
    'produse', coalesce((
      select jsonb_object_agg(t.business_id::text, t.n)
        from (select p.business_id, count(*) as n from public.products p group by p.business_id) t
    ), '{}'::jsonb),
    'comenzi', coalesce((
      select jsonb_object_agg(t.business_id::text, t.n)
        from (select o.business_id, count(*) as n from public.orders o group by o.business_id) t
    ), '{}'::jsonb)
  )
$$;

-- Numai cronul. Sunt numaratori peste TOATA platforma, deci n-au ce cauta la
-- `anon` sau la un comerciant autentificat: ar fi spus oricui cate produse si
-- cate comenzi are fiecare magazin de pe platforma.
revoke all on function public.numar_produse_si_comenzi() from public, anon, authenticated;
grant execute on function public.numar_produse_si_comenzi() to service_role;

notify pgrst, 'reload schema';
