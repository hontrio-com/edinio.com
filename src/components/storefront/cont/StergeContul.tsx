"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Stergerea contului.
 *
 * ⚠ Se cere cuvantul scris, nu o simpla apasare: e ireversibil.
 * ⚠ Si se spune pe fata CE RAMANE, nu doar ce dispare. Omul care sterge contul
 * crede de obicei ca sterge si comenzile; ele raman, fiindca in spatele lor stau
 * documente fiscale, iar el are dreptul sa stie asta INAINTE.
 */
export function StergeContul({ comenzi }: { comenzi: number }) {
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [cuvant, setCuvant] = useState("");
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);

  if (!deschis) {
    return (
      <button
        type="button"
        onClick={() => setDeschis(true)}
        className="text-sm text-red-600 underline"
      >
        Sterge contul
      </button>
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-red-200 p-4">
      <h2 className="font-semibold text-foreground mb-2">Stergi contul?</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-2">
        Se sterg datele contului si legatura lui cu comenzile. Poti deschide oricand alt cont, cu
        aceeasi adresa.
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        {comenzi > 0
          ? `Cele ${comenzi} de comenzi ale tale RAMAN la magazin, fiindca in spatele lor stau documente fiscale. Daca vrei sa fie sterse si datele din ele, scrie magazinului.`
          : "Comenzile plasate raman la magazin, fiindca in spatele lor stau documente fiscale."}
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        Daca ai cerut sa nu mai primesti mesaje, alegerea aceea ramane si dupa stergere.
      </p>

      <label htmlFor="confirmare" className="block text-sm font-medium text-foreground mb-1.5">
        Scrie STERGE ca sa confirmi
      </label>
      <input
        id="confirmare"
        value={cuvant}
        onChange={(e) => setCuvant(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 mb-3"
      />
      {eroare && <p className="text-sm text-red-600 mb-2">{eroare}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={asteapta || cuvant !== "STERGE"}
          onClick={async () => {
            setAsteapta(true);
            setEroare("");
            try {
              const r = await fetch("/api/cont/sterge", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ confirmare: cuvant }),
              });
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                setEroare(j.eroare ?? "Nu am putut sterge contul.");
              } else {
                router.refresh();
                router.push("/cont/intra");
              }
            } catch {
              setEroare("Nu am putut sterge contul. Verifica legatura la internet.");
            } finally {
              setAsteapta(false);
            }
          }}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 disabled:opacity-60"
        >
          {asteapta ? "Se sterge..." : "Sterge definitiv"}
        </button>
        <button type="button" onClick={() => setDeschis(false)} className="text-sm text-muted-foreground underline">
          Renunta
        </button>
      </div>
    </div>
  );
}
