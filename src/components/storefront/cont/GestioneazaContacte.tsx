"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleDashed, Mail, Phone, Plus } from "lucide-react";
import type { ContactulMeu } from "@/lib/cont/date";
import { BUTON_DISCRET, BUTON_PRIMAR, BUTON_SECUNDAR, CAMP, ETICHETA_CAMP, STIL_PRIMAR } from "./ui/clase";

/**
 * Contactele contului: adaugarea unuia nou, in doi pasi, si scoaterea.
 *
 * ⚠ Scoaterea ultimului contact confirmat e refuzata de baza, si mesajul ei se
 * arata ca atare: acolo omul chiar trebuie sa afle de ce, altfel apasa la
 * nesfarsit un buton care nu face nimic.
 *
 * ⚠ `min-w-0` + `break-all` pe adresa: un email lung fara spatii impingea
 * butonul „Scoate" peste marginea ecranului pe telefon.
 */
export function GestioneazaContacte({ contacte }: { contacte: ContactulMeu[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [cod, setCod] = useState("");
  const [pas, setPas] = useState<"inchis" | "scrie" | "cod">("inchis");
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
    <div className="space-y-5">
      <ul className="divide-y divide-[var(--st-border)]">
        {contacte.length === 0 && (
          <li className="py-3 text-sm text-[var(--st-muted)]">Niciun contact in cont.</li>
        )}
        {contacte.map((c) => {
          const Icon = c.fel === "email" ? Mail : Phone;
          return (
            <li key={`${c.fel}:${c.valoare}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--st-primary-soft)]">
                <Icon className="h-4 w-4 text-[var(--st-text)]" strokeWidth={1.7} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium text-[var(--st-text)]">{c.valoareBruta}</p>
                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--st-muted)]">
                  {c.verificat ? (
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {c.fel === "email" ? "Email" : "Telefon"}
                  {c.verificat ? ", confirmat" : ", neconfirmat"}
                </p>
              </div>
              <button
                type="button"
                disabled={asteapta}
                aria-label={`Scoate ${c.valoareBruta}`}
                onClick={async () => {
                  const j = await trimite({ actiune: "scoate", fel: c.fel, valoare: c.valoare });
                  if (j) router.refresh();
                }}
                className={BUTON_DISCRET}
              >
                Scoate
              </button>
            </li>
          );
        })}
      </ul>

      {eroare && pas === "inchis" && <p role="alert" className="text-sm text-[var(--st-text)]">{eroare}</p>}

      {pas === "inchis" && (
        <button type="button" onClick={() => { setPas("scrie"); setEroare(""); }} className={BUTON_SECUNDAR}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adauga o adresa de email
        </button>
      )}

      {pas !== "inchis" && (
        <div className="rounded-[var(--st-radius)] border border-[var(--st-border)] p-4">
          <p className="text-sm font-semibold text-[var(--st-text)]">Adauga o adresa de email</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--st-muted)]">
            Iti trimitem un cod pe adresa noua. Dupa ce o confirmi, comenzile facute cu ea apar si ele in cont.
          </p>

          {pas === "scrie" ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const j = await trimite({ actiune: "cere-cod", fel: "email", valoare: email });
                if (j) {
                  setMesaj(typeof j.mesaj === "string" ? j.mesaj : "");
                  setPas("cod");
                }
              }}
            >
              <div>
                <label htmlFor="email-nou" className={ETICHETA_CAMP}>Adresa noua</label>
                <input
                  id="email-nou"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="adresa@exemplu.ro"
                  required
                  className={CAMP}
                />
              </div>
              {eroare && <p role="alert" className="text-sm text-[var(--st-text)]">{eroare}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={asteapta} className={BUTON_PRIMAR} style={STIL_PRIMAR}>
                  {asteapta ? "Se trimite..." : "Trimite-mi un cod"}
                </button>
                <button type="button" onClick={() => { setPas("inchis"); setEroare(""); }} className={BUTON_SECUNDAR}>
                  Renunta
                </button>
              </div>
            </form>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const j = await trimite({ actiune: "confirma", fel: "email", valoare: email, cod });
                if (j) {
                  setPas("inchis");
                  setEmail("");
                  setCod("");
                  router.refresh();
                }
              }}
            >
              {mesaj && <p className="text-sm text-[var(--st-muted)]">{mesaj}</p>}
              <div>
                <label htmlFor="cod-nou" className={ETICHETA_CAMP}>Codul primit pe {email}</label>
                <input
                  id="cod-nou"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={cod}
                  onChange={(ev) => setCod(ev.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                  className={`${CAMP} text-center text-lg tracking-[0.4em] sm:text-lg`}
                />
              </div>
              {eroare && <p role="alert" className="text-sm text-[var(--st-text)]">{eroare}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={asteapta || cod.length !== 6} className={BUTON_PRIMAR} style={STIL_PRIMAR}>
                  {asteapta ? "Se verifica..." : "Confirma adresa"}
                </button>
                <button type="button" onClick={() => { setPas("scrie"); setCod(""); setEroare(""); }} className={BUTON_SECUNDAR}>
                  Inapoi
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
