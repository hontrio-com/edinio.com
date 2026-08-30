-- Taxa pentru plata ramburs.
--
-- Pana acum, „Metode de plata" avea doua parghii, amandoua in favoarea
-- clientului: reducere la plata cu cardul si reducere la plata ramburs. Lipsea
-- cea inversa, si e cea pe care o cer comerciantii: rambursul costa bani reali
-- (comisionul curierului la incasare, banii blocati pana la decontare), iar ei
-- vor sa poata trece costul asta mai departe, fix sau procentual.
--
-- DE CE O COLOANA NOUA PE `orders` SI NU UN DISCOUNT NEGATIV. `cod_discount_amount`
-- e scazut din total in patru locuri si devine o linie NEGATIVA pe factura la toti
-- trei furnizorii. O taxa e alt semn si alta linie („Taxa plata ramburs", pozitiva);
-- strecurata ca discount negativ, ar fi iesit pe factura ca o reducere de valoare
-- negativa, adica exact lucrul pe care niciun contabil nu vrea sa-l vada.
--
-- `not null default 0`, ca `cod_discount_amount`: cele patru cai de insert in
-- `orders` — doua din magazin, doua din marketplace (Trendyol, About You) — nu
-- trebuie sa stie de coloana asta ca sa functioneze.

alter table public.orders
  add column if not exists cod_fee_amount numeric not null default 0;

comment on column public.orders.cod_fee_amount is
  'Taxa incasata pentru plata ramburs, deja inclusa in orders.total. 0 = fara taxa. Apare ca linie POZITIVA pe factura.';


-- Configuratia comerciantului, langa `card_discount_config` si `cod_discount_config`.
--
-- Forma (vezi `CodFeeConfig` in `lib/payment-methods.ts`):
--   {
--     "enabled": true,
--     "type": "fixed",              -- sau "percent"
--     "value": 5,
--     "amount_includes_vat": false  -- DOAR pentru "fixed"
--   }
--
-- `amount_includes_vat` exista fiindca un comerciant care scrie „5 lei" nu spune
-- prin asta si daca cei 5 lei sunt cu sau fara TVA — iar diferenta ajunge direct
-- in ce plateste clientul. La „percent" intrebarea nu se pune: procentul se aplica
-- peste o baza care e deja in regimul de preturi al magazinului.

alter table public.store_settings
  add column if not exists cod_fee_config jsonb;

comment on column public.store_settings.cod_fee_config is
  'Taxa la plata ramburs: {enabled, type: percent|fixed, value, amount_includes_vat}. NULL = oprita.';
