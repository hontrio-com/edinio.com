"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  CATEGORII,
  INTEGRARI,
  numele,
  ordonate,
  potrivire,
  type CategorieId,
  type Integrare,
} from "@/lib/website/integrari-catalog";
import { Logo } from "./Logo";

/**
 * Biblioteca de integrări: căutare, rubrici, și un card pentru fiecare serviciu.
 *
 * ═══ DE CE E COMPONENTĂ DE CLIENT, ȘI DE CE NU COSTĂ NIMIC ═══
 *
 * Filtrarea se întâmplă în browser, deci are nevoie de stare. Dar componentele
 * de client sunt randate ȘI pe server: toate cele 65 de carduri pleacă în HTML,
 * cu nume și descrieri, exact ca la o pagină statică. Google le vede, cine are
 * JavaScript oprit le vede, iar căutarea e ce se adaugă pe deasupra.
 *
 * Filtrarea NU trece prin adresă (`?categorie=curieri`), și e o alegere: ar fi
 * însemnat o navigare la fiecare apăsare de literă. Prețul e că o listă filtrată
 * nu se poate trimite cuiva pe link. Dacă se cere vreodată, se mută în
 * `useSearchParams` cu `replace`, nu cu `push`.
 *
 * ═══ AȘEZAREA, DUPĂ SCHIȚA CLIENTULUI ═══
 *
 * Pe ecran lat: rubricile în stânga, căutarea deasupra grilei, cardurile în
 * dreapta. Sunt TREI blocuri într-o grilă cu poziții scrise explicit, nu două
 * coloane cu conținut împachetat — fiindcă pe telefon ordinea trebuie să fie
 * alta: întâi cauți, apoi alegi rubrica, apoi vezi rezultatele.
 *
 * Un singur DOM pentru amândouă. Rubricile randate de două ori (o dată ca listă
 * laterală, o dată ca șir de pastile) ar fi însemnat aceleași etichete în două
 * locuri — se despart la prima corectură — și conținut citit de două ori de
 * cititoarele de ecran.
 */

/** Cât de mare se desenează sigla pe card, în pixeli pătrați. Vezi `logoSize()`. */
const ARIE_SIGLA = 1200;
/** Lățimea utilă a locașului siglei. Probată: nicio siglă nu cade sub 11px. */
const LATIME_SIGLA = 120;

type Filtru = CategorieId | "toate";

