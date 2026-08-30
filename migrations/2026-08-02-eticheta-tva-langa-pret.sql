-- Eticheta „(TVA inclus)" / „(fara TVA)" de langa pret, pe pagina produsului.
--
-- Textul NU se alege separat: se deduce din `prices_include_vat` (vezi `vatLabel`
-- in lib/utils/vat.ts), ca sa nu se poata ajunge sa scrie una si sa se incaseze
-- alta. Comutatorul de aici spune doar DACA se arata.
--
-- Implicit `true`, nu `false`: pana acum eticheta se afisa neconditionat la toate
-- magazinele platitoare de TVA, ca rand sub pret. Cu `false` ar fi disparut peste
-- noapte de pe 9 magazine, iar la cele cu preturi fara TVA e chiar informatia care
-- il fereste pe cumparator de o surpriza la finalizare.
alter table public.store_settings
  add column if not exists show_vat_label boolean not null default true;
