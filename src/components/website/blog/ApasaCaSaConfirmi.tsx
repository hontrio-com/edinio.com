"use client";

import { useState, useTransition } from "react";
import type { RezultatJeton } from "@/lib/actions/blog-abonati.actions";
import Link from "next/link";
import { Check, X, Loader2 } from "lucide-react";

/**
 * Butonul de pe paginile de confirmare și de dezabonare.
 *
 * ⚠ EXISTĂ CA SĂ NU SE ÎNTÂMPLE NIMIC LA RANDARE.
 *
 * Amândouă paginile își făceau treaba la GET, adică în timp ce se desenau.
 * Scanerele de legături — Safe Links de la Microsoft, porțile de email ale
 * firmelor, previzualizarea din unele aplicații — chiar deschid adresele din
 * mesaje, adesea înainte ca omul să vadă mesajul. La confirmare asta însemna că
 * poarta firmei tale putea „confirma" în locul tău o adresă scrisă de altcineva,
 * și tocmai asta e ce trebuie să oprească dubla confirmare.
 *
 * O poartă deschide adrese. Nu apasă butoane.
 *
 * ⚠ TOT O SINGURĂ APĂSARE, cum promite textul din email. Nu e un pas în plus
 * pus de frică: pagina se deschide oricum, iar butonul e primul lucru de pe ea.
 */
export function ApasaCaSaConfirmi({
  actiune,
  jeton,
  eticheta,
  titluReusit,
  textReusit,
  textPicat,
  textTemporar,
}: {
  /*
    ⚠ Referință de acțiune de server, nu o închidere legată cu `.bind`.

    `.bind(null, jeton)` ar fi mers și e felul documentat, dar ar fi criptat
    jetonul în sarcina trimisă browserului, cu o cheie care pe desfășurări cu mai
    multe instanțe trebuie ținută stabilă (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`).
    Aici n-are rost să plătim asta: jetonul e deja în adresa pe care o are omul
    în bara de sus. Nu-l ascundem de el, îl ascundem de baza noastră — și asta se
    întâmplă la celălalt capăt, prin amprentă.
  */
  actiune: (jeton: string) => Promise<RezultatJeton>;
  jeton: string;
  eticheta: string;
  titluReusit: string;
  textReusit: string;
  textPicat: string;
  /**
   * Ce se arată când baza n-a răspuns — altceva decât când jetonul nu e bun.
   *
   * ⚠ ȘI BUTONUL RĂMÂNE PE ECRAN în starea asta. Aici e toată deosebirea: la un
   * jeton stricat n-are rost să mai apeși, la o cădere de o clipă are.
   */
  textTemporar: string;
}) {
  const [stare, setStare] = useState<"gata" | "reusit" | "picat" | "temporar">("gata");
  const [seLucreaza, incepe] = useTransition();

  if (stare === "reusit") {
    return (
      <div className="text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-[20px] font-semibold text-ink">{titluReusit}</h2>
        <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">{textReusit}</p>
        <p className="mt-6">
          <Link href="/blog" className="text-[14px] font-semibold text-ink underline-offset-4 hover:underline">
            Înapoi la articole
          </Link>
        </p>
      </div>
    );
  }

  if (stare === "picat") {
    return (
      <div className="text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-tint-2 text-ink-3">
          <X className="h-6 w-6" />
        </span>
        <p className="mt-4 text-[15px] leading-[1.7] text-ink-2">{textPicat}</p>
        <p className="mt-6">
          <Link href="/blog" className="text-[14px] font-semibold text-ink underline-offset-4 hover:underline">
            Înapoi la articole
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      {stare === "temporar" && (
        <p className="mb-6 text-[15px] leading-[1.7] text-ink-2">{textTemporar}</p>
      )}
      <button
        type="button"
        disabled={seLucreaza}
        onClick={() => incepe(async () => {
          const r = await actiune(jeton);
          setStare(r.ok ? "reusit" : r.motiv === "temporar" ? "temporar" : "picat");
        })}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {seLucreaza && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {eticheta}
      </button>
    </div>
  );
}
