import Link from "next/link";
import { PackageSearch } from "lucide-react";
import type { ComandaDinCont } from "@/lib/cont/comenzi";
import { CardComanda } from "./CardComanda";
import { Paginare } from "./Paginare";
import { StareGoala } from "../ui/piese";
import { BUTON_PRIMAR, LEGATURA, STIL_PRIMAR } from "../ui/clase";

export function EcranComenzi({
  comenzi,
  pagina,
  pagini,
}: {
  comenzi: ComandaDinCont[];
  pagina: number;
  pagini: number;
}) {
  if (comenzi.length === 0) {
    /*
      ⚠ Textul spune adevarul, nu „Nu ai nicio comanda". Comenzile omului pot
      exista si sa nu fie inca legate de cont: le leaga contactul verificat, iar
      o comanda pusa cu alt email nu se potriveste.
    */
    return (
      <StareGoala
        icon={PackageSearch}
        titlu="Nicio comanda legata de cont"
        actiune={<Link href="/" className={BUTON_PRIMAR} style={STIL_PRIMAR}>Mergi la magazin</Link>}
      >
        Comenzile se leaga singure de adresa cu care ai intrat. Daca ai comandat cu alta adresa, adaug-o in{" "}
        <Link href="/cont/date" className={LEGATURA}>Datele mele</Link> si le vei vedea aici.
      </StareGoala>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {comenzi.map((c) => (
          <li key={c.orderId}>
            <CardComanda c={c} />
          </li>
        ))}
      </ul>
      <Paginare baza="/cont/comenzi" pagina={pagina} pagini={pagini} />
    </>
  );
}
