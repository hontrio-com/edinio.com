"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ContactulMeu } from "@/lib/cont/date";

/**
 * Contactele contului: adaugarea unuia nou, in doi pasi, si scoaterea.
 *
 * ⚠ Scoaterea ultimului contact confirmat e refuzata de baza, si mesajul ei se
 * arata ca atare: acolo omul chiar trebuie sa afle de ce, altfel apasa la
 * nesfarsit un buton care nu face nimic.
 */
export function GestioneazaContacte({
  contacte,
  color,
}: {
  contacte: ContactulMeu[];
  color: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [cod, setCod] = useState("");
  const [pas, setPas] = useState<"scrie" | "cod">("scrie");
  const [mesaj, setMesaj] = useState("");
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);

  async function trimite(corp: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setAsteapta(true);
    setEroare("");
    try {
      const r = await fetch("/api/cont/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corp),
      });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) {
        setEroare(typeof j.eroare === "string" ? j.eroare : "Nu am putut salva.");
        return null;
      }
      return j;
    } catch {
      setEroare("Nu am putut salva. Verifica legatura la internet.");
      return null;
    } finally {
      setAsteapta(false);
    }
  }

  return (
    <div className="space-y-6">
      <ul className="rounded-xl ring-1 ring-foreground/10 px-4 divide-y divide-foreground/10">
        {contacte.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">Niciun contact in cont.</li>
        )}
        {contacte.map((c) => (
          <li key={`${c.fel}:${c.valoare}`} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm text-foreground">{c.valoareBruta}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {c.fel === "email" ? "Adresa de email" : "Numar de telefon"}
                {c.verificat ? " · confirmat" : " · neconfirmat"}
              </p>
            </div>
            <button
              type="button"
              disabled={asteapta}
              onClick={async () => {
                const j = await trimite({ actiune: "scoate", fel: c.fel, valoare: c.valoare });
                if (j) router.refresh();
              }}
              className="text-sm text-muted-foreground underline shrink-0 disabled:opacity-60"
            >
              Scoate
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="font-semibold text-foreground mb-1">Adauga o adresa de email</h2>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Iti trimitem un cod pe adresa noua. Dupa ce o confirmi, comenzile facute cu ea apar si ele
          in cont.
        </p>

        {pas === "scrie" ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const j = await trimite({ actiune: "cere-cod", fel: "email", valoare: email });
              if (j) {
                setMesaj(typeof j.mesaj === "string" ? j.mesaj : "");
                setPas("cod");
              }
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="adresa@exemplu.ro"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2"
            />
            {eroare && <p className="text-sm text-red-600">{eroare}</p>}
            <button
              type="submit"
              disabled={asteapta}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: color }}
            >
              {asteapta ? "Se trimite..." : "Trimite-mi un cod"}
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const j = await trimite({ actiune: "confirma", fel: "email", valoare: email, cod });
              if (j) {
                setPas("scrie");
                setEmail("");
                setCod("");
                router.refresh();
              }
            }}
          >
            {mesaj && <p className="text-sm text-muted-foreground">{mesaj}</p>}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={cod}
              onChange={(ev) => setCod(ev.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-lg tracking-[0.4em] text-center text-foreground outline-none focus:ring-2"
            />
            {eroare && <p className="text-sm text-red-600">{eroare}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={asteapta || cod.length !== 6}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: color }}
              >
                {asteapta ? "Se verifica..." : "Confirma adresa"}
              </button>
              <button
                type="button"
                onClick={() => { setPas("scrie"); setCod(""); setEroare(""); }}
                className="text-sm text-muted-foreground underline"
              >
                Renunta
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
