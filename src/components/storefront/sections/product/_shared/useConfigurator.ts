"use client";

import { useCallback, useMemo, useState } from "react";
import type { ConfiguratorDeVitrina } from "@/lib/configurators/vitrina";
import { verificaRaspunsul, type Verdict } from "@/lib/configurators/raspuns";
import type { Valori } from "@/lib/configurators/valori";

/**
 * Starea configuratorului pe pagina de produs.
 *
 * ═══ ⚠ DE CE STA AICI, SI NU IN SLOT ═══
 *
 * Pagina are nevoie de raspunsul configuratorului in trei locuri deodata: pretul de sub buton,
 * daca butonul se poate apasa, si ce se pune in cos la apasare. Tinuta inauntrul slotului, starea
 * ar fi trebuit sa iasa inapoi printr-un `onSchimbare` — adica un efect al copilului care scrie
 * in parinte la fiecare tasta, cu randare in cascada si cu ordinea celor doua stari greu de
 * urmarit. Tinuta aici, slotul devine o componenta care doar deseneaza ce i se da.
 *
 * ⚠ SI AICI, NU IN FIECARE MODEL DE PAGINA. Modelele sunt doua si vor fi mai multe; regula
 * „cand se poate comanda" scrisa in fiecare ar fi divergit, iar divergenta s-ar fi vazut ca un
 * model in care se poate cumpara o gravura necompletata.
 *
 * ═══ ⚠ CE ARATA PAGINA NU E CE INCASEAZA SERVERUL ═══
 *
 * `verificaRaspunsul` e acelasi modul pe amandoua partile, deci va da acelasi numar. Dar
 * autoritatea ramane a serverului: el primeste VALORILE, le normalizeaza el insusi si
 * recalculeaza. Ce se trimite de aici nu e niciodata un pret.
 */

export interface StareConfigurator {
  configurator: ConfiguratorDeVitrina | null;
  /** Ce a completat cumparatorul, brut. Se da mai departe motorului la fiecare randare. */
  brute: Record<string, unknown>;
  pune: (id: string, valoare: unknown) => void;
  /** `null` cand produsul n-are configurator. */
  verdict: Verdict | null;
  /**
   * Se poate comanda?
   *
   * ⚠ `true` si cand produsul N-ARE configurator — altfel legarea starii asteia de buton ar fi
   * blocat toate produsele obisnuite din magazin.
   */
  gata: boolean;
  /** Pretul unitar de pus pe linie. Cade pe pretul produsului cat timp raspunsul nu e bun. */
  pretUnitar: number;
  /** Valorile de dus in cos si in comanda. `null` cand nu e nimic de dus. */
  valori: Valori | null;
  amprenta?: string;
}

export function useConfigurator(
  configurator: ConfiguratorDeVitrina | null,
  pretProdus: number,
): StareConfigurator {
  const [brute, setBrute] = useState<Record<string, unknown>>({});

  const pune = useCallback((id: string, valoare: unknown) => {
    setBrute((x) => {
      if (valoare === undefined) {
        // ⚠ Se STERGE cheia, nu se pune pe `undefined`: normalizarea deosebeste cele doua, iar
        // un camp „prezent, dar gol" ar fi intrat altfel in amprenta decat unul absent.
        const copie = { ...x };
        delete copie[id];
        return copie;
      }
      return { ...x, [id]: valoare };
    });
  }, []);

  const verdict = useMemo(
    () => (configurator ? verificaRaspunsul(configurator.compilat, brute, pretProdus) : null),
    [configurator, brute, pretProdus],
  );

  return {
    configurator,
    brute,
    pune,
    verdict,
    gata: !configurator || (verdict?.ok ?? false),
    pretUnitar: verdict?.ok ? verdict.unitar : pretProdus,
    valori: verdict?.ok ? verdict.valori : null,
    amprenta: verdict?.ok ? verdict.amprenta : undefined,
  };
}
