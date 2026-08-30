-- ═══════════════════════════════════════════════════════════════════════════
-- INTENTIA DE PROPAGARE SE STINGE PRIN COMPARE-AND-SET (25.08.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cand comerciantul schimba o setare care pleaca in incarcatura ofertelor (`green_tax`,
-- `supply_lead_time`, GPSR, `vat_id`, `handling_time`, `stoc_rezervat`), catalogul lui
-- trebuie pus in coada. Punerea aia se facea numai dupa raspuns, iar daca instanta murea
-- intre salvare si ea, intentia se pierdea FARA URMA.
--
-- ⚠ SI NU ERA O PIERDERE PE CARE S-O REPARE ALTCINEVA. Plasa de schimbari neplecate
-- compara amprenta de CONTINUT a produsului; o setare de magazin nu schimba nicio amprenta,
-- deci plasa nu vede nimic. Si asa trebuie sa fie — ea repara ce s-a stricat, nu porneste
-- ce n-a fost cerut. Deci nimic nu recupera asta vreodata, iar pe ecran scria deja
-- „Datele pleaca la ofertele tale in cateva minute”.
--
-- Reparatia: intentia (`propagare_ceruta_la`, `propagare_op`) calatoreste in CHIAR peticul
-- care duce datele, prin `jsonb_merge_config`. O singura instructiune, deci ori se scriu
-- amandoua, ori niciuna. Cronul ridica ce ramane.
--
-- ═══ DE CE E NEVOIE DE FUNCTIA ASTA, SI NU DE INCA UN CAMP ═══
--
-- Prima forma tinea si `propagare_facuta_la`, iar „in asteptare" insemna „cele doua marcaje
-- difera". Mergea, dar avea un defect de SCARA: un rand DUS LA CAPAT ramanea cu cheia pusa
-- si trecea de filtrul din PostgREST la nesfarsit. La destule magazine, `limit(200)` pe
-- ordine fixa ar fi devenit chiar fereastra fixa din §12.5 — cele de dupa al 200-lea
-- magazin, in ordine alfabetica, n-ar mai fi fost privite NICIODATA.
--
-- Aici cheia se STERGE la terminare, deci interogarea intoarce numai ce chiar asteapta.
--
-- ⚠ SI SE STERGE NUMAI DACA E ACEEASI. Intre citirea cronului si stingere poate veni o
-- cerere noua; stinsa orbeste, a doua schimbare a comerciantului n-ar mai pleca niciodata.
-- Comparatia si scrierea stau sub acelasi `for update` ca `jsonb_merge_config`, deci nu e
-- doar „fereastra mica", ci chiar nicio fereastra.
--
-- ⚠ SE SCRIE DIRECT IN `privat.store_settings`, si dinadins: acolo parola sta CRIPTATA.
-- Citita si scrisa inapoi neatinsa, ramane criptata. Trecuta prin vedere, ar fi fost
-- decriptata la citire si ar fi cerut recriptare la scriere — un drum in plus pe langa un
-- secret, pentru nimic.

create or replace function public.emag_stinge_propagarea(
  p_business_id uuid,
  p_ceruta_la   text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $$
declare
  v_id     uuid;
  v_curent jsonb;
begin
  if p_business_id is null or coalesce(btrim(p_ceruta_la), '') = '' then
    return false;
  end if;

  select id, coalesce(emag_config, '{}'::jsonb)
    into v_id, v_curent
    from privat.store_settings
   where business_id = p_business_id
   for update;

  if v_id is null then
    return false;
  end if;

  -- ⚠ Compare-and-set. `is distinct from` si nu `<>`: cu `null` de-o parte, `<>` da `null`,
  -- iar `if null then` nu intra pe nicio ramura — s-ar fi stins tacut cand nu trebuia.
  if v_curent->>'propagare_ceruta_la' is distinct from p_ceruta_la then
    return false;
  end if;

  update privat.store_settings
     set emag_config = (v_curent - 'propagare_ceruta_la' - 'propagare_op')
                       || jsonb_build_object('propagare_facuta_la', p_ceruta_la),
         updated_at  = now()
   where id = v_id;

  return true;
end;
$$;

comment on function public.emag_stinge_propagarea(uuid, text) is
  'Stinge intentia de propagare a setarilor, dar NUMAI daca e chiar cea servita (compare-and-set).';

-- ⚠ `PUBLIC` primeste EXECUTE implicit la fiecare `create or replace`, si functia e
-- `security definer` peste `privat.store_settings`. Fara revoke, oricine cu o cheie anonima
-- ar putea sterge intentia oricarui magazin, dand un `business_id` ghicit.
revoke execute on function public.emag_stinge_propagarea(uuid, text) from public, anon, authenticated;
grant execute on function public.emag_stinge_propagarea(uuid, text) to service_role;

notify pgrst, 'reload schema';
