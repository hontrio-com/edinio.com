-- Deriva pret/stoc pe oferta (§68, §69)
--
-- ⚠ DE CE UN CAMP NOU, SI NU `issues`
--
-- `emag_offers.issues` tine ce spune eMAG despre oferta: documentatie lipsa, marca
-- nerecunoscuta, EAN respins. Sunt lucruri pe care le AFLAM de la ei.
--
-- Deriva e altceva: e ce am MASURAT noi, comparand ce am trimite acum cu ce au ei.
-- Amestecate intr-un camp, panoul n-ar mai fi putut spune „eMAG refuza oferta" fata
-- de „oferta e buna, dar pretul de acolo nu mai e al nostru" — doua stari cu doua
-- reparatii cu totul diferite.
--
-- ⚠ FORMA: { semnatura, vazutaDe, reparari, prima, ultima, campuri: [{camp, laNoi, laEi}] }
--
-- `vazutaDe` e miezul: o diferenta se repara abia la a doua vedere cu aceleasi
-- valori. In minutul dintre o vanzare pe eMAG si ingerarea ei la noi, stocul nostru
-- e legitim mai mare decat al lor; reparat din prima, am fi pus inapoi la vanzare
-- bucati deja vandute.
--
-- `null` inseamna „nicio diferenta", si e implicitul.

alter table public.emag_offers
  add column if not exists deriva jsonb;

comment on column public.emag_offers.deriva is
  'Diferenta masurata intre ce am trimite noi si ce are eMAG. null = nicio diferenta. Se repara abia la a doua vedere cu aceleasi valori.';

-- ⚠ Index PARTIAL, pe randurile care CHIAR au o diferenta.
--
-- Panoul intreaba „cate oferte au derivat?", iar raspunsul e aproape mereu zero din
-- zeci de mii de randuri. Un index intreg ar fi tinut in memorie o coloana goala
-- pentru tot catalogul; asa, indexul are exact atatea randuri cate probleme sunt.
create index if not exists emag_offers_deriva_idx
  on public.emag_offers (business_id)
  where deriva is not null;

notify pgrst, 'reload schema';
