"use client";

import { useState } from "react";
import { PanouConsimtamant, ALEGERE_GOALA, type Alegere } from "./PanouConsimtamant";
import { scrieHotararea, retrage, useConsimtamant } from "@/lib/edinio-marketing/consimtamant-browser";

const DATA = new Intl.DateTimeFormat("ro-RO", { dateStyle: "long", timeStyle: "short" });

export function SetariCookieClient() {
  const c = useConsimtamant();
  const [salvat, setSalvat] = useState<null | "salvat" | "retras">(null);

  /* ⚠ Pana dupa hidratare nu stim nimic, si nu ghicim: un schelet, nu o alegere falsa. */
  if (!c.mounted) {
    return <div className="h-64 animate-pulse rounded-[12px] bg-ink/[0.04]" aria-hidden />;
  }

  const initiala: Alegere = c.stare
    ? { statistici: c.stare.statistici, marketing: c.stare.marketing }
    : ALEGERE_GOALA;

  return (
    <div className="space-y-6">
      {c.stare ? (
        <p className="text-[13px] text-ink-3">
          Alegerea ta de acum:{" "}
          <span className="font-medium text-ink">
            {c.stare.statistici ? "statistici pornite" : "statistici oprite"},{" "}
            {c.stare.marketing ? "marketing pornit" : "marketing oprit"}
          </span>
          {c.stare.cand > 0 ? <> — făcută pe {DATA.format(new Date(c.stare.cand * 1000))}</> : null}
        </p>
      ) : (
        <p className="text-[13px] text-ink-3">
          Încă nu ai ales nimic, deci nu măsurăm nimic.
        </p>
      )}

      <PanouConsimtamant
        key={`${initiala.statistici}-${initiala.marketing}`}
        initiala={initiala}
        onAcceptaTot={() => { scrieHotararea({ statistici: true, marketing: true }, "t"); setSalvat("salvat"); }}
        onSalveaza={(a) => { scrieHotararea(a, "p"); setSalvat("salvat"); }}
      />

      {/*
        ⚠ RETRAGEREA E UN BUTON DE SINE STATATOR, nu „debifează tot și salvează".
        Art. 7(3): retragerea trebuie să fie la fel de ușoară ca acordarea. Un om
        care a apăsat o dată „Acceptă toate" trebuie să poată anula tot cu o
        singură apăsare, nu cu trei.
      */}
      <div className="rounded-[12px] border border-hairline px-4 py-4">
        <p className="text-[14px] font-semibold text-ink">Retrage tot consimțământul</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          Oprește toate categoriile, șterge identificatorii deja păstrați și anulează conversiile
          care nu au plecat încă. Site-ul funcționează la fel.
        </p>
        <button
          type="button"
          onClick={() => { retrage(); setSalvat("retras"); }}
          className="mt-3 rounded-[10px] border border-hairline px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors duration-200 hover:bg-ink/[0.04] focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          Retrage consimțământul
        </button>
      </div>

      {salvat ? (
        <p role="status" className="text-[13px] font-medium text-primary">
          {salvat === "retras" ? "Consimțământul a fost retras." : "Alegerea ta a fost salvată."}
        </p>
      ) : null}
    </div>
  );
}
