"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight, CheckCircle2, ChevronRight, Hourglass, LifeBuoy, MessageCircle, Phone, Plus, Reply, Timer,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { CardStatistica } from "@/components/dashboard/CardStatistica";
import { marimeaRandului } from "@/lib/dashboard/cifra-pe-un-rand";
import {
  CATEGORII, DESPRE_STARE, durataScurta, numarulTichetului, numeleCategoriei,
  type CategorieTichet, type StareaTichetului,
} from "@/lib/support/tichete";
import { ICONITA_CATEGORIEI } from "./suport/atasamente";
import { TichetNou } from "./suport/TichetNou";

export type TichetDinLista = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  business_id: string | null;
  has_unread_reply: boolean;
  /** Starea asa cum o vede comerciantul, judecata pe server din ultimul mesaj. */
  stare: StareaTichetului;
  ultimulMesaj: string;
  ultimulMesajDe: "user" | "agent" | null;
  mesaje: number;
  /** „acum 3 ore", scris pe server. */
  cand: string;
};

type Filtru = "toate" | "raspunsul_tau" | "la_noi" | "rezolvate";

const FILTRE: { cheie: Filtru; eticheta: string }[] = [
  { cheie: "toate", eticheta: "Toate" },
  { cheie: "raspunsul_tau", eticheta: "Așteaptă răspunsul tău" },
  { cheie: "la_noi", eticheta: "La echipa Edinio" },
  { cheie: "rezolvate", eticheta: "Rezolvate" },
];

function seIncadreaza(t: TichetDinLista, f: Filtru) {
  if (f === "toate") return true;
  if (f === "rezolvate") return t.stare === "rezolvat" || t.stare === "inchis";
  return t.stare === f;
}

function filtruValid(v: string | null): Filtru {
  return FILTRE.some((f) => f.cheie === v) ? (v as Filtru) : "toate";
}

