"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { pluralRo } from "@/lib/utils/format";
import { BUTON_PERICOL, BUTON_SECUNDAR, CAMP, ETICHETA_CAMP } from "./ui/clase";
import { Mesaj } from "./ui/piese";

/**
 * Stergerea contului.
 *
 * ⚠ Se cere cuvantul scris, nu o simpla apasare: e ireversibil.
 * ⚠ Si se spune pe fata CE RAMANE, nu doar ce dispare. Omul care sterge contul
 * crede de obicei ca sterge si comenzile; ele raman, fiindca in spatele lor stau
 * documente fiscale, iar el are dreptul sa stie asta INAINTE.
 * ⚠ Nu e buton rosu plin: rosul ramane pe iconita, ca pe orice tema sa se citeasca.
 * ⚠ Cu parola contului, cand are una: un cont ramas deschis pe un calculator
 * strain nu se poate sterge de cine il gaseste.
 */
export function StergeContul({ comenzi, areParola = false }: { comenzi: number; areParola?: boolean }) {
  const router = useRouter();
  const [deschis, setDeschis] = useState(false);
  const [cuvant, setCuvant] = useState("");
  const [parola, setParola] = useState("");
  const [cerere, setCerere] = useState(false);
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);
  const deschide = useRef<HTMLButtonElement>(null);
  const aFostDeschis = useRef(false);
  /* ⚠ Pe telefon tastatura pune majuscula numai pe prima litera („Sterge”): cuvantul se compara fara ea. */
  const confirmat = cuvant.trim().toUpperCase() === "STERGE";

  useEffect(() => {
    if (!deschis && aFostDeschis.current) deschide.current?.focus();
    aFostDeschis.current = deschis;
  }, [deschis]);

  if (!deschis) {
    return (
      <button ref={deschide} type="button" onClick={() => setDeschis(true)} className={BUTON_SECUNDAR}>
        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
        Sterge contul
      </button>
    );
  }

  return (
    <div className="rounded-[min(var(--st-radius),0.75rem)] border border-[var(--st-border)] p-4" role="group" aria-label="Confirma stergerea contului">
      <p className="text-sm font-semibold text-[var(--st-text)]">Sigur vrei sa stergi contul?</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--st-muted)]">
        <li>Se sterg datele contului si legatura lui cu comenzile. Poti deschide oricand alt cont, cu aceeasi adresa.</li>
        <li>
          {comenzi === 1
            ? "Comanda ta se pastreaza la magazin, pentru ca are documente fiscale asociate (de exemplu factura). Daca vrei sa fie sterse si datele personale din ea, bifeaza mai jos."
            : comenzi > 1
              ? `Cele ${pluralRo(comenzi, "comanda", "comenzi")} ale tale se pastreaza la magazin, pentru ca au documente fiscale asociate (de exemplu facturi). Daca vrei sa fie sterse si datele personale din ele, bifeaza mai jos.`
              : "Daca ai plasat comenzi, acestea se pastreaza la magazin pentru evidenta fiscala."}
        </li>
        <li>Daca te-ai dezabonat de la mesaje, dezabonarea ramane valabila si dupa stergere.</li>
      </ul>

      {comenzi > 0 && (
        <label className="mt-4 flex items-start gap-2.5 text-sm text-[var(--st-text)]">
          <input type="checkbox" checked={cerere} onChange={(e) => setCerere(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--st-primary)]" />
          <span>
            Cere magazinului sa stearga si datele mele din comenzi
            <span className="block text-xs text-[var(--st-muted)]">Numele, datele de contact si adresa. Magazinul primeste cererea pe email si are la dispozitie o luna sa raspunda. Facturile se pastreaza in evidenta contabila.</span>
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
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        onChange={(e) => setCuvant(e.target.value)}
        className={CAMP}
      />
      {areParola && (
        <>
          <label htmlFor="parola-stergere" className={`${ETICHETA_CAMP} mt-4`}>
            Parola contului
          </label>
          <input
            id="parola-stergere"
            type="password"
            autoComplete="current-password"
            value={parola}
            onChange={(e) => setParola(e.target.value)}
            className={CAMP}
          />
        </>
      )}
      {eroare && (
        <div className="mt-3">
          <Mesaj fel="eroare">{eroare}</Mesaj>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={asteapta || !confirmat || (areParola && parola === "")}
          onClick={async () => {
            setAsteapta(true);
            setEroare("");
            let sters = false;
            try {
              const r = await fetch("/api/cont/sterge", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ confirmare: cuvant.trim().toUpperCase(), cereStergereaDatelor: cerere, parola }),
              });
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                setEroare(j.eroare ?? "Nu am putut sterge contul.");
                setParola("");
              } else {
                const j = await r.json().catch(() => ({}));
                sters = true;
                router.refresh();
                router.push(`/cont/intra?sters=1${j.cerereTrimisa === true ? "&cerere=1" : j.cerereTrimisa === false ? "&cerere=0" : ""}`);
              }
            } catch {
              setEroare("Nu am putut sterge contul. Verifica legatura la internet.");
            } finally {
              /* Dupa reusita butonul ramane oprit: pagina pleaca, iar a doua apasare ar fi dat 404. */
              if (!sters) setAsteapta(false);
            }
          }}
          className={BUTON_PERICOL}
        >
          {asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
          {asteapta ? "Se sterge..." : "Sterge definitiv"}
        </button>
        <button type="button" onClick={() => setDeschis(false)} className={BUTON_SECUNDAR}>
          Renunta
        </button>
      </div>
    </div>
  );
}
