import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { descriereDeCautare, slimPageSections } from "@/lib/storefront/catalog-slim";
import { normalizeSearchText } from "@/lib/storefront/product-search";
import { perechileProdusului } from "@/lib/storefront/catalog/facets";

/**
 * Umple campurile CALCULATE din `catalog_produs`, apeland regulile existente.
 *
 * Asta e jumatatea de Node a modelului de citire. Declansatorul din baza copiaza
 * mecanicele (nume, pret, stoc, imagine) in aceeasi tranzactie cu scrierea si
 * marcheaza randul in `catalog_murdar`; de aici incolo continua proiectorul.
 *
 * DE CE IN NODE, SI NU IN SQL. Fiindca regulile exista deja, scrise si testate, in
 * TypeScript — iar rescrise in SQL ar deveni o a doua sursa de adevar care diverge
 * tacut. `getProductPriceRange` singur codifica patru reguli castigate greu (doar
 * combinatiile `enabled`; doar PRIMA combinatie per titlu duplicat, cu 129 de
 * perechi duplicate in productie; randurile `null` nu au voie sa arunce; un pret 0
 * sau nenumeric cade pe pretul de baza). Un port gresit pe oricare dintre ele
 * schimba preturile AFISATE pe mii de produse. Aici nu se reimplementeaza NIMIC:
 * se apeleaza exact functiile pe care le foloseste si randarea de azi.
 *
 * Singura regula care traieste in SQL e disponibilitatea pachetului
 * (`catalog_fara_stoc`), fiindca de ea depinde un declansator — si are un test de
 * paritate care ruleaza ambele implementari peste aceleasi cazuri.
 */

/** Separator intre cheia fatetei si valoare. Caracter de control tocmai fiindca
 *  nu poate aparea intr-un nume de fateta sau intr-o valoare din `page_sections`. */
export const SEPARATOR_FATETA = "";

/** Cate produse se citesc si se scriu intr-un lot. */
const LOT = 500;

/** Coloanele de care are nevoie proiectorul. Nimic in plus: `page_sections` e deja
 *  partea grea (1,2 kB in medie pe eSAFE), nu mai carem si restul randului. */
const COLOANE = "id, business_id, name, description, category, tags, price, page_sections";

interface RandSursa {
  id: string;
  business_id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  tags: unknown;
  price: unknown;
  page_sections: unknown;
}

/** Ce scrie proiectorul. Mecanicele NU sunt aici: le tine declansatorul. */
export interface ProiectieCalculata {
  product_id: string;
  price_min: number;
  price_max: number;
  has_range: boolean;
  fara_oferta: boolean;
  optiuni: Record<string, unknown> | null;
  descriere_scurta: string;
  cauta_norm: string;
  fatete: string[];
  proiectat_la: string;
}

/**
 * Proiectia unui singur rand. Exportata separat ca sa poata fi testata fara baza:
 * testul de paritate ruleaza chiar functia asta peste randuri reale si compara cu
 * `getProductPriceRange`.
 */
export function proiecteazaRand(p: RandSursa, acum: string): ProiectieCalculata {
  const interval = getProductPriceRange(Number(p.price), p.page_sections);

  // Textul pe care il vede cautarea, in aceeasi ordine de importanta ca indexul
  // din browser: nume, categorie, valorile de varianta, descrierea scurta.
  // Ponderile NU se pierd — raman in `product-search.ts`, care ramane singurul
  // motor de scor. Aici se pregateste doar materialul pentru filtrarea din SQL.
  const perechi = perechileProdusului({ id: p.id, tags: p.tags, page_sections: p.page_sections });
  const valoriOptiuni = perechi.filter((x) => x.grup === "atribut").map((x) => x.valoare);
  const descriere = typeof p.description === "string" ? descriereDeCautare(p.description) : "";

  const cauta_norm = normalizeSearchText(
    [p.name ?? "", p.category ?? "", valoriOptiuni.join(" "), descriere].filter(Boolean).join(" "),
  );

  return {
    product_id: p.id,
    price_min: interval.min,
    price_max: interval.max,
    has_range: interval.hasRange,
    fara_oferta: interval.faraOferta,
    optiuni: slimPageSections(p.page_sections),
    descriere_scurta: descriere,
    cauta_norm,
    // `Set` fiindca acelasi (cheie, valoare) poate veni si din `google.brand`, si
    // dintr-o specificatie scrisa „Brand" — `construiesteFatete` le uneste oricum,
    // dar un array cu dubluri ar umfla degeaba indexul GIN.
    fatete: Array.from(new Set(perechi.map((x) => `${x.cheie}${SEPARATOR_FATETA}${x.valoare}`))),
    proiectat_la: acum,
  };
}

