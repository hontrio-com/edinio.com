/* ══════════════════════════════════════════════════════════════════════════
   IMBINAREA CONFIGURARII SE FACE PE RANDUL DE BAZA, INCUIAT (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA, SI DE CE NU ERA DE AJUNS.

   `jsonb_merge_config` facea deja imbinarea intr-o SINGURA instructiune:

     update public.store_settings
        set emag_config = coalesce(emag_config, '{}') || $1
      where business_id = $2

   Fata de citire-imbinare-scriere in Node, e mult mai bine: fereastra scade de la un
   dus-intors de retea la interiorul unei instructiuni. Dar NU e atomica, si comentariul
   din `config.ts` chiar o spunea.

   Motivul: `public.store_settings` e o VEDERE peste `privat.store_settings`, cu
   declansator `INSTEAD OF UPDATE`. Postgres NU incuie randul de baza cand scaneaza
   vederea. Deci doua apeluri simultane pot citi amandoua aceeasi valoare veche, pot
   calcula amandoua `veche || peticul lor`, iar al doilea care scrie il sterge pe primul.

     cronul de comenzi   citeste {…, cursor: 10}         scrie {…, cursor: 11}
     webhook-ul          citeste {…, cursor: 10}                    scrie {…, ultima_notificare: …}
                                                          ↑ cursorul 11 dispare

   ⚠ Sunt patru scriitori reali, si niciunul nu-l asteapta pe altul: cronul (cinci
   apeluri, din minut in minut, cu trecerile suprapuse), webhook-ul (pe ritmul lor),
   salvarea din panou si importul.

   ⚠ CE PIERDEA. Un cursor de comenzi intors inapoi se repara singur (dedublarea prinde
   comenzile recitite). `needs_reconnect` pierdut NU: magazinul ramane marcat sanatos cu
   acreditari moarte, si fiecare cerere pica pe autentificare pana observa cineva.

   ══════════════════════════════════════════════════════════════════════════
   CE FACE FORMA NOUA
   ══════════════════════════════════════════════════════════════════════════

   Scrie DIRECT pe `privat.store_settings`, dupa `select … for update`. Al doilea apel
   asteapta la usa pana termina primul, apoi CITESTE ce a scris el si imbina peste. Nu mai
   exista fereastra: Postgres serializeaza randul.

   ⚠ OCOLIREA VEDERII INSEAMNA OCOLIREA DECLANSATORULUI, si el facea doua lucruri care
   trebuie facute in continuare, altfel se pierd parolele integrarilor:

     `cripteaza_rand`      cripteaza campurile din `privat.campuri_secrete`
     `pazeste_secretele`   un secret trimis GOL nu sterge secretul care exista

   Amandoua se refac aici, dar numai pentru coloana atinsa. `privat.cripteaza` e
   idempotenta (`if p_val like 'enc.v1.%' then return p_val`), deci valoarea deja
   criptata din baza trece prin ea neatinsa; numai un secret nou, sosit in clar, se
   cripteaza.

   ⚠ Functia e comuna TUTUROR integrarilor (`aboutyou_config`, `trendyol_config`,
   `olx_config`, `gmc_config`, `emag_config`). Schimbarea e aceeasi pentru toate, si le
   foloseste la fel.
*/

begin;

create or replace function public.jsonb_merge_config(
  p_business_id uuid,
  p_column      text,
  p_patch       jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $function$
declare
  v_id      uuid;
  v_curent  jsonb;
  v_nou     jsonb;
  v_cai     text[];
  v_cale    text;
  v_parti   text[];
  v_vechi   text;
  v_nou_val text;
begin
  /* Numele coloanei intra intr-un `format(%I)`, deci se margineste la coloanele de
     configurare. Fara asta, apelantul ar alege orice coloana din tabel. */
  if p_column is null or p_column !~ '^[a-z][a-z0-9_]*_config$' then
    raise exception 'coloana de configurare invalida: %', p_column;
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'peticul trebuie sa fie un obiect jsonb';
  end if;
  if p_business_id is null then
    raise exception 'business_id lipsa';
  end if;

  /*
   * ⚠ `for update` PE TABELA DE BAZA. Aici e toata deosebirea fata de forma dinainte:
   * pe vedere, clauza n-ar fi incuiat randul care conteaza.
   *
   * ⚠ Se citeste valoarea BRUTA, adica cu secretele criptate. Vederea le-ar fi
   * decriptat, iar apoi le-am fi criptat la loc degeaba — si orice cheie schimbata intre
   * timp ar fi facut o valoare pe care n-o mai poate citi nimeni.
   */
  execute format(
    'select id, coalesce(%I, ''{}''::jsonb) from privat.store_settings where business_id = $1 for update',
    p_column
  ) into v_id, v_curent using p_business_id;

  /* Magazin fara rand de setari: nu e o eroare, doar n-are ce imbina. Aceeasi purtare
     ca inainte, cand `update` nu atingea niciun rand. */
  if v_id is null then
    return;
  end if;

  v_nou := v_curent || p_patch;

  /* Caile secrete ale COLOANEI atinse. `null` daca n-are niciuna. */
  select array_agg(cale) into v_cai from privat.campuri_secrete where coloana = p_column;

  if v_cai is not null then
    foreach v_cale in array v_cai loop
      v_parti := string_to_array(v_cale, '.');

      v_vechi   := v_curent #>> v_parti;
      v_nou_val := v_nou    #>> v_parti;

      /*
       * ⚠ UN SECRET TRIMIS GOL NU STERGE SECRETUL CARE EXISTA.
       *
       * Regula lui `privat.pazeste_secretele`, refacuta aici fiindca declansatorul
       * vederii nu mai trece. Ecranele trimit parola goala cand omul n-a atins-o —
       * scrisa asa, integrarea s-ar deconecta la fiecare salvare de setari.
       */
      if coalesce(v_nou_val, '') = '' and coalesce(v_vechi, '') <> '' then
        v_nou := jsonb_set(v_nou, v_parti, to_jsonb(v_vechi), true);
      end if;
    end loop;

    /* ⚠ Idempotenta: ce e deja `enc.v1.…` trece neatins. Numai secretul sosit in clar
       se cripteaza. */
    v_nou := privat.cripteaza_config(v_nou, v_cai);
  end if;

  execute format(
    'update privat.store_settings set %I = $1, updated_at = now() where id = $2',
    p_column
  ) using v_nou, v_id;
end;
$function$;

/* ⚠ `create or replace` REFACE granturile implicite, iar Postgres da EXECUTE lui PUBLIC
   din oficiu. Deci revocarea vine DUPA definitie, de fiecare data. Vezi
   `granturi-rpc.test.ts` si migratia `2026-10-08-inchide-rpc-urile-mele.sql`. */
revoke all on function public.jsonb_merge_config(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.jsonb_merge_config(uuid, text, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';
