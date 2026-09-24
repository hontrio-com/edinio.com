"use client";

import { useState } from "react";
import { Download, LoaderCircle, RotateCcw } from "lucide-react";
import { BUTON_PRIMAR, BUTON_SECUNDAR, STIL_PRIMAR } from "./ui/clase";

/**
 * Descarcarea unei facturi sau a notei ei de stornare.
 *
 * ⚠⚠ PRIN `fetch`, NU PRINTR-O LEGATURA. Legatura simpla ducea omul, la orice
 * esec al furnizorului, pe o pagina alba cu o fraza, fara antetul magazinului si
 * fara drum inapoi. Acum esecul se spune AICI, in card, cu motivul lui si cu o
 * incercare noua.
 *
 * ⚠ Mesajele nu spun NICIODATA ca factura nu exista: daca ruta n-a putut-o aduce,
 * documentul exista la casa de facturare a magazinului, iar omul trebuie sa stie
 * ca il poate cere.
 */

type Motiv =
  | "casa_neconectata" | "furnizor_indisponibil" | "nu_e_pdf" | "prea_mare"
  | "document_de_test" | "fara_document" | "retea" | "sesiune";

function mesajul(motiv: Motiv, email: string | null): string {
  const cere = email ? ` Il poti cere la ${email}.` : " Il poti cere magazinului.";
  switch (motiv) {
    case "casa_neconectata":
      return `Magazinul nu mai are legat programul de facturare, asa ca documentul nu se poate descarca de aici. Documentul exista.${cere}`;
    case "furnizor_indisponibil":
    case "nu_e_pdf":
    case "prea_mare":
      return `Nu am putut aduce acum PDF-ul de la programul de facturare al magazinului. Documentul exista: incearca din nou peste cateva minute.${cere}`;
    case "retea":
      return "Nu am putut descarca documentul. Verifica legatura la internet si incearca din nou.";
    case "sesiune":
      return "Sesiunea a expirat. Intra din nou in cont si descarca documentul.";
    default:
      return "Documentul nu se mai gaseste. Reincarca pagina.";
  }
}

/** Numele din `Content-Disposition`, deja curatat de server. */
function numeleDinAntet(antet: string | null, rezerva: string): string {
  const m = /filename="([^"]+)"/.exec(antet ?? "");
  return m ? m[1] : rezerva;
}

export function DescarcaDocument({
  orderId,
  fel,
  eticheta,
  emailMagazin,
  varianta = "secundar",
}: {
  orderId: string;
  fel: "factura" | "storno";
  eticheta: string;
  emailMagazin: string | null;
  varianta?: "primar" | "secundar";
}) {
  const [asteapta, setAsteapta] = useState(false);
  const [eroare, setEroare] = useState<Motiv | null>(null);

  async function descarca() {
    if (asteapta) return;
    setAsteapta(true);
    setEroare(null);
    try {
      const r = await fetch(`/api/cont/factura/${encodeURIComponent(orderId)}${fel === "storno" ? "/storno" : ""}`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { motiv?: Motiv };
        setEroare(r.status === 401 ? "sesiune" : (j.motiv ?? "fara_document"));
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = numeleDinAntet(r.headers.get("content-disposition"), fel === "factura" ? "Factura.pdf" : "Stornare.pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* Browserul are nevoie de adresa pana porneste descarcarea. */
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setEroare("retea");
    } finally {
      setAsteapta(false);
    }
  }

  const clase = varianta === "primar" ? BUTON_PRIMAR : BUTON_SECUNDAR;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={descarca}
        disabled={asteapta}
        aria-busy={asteapta}
        className={clase}
        style={varianta === "primar" ? STIL_PRIMAR : undefined}
      >
        {asteapta ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : eroare ? (
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {asteapta ? "Se descarca..." : eroare ? "Incearca din nou" : eticheta}
      </button>
      {eroare && (
        <p role="alert" className="text-sm leading-relaxed text-[var(--st-text)]">
          {mesajul(eroare, emailMagazin)}
        </p>
      )}
    </div>
  );
}
