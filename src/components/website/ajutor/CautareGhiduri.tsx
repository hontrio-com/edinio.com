"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ArrowUp, Loader2, Search } from "lucide-react";
import { AJUTOR_CAUTARE } from "@/lib/website/ajutor-texte";
import {
  ADRESA_INDEX,
  adresaGhid,
  cautaInIndex,
  type IntrareIndex,
} from "@/lib/website/ajutor-cautare";

/**
 * Bara de căutare din capul centrului de ajutor, cu rezultatele sub ea.
 *
 * ═══ INDEXUL SE ADUCE LA PRIMA ATINGERE, NU LA DESCHIDEREA PAGINII ═══
 *
 * Centrul are 406 de ghiduri. Împachetate cu pagina, ca să poată fi căutate pe
 * loc, ajungeau 1,1 MB de text în fiecare browser, inclusiv la cine deschide
 * `/ajutor`, se uită la categorii și apasă pe una. Pagina se randa în secunde.
 *
 * Acum indexul e un fișier (`app/indice-ajutor.json/route.ts`, 149 KB comprimați)
 * și se cere abia când omul atinge câmpul. Cine nu caută nu-l descarcă niciodată.
 *
 * ⚠ Același raționament ca la scriptul reCAPTCHA de la formulare, unde e scris pe
 * larg: greutatea nu se plătește pentru cine trece pe lângă funcție.
 *
 * ⚠ Se cere O SINGURĂ DATĂ, oricâte atingeri ar fi: promisiunea se ține la nivel
 * de modul, nu în stare. Fără asta, fiecare intrare și ieșire din câmp ar fi
 * pornit încă o descărcare.
 *
 * ═══ REZULTATELE ÎNLOCUIESC CATEGORIILE, NU SE ADAUGĂ SUB ELE ═══
 *
 * Cât timp câmpul e gol se văd categoriile, adică pagina din schiță. Cum se scrie
 * ceva, categoriile se retrag și rămân rezultatele. Ținute amândouă pe ecran, omul
 * ar fi trebuit să aleagă de fiecare dată între două liste care spun lucruri
 * diferite. De aceea componenta le cuprinde pe amândouă: ea hotărăște ce se vede,
 * nu pagina. Categoriile vin ca `children`, deci rămân randate pe SERVER.
 *
 * ⚠ FĂRĂ JAVASCRIPT rămân categoriile, iar câmpul nu se randează deloc. Un câmp
 * care nu filtrează nimic e mai rău decât lipsa lui: arată exact ca unul care
 * merge. Vezi `<noscript>` mai jos.
 */

/** Promisiunea descărcării, ținută la nivel de modul. Se cere o singură dată. */
let adus: Promise<IntrareIndex[]> | null = null;

function aduIndexul(): Promise<IntrareIndex[]> {
  if (!adus) {
    adus = fetch(ADRESA_INDEX)
      .then((r) => {
        if (!r.ok) throw new Error(`indexul a răspuns ${r.status}`);
        return r.json() as Promise<IntrareIndex[]>;
      })
      .catch((e) => {
        /* Se uită eșecul, ca a doua atingere să poată reîncerca: o pană de rețea
           de o secundă n-are voie să strice căutarea până la reîncărcare. */
        adus = null;
        throw e;
      });
  }
  return adus;
}

export function CautareGhiduri({ categorii }: { categorii: React.ReactNode }) {
  const [interogare, setInterogare] = useState("");
  const [index, setIndex] = useState<IntrareIndex[] | null>(null);
  const [eroare, setEroare] = useState(false);
  const id = useId();

  const scris = interogare.trim();
  const rezultate = useMemo(
    () => (index ? cautaInIndex(index, scris) : []),
    [index, scris],
  );

  function porneste() {
    if (index || eroare) return;
    aduIndexul()
      .then(setIndex)
      .catch(() => setEroare(true));
  }

  return (
    <>
      {/*
        Fără JavaScript, formularul de mai jos se ascunde cu totul. Componenta e de
        client, dar HTML-ul ei pleacă oricum de pe server: câmpul ar fi apărut și
        fără JS, arătând exact ca unul care merge, și n-ar fi filtrat nimic. Ce
        rămâne, categoriile, e randat pe server și e întreg.
      */}
      <noscript>
        <style>{`.cauta-ghiduri { display: none; }`}</style>
      </noscript>

      {/*
        ⚠ `<form>` cu `onSubmit` oprit, nu un `<div>`. Pe telefon, un `<input>`
        singur nu primește tasta „caută” pe tastatură; într-un formular cu un
        singur câmp, o primește. Iar apăsarea ei ÎNCHIDE tastatura, ceea ce e chiar
        ce vrea omul: rezultatele sunt deja filtrate, tastatura doar le acoperea.
      */}
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        /* Coloana îngustă e a CĂUTĂRII, nu a paginii: categoriile de sub ea au
           nevoie de toată lățimea. */
        className="cauta-ghiduri mx-auto mt-8 max-w-[760px]"
      >
        <label htmlFor={id} className="sr-only">
          {AJUTOR_CAUTARE}
        </label>

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3"
          />
          <input
            id={id}
            type="search"
            value={interogare}
            onChange={(e) => {
              setInterogare(e.target.value);
              porneste();
            }}
            /* Se aduce la ATINGERE, nu la prima literă: cine dă clic în câmp
               aproape sigur va scrie, iar așa indexul e gata până termină. */
            onFocus={porneste}
            placeholder={AJUTOR_CAUTARE}
            autoComplete="off"
            /*
              ⚠ FĂRĂ `autoFocus`. Pe telefon ar fi deschis tastatura la intrarea în
              pagină, acoperind jumătate din ecran înainte ca omul să apuce să vadă
              categoriile, iar cei mai mulți vin să se uite, nu să caute.
            */
            className="h-16 w-full rounded-[14px] border border-hairline bg-white ps-14 pe-16 text-[16px] text-ink shadow-[0_1px_2px_rgba(10,10,10,0.04)] transition-colors duration-200 placeholder:text-ink-3 focus:border-ink-3 focus:outline-none focus:ring-2 focus:ring-ink/5 sm:text-[17px]"
          />
          {/*
            ⚠ Hover pe CULOARE, ca toate celelalte butoane verzi ale site-ului.
            Era pe `scale-[1.04]`, adica al treilea fel de a scala din trei care
            existau, si ultimul ramas dupa auditul din 23.08. Rationamentul e
            scris in `lib/website/buton.ts`; clasele nu vin de acolo fiindca
            asta e singurul buton rotund, numai cu pictograma, deci n-are
            inaltime si latime de text.
          */}
          <button
            type="submit"
            className="absolute end-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white transition-colors duration-200 hover:bg-primary/90"
          >
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Caută</span>
          </button>
        </div>
      </form>

      {/*
        Câte s-au găsit, anunțat și cititoarelor de ecran. `aria-live="polite"`
        fiindcă lista se schimbă fără ca pagina să se schimbe: fără el, cine nu vede
        ecranul tastează în gol și nu află niciodată că s-a întâmplat ceva.
      */}
      <p aria-live="polite" className="sr-only">
        {!scris
          ? "Scrie ca să cauți în ghiduri."
          : index
            ? `${rezultate.length} rezultate pentru ${scris}`
            : "Se pregătește căutarea."}
      </p>

      {scris ? (
        <Rezultate
          interogare={scris}
          rezultate={rezultate}
          gata={index !== null}
          eroare={eroare}
        />
      ) : (
        categorii
      )}
    </>
  );
}

