"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Anularea unei comenzi care inca nu a intrat in lucru (H5).
 *
 * ⚠ Butonul se arata NUMAI la starea `pending`, dar asta nu e apararea: baza
 * verifica ea insasi starea, magazinul, contul si vederea. Ecranul doar nu
 * promite ce nu se poate.
 *
 * ⚠ Se cere o confirmare, fiindca nu se poate desface: comanda anulata isi
 * elibereaza stocul si isi desface cuponul.
 */
export function AnuleazaComanda({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [sigur, setSigur] = useState(false);
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);

  if (!sigur) {
    return (
      <button type="button" onClick={() => setSigur(true)} className="text-sm text-muted-foreground underline">
        Anuleaza comanda
      </button>
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 p-4">
      <p className="text-sm text-foreground mb-3">
        Anulezi comanda? Nu se mai poate desface, iar produsele se intorc pe stoc.
      </p>
      {eroare && <p className="text-sm text-red-600 mb-2">{eroare}</p>}
      <div className="flex gap-3">
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
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 disabled:opacity-60"
        >
          {asteapta ? "Se anuleaza..." : "Da, anuleaza"}
        </button>
        <button type="button" onClick={() => setSigur(false)} className="text-sm text-muted-foreground underline">
          Renunta
        </button>
      </div>
    </div>
  );
}
