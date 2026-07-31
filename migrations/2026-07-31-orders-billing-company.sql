-- Comenzi pe firma: datele de facturare ale unei persoane juridice.
--
-- Pana acum o comanda avea UN SINGUR set de date de client: `customer_name`,
-- `customer_phone`, `customer_email` si JSON-ul `shipping_address`. Nu exista
-- nicaieri notiunea de firma, iar toate cele trei sisteme de facturare trimiteau
-- „persoana fizica" hardcodat (SmartBill `vatCode: '0000000000000'`, Oblio
-- `vatPayer: false`, fGO `Tip: 'PF'`). Un magazin care vinde catre firme nu
-- putea emite o factura corecta.
--
-- DE CE O COLOANA SEPARATA SI NU IN `shipping_address`. Amprenta cotatiei de
-- transport se semneaza pe destinatie (vezi `lib/shipping/quote-token.ts`:
-- businessId|judet|oras|tara|cod postal|bani). Sediul fiscal al firmei nu e, in
-- general, adresa la care se livreaza; amestecate in acelasi JSON, cele doua
-- adrese s-ar fi calcat reciproc si pretul transportului ar fi devenit
-- nedeterminist. Aici stau STRICT datele de pe factura.
--
-- DE CE `jsonb` SI NU COLOANE SEPARATE. Acelasi tipar ca `orders.order_source`:
-- un bloc optional, citit intreg sau deloc, care nu are nevoie de index si care
-- se poate extinde (cod postal fiscal, tara) fara alta migratie.
--
-- DE CE NULLABLE SI FARA DEFAULT. Exista patru cai de insert in `orders`, doua
-- fiind ingestii din marketplace care nu au nicio notiune de tip client:
-- `lib/actions/order.actions.ts` (x2), `lib/trendyol/orders.ts`,
-- `lib/aboutyou/orders.ts`. Orice constrangere NOT NULL le-ar fi rupt.
--
-- Forma scrisa de aplicatie (vezi `BillingCompany` in `lib/billing/company.ts`):
--   {
--     "cui":          "RO12345678",
--     "company_name": "SC EXEMPLU SRL",
--     "reg_com":      "J40/1234/2020",
--     "address":      "Str. Exemplu nr. 1",
--     "city":         "Sector 1",
--     "county":       "Bucuresti",
--     "vat_payer":    true
--   }
--
-- `NULL` inseamna comanda pe persoana fizica. Comenzile existente raman NULL si
-- se factureaza exact ca pana acum.

alter table public.orders
  add column if not exists billing_company jsonb;

comment on column public.orders.billing_company is
  'Date de facturare pentru persoane juridice (cui, company_name, reg_com, address, city, county, vat_payer). NULL = persoana fizica. Adresa de LIVRARE ramane in shipping_address.';
