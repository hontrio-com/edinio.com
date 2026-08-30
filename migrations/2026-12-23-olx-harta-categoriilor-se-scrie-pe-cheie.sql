-- ═══════════════════════════════════════════════════════════════════════════
-- HARTA CATEGORIILOR SE SCRIE PE CHEIE, NU INTREAGA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (31.08.2026)
--
-- `saveOlxCategoryMapEntry` citea configul, copia `category_map`, schimba o cheie si scria HARTA
-- INTREAGA inapoi. Iar `jsonb_merge_config` imbina SUPERFICIAL (`v_curent || p_patch`), deci un
-- petic care poarta `category_map` inlocuieste harta cu totul:
--
--     fila A si fila B au amandoua harta {Bijuterii}
--     A mapeaza „Ceasuri"  -> scrie {Bijuterii, Ceasuri}
--     B mapeaza „Genti"    -> scrie {Bijuterii, Genti}
--     -> „Ceasuri" a disparut, si nimeni n-a vazut nicio eroare ❌
--
-- Iar pierderea nu se vede: produsele din categoria disparuta nu mai pleaca la OLX, si motivul
-- scris pe ele e „Categoria produsului nu este mapata" — adica exact ce omul crede ca a facut.
--
-- ⚠ E ACEEASI GRESEALA CA LA TOKEN, cu alt obiect. Acolo peticul purta `refresh_token`-ul citit cu
-- o clipa inainte si stergea rotatia cronului; aici poarta harta citita cu o clipa inainte si
-- sterge maparea celeilalte file. Leacul e acelasi: nu se trimite ce ai citit, se cere baza sa
-- schimbe exact bucata pe care o vrei.
--
-- ═══ DE CE NU SE ADANCESTE `jsonb_merge_config` ═══
--
-- Ar fi parut mai curat: o imbinare recursiva, si toate integrarile castiga. Dar functia aia e
-- folosita de TOATE cele cinci, iar adancita, un petic care vrea sa GOLEASCA un obiect n-ar mai
-- putea: `{"category_map": {}}` ar inceta sa mai insemne „sterge tot". O schimbare tacuta de
-- inteles peste cinci integrari, pentru o singura nevoie.
--
-- ⚠ SE SCRIE PE `privat.store_settings`, adica peste CIFRUL secretelor. `jsonb_set` pe o cale
-- nesecreta lasa `access_token` si `refresh_token` exact cum erau — nu le atinge, deci nu le nici
-- decripteaza, nici nu le recripteaza. Vederea publica le va decripta la citire ca de obicei.

create or replace function public.olx_seteaza_categoria(
  p_business_id uuid,
  p_categorie   text,
  p_intrare     jsonb
) returns void
language plpgsql
security definer
set search_path to 'public', 'privat', 'pg_temp'
as $$
declare
  v_id     uuid;
  v_config jsonb;
  v_harta  jsonb;
begin
  if p_business_id is null then
    raise exception 'business_id lipsa';
  end if;
  if coalesce(btrim(p_categorie), '') = '' then
    raise exception 'numele categoriei lipseste';
  end if;
  -- `p_intrare` null inseamna „scoate maparea"; orice altceva trebuie sa fie obiect.
  if p_intrare is not null and jsonb_typeof(p_intrare) <> 'object' then
    raise exception 'intrarea trebuie sa fie un obiect jsonb';
  end if;

  select id, coalesce(olx_config, '{}'::jsonb)
    into v_id, v_config
    from privat.store_settings
   where business_id = p_business_id
     for update;

  -- Ca `jsonb_merge_config`: fara rand, nu e nimic de scris.
  if v_id is null then
    return;
  end if;

  -- ⚠ Un `olx_config` care nu e obiect (import prost, coloana atinsa de mana) ar face `jsonb_set`
  -- sa arunce. Se porneste atunci de la gol, in loc sa pice salvarea omului.
  if jsonb_typeof(v_config) <> 'object' then
    v_config := '{}'::jsonb;
  end if;

  v_harta := coalesce(v_config -> 'category_map', '{}'::jsonb);
  if jsonb_typeof(v_harta) <> 'object' then
    v_harta := '{}'::jsonb;
  end if;

  if p_intrare is null then
    v_harta := v_harta - p_categorie;
  else
    v_harta := v_harta || jsonb_build_object(p_categorie, p_intrare);
  end if;

  update privat.store_settings
     set olx_config = jsonb_set(v_config, '{category_map}', v_harta, true),
         updated_at = now()
   where id = v_id;
end;
$$;

revoke execute on function public.olx_seteaza_categoria(uuid, text, jsonb) from public;
revoke execute on function public.olx_seteaza_categoria(uuid, text, jsonb) from anon;
revoke execute on function public.olx_seteaza_categoria(uuid, text, jsonb) from authenticated;
grant  execute on function public.olx_seteaza_categoria(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
