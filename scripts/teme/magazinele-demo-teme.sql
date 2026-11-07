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
      ('tema-marte', 'Marte Interior', 'Mobilier pentru case liniștite.', 'Magazin demonstrativ al temei Marte: canapele, fotolii, mese, iluminat și decorațiuni.', 'marte@edinio-demo.test', '#C8A27A'),
      ('tema-saturn', 'Saturn Moto', 'Aventura începe aici.', 'Magazin demonstrativ al temei Saturn: ATV-uri, SSV-uri, motociclete și echipamente.', 'saturn@edinio-demo.test', '#FF6A13'),
      ('tema-uranus', 'Uranus Auto', 'Piese pentru orice mașină, livrate repede.', 'Magazin demonstrativ al temei Uranus: piese motor, uleiuri, baterii, frânare și scule.', 'uranus@edinio-demo.test', '#0A2A8A'),
      ('tema-neptun', 'Neptun Fashion', 'Modă pentru fiecare zi.', 'Magazin demonstrativ al temei Neptun: geci, genți, încălțăminte, pulovere și rochii.', 'neptun@edinio-demo.test', '#111111'),
      ('tema-sirius', 'Sirius Boutique', 'Eleganță pentru fiecare ocazie.', 'Magazin demonstrativ al temei Sirius: rochii, pantofi, genți, bijuterii și parfumuri.', 'sirius@edinio-demo.test', '#1A1A1A'),
      ('tema-vega', 'Vega Sport', 'Echipament pentru fiecare antrenament.', 'Magazin demonstrativ al temei Vega: colanți, tricouri, hanorace, încălțăminte și accesorii de sport.', 'vega@edinio-demo.test', '#0B0B0B'),
      ('tema-altair', 'Altair Piese', 'Piese și accesorii pentru utilaje, livrate a doua zi.', 'Magazin demonstrativ al temei Altair: transmisie, hidraulică, iluminat, anvelope și atelier.', 'altair@edinio-demo.test', '#B5121B'),
      ('tema-rigel', 'Rigel Beauty', 'Frumusețe, în fiecare zi.', 'Magazin demonstrativ al temei Rigel: parfumuri, machiaj, îngrijirea tenului și accesorii.', 'rigel@edinio-demo.test', '#111111'),
      ('tema-polaris', 'Polaris Shoes', 'Încălțăminte din piele, pentru fiecare pas.', 'Magazin demonstrativ al temei Polaris: ghete, sneakers, mocasini, botine și genți.', 'polaris@edinio-demo.test', '#7A3E2B'),
      ('tema-antares', 'Antares IT', 'Tehnologie la prețuri mici.', 'Magazin demonstrativ al temei Antares: laptopuri, telefoane, monitoare, componente și gaming.', 'antares@edinio-demo.test', '#1D4E89'),
      ('tema-arcturus', 'Arcturus Nutrition', 'Nutriție pentru fiecare obiectiv.', 'Magazin demonstrativ al temei Arcturus: proteine, creatină, vitamine, pre-workout și gustări proteice.', 'arcturus@edinio-demo.test', '#FF5A1F'),
      ('tema-aldebaran', 'Aldebaran Cellar', 'Băuturi alese, pentru seri bune.', 'Magazin demonstrativ al temei Aldebaran: vinuri, spumante, whisky, gin și coniac.', 'aldebaran@edinio-demo.test', '#C8A15A'),
      ('tema-capella', 'Capella Pet', 'Tot ce le trebuie prietenilor tăi.', 'Magazin demonstrativ al temei Capella: hrană, jucării, acvarii, cuști și accesorii pentru animale.', 'capella@edinio-demo.test', '#2F9E41')
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