/**
 * Proiecteaza produsele cerute si le scoate din coada.
 *
 * `admin` trebuie sa fie clientul cu service role: `catalog_produs` are RLS
 * pornit si NICIO politica, deci un client de utilizator n-ar scrie nimic si —
 * mai rau — n-ar da eroare, PostgREST raporteaza zero randuri afectate.
 *
 * Intoarce cate randuri a scris. Nu arunca la un lot esuat: proiectorul e chemat
 * si sincron, din actiuni pe care n-are voie sa le doboare. Randul ramane in
 * coada si il ia cronul de la minut.
 */
export async function proiecteaza(
  admin: SupabaseClient,
  ids: string[],
  acum = new Date().toISOString(),
): Promise<number> {
  if (ids.length === 0) return 0;
  let scrise = 0;

  for (let i = 0; i < ids.length; i += LOT) {
    const bucata = ids.slice(i, i + LOT);
    const { data, error } = await admin.from("products").select(COLOANE).in("id", bucata);
    if (error) {
      console.error("[proiector] citirea produselor a esuat:", error.message);
      continue;
    }
    const randuri = (data ?? []) as unknown as RandSursa[];
    if (randuri.length === 0) {
      // Produsele au disparut intre marcaj si proiectare. Declansatorul a sters
      // deja randurile din `catalog_produs`; aici doar golim coada, altfel ar
      // ramane marcaje care nu se pot rezolva niciodata.
      await admin.from("catalog_murdar").delete().in("product_id", bucata);
      continue;
    }

    const proiectii = randuri.map((r) => proiecteazaRand(r, acum));

    /*
     * Un singur dus-intors pe lot, nu unul pe produs.
     *
     * Varianta rand-cu-rand ar fi insemnat 5.826 de cereri la backfill si cateva
     * sute la fiecare import — chiar tiparul pe care modelul asta de citire exista
     * ca sa-l stearga. `catalog_aplica_proiectii` primeste lotul ca jsonb si face
     * un singur `UPDATE ... FROM`.
     *
     * NU e un upsert, deliberat: randurile care nu exista in `catalog_produs` nu se
     * creeaza aici. Cine intra in catalog decide declansatorul, dupa `is_active`.
     * Un upsert ar fi avut nevoie si de coloanele mecanice si le-ar fi rescris cu
     * ce a citit proiectorul, care poate fi mai vechi decat ce e deja in tabela —
     * exact cursa pe care declansatorul o evita.
     */
    const { data: afectate, error: eUpd } = await admin.rpc("catalog_aplica_proiectii", {
      p_randuri: proiectii as unknown as Record<string, unknown>[],
    });
    if (eUpd) {
      console.error("[proiector] scrierea lotului a esuat:", eUpd.message);
      // Coada NU se goleste: randurile raman marcate si le reia cronul urmator.
      continue;
    }
    scrise += Number(afectate) || 0;

    // Se sterge TOATA bucata din coada, nu doar cele scrise: un rand care nu are
    // pereche in `catalog_produs` (produs inactiv) n-ar iesi niciodata altfel.
    const { error: eDel } = await admin.from("catalog_murdar").delete().in("product_id", bucata);
    if (eDel) console.error("[proiector] golirea cozii a esuat:", eDel.message);
  }

  return scrise;
}

/** Ia din coada si proiecteaza. Folosit de cron. */
export async function proiecteazaCoada(admin: SupabaseClient, maxim = 2000): Promise<number> {
  const { data, error } = await admin
    .from("catalog_murdar")
    .select("product_id")
    // Cele mai vechi intai: altfel un magazin care se editeaza intens ar putea
    // tine la infinit in coada randurile altuia.
    .order("marcat_la", { ascending: true })
    .limit(maxim);
  if (error) {
    console.error("[proiector] citirea cozii a esuat:", error.message);
    return 0;
  }
  const ids = (data ?? []).map((r) => (r as { product_id: string }).product_id);
  return proiecteaza(admin, ids);
}
