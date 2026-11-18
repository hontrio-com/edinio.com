import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorPublic, stele } from "./recenzii";

/**
 * Recenziile vizibile ale unui produs, pentru pagina lui: media, numarul si cele mai noi. Numai cele pe
 * care comerciantul nu le-a ascuns. ⚠ Fara email si fara numele intreg: pe pagina pleaca doar
 * „Ion P.”, nota, textul, data si pozele.
 *
 * Nu arunca: o citire cazuta inseamna doar o pagina fara sectiunea de recenzii.
 */
export type RecenziePublica = {
  autor: string;
  /** Din 5, cu o zecimala. */
  stele: number;
  text: string;
  data: string | null;
  media: { tip: "image" | "video"; url: string }[];
};

export type RecenziiProdus = {
  /** Media, din 5, cu o zecimala. */
  medie: number;
  numar: number;
  lista: RecenziePublica[];
};

const AFISATE = 10;
/** Media se socoteste pe cel mult atatea (cele mai noi); peste, diferenta nu se mai vede in zecimala. */
const PENTRU_MEDIE = 1000;

export async function recenziileProdusului(businessId: string, productId: string): Promise<RecenziiProdus | null> {
  try {
    const admin = createAdminClient();
    const [{ data: note, error: eNote }, { data: ultimele, error: eUltimele }] = await Promise.all([
      admin.from("recenzii_produse").select("nota")
        .eq("business_id", businessId).eq("product_id", productId).eq("ascunsa", false)
        .order("data_recenzie", { ascending: false, nullsFirst: false }).limit(PENTRU_MEDIE),
      admin.from("recenzii_produse").select("autor, nota, text, data_recenzie, media")
        .eq("business_id", businessId).eq("product_id", productId).eq("ascunsa", false)
        .order("data_recenzie", { ascending: false, nullsFirst: false }).limit(AFISATE),
    ]);
    if (eNote || eUltimele || !note || note.length === 0) return null;
    const suma = (note as { nota: number }[]).reduce((s, r) => s + (Number(r.nota) || 0), 0);
    return {
      medie: stele(suma / note.length),
      numar: note.length,
      lista: ((ultimele ?? []) as { autor: string; nota: number; text: string; data_recenzie: string | null; media: unknown }[]).map((r) => ({
        autor: autorPublic(r.autor),
        stele: stele(r.nota),
        text: r.text,
        data: r.data_recenzie,
        media: (Array.isArray(r.media) ? r.media : [])
          .filter((m): m is { tip: "image" | "video"; url: string } =>
            !!m && typeof m === "object" && typeof (m as { url?: unknown }).url === "string"
            && ((m as { url: string }).url).startsWith("https://"))
          .slice(0, 6),
      })),
    };
  } catch {
    return null;
  }
}

/** `aggregateRating` + primele recenzii, pentru datele structurate ale produsului. Pura. */
export function recenziiJsonLd(r: RecenziiProdus): Record<string, unknown> {
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: r.medie,
      reviewCount: r.numar,
      bestRating: 5,
      /* Nota lor merge de la 0: fara `worstRating: 0`, o recenzie de 0 ar iesi in afara scalei. */
      worstRating: 0,
    },
    review: r.lista.slice(0, 5).map((x) => ({
      "@type": "Review",
      author: { "@type": "Person", name: x.autor },
      reviewRating: { "@type": "Rating", ratingValue: x.stele, bestRating: 5, worstRating: 0 },
      ...(x.text ? { reviewBody: x.text.slice(0, 1000) } : {}),
      ...(x.data ? { datePublished: x.data.slice(0, 10) } : {}),
    })),
  };
}
