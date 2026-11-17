import { toast } from "sonner";

/**
 * Descarca PDF-ul unui document de la casa de facturare, prin ruta NOASTRA (`/api/<casa>/pdf`).
 *
 * Folosit de casele care dau PDF-ul numai pe API, cu cheile contului (Facturis, Factureaza.ro,
 * easybill): nu exista o adresa a documentului pe care s-o deschida browserul.
 *
 * ⚠ PRIN `fetch`, NU PRINTR-UN LINK. Cand ruta nu poate aduce PDF-ul, raspunde cu JSON si cu motivul;
 * un link simplu ar fi deschis atunci o pagina cu JSON in locul listei. Asa, motivul ajunge intr-un
 * mesaj, iar omul ramane unde era.
 *
 * Un singur loc, folosit si din pagina comenzii, si din lista: scris de doua ori (cum era la Facturis),
 * s-ar fi despartit la prima schimbare.
 */
export async function descarcaPdfDeLaCasa(
  ruta: string,
  casa: string,
  orderId: string,
  tip: "invoice" | "storno",
): Promise<void> {
  const nuSePoate = `PDF-ul nu s-a putut aduce de la ${casa}.`;
  try {
    const res = await fetch(`${ruta}?orderId=${encodeURIComponent(orderId)}&type=${tip}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      toast.error(data.error ?? nuSePoate);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${casa}_${tip}.pdf`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Dupa ce a pornit descarcarea: revocata pe loc, unele browsere ar fi pierdut fisierul. */
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    toast.error(nuSePoate);
  }
}
