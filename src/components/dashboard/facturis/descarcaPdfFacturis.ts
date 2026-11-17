import { toast } from "sonner";

/**
 * Descarca PDF-ul unui document Facturis prin ruta noastra (`/api/facturis/pdf`).
 *
 * ⚠ PRIN `fetch`, NU PRINTR-UN LINK. Facturis da PDF-ul numai pe API, deci ruta il aduce de la ei;
 * cand nu poate, raspunde cu JSON si cu motivul. Un link simplu ar fi deschis atunci o pagina cu
 * JSON in locul listei. Asa, motivul ajunge intr-un mesaj, iar omul ramane unde era.
 *
 * Un singur loc, folosit si din pagina comenzii, si din lista: scris de doua ori, cele doua s-ar fi
 * despartit la prima schimbare a rutei.
 */
export async function descarcaPdfFacturis(orderId: string, tip: "invoice" | "storno"): Promise<void> {
  try {
    const res = await fetch(`/api/facturis/pdf?orderId=${encodeURIComponent(orderId)}&type=${tip}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      toast.error(data.error ?? "PDF-ul nu s-a putut aduce de la Facturis.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `Facturis_${tip}.pdf`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Dupa ce a pornit descarcarea: revocata pe loc, unele browsere ar fi pierdut fisierul. */
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    toast.error("PDF-ul nu s-a putut aduce de la Facturis.");
  }
}