export function BibliotecaIntegrari() {
  const [cautare, setCautare] = useState("");
  const [rubrica, setRubrica] = useState<Filtru>("toate");

  /*
    Căutarea se aplică ÎNAINTE de rubrică, iar numerele de lângă rubrici se
    socotesc din rezultatul ei. Așa, după ce scrii „locker", rubricile arată
    câte găsești în fiecare — și nu poți apăsa una care ți-ar da lista goală.
    Numere fixe ar fi fost mai simple și ar fi mințit.
  */
  const dupaCautare = useMemo(
    () => (cautare.trim() ? INTEGRARI.filter((i) => potrivire(i, cautare)) : INTEGRARI),
    [cautare],
  );

  const numarPeRubrica = useMemo(() => {
    const numar = new Map<Filtru, number>([["toate", dupaCautare.length]]);
    for (const c of CATEGORII) numar.set(c.id, 0);
    for (const i of dupaCautare) numar.set(i.categorie, (numar.get(i.categorie) ?? 0) + 1);
    return numar;
  }, [dupaCautare]);

  /*
    Cele care merg azi, întâi; cele anunțate, la sfârșit. Sortarea e stabilă,
    deci ordinea pe rubrici rămâne întreagă în fiecare dintre cele două grupe.
  */
  const rezultate = useMemo(
    () =>
      ordonate(
        rubrica === "toate"
          ? dupaCautare
          : dupaCautare.filter((i) => i.categorie === rubrica),
      ),
    [dupaCautare, rubrica],
  );

  return (
    <section id="biblioteca" className="border-t border-hairline bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
        {/* ── Antetul secțiunii ─────────────────────────────────────────── */}
        <div className="max-w-[760px]">
          <h2 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            Biblioteca de integrări
          </h2>
          {/*
            FĂRĂ CIFRE, cerut de client. Și e o alegere care se apără singură: un
            număr scris aici s-ar fi demodat la prima integrare livrată, iar
            atunci pagina ar fi spus altceva decât arată cardurile de sub ea.
          */}
          <p className="mt-5 max-w-[620px] text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            Răsfoiește biblioteca de integrări, din toate categoriile, sau caută
            direct furnizorul cu care lucrezi deja. Cele marcate „În
            curând&rdquo; sunt în lucru.
          </p>
        </div>

        {/*
          `items-start` e obligatoriu pentru ca panoul din stânga să se poată lipi
          la derulare: fără el, elementul se întinde pe toată înălțimea rândului
          și `sticky` n-are pe ce aluneca.
        */}
        <div className="mt-10 flex flex-col gap-6 lg:mt-12 lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start lg:gap-x-10 lg:gap-y-6">
          {/* ── Căutarea ────────────────────────────────────────────────── */}
          <div className="lg:col-start-2 lg:row-start-1">
            <BaraDeCautare
              valoare={cautare}
              schimba={setCautare}
              gasite={rezultate.length}
            />
          </div>

          {/* ── Rubricile + caseta de informații ────────────────────────── */}
          {/*
            Cuprinde amândouă rândurile grilei ca să se poată lipi: un element
            lipicios nu iese din caseta lui, iar caseta e chiar aria de grilă.
            Pe un singur rând n-ar fi avut pe ce aluneca.
          */}
          <aside className="lg:sticky lg:top-[88px] lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <NavigatieRubrici
              aleasa={rubrica}
              alege={setRubrica}
              numar={numarPeRubrica}
            />
            {/*
              Pe telefon caseta NU stă aici: măsurat, între pastile și primul card
              se adunau vreo 200px de citit înainte să se vadă un singur rezultat.
              Acolo apare cea de sub grilă.
            */}
            <div className="hidden lg:mt-5 lg:block">
              <CasetaInformativa />
            </div>
          </aside>

          {/* ── Grila de carduri ────────────────────────────────────────── */}
          <div className="lg:col-start-2 lg:row-start-2">
            {rezultate.length > 0 ? (
              <ul
                role="list"
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                {rezultate.map((integrare) => (
                  <li key={integrare.cheie}>
                    <CardIntegrare integrare={integrare} />
                  </li>
                ))}
              </ul>
            ) : (
              <NimicGasit cautare={cautare} />
            )}
          </div>

          {/*
            A DOUA gazdă a casetei, pentru telefon și tabletă. Nu e o a doua
            copie a textului: `CasetaInformativa` e o singură componentă, montată
            în două locuri, iar la orice lățime se vede exact unul — celălalt e
            `display: none`, deci nici cititoarele de ecran nu-l aud de două ori.

            Puteau fi și una singură, mutată cu `order`, dar numai dacă panoul din
            stânga înceta să mai fie lipicios: un element `sticky` nu poate ieși
            din aria lui de grilă, iar aria aia trebuie să cuprindă amândouă
            rândurile ca să aibă pe ce aluneca.
          */}
          <div className="lg:hidden">
            <CasetaInformativa />
          </div>
        </div>
      </div>
    </section>
  );
}

