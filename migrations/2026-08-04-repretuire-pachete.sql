-- Pretul unui pachet urmareste componentele lui.
--
-- `buildBundleWrite` ingheata rezultatul lui `computeBundlePricing` in coloanele
-- `price` si `compare_at_price` la salvarea pachetului, si nimic nu-l mai
-- recalculeaza vreodata. Intre timp pretul unei componente se poate schimba din
-- PATRU cai independente, si niciuna nu stie de pachete:
--   `updateProduct`, `bulkProductAction kind:"price"`, importul de produse
--   (`import/committer.ts`) si feedul de stocuri (`stock-feed/applier.ts`).
-- A cincea e inevitabila. De asta regula sta in baza si nu in cod: e singurul loc
-- prin care trec toate.
--
-- Ce se intampla fara ea: „PACHET OFERTA KIT OBLIGATORIU" are 4 componente care
-- insumeaza 218,00 si -32%, deci 148,24. O componenta urcata de la 60 la 90 face
-- suma reala 248,00 si pretul corect 168,64 — dar pachetul ramane 148,24, adica
-- 20,40 lei pierduti la fiecare vanzare. Invers (componenta coborata), plateste
-- clientul. Iar sectiunea „Ce contine pachetul" de pe pagina listeaza chiar sub
-- pretul inghetat preturile CURENTE, deci pagina se contrazice singura.
--
-- Masurat inainte de aplicare (2026-08-04): 12 pachete, toate active, TOATE pe
-- `discount_percent`, si driftul fata de suma componentelor de azi e 0,00 lei pe
-- toate 11 cele cu componente intacte. Deci declansatorul nu schimba azi niciun
-- pret — se aprinde la prima modificare de pret pe o componenta.
--
-- Ce NU face, deliberat:
--   - nu atinge pachetele pe `pricing_mode = 'fixed'`. Acolo `fixed_price` nu se
--     persista nicaieri (`bundle.actions.ts` il foloseste si il arunca), deci
--     coloana `price` E singura urma a deciziei comerciantului: recalculata, s-ar
--     pierde. Azi nu exista niciun pachet pe modul asta.
--   - nu atinge pachetele cu componente lipsa. Suma lor ar iesi mai mica cu
--     valoarea componentei disparute, adica pachetul s-ar ieftini singur in loc sa
--     fie reparat. Ele se dezactiveaza oricum la stergerea componentei
--     (`dezactiveazaPacheteleCu`), iar formularul refuza sa le salveze.
--   - nu ATINGE stocul, statusul sau vizibilitatea. Doar cele doua preturi.

create or replace function public.repretuieste_pachetele_cu(p_component_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select b.id, b.business_id,
           b.page_sections->'bundle' as cfg,
           b.page_sections->'bundle'->>'pricing_mode' as mod
    from public.products b
    where b.is_bundle
      and b.page_sections->'bundle'->'items' @> jsonb_build_array(jsonb_build_object('product_id', p_component_id::text))
  loop
    -- Modul `fixed` isi tine pretul in coloana; nu se recalculeaza.
    if coalesce(r.mod, 'fixed') = 'fixed' then
      continue;
    end if;

    declare
      v_suma      numeric := 0;
      v_lipsa     integer := 0;
      v_pret      numeric;
      v_procent   numeric := coalesce((r.cfg->>'discount_percent')::numeric, 0);
      v_valoare   numeric := coalesce((r.cfg->>'discount_amount')::numeric, 0);
    begin
      -- Suma componentelor, si cate dintre ele nu se mai gasesc.
      select coalesce(sum(round(c.price, 2) * greatest(coalesce((it->>'quantity')::numeric, 1), 1)), 0),
             count(*) filter (where c.id is null)
        into v_suma, v_lipsa
        from jsonb_array_elements(r.cfg->'items') it
        left join public.products c on c.id = (it->>'product_id')::uuid;

      -- Pachet incomplet: nu se atinge. Vezi comentariul de sus.
      if v_lipsa > 0 or v_suma <= 0 then
        continue;
      end if;

      if r.mod = 'discount_percent' then
        v_pret := round(v_suma * (1 - least(greatest(v_procent, 0), 100) / 100), 2);
      else
        v_pret := round(greatest(v_suma - greatest(v_valoare, 0), 0), 2);
      end if;

      -- `is distinct from` ca sa nu se scrie degeaba si sa nu urce `updated_at`
      -- pe cele 12 pachete la fiecare atingere de pret din catalog.
      update public.products
      set price = v_pret,
          compare_at_price = round(v_suma, 2),
          updated_at = now()
      where id = r.id
        and (price is distinct from v_pret or compare_at_price is distinct from round(v_suma, 2));

      -- Pretul schimbat in baza trebuie sa ajunga si in feeduri, altfel Google
      -- ramane pe cel vechi — exact divergenta pagina-vs-feed pe care o inchide
      -- constatarea 19. Cronul citeste STRICT din coada (nu re-sincronizeaza tot),
      -- deci pachetul se pune aici. `found` = s-a scris ceva mai sus.
      if found then
        insert into public.gmc_sync_queue (business_id, product_id, offer_id, op)
        values (r.business_id, r.id, r.id, 'upsert')
        on conflict (business_id, offer_id, op) do nothing;
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.trg_repretuieste_pachetele()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.repretuieste_pachetele_cu(new.id);
  return new;
end;
$$;

-- `AFTER UPDATE OF price`, si numai pe produsele obisnuite: un pachet nu poate fi
-- componenta a altui pachet (`getBundleEligibleProducts` filtreaza `is_bundle`),
-- iar fara conditia asta declansatorul s-ar chema pe el insusi la fiecare
-- repretuire.
drop trigger if exists products_repretuieste_pachetele on public.products;
create trigger products_repretuieste_pachetele
  after update of price on public.products
  for each row
  when (not coalesce(new.is_bundle, false) and new.price is distinct from old.price)
  execute function public.trg_repretuieste_pachetele();

revoke all on function public.repretuieste_pachetele_cu(uuid) from public;
revoke all on function public.repretuieste_pachetele_cu(uuid) from anon;
revoke all on function public.repretuieste_pachetele_cu(uuid) from authenticated;
grant execute on function public.repretuieste_pachetele_cu(uuid) to service_role;
