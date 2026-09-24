"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleDashed, LoaderCircle, Mail, Phone, Plus } from "lucide-react";
import type { ContactulMeu } from "@/lib/cont/date";
import { BUTON_DISCRET, BUTON_PRIMAR, BUTON_SECUNDAR, CAMP, ETICHETA_CAMP, STIL_PRIMAR } from "./ui/clase";
import { Mesaj } from "./ui/piese";

/**
 * Contactele contului: adaugarea unuia nou, in doi pasi, si scoaterea.
 *
 * ⚠ Scoaterea ultimului contact confirmat e refuzata de baza, si mesajul ei se
 * arata ca atare: acolo omul chiar trebuie sa afle de ce, altfel apasa la
 * nesfarsit un buton care nu face nimic.
 *
 * ⚠ `min-w-0` + `break-all` pe adresa: un email lung fara spatii impingea
 * butonul „Scoate" peste marginea ecranului pe telefon.
 *
 * ⚠⚠ Adresa noua cere PAROLA contului (cand are una): o sesiune ramasa deschisa pe
 * un calculator strain si-ar fi putut adauga adresa ei, apoi ar fi resetat parola
 * de pe ea, iar contul ar fi fost pierdut pe veci.
 */
export function GestioneazaContacte({ contacte, areParola = false }: { contacte: ContactulMeu[]; areParola?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [cod, setCod] = useState("");
  const [pas, setPas] = useState<"inchis" | "scrie" | "cod">("inchis");
  const [mesaj, setMesaj] = useState("");
  const [eroare, setEroare] = useState("");
  const [asteapta, setAsteapta] = useState(false);
  /* Randul care cere confirmarea stergerii (cheia `fel:valoare`), sau null. */
  const [deSters, setDeSters] = useState<string | null>(null);
  const [confirmata, setConfirmata] = useState("");
  const emailuriConfirmate = contacte.filter((c) => c.fel === "email" && c.verificat).length;

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
          <li className="py-3 text-sm text-[var(--st-muted)]">Nicio adresa in cont.</li>
        )}
        {contacte.map((c) => {
          const Icon = c.fel === "email" ? Mail : Phone;
          const cheie = `${c.fel}:${c.valoare}`;
          /* ⚠ Ultima adresa de email confirmata nu se poate sterge (baza o refuza oricum): fara ea nu mai ai cum sa intri. */
          const singura = c.fel === "email" && c.verificat && emailuriConfirmate <= 1;
          return (
            <li key={cheie} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
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
                  {c.fel === "email" ? "Email" : "Telefon"} {c.verificat ? "confirmat" : "neconfirmat"}
                  {singura && " · adresa cu care intri in cont"}
                </p>
              </div>
              {!singura && deSters !== cheie && (
                <button
                  type="button"
                  disabled={asteapta}
                  aria-label={`Sterge ${c.valoareBruta}`}
                  onClick={() => { setDeSters(cheie); setEroare(""); }}
                  className={BUTON_DISCRET}
                >
                  Sterge
                </button>
              )}
              {deSters === cheie && (
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto" role="group" aria-label={`Confirma stergerea adresei ${c.valoareBruta}`}>
                  <span className="text-sm text-[var(--st-text)]">Stergi adresa?</span>
                  <button
                    type="button"
                    autoFocus
                    disabled={asteapta}
                    onClick={async () => {
                      const j = await trimite({ actiune: "scoate", fel: c.fel, valoare: c.valoare });
                      setDeSters(null);
                      if (j) router.refresh();
                    }}
                    className={`${BUTON_DISCRET} text-destructive hover:text-destructive`}
                  >
                    {asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Da, sterge
                  </button>
                  <button type="button" disabled={asteapta} onClick={() => setDeSters(null)} className={BUTON_DISCRET}>
                    Nu
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {eroare && pas === "inchis" && <Mesaj fel="eroare">{eroare}</Mesaj>}
      {confirmata && pas === "inchis" && <Mesaj fel="succes">Adresa {confirmata} a fost confirmata si adaugata in cont.</Mesaj>}

      {pas === "inchis" && (
        <button type="button" onClick={() => { setPas("scrie"); setEroare(""); setConfirmata(""); }} className={BUTON_SECUNDAR}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adauga o adresa de email
        </button>
      )}

      {pas !== "inchis" && (
        <div className="rounded-[min(var(--st-radius),0.75rem)] border border-[var(--st-border)] p-4">
          <p className="text-sm font-semibold text-[var(--st-text)]">Adauga o adresa de email</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--st-muted)]">
            Iti trimitem un cod pe adresa noua. Dupa ce o confirmi, comenzile plasate cu ea apar automat in cont.
          </p>

          {pas === "scrie" ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const j = await trimite({ actiune: "cere-cod", fel: "email", valoare: email, parola });
                if (j) {
                  setMesaj(typeof j.mesaj === "string" ? j.mesaj : "");
                  setParola("");
                  setPas("cod");
                }
              }}
            >
              <div>
                <label htmlFor="email-nou" className={ETICHETA_CAMP}>Adresa noua</label>
                <input
                  id="email-nou"
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="adresa@exemplu.ro"
                  required
                  className={CAMP}
                />
              </div>
              {areParola && (
                <div>
                  <label htmlFor="parola-contact" className={ETICHETA_CAMP}>Parola contului</label>
                  <input
                    id="parola-contact"
                    type="password"
                    autoComplete="current-password"
                    value={parola}
                    onChange={(ev) => setParola(ev.target.value)}
                    required
                    className={CAMP}
                  />
                  <p className="mt-1.5 text-xs text-[var(--st-muted)]">O cerem ca sa fim siguri ca esti chiar tu.</p>
                </div>
              )}
              {eroare && <Mesaj fel="eroare">{eroare}</Mesaj>}
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
                  setConfirmata(email);
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
                  autoFocus
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={cod}
                  onChange={(ev) => setCod(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                  className={`${CAMP} text-center indent-[0.4em] text-lg tracking-[0.4em] sm:text-lg`}
                />
              </div>
              {eroare && <Mesaj fel="eroare">{eroare}</Mesaj>}
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
