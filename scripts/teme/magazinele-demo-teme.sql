-- ═══════════════════════════════════════════════════════════════════════════
-- MAGAZINELE DEMO ALE TEMELOR 2-30 (etapa 24 din `docs/editor-magazin/PLAN.md`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dupa `magazinul-demo.sql` (care face contul tehnic `teme@edinio-demo.test` si magazinul Jupiter): cate un magazin
-- `tema-<cheie>` pe acelasi cont, servit pe `<cheie>.edinio.com`. Apoi `scripts/teme/seamana-demo.ts <cheie>` il umple.
-- Pe baza demo rulat pe 08.11.2026; in PRODUCTIE doar la push, cu acordul lui (REGISTRU „E”).
--
-- Se poate rula din nou: ce exista nu se atinge. Un slug `tema-*` al altui cont opreste tot (nu se preia nimic).
-- Lista se completeaza la fiecare lot, in aceeasi ordine ca `CHEI_TEME` din `src/lib/teme/gazde-demo.ts`.

do $$
declare
  email_cont constant text := 'teme@edinio-demo.test';
  cont uuid;
  t record;
  magazin uuid;
begin
  select id into cont from auth.users where email = email_cont;
  if cont is null then
    raise exception 'Contul tehnic % lipseste: ruleaza intai scripts/teme/magazinul-demo.sql.', email_cont;
  end if;

  for t in
    select * from (values
      ('tema-mercur', 'Mercur Pet Shop', 'Tot ce le trebuie prietenilor tăi blănoși.', 'Magazin demonstrativ al temei Mercur: hrană, jucării și accesorii pentru animale de companie.', 'mercur@edinio-demo.test', '#3446E0'),
      ('tema-venus', 'Venus Electro', 'Electronice și electrocasnice la prețuri bune.', 'Magazin demonstrativ al temei Venus: telefoane, laptopuri, televizoare și electrocasnice.', 'venus@edinio-demo.test', '#C8102E'),
      ('tema-terra', 'Terra Gadget', 'Tehnologie bună, la îndemână.', 'Magazin demonstrativ al temei Terra: audio, drone, telefoane și casă inteligentă.', 'terra@edinio-demo.test', '#0E7C6B'),
      ('tema-marte', 'Marte Interior', 'Mobilier pentru case liniștite.', 'Magazin demonstrativ al temei Marte: canapele, fotolii, mese, iluminat și decorațiuni.', 'marte@edinio-demo.test', '#C8A27A')
    ) as v(slug, nume, slogan, descriere, email, culoare)
  loop
    select id into magazin from public.businesses where slug = t.slug;
    if magazin is null then
      insert into public.businesses (
        user_id, slug, type, business_name, store_name, tagline, description, email, phone,
        address, city, county, social, gallery, features, primary_color, is_published
      ) values (
        cont, t.slug, 'ministore', t.nume, t.nume, t.slogan, t.descriere, t.email, '0700 000 000',
        'Strada Exemplului 1', 'București', 'București', '{}', '[]', '{}', t.culoare, true
      ) returning id into magazin;
    elsif not exists (select 1 from public.businesses where id = magazin and user_id = cont) then
      raise exception 'Slugul % e al altui cont: nu se atinge nimic.', t.slug;
    end if;
    insert into privat.store_settings (business_id) values (magazin) on conflict (business_id) do nothing;
  end loop;
end $$;

-- Verificarea: magazinele, publicate, pe contul tehnic, cu setari, fara domeniu propriu.
select b.slug, b.is_published, b.custom_domain, u.email,
       (select count(*) from privat.store_settings s where s.business_id = b.id) as setari
  from public.businesses b
  join auth.users u on u.id = b.user_id
 where b.slug like 'tema-%'
 order by b.created_at;
