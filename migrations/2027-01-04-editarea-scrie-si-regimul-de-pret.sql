-- `editeaza_comanda_atomic` chiar scrie regimul de pret — 09.09.2026
--
-- ═══ CE REPARA ═══
--
-- Functia aplica fiecare camp din `p_patch` cu `coalesce(p_patch->>'x', x)`, deci ce nu se
-- trimite ramane neschimbat. Bun, si chiar pe asta se sprijina poarta noua din
-- `updateOrderDetails`: pe o comanda de marketplace nu se mai trimite niciun camp de bani.
--
-- ⚠ DAR `prices_include_vat` NU ERA IN LISTA DE `SET`. Aplicatia il trimitea, si el nu
-- ajungea nicaieri: o scriere care nu scria, si care arata in cod exact ca una care scrie.
--
-- Se vede pe un singur drum, si tot merita inchis: comanda din magazin plasata cand
-- preturile erau FARA TVA, editata dupa ce comerciantul a trecut magazinul pe preturi CU
-- TVA. Totalul se resocoteste brut (asa cere editarea), dar semnul ar fi ramas „net” — iar
-- facturarea, care de pe 09.09.2026 crede semnul comenzii inaintea setarii magazinului, ar
-- fi refuzat documentul.
--
-- Restul corpului e neatins, cuvant cu cuvant.

