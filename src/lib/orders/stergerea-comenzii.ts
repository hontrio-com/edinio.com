import { NUME_CURIER, type CurierPropriu } from "./awb-propriu";

/* ═══════════════════════════════════════════════════════════════════════════
   O COMANDA CU COLETUL PE DRUM NU SE STERGE (14.09.2026)
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ CE SE INTAMPLA FARA REGULA ASTA. `deleteOrder` chema RPC-ul care sterge randul
   pe bune, din baza, fara sa se uite o clipa daca pe comanda exista un colet viu.
   Iar stergerea nu e o ascundere din liste: dupa ea nu mai ramane nimic.

     - coletul ramane la curier si pleaca la client, cu rambursul lui de incasat,
       iar comerciantul nu mai are nici numarul AWB ca sa-l urmareasca, nici cui
       sa-i ceara banii;
     - cronul de urmarire nu mai are rand pe care sa scrie, deci starea coletului
       nu mai ajunge nicaieri;
     - `operatii_externe.order_id` devine NULL (vezi migrarea registrului), deci
       nici macar urma operatiei nu mai duce inapoi la o comanda;
     - iar eticheta din depozit, care poarta numele, adresa si telefonul
       cumparatorului, ramane acolo fara nimic care s-o mai lege de ceva.

   ⚠ SI E SINGURA CALE DE STERGERE. Masurat pe 14.09.2026: `sterge_comanda` are un
   singur apelant (`order.actions.ts`), `deleteOrder` are un singur apelant
   (`OrderDetailClient`), si nu exista niciun `.from("orders").delete()` in cod. Deci
   paza pusa aici chiar acopera tot, nu doar drumul pe care m-am uitat eu.

   ═══ ⚠ DE CE SE OPRESTE DUPA STARE, NU DUPA SIMPLA EXISTENTA A UNUI AWB ═══

   Masurat pe 14.09.2026, din 435 de comenzi, 218 poarta o expediere:

     shipped 192 · refunded 15 · cancelled 8 · delivered 3

   Un zid pus pe simpla existenta a AWB-ului ar fi oprit toate 218, adica si cele 26
   la care transportul s-a incheiat de mult si stergerea e curatenie curata. Regula
   se uita la stare fiindca intrebarea adevarata nu e „a existat vreodata un colet?",
   ci „mai e ceva viu pe drum?".

   ⚠ CELE TREI STARI DE MAI JOS SUNT SFARSITURI, nu trepte. `delivered` inseamna ca
   omul a primit coletul; `cancelled` si `refunded` ca vanzarea s-a desfacut. In toate
   trei nu mai exista nimic de urmarit si niciun ramburs de asteptat.

   ⚠ SI `shipped` NU E PRINTRE ELE, desi pare o incheiere. Acolo coletul e chiar in
   mana curierului: e singura stare in care stergerea face paguba maxima. Cele 192 de
   comenzi de azi stau exact acolo.

   ═══ ⚠ CE FAC ALTE PLATFORME ═══

   Niciuna nu sterge din baza o comanda cu expediere activa. Shopify nu ingaduie
   stergerea comenzilor cu livrari sau tranzactii, ci doar arhivarea. WooCommerce le
   duce la cos, de unde se pot scoate inapoi. Tiparul comun e ca stergerea adevarata
   se ingaduie numai acolo unde nu mai atarna nimic de comanda.

   ⚠ AICI NU EXISTA ARHIVARE, si nu se inventeaza una acum: comenzile n-au coloana de
   arhiva, deci ar fi o functionalitate noua, cu migrare, ecrane si filtre. Regula
   asta e reparatia defectului; arhivarea ramane o hotarare de produs.

   ═══ ⚠ SI NU E O FUNDATURA ═══

   Mesajul spune cele doua iesiri, fiindca un „nu se poate" fara urmatoarea miscare
   l-a pus deja pe comerciant sa apese de 208 ori un buton care n-avea cum sa mearga
   (vezi `deCeNuDeAici`). Iesirile sunt reale amandoua: ori scoate AWB-ul de pe
   comanda, ori muta comanda intr-o stare incheiata. Niciuna nu cere sa treaca pe la
   noi.
*/

