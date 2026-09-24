"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Loader2, Search } from "lucide-react";

import {
  CAUTARE_MAXIMA, ORDINI_CONT, STARI_CONT, adresaListei, type OrdineCont, type StareCont,
} from "@/lib/cont/panou-texte";

/**
 * Cautarea si filtrele listei de conturi. Totul pleaca in ADRESA, iar lista se
 * randeaza pe server; componenta asta doar scrie adresa.
 *
 * ⚠ Cautarea asteapta sa se opreasca tastarea (400 ms), ca in „Toti clientii”:
 * altfel fiecare litera ar fi fost o cerere catre baza.
 * ⚠ Orice schimbare trimite la PRIMA pagina: pagina 4 dintr-o lista noua,
 * mai scurta, ar fi fost goala.
 */
export function BaraConturi({ q, stare, ordine }: { q: string; stare: StareCont; ordine: OrdineCont }) {
  const router = useRouter();
  const [asteapta, start] = useTransition();
  const [text, setText] = useState(q);
  /* Ultima cautare trimisa DE AICI, si ultima adresa vazuta. */
  const [trimisa, setTrimisa] = useState<string | null>(null);
  const [qVazut, setQVazut] = useState(q);

  /*
    ⚠ Inapoi/inainte din browser aduce alta cautare: campul o urmeaza. Se face
    IN RANDARE (tiparul React pentru „starea se potriveste dupa o proprietate”),
    nu intr-un efect care scrie starea: acela ar fi dat o randare in plus.
    Cautarea trimisa chiar de aici nu rescrie campul: omul poate tasta deja mai departe.
  */
  if (q !== qVazut) {
    setQVazut(q);
    if (q !== trimisa) setText(q);
    /* ⚠ Ecoul propriei cautari se inghite O DATA: altfel un „inainte” din browser spre
       aceeasi cautare n-ar mai fi rescris campul, iar efectul de mai jos ar fi anulat navigarea. */
    setTrimisa(null);
  }

  useEffect(() => {
    /* ⚠ Taiata ca in adresa: altfel un text mai lung n-ar fi fost niciodata egal cu `q` si s-ar fi retrimis la nesfarsit. */
    const cautat = text.trim().slice(0, CAUTARE_MAXIMA);
    if (cautat === q) return;
    const t = setTimeout(() => {
      setTrimisa(cautat);
      start(() => router.replace(adresaListei({ q: cautat, stare, ordine }), { scroll: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [text, q, stare, ordine, router]);

  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Caută după nume, email, telefon sau numărul unei comenzi…"
          aria-label="Caută în conturi"
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
        {asteapta && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <select
          value={stare}
          onChange={(e) => start(() => router.push(adresaListei({ q, stare: e.target.value as StareCont, ordine }), { scroll: false }))}
          aria-label="Starea contului"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
        >
          {STARI_CONT.map((s) => <option key={s.cheie} value={s.cheie}>{s.eticheta}</option>)}
        </select>
        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={ordine}
            onChange={(e) => start(() => router.push(adresaListei({ q, stare, ordine: e.target.value as OrdineCont }), { scroll: false }))}
            aria-label="Ordinea listei"
            className="w-full appearance-none rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground focus:border-primary focus:outline-none sm:w-auto"
          >
            {ORDINI_CONT.map((o) => <option key={o.cheie} value={o.cheie}>{o.eticheta}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
