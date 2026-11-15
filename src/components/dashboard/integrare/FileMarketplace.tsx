"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Filele paginilor de marketplace (eMAG intai, apoi celelalte), in locul derularii lungi.
 *
 * Pagina eMAG avea zece panouri unul sub altul: oferte, categorii, retururi, campanii, facturi,
 * setari, jurnal. Cine venea sa vada un retur derula peste tabelul de oferte. Acum fiecare are fila
 * lui, iar bara filelor sta lipita sub bara de sus cat derulezi.
 *
 * ⚠ CONTINUTUL SE MONTEAZA LA PRIMA DESCHIDERE A FILEI, nu la intrarea in pagina. Ecranele de
 * marketplace isi cer singure datele la montare, unele pana la eMAG (prin releul de IP fix): toate
 * deodata insemnau o duzina de cereri pentru un om care voia doar sa vada un retur.
 *
 * ⚠ SI NU SE MAI DEMONTEAZA. O fila parasita doar se ascunde (`hidden`): aducerea ofertelor din
 * eMAG merge pas cu pas DIN BROWSER (`PanouImport`), iar demontata la o schimbare de fila, s-ar fi
 * oprit la jumatate. La fel filtrele si pagina din lista de oferte.
 *
 * ⚠ FILA STA IN ADRESA (`#oferte`), ca sa se poata trimite o legatura direct la ea si ca o
 * legatura obisnuita din pagina („în fila Setări”, `href="#setari"`) sa schimbe fila fara cod in
 * plus. Se scrie cu `history.replaceState`, care NU adauga pasi in istoric: „Inapoi” iese din
 * pagina, nu trece prin fiecare fila deschisa. Un hash care nu e al unei file (`#emag-import`) e o
 * ancora obisnuita si nu muta fila.
 */

export type FilaMarketplace = {
  /** Apare in adresa (`#id`). Fara spatii si fara diacritice. */
  id: string;
  titlu: string;
  /** Un numar langa titlu (de exemplu cate oferte sunt). */
  numar?: number | null;
  /** Ceva din fila asteapta o mana de la comerciant: un punct de avertisment langa titlu. */
  atentie?: boolean;
  continut: ReactNode;
};

/** `replaceState` nu da niciun eveniment, deci il dam noi, ca adresa citita mai jos sa se reinnoiasca. */
const FILA_SCHIMBATA = "edinio:fila-marketplace";

function abonare(anunta: () => void) {
  window.addEventListener("hashchange", anunta);
  window.addEventListener(FILA_SCHIMBATA, anunta);
  return () => {
    window.removeEventListener("hashchange", anunta);
    window.removeEventListener(FILA_SCHIMBATA, anunta);
  };
}

function hashulAdresei(): string {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    /* Un `%` ratacit in adresa: nu e o fila, deci nu muta nimic. */
    return "";
  }
}

/** Pe server nu exista adresa cu hash: prima randare e mereu cu prima fila, ca la hidratare. */
const faraHash = () => "";

const NUMAR = new Intl.NumberFormat("ro-RO");

