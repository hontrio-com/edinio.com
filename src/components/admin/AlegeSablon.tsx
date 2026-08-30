import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { SABLOANE } from "@/lib/blog/sabloane";
import { BlogSubmeniu } from "./BlogSubmeniu";

/**
 * Alegerea șablonului, înainte de a scrie.
 *
 * ⚠ SE ALEGE ÎNTÂI, NU SE APLICĂ PESTE. Un buton „pune șablonul" în editor ar fi
 * trebuit să răspundă la întrebarea „ce fac cu ce e deja scris?", iar orice
 * răspuns ar fi fost prost: șters e o pierdere, adăugat dedesubt e o harababură.
 * Aici întrebarea nu apare: alegerea se face pe un articol care încă nu există.
 *
 * ⚠ LEGĂTURI, NU BUTOANE CU STARE. Fiecare șablon e o adresă (`?sablon=ghid`),
 * deci se poate da mai departe cuiva, se poate pune la favorite, iar butonul
 * „înapoi" al browserului duce înapoi la alegere. Un selector cu stare în
 * memorie n-ar fi avut nimic din toate astea.
 */
export function AlegeSablon() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BlogSubmeniu activ="articole" />

      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-5 w-5 text-zinc-900" />
        <h1 className="text-xl font-semibold text-zinc-900">De unde pornim?</h1>
      </div>
      <p className="mb-6 max-w-2xl text-xs text-zinc-500">
        Șabloanele nu sunt design, sunt schele de gândire: pun titlurile în ordinea în care
        se scrie bine felul acela de articol și lasă între ele indicații. Se pot schimba
        oricând după aceea.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {SABLOANE.map((s) => (
          <Link
            key={s.cheie}
            href={`/admin/blog/nou?sablon=${s.cheie}`}
            className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400"
          >
            <span className="text-sm font-semibold text-zinc-900">{s.nume}</span>
            <span className="mt-1 flex-1 text-xs leading-[1.5] text-zinc-500">{s.cand}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-700">
              Pornesc de aici
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <Link
        href="/admin/blog/nou?sablon=gol"
        className="mt-4 inline-block text-sm font-medium text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
      >
        Scriu de la zero, fără șablon
      </Link>
    </div>
  );
}
