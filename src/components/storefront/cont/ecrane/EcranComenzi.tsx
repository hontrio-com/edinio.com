import Link from "next/link";
import { PackageSearch, SearchX } from "lucide-react";
import type { ComandaDinCont } from "@/lib/cont/comenzi";
import { areFiltre, parametriiFiltrelor, type FiltreComenzi } from "@/lib/cont/cautare-comenzi";
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
}: {
  comenzi: ComandaDinCont[];
  pagina: number;
  pagini: number;
  /** Cautarea din adresa, curatata (`citesteFiltrele`). */
  filtre: FiltreComenzi;
  /** Toate comenzile contului, fara filtre (`rezumat.comenzi`): fara niciuna, nu e ce cauta. */
  comenziInCont: number;
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
          Cauta dupa numarul comenzii (de exemplu 1024) sau dupa numele unui produs, ori alege alta stare sau alta perioada.
        </StareGoala>
      ) : (
        <>
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
