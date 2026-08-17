-- Contorul de reluari pentru impingerile de stoc esuate.
--
-- ⚠ DE CE NU POATE STA IN COADA.
--
-- Randul din `trendyol_sync_queue` se STERGE in clipa in care Trendyol raspunde
-- 200 la `price-and-inventory` — dar 200 inseamna doar „primit", nu „aplicat".
-- Esecul adevarat apare abia in lot, la interogarea urmatoare, cand randul nu
-- mai exista. Deci orice contor tinut acolo se citeste mereu ca zero, iar
-- repunerea la coada devine o bucla fara sfarsit: impinge, esueaza, repune,
-- impinge — cate doua apeluri pe minut pentru fiecare produs otravit, pana cand
-- coada magazinului nu mai are loc de listari noi.
--
-- Contorul sta pe listare, unde supravietuieste ciclului, si se pune la zero
-- cand un lot de stoc chiar reuseste.

alter table public.trendyol_listings
  add column if not exists inventory_retries integer not null default 0;

comment on column public.trendyol_listings.inventory_retries is
  'Cate reluari consecutive a avut impingerea de stoc dupa un lot esuat. Se reseteaza la primul lot de stoc reusit. Contorul NU poate sta in trendyol_sync_queue: randul de acolo se sterge la trimitere, inainte sa se stie rezultatul.';

notify pgrst, 'reload schema';