function BaraDeCautare({
  valoare,
  schimba,
  gasite,
}: {
  valoare: string;
  schimba: (v: string) => void;
  gasite: number;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3"
        aria-hidden
      />
      {/*
        `type="search"` aduce butonul de golire al browserului pe unele sisteme,
        dar nu pe toate — de aceea e și unul al nostru, mai jos. Cu amândouă
        vizibile ar fi două cruci una lângă alta, așa că cel al browserului e
        stins din `appearance-none`.
      */}
      <input
        type="search"
        value={valoare}
        onChange={(e) => schimba(e.target.value)}
        placeholder="Caută o integrare: Sameday, facturare, plăți în rate…"
        aria-label="Caută în biblioteca de integrări"
        className="h-13 w-full appearance-none rounded-[10px] border border-hairline bg-white pl-11 pr-11 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink-3/50 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {valoare ? (
        <button
          type="button"
          onClick={() => schimba("")}
          aria-label="Șterge căutarea"
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 transition-colors duration-200 hover:bg-tint-2 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {/*
        Numărul de rezultate, spus doar cititoarelor de ecran. Pe ecran se vede
        oricum din câte carduri au rămas, iar un rând de text care se schimbă la
        fiecare literă ar fi zbârnâit sub bara de căutare. `polite` ca să nu
        întrerupă tastarea.
      */}
      <p aria-live="polite" className="sr-only">
        {gasite === 1 ? "O integrare găsită" : `${gasite} integrări găsite`}
      </p>
    </div>
  );
}

