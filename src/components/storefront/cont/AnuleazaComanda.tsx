"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleX, LoaderCircle } from "lucide-react";
import { BUTON_PERICOL, BUTON_SECUNDAR } from "./ui/clase";
import { Mesaj } from "./ui/piese";

/**
 * Anularea unei comenzi care inca nu a intrat in lucru (H5).
 *
 * ⚠ Butonul se arata NUMAI la starea `pending`, dar asta nu e apararea: baza
 * verifica ea insasi starea, magazinul, contul si vederea. Ecranul doar nu
 * promite ce nu se poate.
 *
 * ⚠ Se cere o confirmare, fiindca nu se poate desface: comanda anulata isi
 * elibereaza stocul si isi desface cuponul. Si nu e un buton rosu plin: rosul
 * ramane pe iconita si pe cuvinte, ca pe orice tema sa se citeasca.
 *
 * ⚠ Dupa anulare, `router.refresh()`: ecranul trebuie sa arate starea NOUA, nu
 * un mesaj care dispare.
 */
export function AnuleazaComanda({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [sigur, setSigur] = useState(false);
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);
  const grup = useRef<HTMLDivElement>(null);
  const deschide = useRef<HTMLButtonElement>(null);
  const aFostDeschis = useRef(false);

  /* Focusul merge pe confirmare cand se deschide, si inapoi pe buton cand se renunta (altfel cadea pe pagina). */
  useEffect(() => {
    if (sigur) grup.current?.focus();
    else if (aFostDeschis.current) deschide.current?.focus();
    aFostDeschis.current = sigur;
  }, [sigur]);

  if (!sigur) {
    return (
      <button ref={deschide} type="button" onClick={() => setSigur(true)} className={BUTON_SECUNDAR}>
        <CircleX className="h-4 w-4 text-destructive" aria-hidden="true" />
        Anuleaza comanda
      </button>
    );
  }

  return (
    <div ref={grup} tabIndex={-1} className="w-full rounded-[min(var(--st-radius),0.75rem)] border border-[var(--st-border)] bg-[var(--st-surface)] p-4 focus:outline-none" role="group" aria-label="Confirma anularea">
      <p className="text-sm font-semibold text-[var(--st-text)]">Sigur vrei sa anulezi comanda?</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--st-muted)]">Anularea este definitiva.</p>
      {eroare && (
        <div className="mt-3">
          <Mesaj fel="eroare">{eroare}</Mesaj>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={asteapta}
          onClick={async () => {
            setAsteapta(true);
            setEroare("");
            try {
              const r = await fetch("/api/cont/comanda", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ actiune: "anuleaza", orderId }),
              });
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                setEroare(j.eroare ?? "Nu am putut anula comanda.");
              } else {
                router.refresh();
              }
            } catch {
              setEroare("Nu am putut anula comanda. Verifica legatura la internet.");
            } finally {
              setAsteapta(false);
            }
          }}
          className={BUTON_PERICOL}
        >
          {asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CircleX className="h-4 w-4" aria-hidden="true" />}
          {asteapta ? "Se anuleaza..." : "Da, anuleaza comanda"}
        </button>
        <button type="button" onClick={() => setSigur(false)} className={BUTON_SECUNDAR} disabled={asteapta}>
          Nu, pastreaza comanda
        </button>
      </div>
    </div>
  );
}
