-- ══════════════════════════════════════════════════════════════════════════
-- „RETURNAT" NU INSEAMNA „INAPOI PE RAFT" (25.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `aplica_tranzitia_comenzii` trateaza `refunded` si `cancelled` la fel: amandoua intorc
-- vanzarea, deci elibereaza stocul intregii comenzi. Pentru o ANULARE e limpede corect —
-- marfa n-a plecat nicaieri.
--
-- Pentru un RETUR nu e. Iar eMAG trimite statusul 5 „Returned", pe care il mapam la
-- `refunded` (si asa trebuie: „returned" nu exista in `orders_status_check`, iar `refunded`
-- e si intelesul potrivit pentru bani). Efectul asupra stocului insa nu e potrivit deloc.
--
-- ═══ ⚠ SI E EXACT OPUSUL REGULII PE CARE O AVEM DEJA SCRISA ═══
--
-- `src/lib/emag/rma.ts` spune, negru pe alb: „STOCUL NU SE PUNE INAPOI AUTOMAT. NICIODATA,
-- DEOCAMDATA." Motivul e bun: marfa intoarsa nu e mereu vandabila — vine desfacuta,
-- zgariata, incompleta, sau pur si simplu alta decat cea trimisa. Un retur „Primit" inseamna
-- ca a ajuns coletul, nu ca produsul e bun de pus la loc pe raft.
--
-- Deci pana azi aveam doua reguli care se bateau cap in cap:
--
--   RMA eMAG          -> nu repune stocul, omul se uita la marfa si o adauga de mana
--   status 5 Returned -> repune stocul INTREGII comenzi, singur
--
-- ⚠ CE COSTA, PE DOUA DRUMURI DEODATA:
--
--   1. Comanda are trei produse, clientul intoarce unul. Statusul 5 pune inapoi TREI.
--   2. Comerciantul vede returul, verifica marfa, si adauga de mana ce e bun — peste stocul
--      pus deja automat. Se dubleaza.
--
-- Si ambele se vad abia la inventar, cand nu se mai stie de unde a venit diferenta.
--
-- ═══ CE SE SCHIMBA ═══
--
-- Statusul ramane `refunded`: problema nu e starea, ci efectul asupra stocului. Functia
-- primeste `p_elibereaza_stoc`, iar apelantul spune ce vrea:
--
--   eMAG status 0 Cancelled -> `cancelled`, elibereaza      (marfa n-a plecat nicaieri)
--   eMAG status 5 Returned  -> `refunded`,  NU elibereaza    (marfa se verifica intai)
--
-- ⚠ IMPLICITUL RAMANE CEL DE AZI (`null` = elibereaza). Toti ceilalti apelanti — panoul,
-- loturile, `editeaza_comanda_atomic`, celelalte canale — cheama cu patru argumente si se
-- poarta neschimbat. O reparatie care ar fi schimbat implicitul ar fi atins fiecare anulare
-- din aplicatie ca sa repare un singur drum de retur.
--
-- ⚠ CUPONUL NU SE ATINGE: la un retur banii chiar se intorc, deci folosirea reducerii se
-- elibereaza ca pana acum. Numai marfa are nevoie de ochii omului.

-- ⚠ Semnatura se schimba, deci vechea forma se sterge ANUME. Lasata, ar fi ramas o a doua
-- functie cu acelasi nume si patru argumente — chemabila, si fara paza noua.
drop function if exists public.aplica_tranzitia_comenzii(uuid, text, text, uuid);

create or replace function public.aplica_tranzitia_comenzii(
  p_order_id uuid,
  p_status text,
  p_payment_status text default null,
  p_business_id uuid default null,
  p_elibereaza_stoc boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c_intoarse constant text[] := array['refunded', 'cancelled'];
  v_status_vechi text;
  v_plata_veche  text;
  v_cupon        text;
  v_biz          uuid;
  v_plata_noua   text;
  v_status_schimbat boolean;
  v_plata_schimbata boolean;
  v_bana_restituita boolean;
  v_intoarce        boolean;
  v_reia            boolean;
  v_rez_cupon text := 'nimic';
  v_rez_stoc  text := 'nimic';
  v_negative  jsonb := '[]'::jsonb;
  v_bool      boolean;
  v_json      jsonb;
begin
  select status, payment_status, discount_code, business_id
    into v_status_vechi, v_plata_veche, v_cupon, v_biz
    from public.orders where id = p_order_id for update;

  if not found then return jsonb_build_object('gasit', false); end if;

  -- LIMITA DE MAGAZIN, verificata AICI si nu la apelant. Lotul din panou o avea in
  -- interogare si a pierdut-o cand a trecut pe un apel per comanda: un utilizator putea
  -- trimite id-uri de comenzi din ALT magazin, si li s-ar fi schimbat statusul si li s-ar fi
  -- eliberat stocul. Actiunile de server se pot chema cu orice argumente, printr-un POST
  -- direct. `null` = apelantul a verificat deja apartenenta pe alt drum.
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  v_plata_noua := coalesce(p_payment_status, v_plata_veche);
  v_status_schimbat := p_status is distinct from v_status_vechi;
  v_plata_schimbata := v_plata_noua is distinct from v_plata_veche;
  v_bana_restituita := v_plata_noua = 'refunded' and v_plata_veche is distinct from 'refunded';
  v_intoarce := v_bana_restituita
                or (p_status = any(c_intoarse) and not (v_status_vechi = any(c_intoarse)));
  v_reia := not (p_status = any(c_intoarse));

  update public.orders
     set status = p_status, payment_status = v_plata_noua, updated_at = now()
   where id = p_order_id;

  if v_status_schimbat or v_bana_restituita then
    if v_cupon is not null then
      if v_intoarce then
        v_bool := public.release_order_discount(p_order_id);
        v_rez_cupon := case when v_bool then 'eliberat' else 'nimic' end;
      elsif v_reia then
        v_rez_cupon := coalesce(public.reclaim_order_discount(p_order_id), 'nimic');
      end if;
    end if;

    if v_intoarce then
      -- ⚠ AICI E TOATA REPARATIA. Un RETUR nu inseamna marfa vandabila inapoi pe raft: poate
      -- veni desfacuta, incompleta, sau se intoarce doar o parte din comanda. Iar `rma.ts`
      -- spune deja ca omul o pune inapoi de mana, dupa ce se uita la ea — pusa si automat de
      -- aici, s-ar fi dublat.
      --
      -- ⚠ `coalesce(..., true)`: cine nu spune nimic pastreaza purtarea de pana acum.
      if coalesce(p_elibereaza_stoc, true) then
        v_rez_stoc := coalesce(public.elibereaza_stoc_comanda(p_order_id), 'nimic');
      else
        v_rez_stoc := 'lasat-consumat';
      end if;
    elsif v_reia then
      v_json := public.revendica_stoc_comanda(p_order_id);
      v_rez_stoc := coalesce(v_json->>'fel', 'nimic');
      v_negative := coalesce(v_json->'negative', '[]'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
    'gasit', true, 'status_vechi', v_status_vechi, 'plata_veche', v_plata_veche,
    'status_schimbat', v_status_schimbat, 'plata_schimbata', v_plata_schimbata,
    'vanzarea_se_intoarce', v_intoarce, 'cupon', v_rez_cupon,
    'stoc', v_rez_stoc, 'negative', v_negative);
end;
$function$;

-- ⚠ `security definer` peste comenzile oricui: fara revoke, EXECUTE se intoarce la PUBLIC
-- dupa fiecare `create or replace`.
--
-- ⚠ SI NUMAI `service_role`, exact ca la forma veche (masurat: `{postgres=X, service_role=X}`).
-- Un `grant ... to authenticated` scris din reflex ar fi deschis un `security definer` peste
-- comenzile oricui catre orice utilizator conectat — o gaura mai mare decat defectul reparat.
revoke execute on function public.aplica_tranzitia_comenzii(uuid, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.aplica_tranzitia_comenzii(uuid, text, text, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