const TELEFON = "0750 456 809";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SUPORT                                                          (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Refacut pe linia celorlalte sectiuni (Discounturi, Clienti, Cosuri): aceleasi
  `CardStatistica` in cap, aceeasi `EtichetaStare`, tabel pe desktop si carduri
  pe telefon. Cerut de el: „simetrie intre sectiuni".

  ⚠⚠ CIFRA DE SUS SPUNE UNDE E MINGEA, nu ce n-ai citit. „Raspunsuri noi"
  numara `has_unread_reply`, care se stinge cand deschizi tichetul, chiar daca
  nu raspunzi. „Asteapta raspunsul tau" numara tichetele la care echipa a scris
  ultima si care nu sunt rezolvate. Vezi `stareaTichetului`.

  ⚠ Filtrul sta in adresa (`?stare=`), ca la Discounturi: cardurile de sus duc
  direct la lista filtrata, iar „inapoi" din tichet se intoarce la ce vedeai.
*/
export function SupportClient({
  tichete,
  timpRaspunsMs,
  businesses,
  userEmail,
}: {
  tichete: TichetDinLista[];
  /** Mediana timpului pana la primul raspuns, pe tichetele care l-au primit. */
  timpRaspunsMs: number | null;
  businesses: { id: string; business_name: string; store_name: string | null }[];
  userEmail: string;
}) {
  const router = useRouter();
  const parametri = useSearchParams();
  const filtru = filtruValid(parametri.get("stare"));

  const [formular, setFormular] = useState<{ categorie: CategorieTichet | null } | null>(
    () => (parametri.get("nou") !== null ? { categorie: null } : null),
  );

  const cate = {
    raspunsul_tau: tichete.filter((t) => t.stare === "raspunsul_tau").length,
    la_noi: tichete.filter((t) => t.stare === "la_noi").length,
    rezolvate: tichete.filter((t) => t.stare === "rezolvat" || t.stare === "inchis").length,
  };
  const catePeFiltru: Record<Filtru, number> = { toate: tichete.length, ...cate };
  const aratate = tichete.filter((t) => seIncadreaza(t, filtru));

  const timp = timpRaspunsMs === null ? null : durataScurta(timpRaspunsMs);
  const marime = marimeaRandului([
    cate.raspunsul_tau, cate.la_noi, cate.rezolvate,
    timp ? { valoare: timp.valoare, unitate: timp.unitate } : "–",
  ]);

  function alegeFiltrul(f: Filtru) {
    const p = new URLSearchParams(parametri.toString());
    if (f === "toate") p.delete("stare"); else p.set("stare", f);
    const sir = p.toString();
    router.replace(sir ? `?${sir}` : "?", { scroll: false });
  }

  const deschide = (categorie: CategorieTichet | null = null) => setFormular({ categorie });

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Suport</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Scrie-ne când te blochează ceva. Îți răspundem aici și pe email.
          </p>
        </div>
        <Button onClick={() => deschide()}>
          <Plus />
          Tichet nou
        </Button>
      </div>

      {tichete.length === 0 ? (
        <EcranGol onAlege={deschide} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CardStatistica
              marime={marime}
              icon={Reply}
              label="Așteaptă răspunsul tău"
              value={cate.raspunsul_tau}
              empty={cate.raspunsul_tau === 0}
              href={cate.raspunsul_tau > 0 ? "?stare=raspunsul_tau" : undefined}
              subsol={cate.raspunsul_tau === 0 ? "Nimic de făcut acum" : "Echipa ți-a scris ultima"}
              explicatie="Tichetele la care echipa Edinio ți-a scris ultima și care nu sunt rezolvate. Merg mai departe când răspunzi."
            />
            <CardStatistica
              marime={marime}
              icon={Hourglass}
              label="La echipa Edinio"
              value={cate.la_noi}
              empty={cate.la_noi === 0}
              href={cate.la_noi > 0 ? "?stare=la_noi" : undefined}
              subsol="Ultimul mesaj e al tău"
              explicatie="Tichetele deschise la care ai scris tu ultimul. Echipa se uită și îți răspunde aici și pe email."
            />
            <CardStatistica
              marime={marime}
              icon={CheckCircle2}
              label="Rezolvate"
              value={cate.rezolvate}
              empty={cate.rezolvate === 0}
              href={cate.rezolvate > 0 ? "?stare=rezolvate" : undefined}
              subsol={`Din ${tichete.length} ${tichete.length === 1 ? "tichet" : "tichete"} în total`}
              explicatie="Tichetele rezolvate sau închise. Un tichet rezolvat se redeschide dacă îi scrii din nou."
            />
            <CardStatistica
              marime={marime}
              icon={Timer}
              label="Timp de răspuns"
              value={timp ? timp.valoare : "–"}
              unit={timp?.unitate}
              empty={!timp}
              subsol={timp ? "Pe tichetele tale, de obicei" : "Încă niciun răspuns"}
              explicatie="Cât a trecut de la deschiderea tichetului până la primul răspuns al echipei. E mediana: jumătate din tichetele tale au primit răspuns mai repede de atât."
            />
          </div>

          {tichete.length >= 4 && (
            <div
              role="tablist"
              aria-label="Filtrează tichetele"
              className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 [scrollbar-width:none] sm:inline-flex"
            >
              {FILTRE.map((f) => (
                <button
                  key={f.cheie}
                  type="button"
                  role="tab"
                  aria-selected={filtru === f.cheie}
                  onClick={() => alegeFiltrul(f.cheie)}
                  className={cn(
                    "flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
                    filtru === f.cheie
                      ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.eticheta}
                  <span className={cn(
                    "rounded-md px-1.5 text-[11px] tabular-nums",
                    filtru === f.cheie ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}>
                    {catePeFiltru[f.cheie]}
                  </span>
                </button>
              ))}
            </div>
          )}

          {aratate.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <p className="font-medium text-foreground">Niciun tichet aici</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {filtru === "raspunsul_tau" ? "Nu ai niciun răspuns de dat. " : ""}
                <button type="button" onClick={() => alegeFiltrul("toate")} className="font-medium text-foreground underline-offset-4 hover:underline">
                  Vezi toate tichetele
                </button>
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:block">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tichet</th>
                      <th className="hidden w-44 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Categorie</th>
                      <th className="w-52 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stare</th>
                      <th className="hidden w-32 px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Actualizat</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {aratate.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => router.push(`/dashboard/suport/${t.id}`)}
                        className="group cursor-pointer transition-colors hover:bg-muted/30"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {t.has_unread_reply && (
                              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" aria-label="Mesaj necitit" />
                            )}
                            <Link
                              href={`/dashboard/suport/${t.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className={cn("truncate text-foreground hover:underline", t.has_unread_reply ? "font-semibold" : "font-medium")}
                            >
                              {t.subject}
                            </Link>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            <span className="font-mono text-[11px]">{numarulTichetului(t.id)}</span>
                            {t.ultimulMesaj && (
                              <>
                                <span className="mx-1.5">·</span>
                                <span className="text-foreground/70">{t.ultimulMesajDe === "agent" ? "Edinio:" : "Tu:"}</span>{" "}
                                {t.ultimulMesaj}
                              </>
                            )}
                          </p>
                        </td>
                        <td className="hidden px-5 py-3.5 lg:table-cell">
                          <Categorie cheie={t.category} />
                        </td>
                        <td className="px-5 py-3.5">
                          <EtichetaStare ton={DESPRE_STARE[t.stare].ton} marime="mic" title={DESPRE_STARE[t.stare].explicatie}>
                            {DESPRE_STARE[t.stare].text}
                          </EtichetaStare>
                        </td>
                        <td className="hidden whitespace-nowrap px-5 py-3.5 text-right text-xs text-muted-foreground md:table-cell">
                          {t.cand}
                        </td>
                        <td className="pr-4">
                          <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2 sm:hidden">
                {aratate.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/dashboard/suport/${t.id}`}
                      className="block rounded-xl bg-card p-3.5 ring-1 ring-foreground/10 transition-colors active:bg-muted/40"
                    >
                      <div className="flex items-start gap-2">
                        {t.has_unread_reply && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
                        <p className={cn("min-w-0 flex-1 text-sm text-foreground", t.has_unread_reply ? "font-semibold" : "font-medium")}>
                          {t.subject}
                        </p>
                      </div>
                      {t.ultimulMesaj && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          <span className="text-foreground/70">{t.ultimulMesajDe === "agent" ? "Edinio:" : "Tu:"}</span> {t.ultimulMesaj}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <EtichetaStare ton={DESPRE_STARE[t.stare].ton} marime="mic">{DESPRE_STARE[t.stare].text}</EtichetaStare>
                        <span className="text-[11px] text-muted-foreground">{numeleCategoriei(t.category)} · {t.cand}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <ContactDirect className="mt-6" />
        </>
      )}

      {formular && (
        <TichetNou
          businesses={businesses}
          userEmail={userEmail}
          categorieInitiala={formular.categorie}
          onClose={() => setFormular(null)}
        />
      )}
    </>
  );
}

function Categorie({ cheie }: { cheie: string }) {
  const Icon = ICONITA_CATEGORIEI[cheie] ?? LifeBuoy;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
      <span className="truncate">{numeleCategoriei(cheie)}</span>
    </span>
  );
}

/*
  ⚠ ECRANUL GOL E DRUMUL CEL MAI SCURT CATRE UN TICHET BUN. Cele opt categorii
  stau direct pe pagina: apasarea deschide formularul cu categoria deja aleasa,
  deci omul spune de la primul clic despre ce e vorba.
*/
function EcranGol({ onAlege }: { onAlege: (c: CategorieTichet) => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card px-6 py-10 text-center ring-1 ring-foreground/10 sm:py-12">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">
          <LifeBuoy className="h-6 w-6 text-primary" strokeWidth={1.75} />
        </div>
        <h2 className="text-base font-semibold text-foreground">Cu ce te putem ajuta?</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Alege despre ce e vorba și scrie-ne. Îți răspundem în cel mult 24 de ore, aici și pe email.
        </p>

        <div className="mx-auto mt-7 grid max-w-3xl grid-cols-2 gap-2 text-left sm:grid-cols-4">
          {CATEGORII.map((c) => {
            const Icon = ICONITA_CATEGORIEI[c.cheie];
            return (
              <button
                key={c.cheie}
                type="button"
                onClick={() => onAlege(c.cheie)}
                className="group flex flex-col gap-2 rounded-xl border border-border p-3 transition-all hover:border-foreground/20 hover:bg-muted/40"
              >
                <span className="flex items-center justify-between">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                </span>
                <span>
                  <span className="block text-[13px] font-medium text-foreground">{c.eticheta}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{c.descriere}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ContactDirect />
    </div>
  );
}

function ContactDirect({ className }: { className?: string }) {
  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center",
      className,
    )}>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">Ai nevoie de ajutor pe loc?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Când magazinul sau comenzile sunt oprite, sună-ne sau scrie-ne pe WhatsApp.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a href="tel:0750456809" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Phone />
          {TELEFON}
        </a>
        <a
          href="https://wa.me/40750456809"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <MessageCircle />
          WhatsApp
        </a>
      </div>
    </div>
  );
}
