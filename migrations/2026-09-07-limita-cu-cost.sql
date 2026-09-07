-- ═══ CONTORUL DURABIL POATE CONSUMA MAI MULT DECAT O LOVITURA ═══
--
-- `consuma_limita` numara INCERCARI: fiecare chemare adauga 1. E potrivit pentru autentificare,
-- unde o incercare e o incercare. Nu e potrivit pentru incarcarea de fisiere, unde ce se plateste
-- nu e numarul de cereri, ci OCTETII scrisi in depozit.
--
-- Marginea de azi la `/api/upload-customization` e 400 de fisiere pe ora pe magazin, iar un PDF de
-- tipar poate avea 40 MB. Adica un magazin poate primi ~16 GB pe ora fara ca nimic sa se opuna —
-- si depozitul se plateste lunar, la nesfarsit, fiindca fisierele fara comanda traiesc pana le ia
-- cronul de retentie.
--
-- ⚠ ADAUGA UN PARAMETRU CU IMPLICIT, deci toate cele ~12 chemari de azi (patru argumente) merg mai
-- departe neatinse, cu acelasi inteles: cost 1. Migratia se poate aplica INAINTEA codului fara sa
-- rupa nimic — si asa si trebuie aplicata.
--
-- ⚠ SE FACE DROP + CREATE, nu CREATE OR REPLACE: un parametru in plus inseamna alta SEMNATURA, deci
-- ar fi aparut o A DOUA functie langa prima, iar chemarile cu patru argumente ar fi devenit
-- AMBIGUE — adica ar fi cazut toate limitele durabile din platforma deodata.
--
-- ⚠ SI DREPTURILE SE REFAC LA LOC, EXPLICIT. Masurat inainte: `{postgres=X/postgres,
-- service_role=X/postgres}`. Un `DROP` sterge ACL-ul, iar functia recreata primeste drepturi din
-- oficiu — si atunci `anon` ar putea chema un `SECURITY DEFINER` care SCRIE in `rate_limits`.
-- Adica oricine de pe internet, cu cheia publica a proiectului, ar putea chema
-- `consuma_limita('login:email:victima@x.ro', 1, 3600, 3600)` si ar bloca omul din propriul cont.
--
-- ═══ ⚠ SI DE LA CINE SE REVOCA: NU AJUNGE `PUBLIC` ═══
--
-- Prima varianta a migratiei asteia scria doar `revoke all ... from public`, dupa memoria
-- „EXECUTE e al lui PUBLIC din oficiu". A fost aplicata pe productie pe 07.09.2026 si ACL-ul a
-- iesit `{postgres, anon, authenticated, service_role}` — adica exact gaura de mai sus, deschisa
-- de chiar migratia care voia s-o inchida.
--
-- Motivul: pe Supabase drepturile nu vin de la `PUBLIC`, ci din `ALTER DEFAULT PRIVILEGES`, care
-- acorda EXECUTE lui `anon` si `authenticated` pe fiecare functie NOUA din schema `public`. Ele
-- sunt granturi explicite pe roluri, deci un `revoke from public` nu le atinge. Se numesc pe fata.
--
-- ⚠ Prins pentru ca migratia a fost urmata imediat de o citire a lui `proacl`, nu pentru ca ar fi
-- dat vreo eroare. `GRANT` nu scartaie niciodata.

begin;

drop function if exists public.consuma_limita(text, integer, integer, integer);

create function public.consuma_limita(
  p_cheie text,
  p_limita integer,
  p_fereastra_sec integer,
  p_blocare_sec integer default 0,
  -- Cat consuma chemarea asta din fereastra. 1 = o incercare, ca pana acum.
  p_cost integer default 1
)
returns table(permis boolean, blocat_pana timestamp with time zone)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_acum timestamptz := clock_timestamp();
  v_start timestamptz; v_lovituri integer; v_blocat timestamptz;
  -- ⚠ Un cost nul sau negativ ar face fereastra sa nu se consume niciodata, adica o limita care
  --   nu limiteaza. Se ridica la cel putin 1, ca o chemare sa coste mereu ceva.
  v_cost integer := greatest(1, coalesce(p_cost, 1));
begin
  insert into public.rate_limits (cheie, fereastra_start, lovituri)
  values (p_cheie, v_acum, 0) on conflict (cheie) do nothing;

  select r.fereastra_start, r.lovituri, r.blocat_pana
    into v_start, v_lovituri, v_blocat
  from public.rate_limits r where r.cheie = p_cheie for update;

  if v_blocat is not null and v_blocat > v_acum then
    return query select false, v_blocat; return;
  end if;

  if v_start < v_acum - make_interval(secs => p_fereastra_sec) then
    v_start := v_acum; v_lovituri := 0;
  end if;

  v_lovituri := v_lovituri + v_cost;
  v_blocat := null;
  if v_lovituri > p_limita and p_blocare_sec > 0 then
    v_blocat := v_acum + make_interval(secs => p_blocare_sec);
  end if;

  update public.rate_limits
     set fereastra_start = v_start, lovituri = v_lovituri,
         blocat_pana = v_blocat, actualizat_la = v_acum
   where cheie = p_cheie;

  return query select (v_lovituri <= p_limita), v_blocat;
end; $function$;

-- ⚠ EXACT DREPTURILE DE DINAINTE, nici unul in plus.
-- ⚠ `anon` si `authenticated` SE NUMESC PE FATA: granturile lor vin din `ALTER DEFAULT PRIVILEGES`,
--    sunt explicite pe rol, si un `revoke from public` nu le atinge. Vezi nota de sus.
revoke all on function public.consuma_limita(text, integer, integer, integer, integer)
  from anon, authenticated, public;
grant execute on function public.consuma_limita(text, integer, integer, integer, integer) to service_role;

-- ⚠ SI SE VERIFICA, in aceeasi tranzactie. `GRANT` nu scartaie niciodata: fara randul asta,
--    greseala de mai sus s-ar fi vazut doar daca cineva s-ar fi gandit sa citeasca `proacl` dupa.
do $$
declare v_acl text;
begin
  select p.proacl::text into v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'consuma_limita' and n.nspname = 'public';

  if v_acl like '%anon=%' or v_acl like '%authenticated=%' then
    raise exception 'consuma_limita a ramas chemabila de anon/authenticated: %', v_acl;
  end if;
end $$;

commit;

-- ⚠ PostgREST tine in cache semnaturile functiilor. Fara asta, prima chemare cu cinci argumente
--    raspunde „function not found" pana la urmatoarea reincarcare de schema.
notify pgrst, 'reload schema';
