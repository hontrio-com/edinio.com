-- ══════════════════════════════════════════════════════════════════════════
-- LA TRENDYOL, COMERCIANTUL FACTUREAZA CLIENTUL FINAL (26.08.2026)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Codul casei spunea, ca regula pentru toate marketplace-urile: „ele incaseaza si factureaza
-- clientul final, deci nu le facturam comenzile". La About You e adevarat. La Trendyol e
-- GRESIT, si s-a masurat direct pe API-ul lor, pe comenzile reale ale contului:
--
--     invoiceAddress = numele si adresa CLIENTULUI (nu ale Trendyol)
--     invoiceStatus  = "NotInvoiced"   pe toate cele opt comenzi
--     invoiceNumber  = ""              pe toate cele opt comenzi
--
-- `invoiceStatus` si `invoiceNumber` sunt campuri pe care doar VANZATORUL le poate misca. Daca
-- Trendyol ar factura clientul, n-ar exista un loc gol care asteapta numarul nostru.
--
-- ⚠ CE A COSTAT: niciuna dintre comenzile Trendyol ale comerciantului n-a fost vreodata
-- facturata. Nici la client, nici la ei. Iar lipsa nu se vedea nicaieri, fiindca „nu facturam
-- comenzile de marketplace" arata ca o hotarare, nu ca o scapare.
--
-- ⚠ VARIANTA INTERNATIONALA CERE DOAR LINKUL SI PACHETUL. Amanasem functia fiindca o serie
-- romaneasca („EDN1234") nu incape in formatul lor de fix 16 semne. Formatul ala e al TURCIEI;
-- OpenAPI-ul international spune, citat: „Only requires invoice link and shipment package ID
-- (no invoice number or date fields)."
--
-- ⚠ UN SINGUR FOC: la al doilea trimis pe acelasi pachet raspund 409, si NU au niciun capat de
-- corectie sau stergere. De-aia urcarea trece prin registrul de operatii, iar 409-ul se citeste
-- ca REUSITA — altfel am fi reincercat la nesfarsit un lucru deja facut.
--
-- ⚠ SI COMUTATORUL `factureaza_clientul` E STINS DIN START: raspunderea fiscala e a
-- comerciantului, iar el poate emite deja facturile astea de mana in alta parte. Pornit de noi,
-- ar iesi doua documente fiscale pentru aceeasi marfa.

alter table public.trendyol_orders
  add column if not exists invoice_uploaded_at timestamptz,
  add column if not exists invoice_number text,
  add column if not exists invoice_error text;

comment on column public.trendyol_orders.invoice_uploaded_at is
  'Cand a fost trimis linkul facturii la ei. Un singur foc: la al doilea raspund 409 si nu au niciun capat de corectie sau stergere.';
comment on column public.trendyol_orders.invoice_number is
  'Numarul facturii trimise. Se tine ca sa se vada CE s-a trimis; varianta internationala nu-l cere in cerere.';
comment on column public.trendyol_orders.invoice_error is
  'De ce n-a mers. Se sterge la reusita.';

create index if not exists trendyol_orders_fara_factura_idx
  on public.trendyol_orders (business_id, updated_at)
  where invoice_uploaded_at is null;

notify pgrst, 'reload schema';