function Rezultate({
  interogare,
  rezultate,
  gata,
  eroare,
}: {
  interogare: string;
  rezultate: IntrareIndex[];
  gata: boolean;
  eroare: boolean;
}) {
  if (eroare) {
    /*
      ⚠ NU se spune „niciun rezultat” când căutarea n-a putut porni. Ar fi o
      minciună: ghidul poate să existe. Se spune ce s-a întâmplat și se lasă
      categoriile ca ieșire.
    */
    return (
      <div className="mx-auto mt-10 max-w-[760px] rounded-[16px] border border-dashed border-hairline bg-tint px-6 py-10 text-center">
        <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Căutarea nu a pornit
        </p>
        <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-[1.6] text-ink-2">
          Reîncarcă pagina și încearcă din nou. Între timp poți răsfoi categoriile
          sau ne poți scrie.
        </p>
      </div>
    );
  }

  if (!gata) {
    /* Cât se aduce indexul. Sub o secundă pe o legătură obișnuită, dar tăcerea ar
       fi arătat ca „n-am găsit nimic”. */
    return (
      <p className="mx-auto mt-10 flex max-w-[760px] items-center gap-2 text-[14px] text-ink-3">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Se pregătește căutarea...
      </p>
    );
  }

  if (rezultate.length === 0) {
    /*
      ⚠ NU E O FUNDĂTURĂ. Un „niciun rezultat” singur trimite omul înapoi de unde a
      venit; aici îi arată imediat cele două ieșiri, categoriile dacă vrea să caute
      singur și oamenii dacă nu mai vrea.
    */
    return (
      <div className="mx-auto mt-10 max-w-[760px] rounded-[16px] border border-dashed border-hairline bg-tint px-6 py-10 text-center">
        <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
          Nu am găsit nimic pentru „{interogare}”
        </p>
        {/* Fără liniuță lungă, ca în toate textele centrului. E regula 17 din cele
            date de client. */}
        <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-[1.6] text-ink-2">
          Încearcă alt cuvânt, de pildă „retur”, „awb” sau „factură”. Dacă tot nu
          găsești, scrie-ne și îți răspunde un om.
        </p>
      </div>
    );
  }

  /*
    ⚠ SE ARATĂ CEL MULT 30. La 406 de ghiduri, un cuvânt des scris întoarce peste
    o sută de rânduri, iar o listă atât de lungă nu se citește: cine n-a găsit
    răspunsul în primele zece scrie alt cuvânt, nu derulează. Numărul întreg se
    scrie deasupra, ca omul să știe că mai sunt.
  */
  const ARATATE = 30;
  const vizibile = rezultate.slice(0, ARATATE);

  return (
    <div className="mx-auto mt-10 max-w-[760px]">
      <p className="text-[14px] text-ink-3">
        {rezultate.length === 1 ? "Un rezultat" : `${rezultate.length} rezultate`} pentru „
        {interogare}”
        {rezultate.length > ARATATE ? `, primele ${ARATATE}` : ""}
      </p>

      <ul role="list" className="mt-4 grid gap-3">
        {vizibile.map((g) => (
          <li key={`${g.c}/${g.s}`}>
            <Link
              href={adresaGhid(g.c, g.s)}
              className="block rounded-[12px] border border-hairline bg-white px-5 py-4 transition-colors duration-200 hover:bg-tint"
            >
              {/* Categoria și grupul deasupra titlului: spun din ce parte a
                  panoului e răspunsul, ceea ce de multe ori e chiar ce lipsea. */}
              <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">
                {g.ct} · {g.g}
              </span>
              <p className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-ink">
                {g.t}
              </p>
              <p className="mt-1 text-[14.5px] leading-[1.55] text-ink-2">{g.r}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
