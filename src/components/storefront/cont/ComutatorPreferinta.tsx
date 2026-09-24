"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { FOCUS } from "./ui/clase";
import { Mesaj } from "./ui/piese";

/**
 * Un comutator de preferinta, care salveaza pe loc.
 *
 * ⚠ Starea de pe ecran se misca DUPA ce serverul a raspuns, nu inainte. O
 * mutare optimista ar fi aratat „dezabonat" unui om care nu e, iar la mesaje de
 * marketing diferenta aia e chiar lucrul care se reclama.
 *
 * ⚠ `role="switch"` + `aria-checked` + nume legat de eticheta: inainte era un
 * buton fara nume, citit de un cititor de ecran ca „buton, apasat".
 */
export function ComutatorPreferinta({
  canal,
  pornit,
  eticheta,
  explicatie,
}: {
  canal: "email" | "sms";
  pornit: boolean;
  eticheta: string;
  explicatie: string;
}) {
  const router = useRouter();
  const id = useId();
  const [stare, setStare] = useState(pornit);
  const [asteapta, setAsteapta] = useState(false);
  const [eroare, setEroare] = useState("");

  async function schimba() {
    if (asteapta) return;
    setAsteapta(true);
    setEroare("");
    try {
      const r = await fetch("/api/cont/preferinte", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ canal, vrea: !stare }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setEroare(j.eroare ?? "Nu am putut salva.");
      } else {
        setStare(!stare);
        router.refresh();
      }
    } catch {
      setEroare("Nu am putut salva. Verifica legatura la internet.");
    } finally {
      setAsteapta(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p id={`${id}-e`} className="text-sm font-semibold text-[var(--st-text)]">{eticheta}</p>
        <p id={`${id}-d`} className="mt-0.5 text-sm leading-relaxed text-[var(--st-muted)]">{explicatie}</p>
        {eroare && (
          <div className="mt-2">
            <Mesaj fel="eroare">{eroare}</Mesaj>
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={stare}
        aria-labelledby={`${id}-e`}
        aria-describedby={`${id}-d`}
        onClick={schimba}
        disabled={asteapta}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors before:absolute before:-inset-2 before:content-[''] disabled:opacity-60 ${FOCUS} ${
          stare ? "border-transparent" : "border-[var(--st-border)] bg-[var(--st-border)]"
        }`}
        style={stare ? { backgroundColor: "var(--st-primary)" } : undefined}
      >
        <span className="sr-only">{stare ? "Pornit" : "Oprit"}</span>
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-sm transition-[left]"
          /* ⚠ Pornit: bila ia culoarea de contrast a primarei. Pe o tema cu primara alba, o bila alba pe fond alb nu se vedea. */
          style={{ left: stare ? "1.5rem" : "0.1875rem", backgroundColor: stare ? "var(--st-primary-contrast)" : "var(--st-surface)" }}
        />
      </button>
    </div>
  );
}