/**
 * Starile in care expedierea s-a incheiat si nu mai atarna nimic de comanda.
 *
 * ⚠ ACEEASI INTREBARE CA LA `STARI_FARA_TRANSPORT` din `awb-propriu.ts`, dar NU
 * acelasi raspuns, si de aceea nu se refoloseste lista de acolo. Aceea intreaba
 * „se mai poate EMITE un colet?" si lasa `delivered` pe dinafara dinadins, fiindca
 * o comanda livrata se poate reexpedia legitim (colet pierdut, retur reintors).
 * Asta intreaba „mai e ceva viu de pierdut?", iar la o comanda livrata nu mai e.
 * Unite intr-o singura lista, una din cele doua reguli ar fi devenit gresita.
 */
const STARI_CU_TRANSPORTUL_INCHEIAT = new Set(["delivered", "cancelled", "refunded"]);

/** Comanda, cat trebuie ca sa se poata hotari. */
export interface ComandaLaStergere {
  status: string | null;
  /** Numerele de AWB de pe comanda, pe curier. Se ia din `awburiDinRand`. */
  awburi: Partial<Record<CurierPropriu, string | null>>;
}

/**
 * De ce nu se poate sterge comanda, sau `null` daca se poate.
 *
 * ⚠ ORDINEA CELOR DOUA VERIFICARI E CHIAR REGULA. Starea incheiata se cantareste
 * INAINTE de AWB: altfel cele 26 de comenzi la care transportul s-a terminat n-ar
 * mai fi putut fi sterse niciodata, iar paza ar fi devenit un zid in loc de o paza.
 *
 * ⚠ SI SE UITA LA TOATE CELE 17 COLOANE, prin `awburi`. Pana azi `deleteOrder` citea
 * una singura, `gls_awb_number`, adica exact curierul cu ZERO expedieri in productie.
 * Cei 211 AWB-uri Woot si cele 5 DPD treceau nevazute.
 */
export function deCeNuSeStergeComanda(o: ComandaLaStergere): string | null {
  if (o.status && STARI_CU_TRANSPORTUL_INCHEIAT.has(o.status)) return null;

  /*
   * ⚠ Se intoarce la PRIMUL colet gasit, in ordinea din `COLOANA_AWB`. O comanda cu
   * doua AWB-uri e ea insasi un defect, aparat in alta parte (`deCeNuSePoateAwbPropriu`);
   * aici numirea unuia singur ajunge, fiindca mesajul cere oricum sa fie scos.
   */
  for (const [curier, numar] of Object.entries(o.awburi) as [CurierPropriu, string | null | undefined][]) {
    if (!numar) continue;
    /* ⚠ Text citit de comerciant: cu diacritice, si cu iesirea in el. */
    return `Comanda are o expediere activă la ${NUME_CURIER[curier]} (${numar}) și nu e încă `
      + "livrată sau închisă. Ștearsă acum, coletul rămâne pe drum la curier, cu rambursul lui "
      + "de încasat, iar ție nu-ți mai rămâne nici numărul, nici eticheta, nici urmărirea lui. "
      + "Anulează întâi AWB-ul din fereastra de editare a comenzii; dacă acel curier refuză "
      + "anularea, fiindcă a preluat deja coletul, folosește „Detașează AWB”. Dacă expedierea "
      + "s-a încheiat deja, marchează comanda livrată, anulată sau restituită, și atunci se poate șterge.";
  }

  return null;
}

/** Se poate sterge comanda asta? Forma scurta, pentru ecrane. */
export function sePoateStergeComanda(o: ComandaLaStergere): boolean {
  return deCeNuSeStergeComanda(o) === null;
}
