/* ══════════════════════════════════════════════════════════════════════════
   RITMUL SE NUMARA INTR-UN SINGUR LOC, NU IN FIECARE INSTANTA (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA. Galeata cu jetoane din `emag/client.ts` traieste in MEMORIA instantei. Iar
   aceeasi cheie de vanzator e folosita din mai multe locuri deodata:

     cronul, pe o instanta          3/s
     importul, pe alta              3/s
     un buton apasat de om          3/s
     un webhook sosit intre timp    3/s

   Fiecare crede ca are bugetul intreg. eMAG vede suma.

   ⚠ Si depasirea nu se plateste doar cu un 429: documentatia lor spune ca si cererile
   INVALIDE se numara in limita. Deci bugetul ars e chiar cel prin care trebuie sa plece o
   mișcare de stoc dupa o vanzare — iar aceea intarziata inseamna supravanzare.

   ⚠ Limitele lor, din documentatie: 12/s pe comenzi, 3/s pe restul. Iar
   `documentation/find_by_eans` are ale ei, mai stranse: 5/s, 200/min si 5.000 PE ZI. Pe
   plafonul zilnic, o galeata din memorie nu poate face nimic — instanta moare inainte sa
   se termine ziua.

   ══════════════════════════════════════════════════════════════════════════
   CE FACE MASA ASTA
   ══════════════════════════════════════════════════════════════════════════

   Un contor pe fereastra, cu randul incuiat de `insert … on conflict do update`. Toti
   scriitorii, din toate instantele, se aseaza la coada pe acelasi rand.

   ⚠ NU E O GALEATA CU SCURGERE, e o fereastra care se reseteaza. Mai aspra la margine (un
   varf poate incapea la sfarsitul unei ferestre si inceputul urmatoarei), dar simpla
   destul incat sa se poata citi si sa nu poata fi gresita. Pentru o limita de 3 pe
   secunda, deosebirea nu conteaza; pentru una de 5.000 pe zi, cu atat mai putin.

   ⚠ GALEATA DIN MEMORIE RAMANE. Nu ca dubla plasa de siguranta, ci ca sa nu ceara nimeni
   un jeton bazei de doua ori pe milisecunda: ea taie varfurile locale gratis, iar masa
   asta e arbitrul.
*/

begin;

create table if not exists privat.ritm_extern (
  /*
   * ⚠ Cheia poarta CONTUL, nu magazinul: limita e a vanzatorului la ei, iar acelasi cont
   * poate fi legat de doua magazine Edinio. Forma: `emag:{tara}:{utilizator}:{galeata}`.
   */
  cheie          text primary key,
  /** Inceputul ferestrei curente, in milisecunde de la epoca. */
  fereastra_ms   bigint      not null,
  folosite       int         not null default 0,
  actualizat_la  timestamptz not null default now()
);

/* Pentru curatenia randurilor uitate. Vezi nota de la sfarsit. */
create index if not exists ritm_extern_actualizat_idx on privat.ritm_extern (actualizat_la);

/**
 * Ia un jeton, sau spune cat sa se astepte.
 *
 * Intoarce `{ok, asteapta_ms, folosite, limita}`.
 *
 * ⚠ `ok = false` NU inseamna eroare. Inseamna „nu acum", iar `asteapta_ms` spune cat.
 * Apelantul hotaraste: la 3 pe secunda doarme si revine; la 5.000 pe zi, o asteptare de
 * ore inseamna „opreste-te si spune omului", nu „dormi".
 */
