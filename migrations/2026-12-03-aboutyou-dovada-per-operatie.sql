-- ═══════════════════════════════════════════════════════════════════════════
-- O IMPINGERE DE STOC NU DOVEDESTE CA A PLECAT DESCRIEREA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE REPARA (27.08.2026, noaptea tarziu)
--
-- Plasa de ieri scria un semn la fiecare modificare de produs si il stergea cand „a plecat ceva"
-- dupa clipa lui. Trei greseli in aceeasi propozitie, si toate se citesc ca „e in regula":
--
-- 1. „A PLECAT CEVA" NU E O DOVADA. Semnul cere o trimitere de CATALOG (`upsert`); o impingere de
--    stoc sau de pret nu poarta descrierea, imaginile sau atributele. Deci:
--
--        10:00  descrierea se schimba          -> semn scris
--        10:00  punerea la coada pica          -> ❌
--        10:01  un `stock` intra in coada din alt motiv
--        10:03  plasa vede „ceva in coada"     -> sterge semnul
--
--    La ei ramane descrierea veche, si nimic nu mai revine acolo.
--
-- 2. CLIPA CEA MAI VECHE ERA EXACT PE DOS. `on conflict do nothing` pastra prima modificare, iar
--    comentariul o numea „cea mai stricta". E invers:
--
--        10:00  modificarea A -> semn 10:00
--        10:01  A pleaca                       -> dovada 10:01
--        10:02  modificarea B, punerea pica    -> semnul RAMANE 10:00
--        plasa: 10:01 >= 10:00 -> „s-a trimis"  ❌ B nu s-a trimis niciodata
--
--    Semnul trebuie sa poarte cea mai NOUA modificare nesatisfacuta.
--
-- 3. SI CLIPA TRIMITERII NU E CLIPA CITIRII. Lucratorul scoate randul din coada, CITESTE produsul,
--    apoi trimite — intre citire si trimitere trec secunde in care produsul se poate schimba. O
--    dovada pusa la trimitere ar acoperi o modificare pe care sarcina utila n-o continea.
--
-- Deci dovada se ia la CITIREA catalogului, si numai a catalogului: `catalog_citit_la`.

alter table public.aboutyou_listings drop column if exists ultima_impingere_la;

alter table public.aboutyou_listings
  add column if not exists catalog_citit_la timestamp with time zone;

comment on column public.aboutyou_listings.catalog_citit_la is
  'Cand a fost CITIT produsul pentru ultima trimitere de catalog reusita (`syncProductNow`). Nu clipa trimiterii, si nu se scrie de impingerile de stoc/pret: doar asa dovedeste ca o modificare anume a plecat. Vezi `rezolvaIntentiile`.';

-- ⚠ Semnul poarta acum cea mai NOUA modificare, nu prima.
create or replace function public.aboutyou_marcheaza_modificarea()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Numai produsele care CHIAR au o listare About You. Indexul `idx_aboutyou_listings_product`
  -- face din asta o singura sondare, si pentru toate celelalte magazine iese pe loc.
  if not exists (
    select 1 from public.aboutyou_listings l
     where l.product_id = new.id and l.business_id = new.business_id
  ) then
    return new;
  end if;

  insert into public.aboutyou_intentii (business_id, product_id)
  values (new.business_id, new.id)
  -- ⚠ `do update`, NU `do nothing`: semnul trebuie sa arate cea mai noua modificare nesatisfacuta.
  -- Pastrata cea veche, o trimitere care a acoperit-o pe ea ar sterge si semnul celei de dupa.
  on conflict (business_id, product_id)
  do update set creat_la = now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SI PLASA NU MAI INGHITE PROPRIA EROARE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Corpul avea `exception when others then return new`, cu explicatia „o plasa n-are voie sa rupa
-- chiar lucrul pe care il pazeste". Suna bine si e fals in fond: taman asta face ca urma sa NU mai
-- fie tranzactionala. Modificarea se salva, semnul nu, si ajungeam exact in situatia pe care
-- declansatorul trebuia s-o faca imposibila — doar ca acum cu o plasa care pare ca exista.
--
-- ⚠ SI PROBA CEREA SA EXISTE. Inca un test verde care apara o alegere ce slabeste invariantul; e a
-- doua oara azi. Auditul l-a numit corect.
--
-- ⚠ CE POATE PICA, DE FAPT: cheia unica (rezolvata de `on conflict`), sau infrastructura — si
-- atunci pica si `UPDATE`-ul comerciantului oricum. Deci fereastra dintre „plasa se rupe" si
-- „salvarea merge" e chiar cea pe care o inchidem, nu una noua.
--
-- ⚠ PROBAT INAINTE DE A SCOATE PAZA, fiindca fara ea o greseala aici opreste salvarea produselor
-- pentru toti: un `UPDATE products` rulat cu rolul `authenticated` si RLS pornit CHIAR scrie
-- semnul. Verificat pe baza de productie, cu `set local role authenticated` si claim-ul de
-- utilizator al magazinului.

-- ⚠ EXECUTE SE IA DE LA `PUBLIC`, ca la prima scriere: `create or replace` pastreaza granturile,
-- dar se repeta ca sa nu depinda de asta cine reface baza din migratii.
revoke execute on function public.aboutyou_marcheaza_modificarea() from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- SI RECUPERAREA ARE UN CAPAT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ Un produs care nu poate fi trimis niciodata — o mapare lipsa, o validare pe care n-o trece —
-- n-ar ajunge niciodata sa aiba `catalog_citit_la` mai nou decat semnul. Fara contor, plasa l-ar
-- repune la coada la fiecare trecere, pe veci. Aceeasi disciplina ca `PRAG_REASERTARI` la veghe:
-- se incearca de cateva ori, apoi se striga o data si se lasa in seama omului, care vede oricum
-- eroarea pe listare.

alter table public.aboutyou_intentii
  add column if not exists recuperari integer default 0 not null;

notify pgrst, 'reload schema';
