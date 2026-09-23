"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleX } from "lucide-react";
import { BUTON_SECUNDAR } from "./ui/clase";

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

  if (!sigur) {
    return (
      <button type="button" onClick={() => setSigur(true)} className={BUTON_SECUNDAR}>
        <CircleX className="h-4 w-4 text-destructive" aria-hidden="true" />
        Anuleaza comanda
      </button>
    );
  }

  return (
    <div className="w-full rounded-[var(--st-radius)] border border-[var(--st-border)] bg-[var(--st-surface)] p-4" role="group" aria-label="Confirma anularea">
      <p className="text-sm font-semibold text-[var(--st-text)]">Anulezi comanda?</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--st-muted)]">
        Nu se mai poate desface. Daca ai platit deja online, rambursarea o face magazinul.
      </p>
      {eroare && (
        <p role="alert" className="mt-3 text-sm text-[var(--st-text)]">
          {eroare}
        </p>
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
          className={BUTON_SECUNDAR}
        >
          <CircleX className="h-4 w-4 text-destructive" aria-hidden="true" />
          {asteapta ? "Se anuleaza..." : "Da, anuleaza comanda"}
        </button>
        <button type="button" onClick={() => setSigur(false)} className={BUTON_SECUNDAR} disabled={asteapta}>
          Nu, pastreaz-o
        </button>
      </div>
    </div>
  );
}
