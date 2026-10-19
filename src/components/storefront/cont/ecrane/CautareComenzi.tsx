"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import {
  adresaComenzilor,
  areFiltre,
  CAUTARE_MAX,
  FARA_FILTRE,
  PERIOADE_FILTRU,
  STARI_FILTRU,
  type FiltreComenzi,
} from "@/lib/cont/cautare-comenzi";
import { BUTON_TEXT, CAMP } from "../ui/clase";

/** Cat se asteapta dupa ultima tasta inainte sa se caute. */
const ASTEPTARE_MS = 350;

const egale = (a: FiltreComenzi, b: FiltreComenzi) =>
  a.cautare === b.cautare && a.stare === b.stare && a.perioada === b.perioada;

/**
 * Bara de cautare din „Comenzile mele”: numarul comenzii sau un produs, starea si
 * perioada.
 *
 * ⚠ Cauta BAZA, nu pagina: fiecare schimbare scrie adresa (`?q=`, `?stare=`,
 * `?perioada=`), iar pagina de server cere lista filtrata de la `cont_comenzile_mele`.
 * Adresa e si cea care se poate trimite, reincarca sau intoarce din browser.
 *
 * ⚠ Fara JavaScript e un formular GET obisnuit: Enter in camp trimite tot.
 *
 * ⚠ Campurile tin minte ce a scris omul, iar ce vine din adresa le schimba NUMAI cand
 * n-a cerut-o el (Sterge filtrele din lista goala, inapoi in browser). Altfel, raspunsul
 * la „ab” ar fi sters litera „c” scrisa intre timp. Comparatia se face la randare,
 * fata de ultima adresa vazuta, nu intr-un efect.
 */
export function CautareComenzi({ filtre }: { filtre: FiltreComenzi }) {
  const router = useRouter();
  const [inCurs, porneste] = useTransition();
  const [valori, setValori] = useState(filtre);
  const [dinAdresa, setDinAdresa] = useState(filtre);
  const [cerute, setCerute] = useState(filtre);
  const temporizator = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!egale(dinAdresa, filtre)) {
    setDinAdresa(filtre);
    if (!egale(filtre, cerute)) {
      setValori(filtre);
      setCerute(filtre);
    }
  }

  useEffect(() => () => {
    if (temporizator.current) clearTimeout(temporizator.current);
  }, []);

  function cauta(noi: FiltreComenzi) {
    if (temporizator.current) clearTimeout(temporizator.current);
    temporizator.current = null;
    const curat = { ...noi, cautare: noi.cautare.replace(/\s+/g, " ").trim() };
    setCerute(curat);
    porneste(() => router.replace(adresaComenzilor(curat), { scroll: false }));
  }

  function scrie(cautare: string) {
    const noi = { ...valori, cautare };
    setValori(noi);
    if (temporizator.current) clearTimeout(temporizator.current);
    temporizator.current = setTimeout(() => cauta(noi), ASTEPTARE_MS);
  }

  function alege(camp: "stare" | "perioada", valoare: string) {
    const noi = { ...valori, [camp]: valoare } as FiltreComenzi;
    setValori(noi);
    cauta(noi);
  }

  function trimite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    cauta(valori);
  }

  function sterge() {
    setValori(FARA_FILTRE);
    cauta(FARA_FILTRE);
  }

  return (
    <form
      role="search"
      action="/cont/comenzi"
      method="get"
      onSubmit={trimite}
      aria-label="Cauta in comenzi"
      className="space-y-2"
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_12rem]">
        <div className="relative">
          <label htmlFor="cauta-comenzi" className="sr-only">Numarul comenzii sau un produs</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--st-muted)]" aria-hidden="true" />
          <input
            id="cauta-comenzi"
            type="search"
            name="q"
            value={valori.cautare}
            onChange={(e) => scrie(e.target.value)}
            maxLength={CAUTARE_MAX}
            placeholder="Numarul comenzii sau un produs"
            autoComplete="off"
            enterKeyHint="search"
            className={`${CAMP} pl-10 pr-10`}
          />
          {inCurs && (
            <LoaderCircle
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--st-muted)] motion-safe:animate-spin"
              aria-hidden="true"
            />
          )}
        </div>
        {/* ⚠ Sub 360px listele stau una sub alta: alaturi, pe 320px, „Ultimele 3 luni” iesea taiata. */}
        <div className="grid gap-2 min-[360px]:grid-cols-2 sm:contents">
          <div>
            <label htmlFor="stare-comenzi" className="sr-only">Starea comenzii</label>
            <select
              id="stare-comenzi"
              name="stare"
              value={valori.stare}
              onChange={(e) => alege("stare", e.target.value)}
              className={CAMP}
            >
              <option value="">Toate starile</option>
              {STARI_FILTRU.map((s) => <option key={s.cheie} value={s.cheie}>{s.eticheta}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="perioada-comenzi" className="sr-only">Perioada</label>
            <select
              id="perioada-comenzi"
              name="perioada"
              value={valori.perioada}
              onChange={(e) => alege("perioada", e.target.value)}
              className={CAMP}
            >
              <option value="">Oricand</option>
              {PERIOADE_FILTRU.map((p) => <option key={p.cheie} value={p.cheie}>{p.eticheta}</option>)}
            </select>
          </div>
        </div>
      </div>
      {/* Fara JavaScript, Enter trimite formularul; butonul e pentru cititorul de ecran. */}
      <button type="submit" className="sr-only">Cauta</button>
      {areFiltre(valori) && (
        <div className="flex justify-end">
          <button type="button" onClick={sterge} className={BUTON_TEXT}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Sterge filtrele
          </button>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{inCurs ? "Se cauta" : ""}</p>
    </form>
  );
}