function NavigatieRubrici({
  aleasa,
  alege,
  numar,
}: {
  aleasa: Filtru;
  alege: (f: Filtru) => void;
  numar: Map<Filtru, number>;
}) {
  const rubrici: { id: Filtru; eticheta: string }[] = [
    { id: "toate", eticheta: "Toate" },
    ...CATEGORII.map((c) => ({ id: c.id as Filtru, eticheta: c.eticheta })),
  ];

  return (
    <nav aria-label="Rubricile bibliotecii de integrări">
      {/*
        Titlul rubricilor se vede doar pe ecran lat, unde panoul e o coloană cu
        cap de tabel. Pe telefon, un titlu peste un șir de pastile ar fi un rând
        în plus care nu spune nimic: se vede din pastile ce sunt.
      */}
      <p className="hidden text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3 lg:block">
        Categorii
      </p>

      {/*
        Pe telefon rubricile stau într-o GRILĂ, nu într-un rând înfășurat.

        Înfășurate, fiecare pastilă era exact cât textul ei, iar rândurile ieșeau
        cu margini din dinți: „SMS" lângă „Email marketing", iar rândul următor
        începea în alt loc. Nu era o problemă de spațiere, ci de LĂȚIMI DIFERITE
        pe același rând — deci nu se repară cu alt `gap`. Într-o grilă de două
        coloane toate au aceeași lățime, iar numerele se aliniază unul sub altul.

        Zece rubrici, două coloane: cinci rânduri pline, fără nimic rămas singur
        pe ultimul.

        De la `md` sunt PATRU coloane, nu cinci, și numărul e măsurat. Cinci
        împărțeau exact zece, deci păreau alegerea evidentă — dar la 768px
        rămâneau 136px de pastilă, iar „Email marketing" cere 145 și se rupea pe
        două rânduri. Cu patru ies 176px și încape tot pe un rând, cu prețul unui
        ultim rând de două. Un rând mai scurt la sfârșit se citește ca listă; o
        etichetă ruptă în două se citește ca greșeală.

        ⚠ Etichetele NU primesc `whitespace-nowrap`: la 320px pastila are 133px
        și atunci s-ar tăia textul. Mai bine se rupe pe două rânduri decât să
        dispară o literă — iar în grilă toate pastilele rândului cresc odată, deci
        rândul rămâne drept.

        ⚠ NU se derulează lateral, la nicio lățime: cine nu ghicește că poate
        trage crede că alea sunt toate rubricile. Aceeași hotărâre ca la tabelul
        de comparație.
      */}
      <ul
        role="list"
        className="mt-0 grid grid-cols-2 gap-2 md:grid-cols-4 lg:mt-3 lg:flex lg:flex-col lg:gap-0.5"
      >
        {rubrici.map((r) => {
          const cate = numar.get(r.id) ?? 0;
          const activa = aleasa === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => alege(r.id)}
                /*
                  `aria-pressed`, nu `aria-current`: sunt butoane care comută o
                  stare, nu legături către locul în care ești.
                */
                aria-pressed={activa}
                /*
                  O rubrică golită de căutare rămâne APĂSABILĂ, doar stinsă. Un
                  buton dezactivat nu poate fi atins ca să afli de ce e gol, iar
                  numărul de lângă el spune deja tot.
                */
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-left text-[13px] transition-colors duration-200 lg:border-transparent lg:px-2.5",
                  activa
                    ? "border-ink bg-ink font-medium text-white lg:border-transparent lg:bg-tint-2 lg:text-ink"
                    : "border-hairline bg-white text-ink-2 hover:bg-tint-2 hover:text-ink",
                  !activa && cate === 0 && "text-ink-3",
                )}
              >
                <span>{r.eticheta}</span>
                <span
                  className={cn(
                    "text-[12px] tabular-nums",
                    activa ? "text-white/70 lg:text-ink-3" : "text-ink-3",
                  )}
                >
                  {cate}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Caseta de sub rubrici — „INFO" din schiță.
 *
 * Textul e al clientului (2026-08-13), dat ca exemplu de sens, nu cuvânt cu
 * cuvânt: „Lucrăm constant să acoperim toate integrările necesare. Dacă ai
 * sugestii de integrări, ne poți contacta." Aici e aceeași idee, spusă în două
 * rânduri scurte plus o legătură — dar dacă vrea forma lui exactă, se schimbă
 * doar textul de mai jos.
 */
function CasetaInformativa() {
  return (
    <div className="rounded-[12px] border border-hairline bg-tint p-4">
      <p className="text-[13px] font-semibold text-ink">Lista crește</p>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-2">
        Lucrăm constant ca să acoperim toate integrările de care ai nevoie. Dacă
        îți lipsește una, spune-ne.
      </p>
      <Link
        href="/contact"
        className="mt-3 inline-flex text-[13px] font-medium text-ink underline decoration-1 underline-offset-[5px] transition-opacity duration-200 hover:opacity-70"
      >
        Sugerează o integrare
      </Link>
    </div>
  );
}

function CardIntegrare({ integrare }: { integrare: Integrare }) {
  const inCurand = integrare.stare === "in-curand";

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-[14px] border p-5 transition-colors duration-200",
        inCurand
          ? "border-hairline bg-tint-2"
          : "border-hairline bg-white hover:border-ink-3/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/*
          Locaș de înălțime FIXĂ, cu sigla centrată în el. Siglele au înălțimi
          foarte diferite la suprafață egală — de la 11px pentru un wordmark lung
          la 45 pentru un semn pătrat — iar fără locaș fix numele de dedesubt ar
          începe fiecare la altă înălțime și rândul de carduri ar ieși zimțat.
        */}
        <div className="flex h-[46px] items-center">
          <Logo k={integrare.cheie} area={ARIE_SIGLA} maxWidth={LATIME_SIGLA} />
        </div>

        {inCurand ? (
          <span className="shrink-0 rounded-full border border-hairline bg-white px-2.5 py-1 text-[11px] font-medium text-ink-2">
            În curând
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 text-[15px] font-semibold text-ink">{numele(integrare)}</h3>
      <p className="mt-1.5 text-[13px] leading-[1.55] text-ink-2">{integrare.descriere}</p>
    </article>
  );
}

function NimicGasit({ cautare }: { cautare: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-hairline bg-tint px-6 py-14 text-center">
      {/* Ghilimele româneşti: „jos-sus". Perechea dreaptă `"` nici n-ar fi trecut
          de `react/no-unescaped-entities`, si oricum nu e semnul potrivit. */}
      <p className="text-[15px] font-semibold text-ink">
        Nu găsim nimic pentru „{cautare}&rdquo;
      </p>
      <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-[1.6] text-ink-2">
        Poate se cheamă altfel, sau poate chiar nu o avem încă. Spune-ne de ce ai
        nevoie și îți răspundem dacă se poate face.
      </p>
      <Link
        href="/contact"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-[8px] bg-primary px-6 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02] active:scale-100"
      >
        Cere o integrare
      </Link>
    </div>
  );
}
