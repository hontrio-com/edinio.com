"use client";

import { useEffect, useState } from "react";
import { greutateaComenziiPentruAwb } from "@/lib/actions/bulk-orders.actions";
import { GREUTATE_REZERVA_KG } from "@/lib/shipping/awb-weight";

/**
 * Campul „Greutate" din formularele de AWB, precompletat din produsele comenzii.
 *
 * Toate cele sase formulare porneau de la `useState("1")`, deci greutatea de pe
 * colet era un kilogram ori de cate ori comerciantul nu o rescria de mana.
 * Cotatia fusese deja reparata sa ceara pretul pe greutatea reala (c516bcf), asa
 * ca se cota un colet de zece kilograme si se declara unul singur; curierul
 * cantareste la depozit si refactureaza banda adevarata.
 *
 * Masurat pe 2026-08-03: 1408 produse active de pe 14 magazine au greutate
 * completata, 284 dintre ele peste un kilogram. Din cele 50 de comenzi cu AWB
 * emis, 4 cantaresc peste un kilogram; eSAFE, cu Sameday si Woot pornite, are
 * 267 de produse active peste un kilogram (pana la 13,1 kg).
 *
 * Ramane un CAMP EDITABIL: catalogul stie marfa, comerciantul stie ambalajul.
 * `dinCatalog` spune formularului daca cifra e masurata sau doar o rezerva — 29
 * din cele 96 de comenzi din productie n-au niciun produs cantarit, si acolo „1"
 * arata exact ca un numar corect fara sa fie.
 */
export function useGreutateaAwb({ open, hasAwb, businessId, orderId }: {
  open: boolean;
  hasAwb: boolean;
  businessId: string;
  orderId: string;
}): { weight: string; setWeight: (v: string) => void; dinCatalog: boolean | null; liniiFaraGreutate: number } {
  const [weight, setWeight] = useState(String(GREUTATE_REZERVA_KG));
  // `null` cat timp inca nu se stie: pana atunci formularul nu spune nimic, ca sa
  // nu clipeasca un avertisment care dispare.
  const [dinCatalog, setDinCatalog] = useState<boolean | null>(null);
  const [liniiFaraGreutate, setLiniiFaraGreutate] = useState(0);

  useEffect(() => {
    // Un AWB emis nu se mai schimba: campul doar arata ce a plecat.
    if (!open || hasAwb) return;
    let anulat = false;
    void greutateaComenziiPentruAwb(businessId, orderId).then((r) => {
      if (anulat) return;
      // Actiunea cazuta lasa rezerva pe loc, dar o si marcheaza ca rezerva:
      // altfel s-ar declara tacut un kilogram, adica exact defectul de dinainte.
      if ("error" in r) { setDinCatalog(false); return; }
      /*
       * Se scrie doar peste rezerva, niciodata peste ce a tastat comerciantul.
       *
       * Modalele sunt montate PERMANENT (`open` e prop, nu conditie de randare),
       * deci efectul se re-declanseaza la fiecare deschidere. Neconditionat,
       * cineva care a pus 5 kg pentru ambalaj, a inchis din greseala si a
       * redeschis s-ar fi intors la valoarea din catalog — iar campul e editabil
       * tocmai fiindca ambalajul il stie doar el.
       */
      setWeight((curent) => (curent === String(GREUTATE_REZERVA_KG) ? String(r.kg) : curent));
      setDinCatalog(r.dinCatalog);
      setLiniiFaraGreutate(r.liniiFaraGreutate);
    }).catch(() => {
      // O actiune care RESPINGE (retea cazuta, deploy in curs) nu trece prin
      // `.then`: fara ramura asta, campul ramanea pe „1" fara niciun avertisment,
      // adica exact defectul de dinainte, cu un comentariu care jura ca s-a inchis.
      if (!anulat) setDinCatalog(false);
    });
    return () => { anulat = true; };
  }, [open, hasAwb, businessId, orderId]);

  return { weight, setWeight, dinCatalog, liniiFaraGreutate };
}

/**
 * Ce scrie sub camp. Text, nu componenta, ca fiecare formular sa-l aseze in
 * propriul lui aranjament.
 *
 * Nu spune „reincarca pagina": reincarcarea n-are ce repara, greutatea lipseste
 * din catalog. Spune exact ce se poate face.
 */
export function notaGreutate(dinCatalog: boolean | null, liniiFaraGreutate = 0): string | null {
  if (dinCatalog === null) return null;
  if (dinCatalog) return "Calculata din produsele comenzii. Adauga ambalajul daca e cazul.";
  // Cazul PARTIAL isi spune pe fata cate produse lipsesc: altfel un numar
  // incomplet („0,4 kg" pentru un colet cu umbrela) arata ca unul masurat.
  if (liniiFaraGreutate > 0) {
    return `${liniiFaraGreutate === 1 ? "Un produs din comanda n-are" : `${liniiFaraGreutate} produse din comanda n-au`} greutate in catalog, deci cifra de mai sus e incompleta. Curierul factureaza cat arata cantarul — scrie greutatea reala.`;
  }
  return "Produsele comenzii n-au greutate in catalog, asa ca aici e o valoare de rezerva. Curierul cantareste coletul si factureaza cat arata cantarul — scrie greutatea reala.";
}
