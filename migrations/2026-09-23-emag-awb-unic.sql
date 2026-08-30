/* ═══════════════════════════════════════════════════════════════════════════
   eMAG: acelasi AWB nu poate fi scris de doua ori
   ═══════════════════════════════════════════════════════════════════════════

   `emag_awb` era singura dintre cele cinci tabele eMAG fara niciun unic. Emiterea
   trece prin `cuRegistru`, care o face o singura data — deci in practica nu se ajungea
   la un al doilea rand.

   Dar registrul e o plasa la nivel de APLICATIE. Randul lui din `operatii_externe` se
   poate sterge: o curatare de intretinere, o reparatie facuta de mana, o migratie
   viitoare care umbla la tabelul acela. Iar atunci urmatoarea emitere n-ar mai primi
   `deja`, ar chema eMAG din nou, si ar insera al doilea rand pentru acelasi transport.

   Ce urmeaza e mai rau decat un rand in plus: ecranul citeste ULTIMUL AWB al comenzii
   (`order by created_at desc limit 1`). Cu doua randuri, comerciantul ar vedea un
   numar, iar coletul ar purta eticheta celuilalt.

   ═══ ⚠ DE CE `(business_id, emag_id)` SI NU `(business_id, order_id)` ═══

   Fiindca o comanda POATE avea doua AWB-uri, si chiar are nevoie de amandoua:
   `awb_type: 1` e livrarea catre client, `awb_type: 2` e ridicarea de la el la retur.
   Unicul pe comanda le-ar fi facut sa se excluda — iar returul n-ar mai fi putut fi
   ridicat, adica marfa ar fi ramas la client.

   ⚠ Pe magazin, nu global: `emag_id` e al contului lor, iar doi comercianti pot avea
   acelasi numar. Aceeasi lectie ca la `emag_offers`, unde unicul global ar fi oprit
   importul celui de-al doilea comerciant.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

alter table public.emag_awb
  add constraint emag_awb_business_emag_key unique (business_id, emag_id);

comment on constraint emag_awb_business_emag_key on public.emag_awb is
  'Acelasi AWB nu poate fi scris de doua ori. A doua plasa dupa `cuRegistru`, pentru '
  'cazul in care randul din `operatii_externe` s-ar sterge. ⚠ NU e pe `order_id`: o '
  'comanda are nevoie si de AWB de livrare, si de unul de ridicare la retur.';

commit;

notify pgrst, 'reload schema';
