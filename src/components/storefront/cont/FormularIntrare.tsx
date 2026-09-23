"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, Mail } from "lucide-react";
import { BUTON_PRIMAR, CAMP, ETICHETA_CAMP, LEGATURA, STIL_PRIMAR, TITLU, FOCUS } from "./ui/clase";
import { useAutentificare, type ModAutentificare } from "./autentificare-client";

/**
 * Intrarea in contul de cumparator: email si parola, contul nou, resetarea
 * parolei, si codul de pe email ca al doilea pas. Cererile si regulile lor sunt in
 * `useAutentificare`, impartite cu pasul de intrare din formularul de comanda.
 *
 * ⚠ H6: ecranele noi se scriu FARA diacritice, ca restul vitrinei
 * („Finalizeaza comanda”), nu ca panoul.
 */

const TITLURI: Record<ModAutentificare, { titlu: string; sub: string }> = {
  intrare: { titlu: "Intra in cont", sub: "Cu adresa de email si parola ta." },
  inregistrare: { titlu: "Creeaza un cont", sub: "Iti confirmam adresa cu un cod pe email." },
  uitata: { titlu: "Ai uitat parola?", sub: "Iti trimitem un cod pe email si alegi una noua." },
};

function CampParola({
  id, eticheta, valoare, schimba, autoComplete, ajutor,
}: {
  id: string;
  eticheta: string;
  valoare: string;
  schimba: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  ajutor?: string;
}) {
  const [vizibila, setVizibila] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={ETICHETA_CAMP}>{eticheta}</label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={vizibila ? "text" : "password"}
          autoComplete={autoComplete}
          value={valoare}
          onChange={(ev) => schimba(ev.target.value)}
          className={`${CAMP} pr-11`}
          required
        />
        <button
          type="button"
          onClick={() => setVizibila((v) => !v)}
          className={`absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[var(--st-radius-sm)] text-[var(--st-muted)] hover:text-[var(--st-text)] ${FOCUS}`}
          aria-label={vizibila ? "Ascunde parola" : "Arata parola"}
          aria-pressed={vizibila}
        >
          {vizibila ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {ajutor && <p className="mt-1.5 text-xs text-[var(--st-muted)]">{ajutor}</p>}
    </div>
  );
}

