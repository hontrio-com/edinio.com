import Link from "next/link";
import { Undo2 } from "lucide-react";
import type { ReturulMeu } from "@/lib/cont/date";
import type { TonEticheta } from "@/components/ui/eticheta-stare";
import { formatDate, pluralRo } from "@/lib/utils/format";
import { EtichetaStareCont, ListaDate, RandDate, StareGoala } from "../ui/piese";
import { BUTON_PRIMAR, CARD, LEGATURA, STIL_PRIMAR } from "../ui/clase";

/** Starile cererilor de retur (`return.actions.ts`), scrise pentru cumparator. */
const STARE: Record<string, { text: string; ton: TonEticheta; fraza: string }> = {
  nou: { text: "Trimisa", ton: "asteptare", fraza: "Magazinul a primit cererea si o verifica." },
  aprobat: { text: "Aprobata", ton: "info", fraza: "Cererea e aprobata. Trimite produsele cum ti-a spus magazinul." },
  respins: { text: "Respinsa", ton: "rau", fraza: "Magazinul a respins cererea. Pentru detalii, scrie-i." },
  rambursat: { text: "Banii intorsi", ton: "bun", fraza: "Suma a fost returnata." },
};

const RESTITUIRE: Record<string, string> = {
  iban: "In contul bancar",
  original: "Pe aceeasi cale ca plata",
  card: "Pe card",
};

export function EcranRetururi({ retururi }: { retururi: ReturulMeu[] }) {
  if (retururi.length === 0) {
    return (
      <StareGoala
        icon={Undo2}
        titlu="Nu ai nicio cerere de retur"
        actiune={<Link href="/cont/comenzi" className={BUTON_PRIMAR} style={STIL_PRIMAR}>Vezi comenzile</Link>}
      >
        Te poti retrage din contract in cel putin 14 zile de la primirea produselor, din pagina comenzii.
      </StareGoala>
    );
  }

  return (
    <ul className="space-y-4">
      {retururi.map((r) => {
        const st = STARE[r.stare] ?? { text: r.stare, ton: "neutru" as TonEticheta, fraza: "" };
        return (
          <li key={r.returId} className={`${CARD} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-[var(--st-text)]">
                  Retur pentru comanda{" "}
                  {r.orderId ? (
                    <Link href={`/cont/comenzi/${r.orderId}`} className={`${LEGATURA} tabular-nums`}>{r.numarComanda}</Link>
                  ) : (
                    <span className="tabular-nums">{r.numarComanda}</span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-[var(--st-muted)]">
                  Cerut pe {formatDate(r.creatLa)} · {pluralRo(r.bucati, "produs", "produse")}
                </p>
              </div>
              <EtichetaStareCont ton={st.ton}>{st.text}</EtichetaStareCont>
            </div>
            {st.fraza && <p className="mt-3 text-sm text-[var(--st-muted)]">{st.fraza}</p>}

            <div className="mt-4">
              <ListaDate>
                {r.produse.length > 0 && (
                  <RandDate eticheta="Produse">
                    {r.produse.map((p, i) => (
                      <span key={i} className="block">
                        {p.nume}
                        {p.cantitate > 1 && <span className="font-normal text-[var(--st-muted)]"> x {p.cantitate}</span>}
                      </span>
                    ))}
                  </RandDate>
                )}
                {r.motiv && <RandDate eticheta="Motiv">{r.motiv}</RandDate>}
                {r.felRestituire && (
                  <RandDate eticheta="Restituire">
                    {RESTITUIRE[r.felRestituire] ?? r.felRestituire}
                    {/*
                      ⚠ IBAN-ul vine DEJA mascat din baza, la ultimele patru cifre. O
                      mascare facuta aici s-ar fi putut ocoli de a doua randare, de
                      export sau de urmatorul ecran care citeste aceeasi functie.
                    */}
                    {r.ibanMascat && <span className="block font-normal tabular-nums text-[var(--st-muted)]">{r.ibanMascat}</span>}
                  </RandDate>
                )}
              </ListaDate>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
