"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Un comutator de preferinta, care salveaza pe loc.
 *
 * ⚠ Starea de pe ecran se misca DUPA ce serverul a raspuns, nu inainte. O
 * mutare optimista ar fi aratat „dezabonat" unui om care nu e, iar la mesaje de
 * marketing diferenta aia e chiar lucrul care se reclama.
 */
export function ComutatorPreferinta({
  canal,
  pornit,
  eticheta,
  explicatie,
  color,
}: {
  canal: "email" | "sms";
  pornit: boolean;
  eticheta: string;
  explicatie: string;
  color: string;
}) {
  const router = useRouter();
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
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{eticheta}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{explicatie}</p>
        {eroare && <p className="text-xs text-red-600 mt-1">{eroare}</p>}
      </div>
      <button
        type="button"
        onClick={schimba}
        disabled={asteapta}
        aria-pressed={stare}
        className="shrink-0 rounded-full w-11 h-6 transition relative disabled:opacity-60"
        style={{ backgroundColor: stare ? color : "var(--color-muted, #d4d4d8)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: stare ? "1.375rem" : "0.125rem" }}
        />
      </button>
    </div>
  );
}
