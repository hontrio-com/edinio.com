-- `null` pe o cale secreta STERGE secretul, sirul gol il pastreaza - 09.09.2026
--
-- ═══ CE REPARA ═══
--
-- `jsonb_merge_config` are o plasa pentru ecranele care trimit parola NEATINSA: un camp secret
-- sosit gol nu sterge secretul care exista, ci il pune la loc. Fara ea, orice salvare a unui
-- formular cu parola mascata ar fi golit credentiala. Plasa e buna si ramane.
--
-- ⚠ NUMAI CA EA NU DEOSEBEA DOUA LUCRURI DIFERITE. Verificarea era pe `#>>`, iar `#>>` intoarce
-- SQL NULL si pentru „calea lipseste", si pentru „valoarea e JSON null". Deci un `null` scris
-- ANUME, ca sa stearga, cadea pe ramura de pastrare si valoarea veche era rescrisa la loc.
--
-- ⚠ URMAREA, in cod: `deconecteazaPepita` scrie `{activ:false, feed_token:null, order_key:null}`
-- si are deasupra un comentariu care spune raspicat „SI CHEILE DIN CONFIGURARE SE STERG, nu doar
-- amprentele: altfel o repornire ar fi reinviat exact adresele pe care omul le-a inchis". Cheile
-- NU se stergeau. Iar `activeazaPepita`, gasindu-le acolo, reaseaza amprenta cu `revocat_la: null`
-- si INVIE adresa veche. Daca cineva si-a oprit integrarea tocmai fiindca adresa i se scursese,
-- repornirea i-o rearma pe cea scursa.
--
-- ⚠ CINE E ATINS: `jsonb_merge_config` e chemata de TOATE integrarile, pe 37 de coloane de
-- configurare. Dar cautat in tot codul, `deconecteazaPepita` e SINGURUL loc care trimite `null`
-- pe o cale secreta; peste tot altundeva campurile mascate sosesc ca sir GOL, si acelea se
-- comporta exact ca pana acum. Deci schimbarea atinge un singur apelant, chiar pe cel care voia
-- stergerea.
--
-- ═══ CELE TREI INTELESURI, DE ACUM ═══
--
--   calea lipseste din petic  -> valoarea veche ramane (imbinarea nici n-o atinge)
--   sir gol                   -> valoarea veche ramane (ecranul a trimis parola nemodificata)
--   `null` scris anume        -> calea SE SCOATE din configurare
--
-- ⚠ SE INTREABA `p_patch`, NU `v_nou`. Daca s-ar intreba documentul imbinat, un `null` ramas de
-- demult in configurare ar fi sters campul la orice salvare care nu-l pomeneste, adica o stergere
-- pe care n-a cerut-o nimeni. Numai peticul spune ce a cerut apelantul ACUM.

create or replace function public.jsonb_merge_config(p_business_id uuid, p_column text, p_patch jsonb)
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
  if p_column is null or p_column !~ '^[a-z][a-z0-9_]*_config$' then
    raise exception 'coloana de configurare invalida: %', p_column;
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'peticul trebuie sa fie un obiect jsonb';
  end if;
  if p_business_id is null then
    raise exception 'business_id lipsa';
  end if;

  execute format(
    'select id, coalesce(%I, ''{}''::jsonb) from privat.store_settings where business_id = $1 for update',
    p_column
  ) into v_id, v_curent using p_business_id;

  if v_id is null then
    return;
  end if;

  v_nou := v_curent || p_patch;

  select array_agg(cale) into v_cai from privat.campuri_secrete where coloana = p_column;

  if v_cai is not null then
    foreach v_cale in array v_cai loop
      v_parti := string_to_array(v_cale, '.');

      -- ⚠ STERGERE CERUTA ANUME. `jsonb_typeof` intoarce 'null' DOAR pentru un JSON null chiar
      -- prezent in petic; pentru o cale care lipseste intoarce SQL NULL, deci nu intra aici.
      -- Exact deosebirea pe care `#>>` o pierdea.
      if jsonb_typeof(p_patch #> v_parti) = 'null' then
        v_nou := v_nou #- v_parti;
        continue;
      end if;

      v_vechi   := v_curent #>> v_parti;
      v_nou_val := v_nou    #>> v_parti;
      -- Sirul gol inseamna „ecranul mi-a trimis parola nemodificata": se pastreaza ce era.
      if coalesce(v_nou_val, '') = '' and coalesce(v_vechi, '') <> '' then
        v_nou := jsonb_set(v_nou, v_parti, to_jsonb(v_vechi), true);
      end if;
    end loop;
    v_nou := privat.cripteaza_config(v_nou, v_cai);
  end if;

  execute format(
    'update privat.store_settings set %I = $1, updated_at = now() where id = $2',
    p_column
  ) using v_nou, v_id;
end;
$function$;

comment on function public.jsonb_merge_config(uuid, text, jsonb) is
  'Imbina un petic in `<x>_config`, pe randul incuiat, si cripteaza caile secrete. Pe o cale secreta: `null` scris anume STERGE calea, sirul gol PASTREAZA valoarea existenta (ecranele trimit parola mascata ca sir gol), iar o cale care lipseste din petic ramane neatinsa. Stergerea se citeste din `p_patch`, nu din documentul imbinat: altfel un `null` mai vechi ar sterge campul la orice salvare care nu-l pomeneste.';
