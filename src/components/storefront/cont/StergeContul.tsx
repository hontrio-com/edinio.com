"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { pluralRo } from "@/lib/utils/format";
import { BUTON_SECUNDAR, CAMP, ETICHETA_CAMP } from "./ui/clase";

/**
 * Stergerea contului.
 *
 * ⚠ Se cere cuvantul scris, nu o simpla apasare: e ireversibil.
 * ⚠ Si se spune pe fata CE RAMANE, nu doar ce dispare. Omul care sterge contul
 * crede de obicei ca sterge si comenzile; ele raman, fiindca in spatele lor stau
 * documente fiscale, iar el are dreptul sa stie asta INAINTE.
 * ⚠ Nu e buton rosu plin: rosul ramane pe iconita, ca pe orice tema sa se citeasca.
 */
export function StergeContul({ comenzi }: { comenzi: number }) {
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [cuvant, setCuvant] = useState("");
  const [cerere, setCerere] = useState(false);
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);

  if (!deschis) {
    return (
      <button type="button" onClick={() => setDeschis(true)} className={BUTON_SECUNDAR}>
        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
        Sterge contul
      </button>
    );
  }

  return (
    <div className="rounded-[var(--st-radius)] border border-[var(--st-border)] p-4" role="group" aria-label="Confirma stergerea contului">
      <p className="text-sm font-semibold text-[var(--st-text)]">Stergi contul?</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--st-muted)]">
        <li>Se sterg datele contului si legatura lui cu comenzile. Poti deschide oricand alt cont, cu aceeasi adresa.</li>
        <li>
          {comenzi === 1
            ? "Comanda ta RAMANE la magazin, fiindca in spatele ei stau documente fiscale. Daca vrei sa fie sterse si datele din ea, scrie magazinului."
            : comenzi > 1
              ? `Cele ${pluralRo(comenzi, "comanda", "comenzi")} ale tale RAMAN la magazin, fiindca in spatele lor stau documente fiscale. Daca vrei sa fie sterse si datele din ele, scrie magazinului.`
              : "Comenzile plasate raman la magazin, fiindca in spatele lor stau documente fiscale."}
        </li>
        <li>Daca ai cerut sa nu mai primesti mesaje, alegerea aceea ramane si dupa stergere.</li>
      </ul>

      {comenzi > 0 && (
        <label className="mt-4 flex items-start gap-2.5 text-sm text-[var(--st-text)]">
          <input type="checkbox" checked={cerere} onChange={(e) => setCerere(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--st-primary)]" />
          <span>
            Cere magazinului sa stearga si datele mele din comenzi
            <span className="block text-xs text-[var(--st-muted)]">Numele, contactele si adresa. Magazinul primeste cererea pe email si are o luna sa raspunda; facturile raman in evidenta lui contabila.</span>
          </span>
        </label>
      )}

      <label htmlFor="confirmare" className={`${ETICHETA_CAMP} mt-4`}>
        Scrie STERGE ca sa confirmi
      </label>
      <input
        id="confirmare"
        value={cuvant}
        autoComplete="off"
        onChange={(e) => setCuvant(e.target.value)}
        className={CAMP}
      />
      {eroare && <p role="alert" className="mt-2 text-sm text-[var(--st-text)]">{eroare}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
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
                body: JSON.stringify({ confirmare: cuvant, cereStergereaDatelor: cerere }),
              });
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                setEroare(j.eroare ?? "Nu am putut sterge contul.");
              } else {
                const j = await r.json().catch(() => ({}));
                router.refresh();
                router.push(`/cont/intra?sters=1${j.cerereTrimisa === true ? "&cerere=1" : j.cerereTrimisa === false ? "&cerere=0" : ""}`);
              }
            } catch {
              setEroare("Nu am putut sterge contul. Verifica legatura la internet.");
            } finally {
              setAsteapta(false);
            }
          }}
          className={BUTON_SECUNDAR}
        >
          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
          {asteapta ? "Se sterge..." : "Sterge definitiv"}
        </button>
        <button type="button" onClick={() => setDeschis(false)} className={BUTON_SECUNDAR}>
          Renunta
        </button>
      </div>
    </div>
  );
}
