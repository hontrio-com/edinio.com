-- ══════════════════════════════════════════════════════════════════════════
-- RETURURILE TRENDYOL: FORMA LOR ADEVARATA, SI O REPUNERE CARE NU SE DUBLEAZA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Doua lucruri, amandoua masurate azi (26.08.2026).
--
-- ─── 1) Liniile returului stau cu UN NIVEL MAI ADANC decat le citeam ───
--
-- Verificat in referinta lor (`getClaims`): raspunsul e
--
--   claim
--   └── items[]
--       ├── orderLine   { id, productName, barcode, merchantSku, price, ... }
--       └── claimItems[]{ id, orderLineItemId, customerClaimItemReason,
--                         trendyolClaimItemReason, claimItemStatus, customerNote,
--                         resolved, autoAccepted, acceptedBySeller }
--
-- Noi citeam `items[]` ca si cum ar fi chiar liniile. Pe forma lor adevarata, `items[i].id` nu
-- exista, deci fiecare linie ar fi fost SARITA — iar returul ar fi aparut in panou cu zero
-- produse. Aratand complet, si gol.
--
-- ⚠ NU S-A PUTUT MASURA PE TRAFIC: ambele conturi au zero cereri de retur, pe orice fereastra
-- si orice stare (verificat direct pe API-ul lor, 200 cu `content: null`). De-aia se citesc
-- AMANDOUA formele, si de-aia proba are un tipar copiat dupa referinta.
--
-- ⚠ SI `orderShipmentPackageId`, NU `shipmentPackageId`. Al doilea nu exista in raspuns.
--
-- ⚠ FIECARE `claimItem` E O BUCATA. Nu au camp de cantitate: un retur de trei bucati vine ca
-- trei elemente cu id-uri diferite. Deci `quantity` ramane 1 pe linie — nu din lipsa de date,
-- ci fiindca asta INSEAMNA un claimItem la ei.
--
-- ─── 2) Repunerea in stoc se facea in trei pasi, deci se putea dubla ───
--
-- Era: citeste marcajul → aduna stocul → scrie marcajul. Doua apasari repezi treceau amandoua
-- de citire cu marcajul gol, si stocul crestea de doua ori. Sau adunarea reusea si scrierea
-- marcajului pica, iar omul incerca din nou.
--
-- ⚠ ACUM E O SINGURA TRANZACTIE, cu randul luat `for update`. A doua apasare asteapta, apoi
-- vede marcajul si nu mai adauga nimic. Stocul e ultimul loc unde iti permiti doua socoteli.

alter table public.trendyol_claim_items
  add column if not exists claim_item_status text,
  add column if not exists order_line_id text;

comment on column public.trendyol_claim_items.claim_item_status is
  'Starea LINIEI la ei (claimItemStatus). Cea de pe cerere nu spune ce e cu fiecare bucata.';
comment on column public.trendyol_claim_items.order_line_id is
  'orderLine.id de la ei: leaga linia returului de linia comenzii.';

create or replace function public.trendyol_repune_stoc_retur(
  p_business_id uuid,
  p_claim_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_linie public.trendyol_claim_items%rowtype;
  v_listing_id uuid;
  v_variant_title text;
  v_product_id uuid;
begin
  -- ⚠ `for update` E TOT ROSTUL FUNCTIEI. Fara el, doua apasari citesc amandoua un marcaj gol
  -- si aduna amandoua. Cu el, a doua asteapta si gaseste treaba facuta.
  select * into v_linie
    from public.trendyol_claim_items
   where business_id = p_business_id
     and claim_item_id = p_claim_item_id
   for update;

  if not found then
    return jsonb_build_object('stare', 'lipsa', 'pus', 0);
  end if;

  -- Nu e o eroare: e chiar raspunsul corect la a doua apasare.
  if v_linie.repus_in_stoc_la is not null then
    return jsonb_build_object('stare', 'deja', 'pus', 0);
  end if;

  if coalesce(v_linie.barcode, '') = '' then
    return jsonb_build_object('stare', 'fara-cod', 'pus', 0);
  end if;

  select v.listing_id, v.variant_title into v_listing_id, v_variant_title
    from public.trendyol_variants v
   where v.business_id = p_business_id
     and v.barcode = v_linie.barcode
   limit 1;

  if v_listing_id is null then
    return jsonb_build_object('stare', 'cod-nelegat', 'pus', 0);
  end if;

  select l.product_id into v_product_id
    from public.trendyol_listings l
   where l.id = v_listing_id;

  if v_product_id is null then
    return jsonb_build_object('stare', 'fara-produs', 'pus', 0);
  end if;

  -- ⚠ FUNCTIA CASEI, nu o adunare scrisa aici: `elibereaza_stoc_complet` e chiar cea prin care
  -- se intoarce stocul la anulari, si stie amandoua felurile — produsul intreg si combinatia.
  -- ⚠ Variantele merg pe `variant_title`, nu pe un indice: indicii se muta cand comerciantul
  -- rearanjeaza combinatiile, titlurile nu.
  if coalesce(v_variant_title, '') <> '' then
    perform public.elibereaza_stoc_complet(
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'product_id', v_product_id, 'variant_title', v_variant_title, 'quantity', v_linie.quantity)));
  else
    perform public.elibereaza_stoc_complet(
      jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'quantity', v_linie.quantity)),
      '[]'::jsonb);
  end if;

  update public.trendyol_claim_items
     set repus_in_stoc_la = now(), updated_at = now()
   where id = v_linie.id;

  return jsonb_build_object('stare', 'pus', 'pus', v_linie.quantity);
end;
$$;

comment on function public.trendyol_repune_stoc_retur(uuid, text) is
  'Repune in stoc o linie de retur, o singura data. Randul se ia `for update`: a doua apasare nu mai aduna.';

-- ⚠ `security definer` peste stocul oricui: fara revoke, EXECUTE ramane la PUBLIC dupa fiecare
-- `create or replace`. Actiunea de server isi verifica magazinul inainte s-o cheme.
revoke execute on function public.trendyol_repune_stoc_retur(uuid, text) from public, anon, authenticated;
grant execute on function public.trendyol_repune_stoc_retur(uuid, text) to service_role;

notify pgrst, 'reload schema';
