/* ═══════════════════════════════════════════════════════════════════════════
   eMAG: cand s-a urcat factura comenzii
   ═══════════════════════════════════════════════════════════════════════════

   eMAG e altfel decat celelalte marketplace-uri din Edinio: acolo comerciantul
   factureaza CLIENTUL FINAL si trebuie sa incarce factura inapoi la ei
   (`/order/attachments/save`, „For invoices: use type = 1"). La Trendyol si About
   You, marketplace-ul factureaza el clientul, iar comerciantul il factureaza pe el.

   ═══ ⚠ DE CE O COLOANA SI NU O CAUTARE IN REGISTRU ═══

   Urcarea trece oricum prin `cuRegistru`, care o face o singura data. Deci
   corectitudinea nu depinde de coloana asta — ea e doar FILTRUL.

   Fara ea, cronul ar fi trebuit sa treaca la fiecare minut prin TOATE comenzile eMAG
   cu factura ale fiecarui magazin, ca sa afle care mai are nevoie. La un comerciant
   cu zece mii de comenzi vechi, asta inseamna zece mii de randuri citite pe minut,
   la nesfarsit, pentru zero lucru — si nu se vede ca defect nicaieri: totul merge,
   doar ca baza geme.

   Cu ea, filtrul e `is null` pe un index partial si nu costa nimic.

   ⚠ NU se scrie decat dupa ce eMAG a confirmat atasamentul. Scrisa mai devreme, o
   urcare cazuta ar fi ramas neincercata pe veci, iar comanda ar fi ramas fara
   factura la ei — o lipsa fiscala, nu una tehnica.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

alter table public.emag_orders
  add column if not exists invoice_uploaded_at timestamptz,
  add column if not exists invoice_number text;

comment on column public.emag_orders.invoice_uploaded_at is
  'Cand a confirmat eMAG atasarea facturii. NULL = mai are nevoie. ⚠ Se scrie DUPA '
  'confirmarea lor, niciodata inainte.';
comment on column public.emag_orders.invoice_number is
  'Numarul facturii urcate. ⚠ Dupa un storno si o reemitere, documentul e ALTUL: '
  'numarul se schimba, iar cheia din registru il contine, deci noua factura poate urca.';

/* Indexul care face filtrul gratuit. Partial: intereseaza numai ce n-a urcat inca. */
create index if not exists emag_orders_factura_de_urcat_idx
  on public.emag_orders (business_id, created_at)
  where invoice_uploaded_at is null;

commit;

notify pgrst, 'reload schema';
