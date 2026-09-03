"use client";

import { useState } from "react";
import { CATEGORII, type Categorie } from "@/lib/edinio-marketing/consimtamant/stare";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ALEGEREA PE CATEGORII
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ NICIUN COMUTATOR NU E PORNIT LA PRIMA INTREBARE. Un consimtamant „prebifat" nu
  e consimtamant — e chiar exemplul dat de autoritati pentru ce nu are valoare.

  ⚠ PE `/cookies/setari` E ALTCEVA, si e in regula: acolo comutatoarele arata
  alegerea DE ACUM a omului (`initiala`), fiindca el a venit sa si-o schimbe, nu
  sa fie intrebat prima oara. Deosebirea sta in `initiala`: bannerul o da goala,
  ecranul de setari o da pe cea citita din cookie.

  ⚠ SI NU EXISTA UN COMUTATOR „strict necesare" GRI SI PORNIT. Un comutator care
  nu comanda nimic da impresia unei alegeri care nu exista. Se scrie ca eticheta.
*/

export type Alegere = Record<Categorie, boolean>;

export const ALEGERE_GOALA: Alegere = { statistici: false, marketing: false };

const DESCRIERI: Record<Categorie, { titlu: string; text: string; furnizori: string }> = {
  statistici: {
    titlu: "Statistici",
    text:
      /*
        ⚠ „NU TE IDENTIFICA PERSONAL" A FOST SCOS PE 03.09.2026, si merita spus de ce.

        Era o afirmatie prea tare. E adevarat ca nu trimitem catre Google numele,
        emailul, telefonul sau ce scrie omul in formulare — asta se si probeaza, la
        fiecare eveniment, prin paza anti-PII. Dar GA4 pastreaza un identificator
        intr-un cookie ca sa deosebeasca browserele intre ele; e pseudonim, nu
        anonim, iar legea il socoteste tot data cu caracter personal.

        Un text care spune mai mult decat poate tine e o promisiune pe care omul o
        crede. Aici se spune exact ce NU pleaca — verificabil — in loc de o
        categorie juridica pe care n-o putem garanta.
      */
      "Ne arata cate persoane ne viziteaza si ce pagini citesc, ca sa stim ce e de imbunatatit. " +
      "Nu trimitem numele, emailul, telefonul sau ce scrii in formulare, si nu se foloseste pentru reclame.",
    furnizori: "Google Analytics",
  },
  marketing: {
    titlu: "Marketing si publicitate",
    text:
      "Ne ajuta sa masuram ce reclama te-a adus aici si sa nu-ti mai aratam reclame pentru ceva ce ai facut deja. " +
      "Fara ele platim reclame la intamplare, dar site-ul merge la fel.",
    furnizori: "Meta (Facebook, Instagram), TikTok, Google Ads",
  },
};

function Comutator({ pornit, seteaza, id }: { pornit: boolean; seteaza: (v: boolean) => void; id: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pornit}
      id={id}
      onClick={() => seteaza(!pornit)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ink/20 ${
        pornit ? "bg-primary" : "bg-ink/20"
      }`}
    >
      <span className="sr-only">{pornit ? "Pornit" : "Oprit"}</span>
      <span
        aria-hidden
        /*
          ⚠ `left-0` NU E DE PRISOS. Fara el, butonul e `absolute` fara nicio
          ancora orizontala, deci pleaca din pozitia lui STATICA — care, cu un
          `<span class="sr-only">` inaintea lui, cade la capatul din dreapta al
          pastilei. Masurat in browser: marginea butonului la 44px, pastila lata
          de 44px — adica butonul iesise cu totul afara, si comutatorul arata ca
          o pastila verde goala.
        */
        className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          pornit ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function PanouConsimtamant({
  initiala,
  onSalveaza,
  onAcceptaTot,
}: {
  initiala?: Alegere;
  onSalveaza: (a: Alegere) => void;
  onAcceptaTot: () => void;
}) {
  const [alegere, setAlegere] = useState<Alegere>(initiala ?? ALEGERE_GOALA);

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-hairline bg-ink/[0.02] px-4 py-3">
        <p className="text-[14px] font-semibold text-ink">Strict necesare</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          Tin minte ca esti autentificat si pastreaza aceasta alegere. Fara ele site-ul nu poate
          functiona, deci nu pot fi oprite.
        </p>
      </div>

      {CATEGORII.map((cat) => (
        <div key={cat} className="rounded-[12px] border border-hairline px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <label htmlFor={`consim-${cat}`} className="cursor-pointer text-[14px] font-semibold text-ink">
              {DESCRIERI[cat].titlu}
            </label>
            <Comutator
              id={`consim-${cat}`}
              pornit={alegere[cat]}
              seteaza={(v) => setAlegere((a) => ({ ...a, [cat]: v }))}
            />
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{DESCRIERI[cat].text}</p>
          <p className="mt-2 text-[12px] text-ink-3">
            <span className="font-medium">Cine primeste datele:</span> {DESCRIERI[cat].furnizori}
          </p>
        </div>
      ))}

      <div className="flex flex-col gap-2 sm:flex-row">
        {/*
          ⚠ ACELEASI CLASE PENTRU AMANDOUA. „Accepta toate" verde si „Salveaza"
          scris marunt e chiar tiparul pentru care s-au dat amenzi: alegerea
          trebuie sa fie la fel de usoara in ambele sensuri.
        */}
        <button
          type="button"
          onClick={onAcceptaTot}
          className="flex-1 rounded-[10px] bg-primary px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          Accepta toate
        </button>
        <button
          type="button"
          onClick={() => onSalveaza(alegere)}
          className="flex-1 rounded-[10px] bg-primary px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity duration-200 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          Salveaza alegerea
        </button>
      </div>
    </div>
  );
}
