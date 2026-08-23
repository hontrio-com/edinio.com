/* ═══════════════════════════════════════════════════════════════════════════
   eMAG: un magazin poate avea mai mult de O SINGURA oferta nelegata
   ═══════════════════════════════════════════════════════════════════════════

   Al treilea defect din `2026-09-18-emag-marketplace.sql`, si cel care ar fi oprit
   importul chiar la primul comerciant, nu la al doilea.

   ═══ CE FACEA INDEXUL ═══

       create unique index emag_offers_produs_varianta_uidx on public.emag_offers
         (business_id,
          coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(variant_title, ''));

   Scris ca sa inchida o gaura adevarata: la produsele SIMPLE `variant_title` e NULL,
   iar in Postgres `NULL <> NULL`, deci un `unique` obisnuit n-ar fi prins nimic
   acolo — s-ar fi putut face oricate randuri pentru acelasi produs simplu.

   Dar `coalesce` s-a pus pe AMANDOUA coloanele. Iar atunci toate randurile cu
   `product_id` NULL cad pe aceeasi cheie: `(magazin, zero, '')`. Adica un magazin
   poate avea EXACT O oferta nelegata. A doua cade.

   ═══ DE CE E FATAL TOCMAI PENTRU IMPORT ═══

   Importul are trei feluri de raspunsuri care nu au inca produs:

       nehotarat  doua produse Edinio raspund la acelasi cod de bare
       ocupat     produsul potrivit e deja al altei oferte
       nou        n-are corespondent, produsul se creeaza pe urma

   Toate trei se SCRIU, tocmai ca sa le vada comerciantul si sa hotarasca. Cu indexul
   de dinainte, prima se scria si a doua darama scrierea — deci nu doar ca nu se
   vedeau, dar cadea importul intreg. Un comerciant cu 400 de oferte necunoscute ar
   fi vazut o eroare de `duplicate key` si niciun produs.

   ⚠ MASURAT PE PRODUCTIE, NU PRESUPUS. Doua inserari cu `product_id` NULL:
   „duplicate key value violates unique constraint emag_offers_produs_varianta_uidx".

   ═══ REPARATIA ═══

   Indexul se face PARTIAL: pazeste numai randurile care chiar au produs. Regula pe
   care trebuia s-o tina — „un produs sau o combinatie nu poate avea doua oferte" —
   ramane intreaga, fiindca ea nici nu are inteles fara produs.

   Randurile nelegate raman pazite de `emag_offers_business_emag_key
   (business_id, emag_id)`, care e cheia lor adevarata.

   ⚠ `coalesce(variant_title, '')` RAMANE. Acolo e gaura adevarata, si e reala:
   fara el, doua randuri pentru acelasi produs simplu ar fi trecut amandoua.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

drop index if exists public.emag_offers_produs_varianta_uidx;

create unique index emag_offers_produs_varianta_uidx
  on public.emag_offers (business_id, product_id, coalesce(variant_title, ''))
  where product_id is not null;

comment on index public.emag_offers_produs_varianta_uidx is
  'Un produs sau o combinatie nu poate avea doua oferte eMAG. ⚠ PARTIAL dinadins: '
  'ofertele inca nelegate (nehotarate, ocupate, sau noi pana se creeaza produsul) '
  'trebuie sa incapa oricate. Forma dinainte punea `coalesce` si pe `product_id`, '
  'deci un magazin putea avea o singura oferta nelegata si importul cadea la a doua.';

commit;

notify pgrst, 'reload schema';
