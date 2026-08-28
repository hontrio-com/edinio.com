-- ═══════════════════════════════════════════════════════════════════════════
-- `revoke … from public` NU IA SI GRANTURILE DATE PE NUME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (28.08.2026, dimineata)
--
-- Migratiile de ieri se incheiau cu `revoke execute … from public`, si o proba scrisa cu luni in
-- urma cerea exact asta — deci totul parea inchis. Numai ca Supabase da EXECUTE lui `anon` si
-- `authenticated` PE NUME, prin privilegii implicite, iar `from public` nu atinge un grant nominal.
--
-- Citit in productie, nu in fisier:
--
--     aboutyou_incheie_scoaterea  ->  anon=X | authenticated=X | service_role=X
--     aboutyou_ceas_urmator       ->  anon=X | authenticated=X | service_role=X
--
-- Iar `aboutyou_incheie_scoaterea` face `delete from public.aboutyou_listings`, cu `security
-- definer` — adica ocolind RLS. Cine ii afla cele doua chei ii poate cere stergerea.
--
-- ⚠ SI PROBA CARE PAZEA ERA PREA SLABA: cerea revocarea de la PUBLIC si atat. A trecut verde peste
-- exact gaura pe care trebuia s-o vada. E a patra oara saptamana asta.
--
-- ═══ SI DE CE NU SE FACE O MATURARE PESTE TOT ═══
--
-- In toata baza sunt saisprezece functii `security definer` cu `anon=X`. Zece dintre ele NU trebuie
-- atinse, si maturate ar rupe magazinul:
--
--   `catalog_cauta`, `catalog_pagina`, `catalog_randuri` — chiar vitrina publica le cheama, cu
--     cheia anonima; de-aia sunt `security definer`.
--   `is_admin` — o cheama NOUA politici RLS, iar politicile ruleaza cu rolul apelantului: fara
--     EXECUTE pentru `authenticated`, fiecare din ele ar cadea.
--
-- Deci se inchid tintit cele care SCRIU, si declansatoarele — care oricum nu se pot chema ca
-- functii („trigger functions can only be called as triggers"), dar nu costa nimic sa fie inchise.

revoke all on function public.aboutyou_ceas_urmator(uuid, text, text) from public, anon, authenticated;
grant execute on function public.aboutyou_ceas_urmator(uuid, text, text) to service_role;

revoke all on function public.aboutyou_incheie_scoaterea(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.aboutyou_incheie_scoaterea(uuid, text, integer) to service_role;

revoke all on function public.aboutyou_elibereaza_anulari(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.aboutyou_elibereaza_anulari(uuid, text, jsonb) to service_role;

-- Declansatoarele: inchise pentru curatenie, nu pentru ca ar fi fost o poarta.
revoke all on function public.aboutyou_marcheaza_listarea() from public, anon, authenticated;
revoke all on function public.aboutyou_marcheaza_modificarea() from public, anon, authenticated;
revoke all on function public.aboutyou_marcheaza_varianta() from public, anon, authenticated;
revoke all on function public.trg_catalog_cuvinte_murdar() from public, anon, authenticated;
revoke all on function public.trg_catalog_proiectie() from public, anon, authenticated;
revoke all on function public.trg_catalog_rezumat_murdar() from public, anon, authenticated;
revoke all on function public.trg_categorii_rezumat_murdar() from public, anon, authenticated;
revoke all on function public.trg_repretuieste_pachetele() from public, anon, authenticated;

-- ⚠ Nu mai e chemata de nimeni de cand ceasul a luat locul generatiei de pe listare. Lasata, ar fi
-- ramas o a doua cale de a misca starea, deschisa lui `anon`, pe care n-o mai paziseste nimeni.
drop function if exists public.aboutyou_status_generatie_noua(uuid, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- SI COMPARAREA E DE EGALITATE, NU DE ORDINE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ `p_generatie < v_ceas` inseamna „nu e mai vechi", nu „e chiar cel curent". Cu un numar mare —
-- `2147483647` — verificarea trece si stergerea se face:
--
--     ceasul 10, p_generatie 2147483647
--     2147483647 < 10 -> fals -> nu e depasit -> STERGE
--
-- O comparare-si-schimba adevarata cere EGALITATE. Si mai inchide un drum, nu doar pe cel rau
-- intentionat: un lot dintr-o generatie mai NOUA decat ceasul n-ar trebui sa existe, iar daca
-- exista, e un semn ca ceva s-a stricat — nu o incuviintare de a sterge.

create or replace function public.aboutyou_incheie_scoaterea(
  p_business_id uuid, p_style_key text, p_generatie integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ceas integer;
  v_listing uuid;
  v_product uuid;
begin
  select generatie into v_ceas
    from public.aboutyou_ceas_stare
   where business_id = p_business_id and style_key = p_style_key
     for update;

  if not found then
    return 'fara-ceas';
  end if;

  -- ⚠ EGALITATE. Vezi nota de mai sus: `<` lasa sa treaca orice numar mai mare decat ceasul.
  if p_generatie is null or p_generatie <> v_ceas then
    return 'depasit';
  end if;

  select id, product_id into v_listing, v_product
    from public.aboutyou_listings
   where business_id = p_business_id and style_key = p_style_key
     for update;
  if not found then
    return 'lipsa';
  end if;

  insert into public.aboutyou_sku_istoric (business_id, sku, product_id, variant_title, scos_la)
  select v.business_id, v.sku, v.product_id, v.variant_title, now()
    from public.aboutyou_variants v
   where v.listing_id = v_listing
  on conflict (business_id, sku)
  do update set product_id = excluded.product_id,
                variant_title = excluded.variant_title,
                scos_la = excluded.scos_la;

  insert into public.aboutyou_listari_scoase
    (business_id, style_key, product_id, status_generatie, scos_la, reasertari)
  values (p_business_id, p_style_key, v_product, v_ceas, now(), 0)
  on conflict (business_id, style_key)
  do update set product_id = excluded.product_id,
                status_generatie = excluded.status_generatie,
                scos_la = excluded.scos_la,
                reasertari = 0;

  delete from public.aboutyou_listings where id = v_listing;
  return 'sters';
end;
$$;

revoke all on function public.aboutyou_incheie_scoaterea(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.aboutyou_incheie_scoaterea(uuid, text, integer) to service_role;

notify pgrst, 'reload schema';
