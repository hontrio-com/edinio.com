-- ═══════════════════════════════════════════════════════════════════════════
-- PEPITA: PRODUSUL STERS LA NOI NU DISPARE SI DE LA EI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ CE ERA STRICAT
--
-- `pepita_articole` tine minte ce `<Id>` a plecat in feed pentru fiecare produs si combinatie.
-- Cheia straina catre `products` era `on delete cascade`, deci stergerea unui produs stergea si
-- evidenta. Iar evidenta e chiar lucrul care trebuia sa supravietuiasca stergerii:
--
--   * ARTICOLUL RAMANE LA EI. Feedul nostru nu are cum sa spuna „sterge asta": Pepita citeste ce
--     ii dam, iar ce nu mai apare ramane pur si simplu in catalogul lor, la vanzare. Numaratoarea
--     de orfani din panou („articole ramase la ei") se face taind lista trimisa AZI din randurile
--     astea. Cu `cascade`, randul disparea odata cu produsul, deci tocmai articolul care CHIAR e
--     orfan nu se mai numara niciodata. Avertismentul tacea exact in cazul pentru care exista.
--   * COMANDA INTARZIATA. Pepita poate impinge o comanda si dupa ce produsul a fost sters la noi.
--     Fara rand, linia ajungea in carantina cu „cod necunoscut", si comerciantul nu avea de unde
--     sa inceapa. Cu randul pastrat, se poate spune exact ce s-a intamplat.
--
-- ⚠ LEACUL: `on delete set null`, ca la `pepita_comenzi.order_id`. Randul ramane, coloana se
-- goleste, si asta INSEAMNA ceva: „am trimis `<Id>`-ul asta, produsul din spatele lui nu mai
-- exista".
--
-- ⚠ CE SE INTAMPLA CU CELE DOUA CHEI UNICE
--
--   `unique (business_id, articol_id)`               ramane deplina: `articol_id` e mereu scris,
--                                                     deci un `<Id>` tot nu poate avea doua randuri.
--   `unique (business_id, product_id, combinatie)`   inceteaza sa mai lege orfanii intre ei, fiindca
--                                                     in Postgres doua `null` sunt DISTINCTE. E in
--                                                     regula si e chiar ce vrem: doi orfani proveniti
--                                                     din doua produse sterse diferite n-au de ce sa
--                                                     se ciocneasca. Cheia isi face treaba mai
--                                                     departe pe randurile vii, care sunt singurele
--                                                     pe care se scrie (`onConflict:
--                                                     business_id,articol_id`).
--
-- ⚠ SI DE CE NU SE CURATA NICIODATA. Un rand orfan e cateva zeci de octeti si e singura dovada
-- ca articolul e la ei. Sters, am pierde-o din nou.

alter table public.pepita_articole
  alter column product_id drop not null;

alter table public.pepita_articole
  drop constraint pepita_articole_product_id_fkey;

alter table public.pepita_articole
  add constraint pepita_articole_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

comment on column public.pepita_articole.product_id is
  '`null` inseamna ca produsul a fost sters din Edinio, dar `<Id>`-ul a plecat deja la Pepita si articolul a ramas la ei.';

notify pgrst, 'reload schema';
