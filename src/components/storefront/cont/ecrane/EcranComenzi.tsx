import Link from "next/link";
import { Download, PackageSearch, SearchX } from "lucide-react";
import type { ComandaDinCont } from "@/lib/cont/comenzi";
import { areFiltre, parametriiFiltrelor, type FiltreComenzi } from "@/lib/cont/cautare-comenzi";
import { pluralRo } from "@/lib/utils/format";
import { CardComanda } from "./CardComanda";
import { CautareComenzi } from "./CautareComenzi";
import { Paginare } from "./Paginare";
import { StareGoala } from "../ui/piese";
import { BUTON_PRIMAR, BUTON_SECUNDAR, LEGATURA, STIL_PRIMAR } from "../ui/clase";
import { LegaturaCont } from "../ui/LegaturaCont";

export function EcranComenzi({
  comenzi,
  pagina,
  pagini,
  filtre,
  comenziInCont,
  gasite = 0,
  mesajRaport = null,
}: {
  comenzi: ComandaDinCont[];
  pagina: number;
  pagini: number;
  /** Cautarea din adresa, curatata (`citesteFiltrele`). */
  filtre: FiltreComenzi;
  /** Toate comenzile contului, fara filtre (`rezumat.comenzi`): fara niciuna, nu e ce cauta. */
  comenziInCont: number;
  /** Cate comenzi are filtrul de acum, pe toate paginile: atatea intra in raport. */
  gasite?: number;
  /** De ce nu s-a descarcat raportul cerut (`?raport=`), sau `null`. */
  mesajRaport?: string | null;
}) {
  const cauta = areFiltre(filtre);

  if (comenzi.length === 0 && !cauta && comenziInCont === 0) {
    /*
      ⚠ Textul spune adevarul, nu „Nu ai nicio comanda". Comenzile omului pot
      exista si sa nu fie inca legate de cont: le leaga contactul verificat, iar
      o comanda pusa cu alt email nu se potriveste.
    */
    return (
      <StareGoala
        icon={PackageSearch}
        titlu="Nu ai nicio comanda in cont"
        actiune={<Link href="/" className={BUTON_PRIMAR} style={STIL_PRIMAR}>Mergi la magazin</Link>}
      >
        Comenzile plasate cu adresa de email a contului apar aici automat. Daca ai comandat cu alta adresa, adaug-o in{" "}
        <Link href="/cont/date" className={LEGATURA}>Datele mele</Link> si le vei vedea aici.
      </StareGoala>
    );
  }

  return (
    <>
      <CautareComenzi filtre={filtre} />
      {comenzi.length === 0 ? (
        /* ⚠ Alta stare goala decat a contului fara comenzi: aici comenzile exista, cautarea nu le-a gasit. */
        <StareGoala
          icon={SearchX}
          titlu="Nicio comanda nu se potriveste"
          actiune={<LegaturaCont href="/cont/comenzi" className={BUTON_SECUNDAR}>Sterge filtrele</LegaturaCont>}
        >
          Cauta dupa numarul comenzii (de exemplu 1024), numele unui produs, destinatar, telefon sau numarul AWB, ori alege alta stare sau alta perioada.
        </StareGoala>
      ) : (
        <>
          {/*
            Raportul (cerut 23.11.2026): toate comenzile filtrului de mai sus, nu doar pagina, intr-un
            fisier .xlsx. ⚠ Formular cu POST, ca la „Descarca datele mele”: merge fara JavaScript si
            trece prin poarta de origine. Campurile ascunse poarta filtrele cu numele din adresa.
          */}
          <form method="post" action="/api/cont/comenzi/raport" className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {filtre.cautare && <input type="hidden" name="q" value={filtre.cautare} />}
            {filtre.stare && <input type="hidden" name="stare" value={filtre.stare} />}
            {filtre.perioada && <input type="hidden" name="perioada" value={filtre.perioada} />}
            {filtre.deLa && <input type="hidden" name="de_la" value={filtre.deLa} />}
            {filtre.panaLa && <input type="hidden" name="pana_la" value={filtre.panaLa} />}
            {mesajRaport && <p role="alert" className="mr-auto text-[13px] text-[var(--st-muted)]">{mesajRaport}</p>}
            <button type="submit" className={BUTON_SECUNDAR}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Descarca raportul (.xlsx){gasite > 0 ? `, ${pluralRo(gasite, "comanda", "comenzi")}` : ""}
            </button>
          </form>
          <ul className="space-y-3">
            {comenzi.map((c) => (
              <li key={c.orderId}>
                <CardComanda c={c} />
              </li>
            ))}
          </ul>
          <Paginare baza="/cont/comenzi" pagina={pagina} pagini={pagini} parametri={parametriiFiltrelor(filtre)} />
        </>
      )}
    </>
  );
}
