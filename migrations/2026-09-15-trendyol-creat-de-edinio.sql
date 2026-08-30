-- Cine a creat produsul la Trendyol: noi, sau comerciantul pe alta cale?
--
-- ⚠ DEFECT GASIT LIVE, IN PROPRIA REPARATIE DE ADOPTARE.
--
-- Adoptarea se declanseaza cand crearea pica si produsul exista deja la ei. Dar
-- „exista deja" e adevarat SI pentru un produs pe care tot noi l-am creat cu
-- cinci minute inainte: comerciantul apasa „Reincearca" pe o listare de-a
-- noastra, Trendyol raspunde „codul de bare exista deja", si logica o trata ca
-- pe o listare straina — ii oprea sincronizarea de stoc si o marca „Preluat".
--
-- Vazut in productie pe „Bliana-2": produs creat de Edinio, respins la revizuie
-- pentru imagini, reincercat de comerciant, si ajuns cu `auto_inventory = false`
-- desi stocul lui trebuie sa vina in continuare din Edinio.
--
-- Marcajul se pune cand un lot de creare CHIAR reuseste pentru listarea aia.

alter table public.trendyol_listings
  add column if not exists creat_de_edinio boolean not null default false;

comment on column public.trendyol_listings.creat_de_edinio is
  'Produsul de la Trendyol a fost creat de Edinio (lot de creare reusit), nu de comerciant pe alta cale. Cand e true, un refuz de tip „codul exista deja" NU inseamna adoptare: e chiar produsul nostru, si stocul ramane sincronizat.';

-- Completarea pentru randurile existente, din urma REALA a loturilor: o listare
-- pentru care exista un lot de creare `completed` a fost creata de noi.
update public.trendyol_listings l
   set creat_de_edinio = true
 where creat_de_edinio = false
   and exists (
     select 1 from public.trendyol_batches b
      where b.business_id = l.business_id
        and b.kind = 'product'
        and b.status = 'completed'
        and b.related_ids ? l.product_main_id
   );

-- Si reparam ce a stricat adoptarea gresita: listarile create de noi isi reiau
-- sincronizarea de stoc.
update public.trendyol_listings
   set auto_inventory = true
 where creat_de_edinio = true and auto_inventory = false;

notify pgrst, 'reload schema';