CREATE OR REPLACE FUNCTION public.editeaza_comanda_atomic(p_order_id uuid, p_business_id uuid, p_patch jsonb, p_produse jsonb, p_variante jsonb, p_status_asteptat text DEFAULT NULL::text, p_produse_minus jsonb DEFAULT '[]'::jsonb, p_variante_minus jsonb DEFAULT '[]'::jsonb, p_produse_necesar jsonb DEFAULT '[]'::jsonb, p_variante_necesar jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_biz      uuid;
  v_rez      jsonb;
  v_status   text;
  v_eliberat timestamptz;
  v_calc     jsonb;
  v_nou      jsonb;
  v_misca    boolean;
begin
  select business_id, stoc_rezervat, status, stoc_eliberat_la
    into v_biz, v_rez, v_status, v_eliberat
    from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('gasit', false); end if;
  -- Limita de magazin, ca la celelalte: actiunile de server se pot chema cu orice
  -- argumente, printr-un POST direct.
  if p_business_id is not null and v_biz is distinct from p_business_id then
    return jsonb_build_object('gasit', false, 'motiv', 'alt magazin');
  end if;

  /*
   * === STATUSUL SE VERIFICA SUB LACAT ===
   *
   * Comerciantul citeste comanda, ii vede statusul, rezerva stocul pentru liniile
   * noi - si abia apoi ajunge aici. Intre citire si scriere, altcineva (panoul,
   * un lot, un webhook de marketplace) poate ANULA comanda si elibera stocul ei.
   * Fara verificarea de aici, editarea se aplica peste o comanda deja anulata si
   * ii adauga stoc rezervat proaspat - pe care anularea, deja intamplata, nu-l mai
   * elibereaza niciodata.
   */
  if p_status_asteptat is not null and v_status is distinct from p_status_asteptat then
    return jsonb_build_object('gasit', false, 'motiv', 'status schimbat',
                              'status_curent', v_status, 'asteptat', p_status_asteptat);
  end if;

  v_misca := jsonb_array_length(coalesce(p_produse,        '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_variante,       '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_produse_minus,  '[]'::jsonb)) > 0
          or jsonb_array_length(coalesce(p_variante_minus, '[]'::jsonb)) > 0;

  /*
   * === STOCUL DEJA ELIBERAT NU SE MAI MISCA ===
   *
   * `stoc_eliberat_la` inseamna ca marfa comenzii s-a intors deja pe raft -
   * comanda e anulata, rambursata, sau doar cu `payment_status = 'refunded'`
   * (`aplica_tranzitia_comenzii` elibereaza si pe drumul asta, fara sa schimbe
   * statusul). Ultimul caz TRECE de garda din aplicatie, care se uita doar la
   * status.
   *
   * Peste o comanda in starea asta, o adaugare ar scadea stoc pe care anularea
   * l-a dat deja inapoi, iar o scoatere ar da inapoi bucati intoarse o data.
   * Datele clientului se pot corecta oricand; marfa, nu.
   */
  if v_eliberat is not null and v_misca then
    return jsonb_build_object('gasit', false, 'motiv', 'stoc eliberat');
  end if;

  /*
   * Comanda dinainte de coloana (`stoc_rezervat is null`) ramane NULL.
   *
   * Nu se stie ce a consumat, deci nu se poate nici da inapoi, nici scrie acum
   * doar liniile atinse: scrisa asa, ar arata ca si cum atat ar fi consumat, iar
   * `elibereaza_stoc_comanda` ar raporta „eliberat" dupa ce ar da inapoi o farama.
   * Apelantul afla din `stoc_cunoscut` si spune omului sa corecteze de mana.
   */
  if v_rez is null then
    v_nou  := null;
    v_calc := jsonb_build_object('produse', '[]'::jsonb, 'variante', '[]'::jsonb);
  else
    v_calc := public.scade_din_rezervat(v_rez, p_produse_minus, p_variante_minus,
                                        p_produse_necesar, p_variante_necesar);
    v_nou  := jsonb_build_object(
      'produse',  coalesce(v_calc->'rezervat'->'produse',  '[]'::jsonb) || coalesce(p_produse,  '[]'::jsonb),
      'variante', coalesce(v_calc->'rezervat'->'variante', '[]'::jsonb) || coalesce(p_variante, '[]'::jsonb));
  end if;

  update public.orders set
    customer_name    = coalesce(p_patch->>'customer_name', customer_name),
    customer_phone   = coalesce(p_patch->>'customer_phone', customer_phone),
    customer_email   = case when p_patch ? 'customer_email' then nullif(p_patch->>'customer_email','') else customer_email end,
    shipping_address = coalesce(p_patch->'shipping_address', shipping_address),
    items            = coalesce(p_patch->'items', items),
    subtotal         = coalesce((p_patch->>'subtotal')::numeric, subtotal),
    shipping_cost    = coalesce((p_patch->>'shipping_cost')::numeric, shipping_cost),
    cod_fee_amount   = coalesce((p_patch->>'cod_fee_amount')::numeric, cod_fee_amount),
    vat_amount       = coalesce((p_patch->>'vat_amount')::numeric, vat_amount),
    vat_rate         = coalesce((p_patch->>'vat_rate')::numeric, vat_rate),
    -- Regimul de pret al comenzii.
    --
    -- ⚠ LIPSEA DIN LISTA, iar aplicatia il trimitea in `p_patch`: o scriere care nu scria.
    -- Conteaza pe comanda din magazin plasata cand preturile erau FARA TVA si editata dupa
    -- ce comerciantul a trecut magazinul pe preturi CU TVA: totalul se resocoteste brut,
    -- iar semnul ar fi ramas „net”, si atunci facturarea refuza documentul.
    --
    -- ⚠ Pe comenzile de MARKETPLACE nu se trimite deloc, si atunci `coalesce` pastreaza ce
    -- era: banii lor sunt o fotografie. Vezi `updateOrderDetails`.
    prices_include_vat = coalesce((p_patch->>'prices_include_vat')::boolean, prices_include_vat),
    total            = coalesce((p_patch->>'total')::numeric, total),
    updated_at       = now(),
    stoc_rezervat    = v_nou
  where id = p_order_id;

  /*
   * Darea inapoi, in ACEEASI tranzactie cu scrierea de mai sus.
   *
   * Produsele intai, variantele dupa - ordinea impusa de declansatorul care pune
   * `stock_quantity` = suma combinatiilor. Vezi antetul lui
   * `2026-08-17-eliberare-stoc-comanda.sql`.
   */
  perform public.elibereaza_stoc_complet(v_calc->'produse', v_calc->'variante');

  return jsonb_build_object(
    'gasit', true,
    'stoc_cunoscut', v_rez is not null,
    'eliberat', jsonb_build_object('produse', v_calc->'produse', 'variante', v_calc->'variante'));
end;
$function$
;
