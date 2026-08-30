-- ═══════════════════════════════════════════════════════════════════════════
-- TRANZITIA UNEI COMENZI, INTR-O SINGURA TRANZACTIE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Statusul, utilizarea cuponului si stocul erau trei drumuri separate la baza:
--
--     UPDATE orders SET status = 'cancelled'    -> reuseste
--     rpc release_order_discount                -> poate esua
--     rpc elibereaza_stoc_comanda               -> poate esua
--
-- Iar apelantii nici nu se uitau la eroare (`const { data: fel } = await ...`,
-- fara `error`), deci rezultatul unei picari era: comanda anulata, marfa inca
-- rezervata, raspuns de SUCCES si NICIO urma nicaieri. Exact familia „200, dar
-- starea e gresita" pentru care exista santinela.
--
-- Aici sunt una singura: ori se muta tot, ori nu se muta nimic.
--
-- ═══ DE CE HOTARASTE BAZA, NU APELANTUL ═══
--
-- Regulile („vanzarea se intoarce", „vanzarea se reia") se calculau in aplicatie
-- din statusul citit CU CATEVA DUS-INTORSURI INAINTE. Intre citire si scriere
-- statusul se putea schimba din alta parte — panoul, un lot, un webhook de plata
-- — si atunci se elibera stoc pentru o intoarcere care nu mai avea loc.
--
-- Aici se citesc sub `for update`, in aceeasi tranzactie cu scrierea. Apelantul
-- primeste inapoi valorile VECHI, ca sa-si poata trimite evenimentele (GA4,
-- emailuri) pe date adevarate, nu pe ce credea el ca era.
--
-- Trei apelanti au aceeasi secventa: `updateOrder`, `bulkUpdateOrderStatus` si
-- cronul. Scrisa de trei ori, a apucat-o deja pe drumuri diferite o data.

