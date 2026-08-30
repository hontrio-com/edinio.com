-- Cautarea in comenzi dupa firma si CUI capata index.
--
-- `bulkOrders` / `dashboard/orders` cauta cu `.or(...)` peste CINCI campuri:
-- `order_number`, `customer_name`, `customer_phone`, `billing_company->>company_name`
-- si `billing_company->>cui`. Primele trei au indexuri trigram; ultimele doua, nu.
--
-- Iar asta nu inseamna „ultimele doua sunt mai lente" — inseamna ca TOATE cinci
-- sunt lente. Postgres poate rezolva un `OR` prin `BitmapOr` doar cand FIECARE
-- ramura are index; una singura fara il obliga la scanare secventiala, si atunci
-- cele trei indexuri existente devin lest mort. Sunt acolo de la o migratie care
-- si-a atins scopul pana in ziua in care cautarea a fost extinsa cu firma si CUI.
--
-- Expresia din index trebuie sa fie EXACT cea din interogare (`->>`, nu `->`),
-- altfel planificatorul nu o recunoaste si indexul ramane nefolosit — un index
-- care exista si nu se atinge e mai rau decat lipsa lui, fiindca pare rezolvat.
create index if not exists idx_orders_trgm_company_name
  on public.orders using gin ((billing_company->>'company_name') extensions.gin_trgm_ops);

create index if not exists idx_orders_trgm_cui
  on public.orders using gin ((billing_company->>'cui') extensions.gin_trgm_ops);
