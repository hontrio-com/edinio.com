"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2, LogOut, RotateCcw, Trash2 } from "lucide-react";

import {
  reactiveazaContul, scoateDePeDispozitive, stergeContulClientului, suspendaContul,
} from "@/lib/actions/conturi-panou.actions";
import { cn } from "@/lib/utils/cn";

/**
 * Actiunile comerciantului pe un cont: iesirea de pe toate dispozitivele,
 * suspendarea (si reactivarea) si stergerea la cererea omului.
 *
 * ⚠ Fiecare cere o CONFIRMARE pe loc, sub buton, cu ce se intampla scris pe
 * litere. Suspendarea si stergerea il scot pe om din cont imediat, iar stergerea
 * nu se mai poate intoarce.
 *
 * ⚠ Dupa o eroare de retea NU se spune „n-a mers”: se poate sa fi mers inainte sa
 * cada legatura. Se spune sa reincarce si sa se uite.
 */

type Deschis = null | "iesire" | "suspenda" | "reactiveaza" | "sterge";
type Rezultat = { ok: true; mesaj: string } | { error: string };

const BUTON =
  "inline-flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50";

export function ActiuniCont({
  businessId,
  contId,
  suspendat,
  comenzi,
  sesiuni,
  dispozitive,
}: {
  businessId: string;
  contId: string;
  suspendat: boolean;
  comenzi: number;
  sesiuni: number;
  dispozitive: number;
}) {
  const router = useRouter();
  const [lucreaza, start] = useTransition();
  const [deschis, setDeschis] = useState<Deschis>(null);
  const [motiv, setMotiv] = useState("");
  const [aCerut, setACerut] = useState(false);

  function deschide(d: Deschis) {
    setDeschis((acum) => (acum === d ? null : d));
    setACerut(false);
  }

  function ruleaza(f: () => Promise<Rezultat>, dupa?: () => void) {
    start(async () => {
      let r: Rezultat;
      try {
        r = await f();
      } catch {
        toast.error("Nu am primit răspuns de la server. Reîncarcă pagina și uită-te la cont înainte să reiei: se poate să fi mers.", { duration: 12000 });
        return;
      }
      if ("error" in r) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(r.mesaj, { duration: 7000 });
      setDeschis(null);
      setMotiv("");
      if (dupa) dupa();
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {/* ═══ Iesirea de peste tot ═══ */}
      <button type="button" className={BUTON} disabled={lucreaza} onClick={() => deschide("iesire")} aria-expanded={deschis === "iesire"}>
        <LogOut className="h-4 w-4 text-muted-foreground" /> Deconectează-l de pe toate dispozitivele
      </button>
      {deschis === "iesire" && (
        <Confirmare>
          <p>
            {sesiuni === 0 ? "Nu are nicio sesiune deschisă acum." : `Se ${sesiuni === 1 ? "închide sesiunea deschisă" : `închid cele ${sesiuni} sesiuni deschise`}.`}
            {dispozitive > 0 && ` Se uită ${dispozitive === 1 ? "dispozitivul ținut minte" : `cele ${dispozitive} dispozitive ținute minte`}, deci la următoarea intrare i se cere din nou codul pe email.`}
            {" "}Poate intra din nou oricând, cu parola lui. Folosește-o când clientul îți spune că și-a pierdut telefonul.
          </p>
          <Butoane
            lucreaza={lucreaza}
            eticheta="Deconectează-l de pe toate dispozitivele"
            onDa={() => ruleaza(() => scoateDePeDispozitive(businessId, contId))}
            onNu={() => setDeschis(null)}
          />
        </Confirmare>
      )}

      {/* ═══ Suspendarea sau reactivarea ═══ */}
      {suspendat ? (
        <>
          <button type="button" className={BUTON} disabled={lucreaza} onClick={() => deschide("reactiveaza")} aria-expanded={deschis === "reactiveaza"}>
            <RotateCcw className="h-4 w-4 text-muted-foreground" /> Reactivează contul
          </button>
          {deschis === "reactiveaza" && (
            <Confirmare>
              <p>Clientul va putea intra din nou cu parola lui și va vedea iar comenzile din cont.</p>
              <Butoane
                lucreaza={lucreaza}
                eticheta="Reactivează"
                onDa={() => ruleaza(() => reactiveazaContul(businessId, contId))}
                onNu={() => setDeschis(null)}
              />
            </Confirmare>
          )}
        </>
      ) : (
        <>
          <button type="button" className={BUTON} disabled={lucreaza} onClick={() => deschide("suspenda")} aria-expanded={deschis === "suspenda"}>
            <Ban className="h-4 w-4 text-destructive" /> Suspendă contul
          </button>
          {deschis === "suspenda" && (
            <Confirmare>
              <p>
                Clientul e scos pe loc de pe toate dispozitivele și nu mai poate intra, nici să-și reseteze parola, până
                nu-l reactivezi. La intrare i se spune că i-ai suspendat contul și să-ți scrie. Comenzile rămân legate.
              </p>
              <label className="mt-2 block text-[11px] font-medium text-foreground" htmlFor="motiv-suspendare">
                Motiv (opțional, îl vezi doar tu)
              </label>
              <textarea
                id="motiv-suspendare"
                value={motiv}
                onChange={(e) => setMotiv(e.target.value.slice(0, 200))}
                rows={2}
                maxLength={200}
                placeholder="De exemplu: comenzi refuzate repetat"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <Butoane
                lucreaza={lucreaza}
                eticheta="Suspendă"
                periculos
                onDa={() => ruleaza(() => suspendaContul(businessId, contId, motiv))}
                onNu={() => setDeschis(null)}
              />
            </Confirmare>
          )}
        </>
      )}

      {/* ═══ Stergerea ═══ */}
      <button type="button" className={BUTON} disabled={lucreaza} onClick={() => deschide("sterge")} aria-expanded={deschis === "sterge"}>
        <Trash2 className="h-4 w-4 text-destructive" /> Șterge contul
      </button>
      {deschis === "sterge" && (
        <Confirmare>
          <p>
            <span className="font-semibold text-foreground">Se șterg:</span> contul, adresele lui, sesiunile, dispozitivele
            ținute minte și istoricul.
          </p>
          {comenzi === 0 ? (
            <p className="mt-1">Contul n-are comenzi, deci nu rămâne nimic în urmă.</p>
          ) : (
            <p className="mt-1">
              <span className="font-semibold text-foreground">Rămân:</span>{" "}
              {comenzi === 1 ? "comanda lui" : `cele ${comenzi} comenzi ale lui`}, cu datele de pe ele, fiindcă în
              spatele lor stau documente fiscale. Dacă a cerut și ștergerea datelor din comenzi, folosește „Șterge
              datele clientului” din fișa lui, la Toți clienții.
            </p>
          )}
          <p className="mt-1">Nu se poate întoarce. Clientul își poate face oricând alt cont, cu aceeași adresă.</p>
          <label className="mt-2 flex items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={aCerut}
              onChange={(e) => setACerut(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-primary"
            />
            Clientul a cerut ștergerea contului.
          </label>
          <Butoane
            lucreaza={lucreaza}
            eticheta="Șterge definitiv"
            periculos
            dezactivat={!aCerut}
            onDa={() => ruleaza(
              () => stergeContulClientului(businessId, contId),
              () => {
                router.push("/dashboard/customers?fila=conturi");
                router.refresh();
              },
            )}
            onNu={() => setDeschis(null)}
          />
        </Confirmare>
      )}
    </div>
  );
}

function Confirmare({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{children}</div>;
}

function Butoane({
  lucreaza,
  eticheta,
  periculos = false,
  dezactivat = false,
  onDa,
  onNu,
}: {
  lucreaza: boolean;
  eticheta: string;
  periculos?: boolean;
  dezactivat?: boolean;
  onDa: () => void;
  onNu: () => void;
}) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onDa}
        disabled={lucreaza || dezactivat}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50",
          periculos ? "bg-destructive" : "bg-primary",
        )}
      >
        {lucreaza && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {eticheta}
      </button>
      <button
        type="button"
        onClick={onNu}
        disabled={lucreaza}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        Renunță
      </button>
    </div>
  );
}