export function FileMarketplace({ file, eticheta }: { file: FilaMarketplace[]; eticheta: string }) {
  /*
   * ⚠ `useSyncExternalStore`, nu un efect cu `setState`: adresa nu exista pe server, deci prima randare
   * din browser trebuie sa fie aceeasi cu a serverului (prima fila), iar fila din adresa vine imediat
   * dupa. Acelasi tipar ca in `StocScazutRand`.
   */
  const hash = useSyncExternalStore(abonare, hashulAdresei, faraHash);
  const ids = file.map((f) => f.id);
  const dinAdresa = ids.includes(hash) ? hash : null;

  const [stare, setStare] = useState<{ activa: string; montate: string[] }>(() => ({
    activa: file[0]?.id ?? "",
    montate: file[0] ? [file[0].id] : [],
  }));

  /*
   * O fila venita din adresa (legatura „#oferte”, intrarea direct pe ea) devine fila aleasa si ramane
   * montata. Se face in randare, nu intr-un efect: e tiparul React pentru o stare care urmeaza o valoare
   * din afara, fara o a doua trecere prin ecran.
   */
  if (dinAdresa && dinAdresa !== stare.activa) {
    setStare((s) => ({
      activa: dinAdresa,
      montate: s.montate.includes(dinAdresa) ? s.montate : [...s.montate, dinAdresa],
    }));
  }

  const activa = ids.includes(stare.activa) ? stare.activa : ids[0];
  const cadru = useRef<HTMLDivElement>(null);
  const butoane = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lista = useRef<HTMLDivElement>(null);
  /* Bara era lipita sus in clipa apasarii? Se masoara INAINTE de schimbare, vezi mai jos. */
  const lipitaLaApasare = useRef(false);

  /*
   * Dupa o schimbare de fila, fila noua se citeste DE LA INCEPUT, cu bara chiar sub bara de sus
   * (`scroll-mt-14` tine loc pentru ea): daca omul derulase adanc in fila veche (bara lipita sus) sau
   * fila s-a schimbat dintr-o legatura de departe (bara e jos, sub antet).
   *
   * ⚠ „Lipita” se masoara la APASARE, nu aici. Fila noua e adesea mai scurta (abia isi cere datele),
   * pagina se strange, browserul taie derularea, iar aici bara ar parea deja la locul ei. Masurat pe
   * 15.11.2026: din josul filei Setări, Oferte se deschidea la mijlocul listei.
   */
  useEffect(() => {
    if (!dinAdresa) return;
    const el = cadru.current;
    if (!el) return;
    const eraLipita = lipitaLaApasare.current;
    lipitaLaApasare.current = false;
    const sus = el.getBoundingClientRect().top;
    if (eraLipita || sus < 0 || sus > window.innerHeight * 0.6) el.scrollIntoView({ block: "start" });
  }, [dinAdresa]);

  /*
   * Pe telefon bara se deruleaza in lateral, iar fila aleasa poate sta in afara ei (intrat direct pe
   * `#setari`, „Setări” era ascunsa in dreapta). Se aduce in vedere numai IN LATERAL, din `scrollLeft`:
   * `scrollIntoView` pe buton ar fi miscat si pagina in sus sau in jos.
   */
  useEffect(() => {
    const l = lista.current;
    const b = butoane.current.get(activa);
    if (!l || !b) return;
    const lr = l.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    if (br.left < lr.left) l.scrollLeft -= lr.left - br.left + 16;
    else if (br.right > lr.right) l.scrollLeft += br.right - lr.right + 16;
  }, [activa]);

  function alege(id: string) {
    if (id === activa) return;
    lipitaLaApasare.current = (cadru.current?.getBoundingClientRect().top ?? 1e9) < 57;
    setStare((s) => ({ activa: id, montate: s.montate.includes(id) ? s.montate : [...s.montate, id] }));
    window.history.replaceState(null, "", `#${id}`);
    window.dispatchEvent(new Event(FILA_SCHIMBATA));
  }

  /* Sagetile, Home si End muta fila, ca la orice lista de file accesibila (WAI-ARIA, „tabs”). */
  function tasta(e: KeyboardEvent<HTMLDivElement>) {
    const i = ids.indexOf(activa);
    const urmatoarea =
      e.key === "ArrowRight" ? ids[(i + 1) % ids.length]
      : e.key === "ArrowLeft" ? ids[(i - 1 + ids.length) % ids.length]
      : e.key === "Home" ? ids[0]
      : e.key === "End" ? ids[ids.length - 1]
      : null;
    if (!urmatoarea) return;
    e.preventDefault();
    alege(urmatoarea);
    butoane.current.get(urmatoarea)?.focus();
  }

  /*
   * ═══ ⚠ DOUA LUCRURI TIN FILA NOUA LA INCEPUTUL EI (masurate pe 15.11.2026) ═══
   *
   * Din josul filei Setări (derulat la 1953 px), un clic pe Oferte, deschisa prima oara, ajungea la
   * jumatatea listei. Cadru cu cadru: pagina se strangea la 967 px (fila noua abia isi cerea datele),
   * browserul taia derularea la 56, iar cand soseau datele o muta singur la 744 si apoi inapoi la 1953.
   * Fara niciun apel din cod: e ancorarea derularii din Chrome (`overflow-anchor`), care tinea minte
   * bara lipita ca reper.
   *
   *   1. `overflow-anchor: none` pe toata zona filelor: fara reper aici, derularea sta unde o pune
   *      `scrollIntoView`. (Safari n-are ancorare deloc, deci se poarta deja asa.)
   *   2. Panourile au cel putin inaltimea ecranului: pagina nu se mai strange sub bara, deci bara
   *      chiar poate urca sus, oricat de scurta ar fi fila noua in prima clipa.
   */
  return (
    <div ref={cadru} className="scroll-mt-14 [overflow-anchor:none]">
      {/* ⚠ Fond PLIN sub bara lipita: continutul trece pe dedesubt la derulare. */}
      <div className="sticky top-14 z-20 -mx-4 bg-background px-4 sm:-mx-6 sm:px-6">
        <div
          ref={lista}
          role="tablist"
          aria-label={eticheta}
          onKeyDown={tasta}
          className="flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
        >
          {file.map((f) => {
            const aleasa = f.id === activa;
            return (
              <button
                key={f.id}
                ref={(b) => {
                  if (b) butoane.current.set(f.id, b);
                  else butoane.current.delete(f.id);
                }}
                type="button"
                role="tab"
                id={`fila-${f.id}`}
                aria-selected={aleasa}
                aria-controls={`panou-${f.id}`}
                tabIndex={aleasa ? 0 : -1}
                onClick={() => alege(f.id)}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset rounded-t-md",
                  aleasa ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.titlu}
                {f.numar != null && f.numar > 0 && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {NUMAR.format(f.numar)}
                  </span>
                )}
                {f.atentie && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" role="img" aria-label="cere atenție" />
                )}
                {aleasa && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cel putin cat ecranul fara bara de sus: vezi „doua lucruri” mai sus. */}
      <div className="min-h-[calc(100dvh-3.5rem)] pt-5">
        {file.map((f) => (
          <div
            key={f.id}
            role="tabpanel"
            id={`panou-${f.id}`}
            aria-labelledby={`fila-${f.id}`}
            hidden={f.id !== activa}
            className="space-y-4"
          >
            {(f.id === activa || stare.montate.includes(f.id)) && f.continut}
          </div>
        ))}
      </div>
    </div>
  );
}