export function FormularIntrare({ modInitial = "intrare" }: { modInitial?: ModAutentificare }) {
  const router = useRouter();
  const a = useAutentificare({
    modInitial,
    dupaIntrare: () => {
      /*
        ⚠ `refresh()` INAINTE de `push()`, si ordinea conteaza.
        Cookie-ul tocmai a fost scris de ruta, dar Router Cache-ul clientului
        tine payloadul RSC 30 de secunde (`next.config.ts`, `staleTimes.dynamic`).
        Fara `refresh()`, omul ar fi ajuns pe o pagina randata ca si cum n-ar fi
        logat, si ar fi fost trimis inapoi la intrare.
      */
      router.refresh();
      router.push("/cont");
    },
  });
  const t = TITLURI[a.mod];

  return (
    <div>
      {a.mod !== "uitata" && a.pas === "date" && (
        <div role="tablist" aria-label="Intra sau creeaza cont" className="mb-6 grid grid-cols-2 gap-1 rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)] p-1">
          {(["intrare", "inregistrare"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={a.mod === m}
              onClick={() => a.schimbaMod(m)}
              className={`min-h-10 rounded-[calc(var(--st-radius-sm)-2px)] px-3 text-sm font-semibold transition-colors ${FOCUS} ${
                a.mod === m ? "bg-[var(--st-surface)] text-[var(--st-text)] shadow-sm" : "text-[var(--st-muted)] hover:text-[var(--st-text)]"
              }`}
            >
              {m === "intrare" ? "Am cont" : "Cont nou"}
            </button>
          ))}
        </div>
      )}

      <h2 className="text-xl font-semibold text-[var(--st-text)]" style={TITLU}>{a.pas === "cod" ? "Verifica-ti emailul" : t.titlu}</h2>
      <p className="mb-6 mt-1 text-sm text-[var(--st-muted)]">
        {a.pas === "cod" ? "Am trimis un cod de sase cifre." : t.sub}
      </p>

      {a.pas === "cod" ? (
        <form onSubmit={a.trimiteCodul} className="space-y-5">
          <div className="flex items-start gap-3 rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)] px-4 py-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--st-text)]" aria-hidden="true" />
            <div className="min-w-0 text-sm leading-relaxed text-[var(--st-text)]">
              <p>{a.mesaj || "Daca adresa poate fi folosita, codul a plecat."}</p>
              <p className="mt-0.5 text-[var(--st-muted)]">
                Adresa: <span className="break-all font-semibold text-[var(--st-text)]">{a.email}</span>
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="cod" className={ETICHETA_CAMP}>Codul de sase cifre din email</label>
            <input
              id="cod"
              name="cod"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={a.cod}
              onChange={(ev) => a.scrieCod(ev.target.value)}
              className={`${CAMP} py-3 text-center text-xl tracking-[0.5em] sm:text-xl`}
              placeholder="000000"
              required
            />
          </div>
          {a.mod === "uitata" && (
            <CampParola
              id="parola-noua"
              eticheta="Parola noua"
              valoare={a.parolaNoua}
              schimba={a.setParolaNoua}
              autoComplete="new-password"
              ajutor="Cel putin 8 caractere. Te scoatem din cont de pe celelalte dispozitive."
            />
          )}
          <label className="flex items-start gap-2.5 text-sm text-[var(--st-text)]">
            <input
              type="checkbox"
              checked={a.tineMinte}
              onChange={(ev) => a.setTineMinte(ev.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--st-primary)]"
            />
            <span>
              Tine minte acest dispozitiv 60 de zile
              <span className="block text-xs text-[var(--st-muted)]">Nu bifa pe un calculator folosit si de altii.</span>
            </span>
          </label>
          {a.eroare && <p role="alert" className="text-sm text-[var(--st-text)]">{a.eroare}</p>}
          <button type="submit" disabled={a.asteapta || a.cod.length !== 6} className={`${BUTON_PRIMAR} w-full`} style={STIL_PRIMAR}>
            {a.asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {a.asteapta ? "Se verifica..." : a.mod === "uitata" ? "Schimba parola si intra" : a.mod === "inregistrare" ? "Confirma si creeaza contul" : "Intra in cont"}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={a.inapoi} className={`inline-flex items-center gap-1.5 ${LEGATURA}`}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Inapoi
            </button>
            {a.ramas > 0 ? (
              <span className="text-[var(--st-muted)]" aria-live="polite">Poti cere alt cod in {a.ramas} s</span>
            ) : (
              <button type="button" onClick={() => void a.retrimite()} disabled={a.asteapta} className={LEGATURA}>
                Retrimite codul
              </button>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={a.trimiteDatele} className="space-y-5">
          <div>
            <label htmlFor="email" className={ETICHETA_CAMP}>Adresa de email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={a.email}
              onChange={(ev) => a.setEmail(ev.target.value)}
              className={CAMP}
              placeholder="adresa@exemplu.ro"
              required
            />
            {a.mod === "inregistrare" && (
              <p className="mt-2 text-xs leading-relaxed text-[var(--st-muted)]">
                Foloseste adresa cu care ai comandat: comenzile se leaga singure de cont.
              </p>
            )}
          </div>
          {a.mod !== "uitata" && (
            <CampParola
              id="parola"
              eticheta={a.mod === "inregistrare" ? "Alege o parola" : "Parola"}
              valoare={a.parola}
              schimba={a.setParola}
              autoComplete={a.mod === "inregistrare" ? "new-password" : "current-password"}
              ajutor={a.mod === "inregistrare" ? "Cel putin 8 caractere." : undefined}
            />
          )}
          {a.mod === "intrare" && (
            <div className="-mt-2 text-right text-sm">
              <button type="button" onClick={() => a.schimbaMod("uitata")} className={LEGATURA}>Ai uitat parola?</button>
            </div>
          )}
          {a.eroare && <p role="alert" className="text-sm text-[var(--st-text)]">{a.eroare}</p>}
          <button type="submit" disabled={a.asteapta} className={`${BUTON_PRIMAR} w-full`} style={STIL_PRIMAR}>
            {a.asteapta ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {a.asteapta ? "Se trimite..." : a.mod === "intrare" ? "Intra in cont" : a.mod === "inregistrare" ? "Creeaza contul" : "Trimite-mi un cod"}
            {!a.asteapta && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
          {a.mod === "inregistrare" && (
            <p className="text-center text-xs leading-relaxed text-[var(--st-muted)]">
              Creand contul, esti de acord cu{" "}
              <Link href="/politici/termeni" className={LEGATURA}>termenii magazinului</Link> si ai citit{" "}
              <Link href="/politici/confidentialitate" className={LEGATURA}>politica de confidentialitate</Link>.
            </p>
          )}
          {a.mod === "uitata" && (
            <div className="text-center text-sm">
              <button type="button" onClick={() => a.schimbaMod("intrare")} className={`inline-flex items-center gap-1.5 ${LEGATURA}`}>
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Inapoi la intrare
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