create or replace function public.ia_jeton_extern(
  p_cheie        text,
  p_limita       int,
  p_fereastra_ms int default 1000
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $function$
declare
  v_acum     bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_fer      bigint;
  v_folosite int;
begin
  if coalesce(btrim(p_cheie), '') = '' then
    raise exception 'cheie de ritm lipsa';
  end if;
  if p_limita is null or p_limita < 1 then
    raise exception 'limita de ritm invalida: %', p_limita;
  end if;
  if p_fereastra_ms is null or p_fereastra_ms < 1 then
    raise exception 'fereastra de ritm invalida: %', p_fereastra_ms;
  end if;

  /*
   * ⚠ `insert … on conflict do update` E CHIAR INCUIETOAREA. Un `select` urmat de un
   * `update` ar fi lasat exact fereastra pe care masa asta o inchide: doi apelanti citesc
   * acelasi contor si scriu amandoi peste el.
   *
   * ⚠ Fereastra se reseteaza INAUNTRUL instructiunii, nu inainte: socotita in afara, doi
   * apelanti sositi la granita ar fi resetat-o amandoi si ar fi luat fiecare cate un
   * buget intreg.
   */
  insert into privat.ritm_extern (cheie, fereastra_ms, folosite, actualizat_la)
  values (p_cheie, v_acum, 1, now())
  on conflict (cheie) do update
    set fereastra_ms = case
          when v_acum - privat.ritm_extern.fereastra_ms >= p_fereastra_ms then v_acum
          else privat.ritm_extern.fereastra_ms end,
        folosite = case
          when v_acum - privat.ritm_extern.fereastra_ms >= p_fereastra_ms then 1
          else privat.ritm_extern.folosite + 1 end,
        actualizat_la = now()
  returning fereastra_ms, folosite into v_fer, v_folosite;

  if v_folosite <= p_limita then
    return jsonb_build_object(
      'ok', true, 'asteapta_ms', 0, 'folosite', v_folosite, 'limita', p_limita);
  end if;

  /*
   * ⚠ JETONUL S-A NUMARAT ORICUM, si asta e voit. Un apelant care e refuzat si revine
   * peste 200 ms ar fi altfel numarat de doua ori la cererea urmatoare — dar aici
   * contorul deja a trecut de limita, deci orice crestere in plus nu schimba raspunsul.
   * Fereastra urmatoare il reseteaza.
   */
  return jsonb_build_object(
    'ok', false,
    'asteapta_ms', greatest(1, (v_fer + p_fereastra_ms - v_acum))::int,
    'folosite', v_folosite,
    'limita', p_limita);
end;
$function$;

/**
 * Cate jetoane s-au folosit in fereastra curenta, FARA sa se ia unul.
 *
 * ⚠ Slujeste la a ARATA comerciantului cat i-a mai ramas din plafonul zilnic de cautari
 * dupa cod de bare. O intrebare care ia un jeton n-ar putea fi pusa de un ecran: simpla
 * deschidere a paginii i-ar consuma bugetul.
 */
create or replace function public.vezi_ritm_extern(p_cheie text, p_fereastra_ms int default 1000)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $function$
declare
  v_acum bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_fer  bigint;
  v_fol  int;
begin
  select fereastra_ms, folosite into v_fer, v_fol
    from privat.ritm_extern where cheie = p_cheie;

  if v_fer is null or v_acum - v_fer >= p_fereastra_ms then
    return jsonb_build_object('folosite', 0, 'fereastra_ms', v_acum);
  end if;
  return jsonb_build_object('folosite', v_fol, 'fereastra_ms', v_fer);
end;
$function$;

/**
 * Randurile uitate.
 *
 * ⚠ Nu se sterge dupa `fereastra_ms`, ci dupa `actualizat_la`: un magazin care n-a mai
 * trimis nimic de o saptamana n-are ce cauta in masa, dar unul care trimite in fiecare
 * minut trebuie sa-si pastreze randul — recreat de fiecare data, ar fi insemnat un
 * `insert` in loc de un `update` la fiecare cerere.
 */
create or replace function public.curata_ritm_extern()
returns int
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $function$
declare v_sterse int;
begin
  delete from privat.ritm_extern where actualizat_la < now() - interval '7 days';
  get diagnostics v_sterse = row_count;
  return v_sterse;
end;
$function$;

/* ⚠ `create or replace` REFACE granturile implicite, iar Postgres da EXECUTE lui PUBLIC
   din oficiu. Toate trei sunt `security definer` si scriu in `privat`. */
revoke all on function public.ia_jeton_extern(text, int, int) from public, anon, authenticated;
revoke all on function public.vezi_ritm_extern(text, int) from public, anon, authenticated;
revoke all on function public.curata_ritm_extern() from public, anon, authenticated;
grant execute on function public.ia_jeton_extern(text, int, int) to service_role;
grant execute on function public.vezi_ritm_extern(text, int) to service_role;
grant execute on function public.curata_ritm_extern() to service_role;

commit;

notify pgrst, 'reload schema';