create or replace function public.aplica_tranzitia_comenzii(
  p_order_id       uuid,
  p_status         text,
  -- `null` = se pastreaza ce e. Lotul schimba doar statusul, nu si plata.
  p_payment_status text default null,
  -- Limita de magazin. Vezi verificarea din corp.
  p_business_id    uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  -- Statusurile care inseamna „vanzarea NU mai are loc". Aceeasi lista ca
  -- `GA4_REVERSAL` din aplicatie; sta aici fiindca aici se ia decizia.
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
    from public.orders
   where id = p_order_id
   for update;

  if not found then
    return jsonb_build_object('gasit', false);
  end if;

  /*
   * LIMITA DE MAGAZIN, verificata AICI si nu la apelant.
   *
   * Lotul din panou o avea in interogare (`.eq("business_id", ...)`) si a pierdut-o
   * cand a trecut pe un apel per comanda: un utilizator cu magazinul lui putea
   * trimite id-uri de comenzi din ALT magazin, si li s-ar fi schimbat statusul si
   * li s-ar fi eliberat stocul. Actiunile de server se pot chema cu orice
   * argumente, printr-un POST direct — vezi manifestul global de actiuni.
   *
   * `null` = apelantul a verificat apartenenta pe alt drum (`updateOrder` citeste
   * comanda si magazinul cu clientul utilizatorului, sub RLS).
   */
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  v_plata_noua := coalesce(p_payment_status, v_plata_veche);

  v_status_schimbat := p_status is distinct from v_status_vechi;
  v_plata_schimbata := v_plata_noua is distinct from v_plata_veche;
  v_bana_restituita := v_plata_noua = 'refunded' and v_plata_veche is distinct from 'refunded';

  v_intoarce := v_bana_restituita
                or (p_status = any(c_intoarse) and not (v_status_vechi = any(c_intoarse)));

  /*
   * Reluarea NU cere ca statusul vechi sa fi fost anulat.
   *
   * Cronul elibereaza comenzi ramase in `pending`, nu anulate. Cu o conditie pe
   * statusul vechi, comerciantul care duce apoi comanda `pending -> confirmed`
   * n-ar declansa nimic: comanda ar pastra reducerea, campania n-ar mai numara-o,
   * si o campanie de 4 ar servi 5. Gardele raman in `reclaim_order_discount` si
   * `revendica_stoc_comanda`: fara marcaj de eliberare nu se poate lua inapoi ce
   * n-a fost dat inapoi.
   */
  v_reia := not (p_status = any(c_intoarse));

  update public.orders
     set status         = p_status,
         payment_status = v_plata_noua,
         updated_at     = now()
   where id = p_order_id;

  if v_status_schimbat or v_bana_restituita then
    -- Cuponul: `discount_code` e poarta ieftina — 95 din 96 de comenzi n-au avut
    -- niciodata cupon, si atunci nu mai facem drumul.
    if v_cupon is not null then
      if v_intoarce then
        v_bool := public.release_order_discount(p_order_id);
        v_rez_cupon := case when v_bool then 'eliberat' else 'nimic' end;
      elsif v_reia then
        v_rez_cupon := coalesce(public.reclaim_order_discount(p_order_id), 'nimic');
      end if;
    end if;

    -- Stocul n-are poarta ieftina: aproape orice comanda consuma stoc, iar
    -- functiile ies imediat cand n-au ce face.
    if v_intoarce then
      v_rez_stoc := coalesce(public.elibereaza_stoc_comanda(p_order_id), 'nimic');
    elsif v_reia then
      v_json := public.revendica_stoc_comanda(p_order_id);
      v_rez_stoc := coalesce(v_json->>'fel', 'nimic');
      v_negative := coalesce(v_json->'negative', '[]'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
    'gasit', true,
    -- Valorile VECHI pleaca inapoi la apelant: pe ele isi trimite el evenimentul
    -- de rambursare catre GA4 si isi alege textul instiintarilor. Citite de el
    -- inainte, ar fi putut fi deja invechite.
    'status_vechi', v_status_vechi,
    'plata_veche', v_plata_veche,
    'status_schimbat', v_status_schimbat,
    'plata_schimbata', v_plata_schimbata,
    'vanzarea_se_intoarce', v_intoarce,
    'cupon', v_rez_cupon,
    'stoc', v_rez_stoc,
    'negative', v_negative);
end;
$$;

-- ── Stergerea comenzii, tot ori-tot-ori-nimic ────────────────────────────────
--
-- Ordinea de pana acum era corecta ca intentie si periculoasa ca rezultat:
--
--     elibereaza cupon  -> reuseste
--     elibereaza stoc   -> reuseste
--     DELETE order      -> ESUEAZA
--
-- si ramaneai cu o comanda care exista si al carei stoc fusese deja pus inapoi
-- pe raft. Adica supravanzare, din chiar incercarea de a nu pierde marfa. Nu se
-- repara inversand ordinea (dupa DELETE nu mai stii ce sa dai inapoi): se repara
-- punand tot intr-o tranzactie.
create or replace function public.sterge_comanda(p_order_id uuid, p_business_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cupon text;
  v_biz   uuid;
  v_stoc  text := 'nimic';
  v_bool  boolean;
begin
  select discount_code, business_id into v_cupon, v_biz
    from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('gasit', false);
  end if;
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  if v_cupon is not null then
    v_bool := public.release_order_discount(p_order_id);
  end if;
  v_stoc := coalesce(public.elibereaza_stoc_comanda(p_order_id), 'nimic');

  delete from public.orders where id = p_order_id;

  return jsonb_build_object('gasit', true, 'stoc', v_stoc);
end;
$$;

-- Semnaturile fara limita de magazin dispar, ca sa nu ramana o cale deschisa.
drop function if exists public.aplica_tranzitia_comenzii(uuid, text, text);
drop function if exists public.sterge_comanda(uuid);

revoke all on function public.aplica_tranzitia_comenzii(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.sterge_comanda(uuid, uuid) from public, anon, authenticated;
grant execute on function public.aplica_tranzitia_comenzii(uuid, text, text, uuid) to service_role;
grant execute on function public.sterge_comanda(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
